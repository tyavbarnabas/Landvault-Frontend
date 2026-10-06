// Backend integration seam for auth. See INTEGRATION.md.
//
// Single login point for the whole app: one form, one login() call. Mock mode
// decides which account to return by matching the email entered — this is
// standing in for the real backend returning a user with their actual role
// and permission set. Menus render off `permissions`, not a hardcoded role
// switch, so plugging in real per-user RBAC later (see the Developer Portal's
// DP-1.4 / Super Admin's SA-2.1 stories) is additive, not a rewrite.

import type { Currency, KYCStatus } from "../data/mockData";
import { apiClient, logoutSession, refreshSession, setAuthToken } from "../lib/apiClient";

// The backend emits exactly two role strings — see AuthService's
// `ctx.superAdmin() ? "super_admin" : "client"`. There is NO "developer"
// role: a company's portal staff arrive as "client" carrying
// portal.estates.* permissions.
//
// So roles are a coarse summary and must never be what a surface is gated on.
// Use the permission helpers below: permissions are the backend's real
// authorisation surface, and a user holding portal.estates.view is portal
// staff whatever their role string says.
export type UserRole = "client" | "super_admin";

export interface AuthUser {
  name: string;
  email: string;
  phone: string;
  country: string;
  currency: Currency;
  kycStatus: KYCStatus;
  kycType: "local" | "diaspora";
  twoFAEnabled: boolean;
  role: UserRole;
  permissions: string[];
  // Present only for a Super Admin bootstrapped with a temporary password.
  mustChangePassword?: boolean;
  // True for platform staff who hold the platform-scope RLS bypass but
  // haven't confirmed 2FA. Login is deliberately NOT blocked on it — that
  // would strand the bootstrapped Super Admin, who can't set 2FA up without
  // signing in first — so the frontend routes on this flag instead.
  mustSetUpTwoFa?: boolean;
  // 0 when 2FA is off.
  recoveryCodesRemaining?: number;
  // Which company this user acts for, and — for branch-scoped staff — which
  // branch. Both arrive on `AuthUserResponse` itself (no second call to
  // `/api/me` or the `/api/me/tenant-scope` debug endpoint). They stay
  // optional because a buyer, platform staff and an independent agent carry
  // neither — every consumer must cope with them being absent rather than
  // assuming a scope.
  //
  // A null/absent branchId means NOT branch-scoped: an Executive Director
  // sees across their company's branches. Buyers and platform staff have
  // neither field.
  //
  // Scoping itself is enforced server-side by RLS. These are here so the
  // mock layer can stand in for that, and so the UI can say whose estates it
  // is showing — never so the frontend can re-filter or widen a scope.
  tenantId?: string;
  branchId?: string | null;
}

const CLIENT_PERMISSIONS = [
  "client.dashboard.view",
  "client.marketplace.view",
  "client.estates.view",
  "client.resale.view",
  "client.portfolio.view",
  "client.documents.view",
  "client.inspections.view",
  "client.enquiries.view",
  "client.syndicates.view",
  "client.support.view",
  "client.settings.view",
];

// Only what's actually built so far (tenant lifecycle, a platform dashboard,
// and SA-3.4's listing-conflict detection). The rest of the Super Admin
// backlog (the rest of marketplace governance, seller verification,
// reputation/disputes, integrations, billing, compliance, support ops) adds
// its own permission slugs here as those screens land.
const SUPER_ADMIN_PERMISSIONS = [
  "admin.dashboard.view",
  "admin.tenants.view",
  "admin.tenants.manage",
  "admin.marketplace.conflicts",
];

// Only what this slice actually builds (DP-1 to DP-6: reach the portal, list
// estates, create one, see its boundary). Inventory, disclosure and
// publication add their own slugs here as those screens land.
const PORTAL_PERMISSIONS = [
  "portal.estates.view",
  "portal.estates.manage",
];

// Tenant self-service (changesets 065, 067, 068), granted exactly as the
// backend grants them:
//   portal.branches.manage — executive_director only
//   portal.staff.invite    — executive_director only
//   portal.staff.request   — branch_manager AND executive_director. The
//     director holds it only so that inviting a branch manager passes SI-4
//     ("never grant what you don't hold"); the backend refuses anyone holding
//     portal.staff.invite at /requests, so a director never actually asks.
export const BRANCHES_MANAGE_PERMISSION = "portal.branches.manage";
export const STAFF_INVITE_PERMISSION = "portal.staff.invite";
export const STAFF_REQUEST_PERMISSION = "portal.staff.request";

const DIRECTOR_PERMISSIONS = [...PORTAL_PERMISSIONS, BRANCHES_MANAGE_PERMISSION, STAFF_INVITE_PERMISSION, STAFF_REQUEST_PERMISSION];
// NOT portal.estates.manage: changeset 041 grants that to executive_director
// and surveyor_project_manager only. A branch manager reads their branch's
// estates and asks head office for staff — the surveyor they ask for is the
// one who builds the inventory.
const BRANCH_MANAGER_PERMISSIONS = ["portal.estates.view", STAFF_REQUEST_PERMISSION];

// ─── Surface helpers — permissions, never role strings ───────────────────────

export const PORTAL_VIEW_PERMISSION = "portal.estates.view";
export const ADMIN_VIEW_PERMISSION = "admin.dashboard.view";

function can(user: AuthUser | null | undefined, permission: string): boolean {
  return user?.permissions?.includes(permission) ?? false;
}

// A company's own staff. Holding the portal permission is what makes someone
// portal staff — the backend never labels them with a distinct role.
export function isPortalStaff(user: AuthUser | null | undefined): boolean {
  return can(user, PORTAL_VIEW_PERMISSION);
}

// Declaring terms and publishing write under `portal.estates.manage`; reading
// them needs only `.view`. A sales manager who can see the fee schedule they
// are asked about all day is not thereby able to change it.
export const PORTAL_MANAGE_PERMISSION = "portal.estates.manage";

export function canManageEstates(user: AuthUser | null | undefined): boolean {
  return can(user, PORTAL_MANAGE_PERMISSION);
}

// Create and rename branches. The backend ALSO refuses a caller whose current
// scope is one branch, so this is a menu gate, never the control itself.
export function canManageBranches(user: AuthUser | null | undefined): boolean {
  return can(user, BRANCHES_MANAGE_PERMISSION);
}

// Invite staff, approve or reject branch requests, manage the team.
export function canInviteStaff(user: AuthUser | null | undefined): boolean {
  return can(user, STAFF_INVITE_PERMISSION);
}

// Ask head office for staff. Whoever can invite never asks — the backend
// refuses them at /requests — so they don't count here.
export function canRequestStaff(user: AuthUser | null | undefined): boolean {
  return can(user, STAFF_REQUEST_PERMISSION) && !canInviteStaff(user);
}

export function isPlatformStaff(user: AuthUser | null | undefined): boolean {
  return can(user, ADMIN_VIEW_PERMISSION) || user?.role === "super_admin";
}

// A buyer is whoever is neither of the above. Derived rather than asserted, so
// buyer-only chrome (the KYC pill, the display-currency selector) can't leak
// into a surface it makes no sense on.
export function isBuyer(user: AuthUser | null | undefined): boolean {
  return !!user && !isPortalStaff(user) && !isPlatformStaff(user);
}

// Where a session should land after signing in. Three audiences, three home
// screens — a developer dropped on the buyer dashboard would see a portfolio
// they don't have.
export function landingRouteFor(user: AuthUser | null | undefined): string {
  if (isPlatformStaff(user)) return "/admin/dashboard";
  if (isPortalStaff(user)) return "/portal/estates";
  return "/dashboard";
}

export const MOCK_CLIENT_USER: AuthUser = {
  name: "Emeka Okonkwo",
  email: "emeka.okonkwo@gmail.com",
  phone: "+44 7700 900123",
  country: "GB",
  currency: "GBP",
  kycStatus: "approved",
  kycType: "diaspora",
  // Off, so a returning buyer's login is exactly what it was: password, done.
  twoFAEnabled: false,
  role: "client",
  permissions: CLIENT_PERMISSIONS,
};

// Demo super admin account — sign in with this email in mock mode to preview
// the platform console. Stands in for a seeded Super Admin account once the
// backend exists (see the repo-wide note: seeding the first Super Admin is a
// deliberate step, not something a tenant or client can self-register into).
const MOCK_SUPER_ADMIN_USER: AuthUser = {
  name: "Ada Nwosu",
  email: "admin@landvault.com",
  phone: "+234 802 000 0000",
  country: "NG",
  currency: "NGN",
  kycStatus: "approved",
  kycType: "local",
  // Platform staff hold the platform-scope RLS bypass, so 2FA is mandatory for
  // them — but login is deliberately not blocked on it, or the bootstrapped
  // Super Admin could never sign in to set it up. This account demonstrates
  // both flags being ROUTED on rather than enforced.
  twoFAEnabled: false,
  mustSetUpTwoFa: true,
  mustChangePassword: true,
  role: "super_admin",
  permissions: SUPER_ADMIN_PERMISSIONS,
};

// Demo developer-portal accounts, both staff of the seeded Estintin Group
// tenant. Two of them on purpose: branch scoping is invisible with only one
// account, because a wrongly-scoped list just looks shorter than expected.
//
// Chidi is an Executive Director (no branch — sees all of Estintin's
// estates); Tunde manages the Heritage branch and is the same person named as
// Heritage's manager in tenantsService.ts's seed data.
const MOCK_PORTAL_DIRECTOR: AuthUser = {
  name: "Chidi Okeke",
  email: "director@estintin.com",
  phone: "+234 803 111 2222",
  country: "NG",
  currency: "NGN",
  kycStatus: "approved",
  kycType: "local",
  twoFAEnabled: true,
  // "client", not a bespoke role — this is exactly what the backend sends for
  // a tenant's staff member. The portal permissions are what matter.
  role: "client",
  permissions: DIRECTOR_PERMISSIONS,
  tenantId: "estintin-group",
  branchId: null,
};

const MOCK_PORTAL_BRANCH_MANAGER: AuthUser = {
  name: "Tunde Bakare",
  email: "heritage@estintin.com",
  phone: "+234 803 333 4444",
  country: "NG",
  currency: "NGN",
  kycStatus: "approved",
  kycType: "local",
  twoFAEnabled: false,
  role: "client",
  permissions: BRANCH_MANAGER_PERMISSIONS,
  tenantId: "estintin-group",
  branchId: "heritage",
};

// Still one login form for every account type — this table stands in for the
// real backend returning whichever user the credentials belong to, with their
// actual role, permissions and tenant/branch claims.
const MOCK_ACCOUNTS_BY_EMAIL: Record<string, AuthUser> = {
  [MOCK_SUPER_ADMIN_USER.email]: MOCK_SUPER_ADMIN_USER,
  [MOCK_PORTAL_DIRECTOR.email]: MOCK_PORTAL_DIRECTOR,
  [MOCK_PORTAL_BRANCH_MANAGER.email]: MOCK_PORTAL_BRANCH_MANAGER,
};

// Mock mode only: an accepted invitation creates an account that can then
// sign in like any other — a fresh login, not the demo buyer fallback.
export function registerMockAccount(user: AuthUser): void {
  MOCK_ACCOUNTS_BY_EMAIL[user.email.trim().toLowerCase()] = user;
}

export function mockAccountExists(email: string): boolean {
  return email.trim().toLowerCase() in MOCK_ACCOUNTS_BY_EMAIL || email.trim().toLowerCase() === MOCK_CLIENT_USER.email;
}

// The permissions a mock account holds for a tenant role — the backend's
// role_permissions, for the roles a tenant can assign.
// Transcribed from changesets 041, 045, 065, 067 and 068.
export function mockPermissionsForRole(roleCode: string): string[] {
  switch (roleCode) {
    case "executive_director": return DIRECTOR_PERMISSIONS;
    case "branch_manager": return BRANCH_MANAGER_PERMISSIONS;
    case "surveyor_project_manager": return PORTAL_PERMISSIONS;
    case "sales_manager":
    case "finance_officer":
    case "legal_officer": return ["portal.estates.view"];
    default: return [];
  }
}

// ─── Login, and the second step when 2FA is on ───────────────────────────────

// `POST /api/auth/login` returns EITHER a session or a challenge. The two
// response shapes deliberately share no field name — the challenge carries no
// `token` and no `user` — so a client cannot mistake one for the other. We discriminate on `twoFactorRequired`, which the challenge states
// outright.
//
// (The endpoint's OpenAPI description says to "check for a `challengeId`
// field". `TwoFactorChallengeResponse` has no such field — it is
// `challengeToken`. The DTO is the authority.)
export interface TwoFactorChallenge {
  twoFactorRequired: true;
  challengeToken: string;
  expiresAt: string;
}

export type LoginOutcome =
  | { kind: "authenticated"; user: AuthUser }
  | { kind: "two_factor_required"; challenge: TwoFactorChallenge };

// AuthResponse: `{ user, token }` from login, register, 2FA verify — and from
// refresh, which is how a page load restores a session. There is no refresh
// token in any body: it is an HttpOnly cookie the browser holds, which this
// code never reads or stores.
interface AuthResponseBody {
  user: AuthUser;
  token: string;
}

// Every call whose response sets the refresh cookie needs `credentials:
// "include"`, or the browser silently discards the Set-Cookie. Login and 2FA
// verify also answer a wrong password or code with 401 — an answer, not an
// expired session — so they must not trigger the refresh interceptor either.
const SETS_SESSION_COOKIE = { credentials: "include" as const };
const ANSWERS_WITH_401 = { skipAuthRefresh: true };

function isChallenge(body: AuthResponseBody | TwoFactorChallenge): body is TwoFactorChallenge {
  return (body as TwoFactorChallenge).twoFactorRequired === true;
}

export async function login(email: string, password?: string): Promise<LoginOutcome> {
  if (apiClient.isMockMode) {
    const user = MOCK_ACCOUNTS_BY_EMAIL[email.trim().toLowerCase()] ?? MOCK_CLIENT_USER;
    // Mock mode mirrors the real branch: an account with 2FA on gets a
    // challenge, not a session. Nothing is signed in until a code verifies.
    if (user.twoFAEnabled) {
      const challengeToken = issueMockChallenge(user);
      return { kind: "two_factor_required", challenge: { twoFactorRequired: true, challengeToken, expiresAt: mockChallengeExpiry() } };
    }
    return { kind: "authenticated", user };
  }

  const body = await apiClient.post<AuthResponseBody | TwoFactorChallenge>(
    "/api/auth/login", { email, password }, { ...SETS_SESSION_COOKIE, ...ANSWERS_WITH_401 });
  if (isChallenge(body)) return { kind: "two_factor_required", challenge: body };
  setAuthToken(body.token);
  return { kind: "authenticated", user: body.user };
}

// The challenge token identifies a PENDING login and nothing else: it cannot
// call a protected endpoint, and it is never stored as a session token.
export async function verifyTwoFactor(challengeToken: string, code: string): Promise<AuthUser> {
  if (apiClient.isMockMode) return verifyMockChallenge(challengeToken, code);
  const body = await apiClient.post<AuthResponseBody>(
    "/api/auth/2fa/verify", { challengeToken, code }, { ...SETS_SESSION_COOKIE, ...ANSWERS_WITH_401 });
  setAuthToken(body.token);
  return body.user;
}

// ─── Two-factor enrolment and management ─────────────────────────────────────

// `setup` does NOT enable 2FA. Only `confirm` does — and collapsing the two
// would strand a user whose QR scan silently failed, permanently and with no
// recovery codes, because those are issued at confirmation.
export interface TwoFactorSetup {
  // Base32, returned HERE AND NOWHERE ELSE. Encrypted at rest and never
  // readable again through any endpoint. Never log it, never persist it.
  secret: string;
  otpAuthUri: string;
}

export async function setupTwoFactor(): Promise<TwoFactorSetup> {
  if (apiClient.isMockMode) return mockSetupTwoFactor();
  return apiClient.post<TwoFactorSetup>("/api/auth/2fa/setup", {});
}

// Returns the recovery codes, in plaintext, EXACTLY ONCE. They are stored
// hashed and can never be retrieved again.
export async function confirmTwoFactor(code: string): Promise<string[]> {
  if (apiClient.isMockMode) return mockConfirmTwoFactor(code);
  const { recoveryCodes } = await apiClient.post<{ recoveryCodes: string[] }>("/api/auth/2fa/confirm", { code });
  return recoveryCodes;
}

// A code is required, not just a session: a hijacked session must not be able
// to strip the protection 2FA exists to provide. Platform staff cannot disable
// it at all (TWO_FACTOR_MANDATORY).
export async function disableTwoFactor(code: string): Promise<void> {
  if (apiClient.isMockMode) return mockDisableTwoFactor(code);
  await apiClient.post("/api/auth/2fa/disable", { code });
}

// Requires a current TOTP code, and invalidates every previous code.
export async function regenerateRecoveryCodes(code: string): Promise<string[]> {
  if (apiClient.isMockMode) return mockRegenerateRecoveryCodes(code);
  const { recoveryCodes } = await apiClient.post<{ recoveryCodes: string[] }>("/api/auth/2fa/recovery-codes/regenerate", { code });
  return recoveryCodes;
}

// ─── Password reset ──────────────────────────────────────────────────────────

// The backend returns the SAME response whether or not the email exists, and
// goes to real trouble to keep the timing equal too. Nothing here may reveal
// which it was — no "no account found", ever.
export async function forgotPassword(email: string): Promise<void> {
  if (apiClient.isMockMode) {
    mockResetCodes.set(email.trim().toLowerCase(), MOCK_RESET_CODE);
    return;
  }
  await apiClient.post("/api/auth/forgot-password", { email });
}

export interface ResetPasswordInput {
  email: string;
  code: string;
  newPassword: string;
}

export async function resetPassword(input: ResetPasswordInput): Promise<void> {
  if (apiClient.isMockMode) return mockResetPassword(input);
  await apiClient.post("/api/auth/reset-password", input);
}

// ─── Change password ─────────────────────────────────────────────────────────

// NOT a reset. A reset proves control of a mailbox; this proves knowledge of
// the password being replaced — which is what a change-password screen means,
// and it works on a deployment with no mail configured, so a bootstrapped
// admin can retire a temporary credential without email.
//
// `newPassword` carries exactly the rule registration does (@NotBlank) and no
// stricter one: a password acceptable at registration cannot become
// unacceptable when it is changed. So nothing here adds a strength rule the
// backend would not enforce.
//
// A wrong current password comes back as 401 INVALID_CREDENTIALS — the same
// response a bad password gets at login. `skipAuthRefresh` keeps apiClient
// from reading that 401 as an expired session and signing the user out.
//
// On success the backend revokes every OTHER session's refresh token and sets
// a fresh cookie for this browser — hence `credentials: "include"`, without
// which the browser drops that cookie and this session ends at its next
// refresh after all. Other sessions' access tokens are NOT severed: they ride
// out their remaining lifetime, up to 15 minutes. Never describe it as instant.
export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export async function changePassword(input: ChangePasswordInput, email: string): Promise<void> {
  if (apiClient.isMockMode) return mockChangePassword(input, email);
  await apiClient.post("/api/auth/change-password", input, { ...SETS_SESSION_COOKIE, ...ANSWERS_WITH_401 });
}

export interface RegisterInput {
  name: string;
  email: string;
  phone: string;
  country: string;
  currency: Currency;
}

// Deliberately distinct from login() above. A returning user signing back in
// gets the pre-seeded, already-verified MOCK_CLIENT_USER — but a genuinely
// new signup has never been through KYC. This is what makes the purchase-time
// KYC gate (kycService.ts) actually reachable: sign IN with an existing
// account and you're pre-verified; REGISTER fresh and you're not, and the
// buyer type (kycService's local/diaspora split) is driven by the country
// entered here, not chosen again later.
export async function register(input: RegisterInput): Promise<AuthUser> {
  if (apiClient.isMockMode) {
    return {
      name: input.name || "New Buyer",
      email: input.email,
      phone: input.phone,
      country: input.country,
      currency: input.currency,
      kycStatus: "unsubmitted",
      kycType: input.country === "NG" ? "local" : "diaspora",
      twoFAEnabled: false,
      role: "client",
      permissions: CLIENT_PERMISSIONS,
    };
  }
  const { user, token } = await apiClient.post<AuthResponseBody>("/api/auth/register", input, SETS_SESSION_COOKIE);
  setAuthToken(token);
  return user;
}

// Ends this browser's session only (other devices stay signed in), then drops
// the access token — which would otherwise still work server-side for up to
// 15 minutes. Serialised with refresh across tabs; see apiClient.
export function logout(): Promise<void> {
  return logoutSession();
}

// ─── Restoring a session on page load ────────────────────────────────────────

// One refresh at startup: `{ user, token }` back means signed in, with the same
// user login returns, read fresh. Mock mode has no cookies and no backend, and
// keeps its demo user.
export type RestoreOutcome =
  | { kind: "mock" }
  | { kind: "signed_in"; user: AuthUser }
  | { kind: "signed_out"; code: string; message?: string }
  | { kind: "config_problem"; problem: "origin_not_allowed" | "unreachable" };

export async function restoreSession(): Promise<RestoreOutcome> {
  if (apiClient.isMockMode) return { kind: "mock" };
  const outcome = await refreshSession(null);
  switch (outcome.kind) {
    // A refresh with no user (a backend older than cf8983e returns only
    // `{ token }`) restores nobody — never a session with a fabricated user.
    case "refreshed":
      return outcome.user ? { kind: "signed_in", user: outcome.user as AuthUser } : { kind: "signed_out", code: "NO_USER" };
    // Not reachable with a null staleToken; treated as signed out rather
    // than inventing a user.
    case "reused": return { kind: "signed_out", code: "NO_USER" };
    case "signed_out":
      setAuthToken(null);
      return { kind: "signed_out", code: outcome.code, message: outcome.message };
    case "origin_not_allowed":
    case "unreachable":
      return { kind: "config_problem", problem: outcome.kind };
  }
}

// Why a session ended, in words a person can act on. REFRESH_TOKEN_MISSING
// (never signed in here) needs no message at all.
export function signOutReason(code: string): string | null {
  switch (code) {
    case "ACCOUNT_SUSPENDED": return "Your account has been suspended. Please contact support.";
    case "ACCOUNT_DEACTIVATED": return "Your account has been deactivated. Please contact support.";
    case "TENANT_NOT_ACTIVE": return "Your organisation's account isn't active. Contact your administrator.";
    case "INVALID_REFRESH_TOKEN": return "Your session has ended. Please sign in again.";
    default: return null;
  }
}

// ─── Mock-mode implementations ───────────────────────────────────────────────
//
// These stand in for the backend so the flows are exercisable without it. The
// error CODES thrown here are the backend's own (see AuthExceptionHandler), so
// UI that branches on a code works identically in both modes.

export const AUTH_ERROR_CODES = [
  "EMAIL_ALREADY_REGISTERED",
  "INVALID_CREDENTIALS",
  "ACCOUNT_SUSPENDED",
  "ACCOUNT_DEACTIVATED",
  "TENANT_NOT_ACTIVE",
  "INVALID_REFRESH_TOKEN",
  "REFRESH_TOKEN_MISSING",
  "ORIGIN_NOT_ALLOWED",
  "INVALID_OR_EXPIRED_CODE",
  "INVALID_TWO_FACTOR_CODE",
  "INVALID_TWO_FACTOR_CHALLENGE",
  "TWO_FACTOR_LOCKED_OUT",
  "TWO_FACTOR_SETUP_REQUIRED",
  "TWO_FACTOR_NOT_ENABLED",
  "TWO_FACTOR_MANDATORY",
] as const;

export type AuthErrorCode = (typeof AUTH_ERROR_CODES)[number];

// Mirrors ApiError's shape closely enough that one `errorCodeOf` helper reads
// both, so callers never branch on a message string.
export class MockAuthError extends Error {
  body: { code: AuthErrorCode; message: string };
  constructor(code: AuthErrorCode, message: string) {
    super(message);
    this.name = "MockAuthError";
    this.body = { code, message };
  }
}

// Branch on the code, never the message — the message is written for people
// and may change.
export function errorCodeOf(error: unknown): AuthErrorCode | null {
  const code = (error as { body?: { code?: string } } | undefined)?.body?.code;
  return code && (AUTH_ERROR_CODES as readonly string[]).includes(code) ? (code as AuthErrorCode) : null;
}

// Demo codes for mock mode. Deliberately obvious, and only ever compared —
// never rendered into a URL or a log.
const MOCK_TOTP_CODE = "123456";
const MOCK_RESET_CODE = "654321";
const MOCK_RECOVERY_CODES = [
  "4f2a-91bc", "7d3e-05fa", "b18c-6e42", "9a70-cd15",
  "2e64-38ab", "c5d9-71f0", "83bf-4a2c", "16e5-90db",
];

const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const MAX_TWO_FACTOR_ATTEMPTS = 5;

interface MockChallenge {
  user: AuthUser;
  expiresAt: number;
  attempts: number;
}

const mockChallenges = new Map<string, MockChallenge>();
const mockResetCodes = new Map<string, string>();
// Mock login accepts any password, so change-password needs a known "current"
// one to verify against. Every account starts on the demo password; a
// successful change replaces it, so the old one stops working — as it would.
const MOCK_CURRENT_PASSWORD = "landvault-demo";
const mockPasswords = new Map<string, string>();
// Recovery codes are single-use, so a consumed one is remembered.
const mockUsedRecoveryCodes = new Set<string>();
let mockPendingSecret: string | null = null;

function mockChallengeExpiry(): string {
  return new Date(Date.now() + CHALLENGE_TTL_MS).toISOString();
}

function issueMockChallenge(user: AuthUser): string {
  const token = `chal_${Math.random().toString(36).slice(2, 12)}`;
  mockChallenges.set(token, { user, expiresAt: Date.now() + CHALLENGE_TTL_MS, attempts: 0 });
  return token;
}

function verifyMockChallenge(challengeToken: string, code: string): AuthUser {
  const challenge = mockChallenges.get(challengeToken);
  if (!challenge || challenge.expiresAt < Date.now()) {
    throw new MockAuthError("INVALID_TWO_FACTOR_CHALLENGE", "This sign-in attempt is no longer valid. Start again.");
  }
  if (challenge.attempts >= MAX_TWO_FACTOR_ATTEMPTS) {
    throw new MockAuthError("TWO_FACTOR_LOCKED_OUT", "Too many incorrect codes. Try again later.");
  }

  const normalized = code.trim().toLowerCase();
  const isRecovery = MOCK_RECOVERY_CODES.includes(normalized) && !mockUsedRecoveryCodes.has(normalized);
  if (code.trim() !== MOCK_TOTP_CODE && !isRecovery) {
    challenge.attempts += 1;
    if (challenge.attempts >= MAX_TWO_FACTOR_ATTEMPTS) {
      throw new MockAuthError("TWO_FACTOR_LOCKED_OUT", "Too many incorrect codes. Try again later.");
    }
    throw new MockAuthError("INVALID_TWO_FACTOR_CODE", "That code is not valid. Try again, or use a recovery code.");
  }

  // Each recovery code works exactly once.
  if (isRecovery) mockUsedRecoveryCodes.add(normalized);
  mockChallenges.delete(challengeToken);
  return challenge.user;
}

function mockSetupTwoFactor(): TwoFactorSetup {
  // Base32 alphabet, so a real authenticator app would accept the shape.
  const secret = "JBSWY3DPEHPK3PXP";
  mockPendingSecret = secret;
  const label = encodeURIComponent("LandVault:demo@landvault.com");
  return { secret, otpAuthUri: `otpauth://totp/${label}?secret=${secret}&issuer=LandVault` };
}

function mockConfirmTwoFactor(code: string): string[] {
  // Confirming without having started setup is its own error, not a bad code.
  if (!mockPendingSecret) {
    throw new MockAuthError("TWO_FACTOR_SETUP_REQUIRED", "Start two-factor setup before confirming it.");
  }
  if (code.trim() !== MOCK_TOTP_CODE) {
    throw new MockAuthError("INVALID_TWO_FACTOR_CODE", "That code is not valid. Try again, or use a recovery code.");
  }
  mockPendingSecret = null;
  mockUsedRecoveryCodes.clear();
  return [...MOCK_RECOVERY_CODES];
}

function mockDisableTwoFactor(code: string): void {
  if (code.trim() !== MOCK_TOTP_CODE && !MOCK_RECOVERY_CODES.includes(code.trim().toLowerCase())) {
    throw new MockAuthError("INVALID_TWO_FACTOR_CODE", "That code is not valid. Try again, or use a recovery code.");
  }
}

function mockRegenerateRecoveryCodes(code: string): string[] {
  if (code.trim() !== MOCK_TOTP_CODE) {
    throw new MockAuthError("INVALID_TWO_FACTOR_CODE", "That code is not valid. Try again, or use a recovery code.");
  }
  // Every previous code is invalidated.
  mockUsedRecoveryCodes.clear();
  return MOCK_RECOVERY_CODES.map((c) => c.split("").reverse().join(""));
}

function mockResetPassword({ email, code }: ResetPasswordInput): void {
  const expected = mockResetCodes.get(email.trim().toLowerCase());
  // One generic failure for a wrong code, an expired code, and a code that was
  // never requested — the backend does the same, so nothing here reveals which
  // emails have accounts.
  if (!expected || code.trim() !== expected) {
    throw new MockAuthError("INVALID_OR_EXPIRED_CODE", "That reset code is invalid or has expired. Request a new one.");
  }
  mockResetCodes.delete(email.trim().toLowerCase());
}

function mockChangePassword({ currentPassword, newPassword }: ChangePasswordInput, email: string): void {
  const key = email.trim().toLowerCase();
  if (currentPassword !== (mockPasswords.get(key) ?? MOCK_CURRENT_PASSWORD)) {
    // The backend's own response for a wrong current password — login's.
    throw new MockAuthError("INVALID_CREDENTIALS", "Invalid email or password.");
  }
  mockPasswords.set(key, newPassword);
}

// Exported for the demo screens only, so a tester knows what to type. Never
// rendered into a URL, and never logged.
export const MOCK_DEMO_CODES = { totp: MOCK_TOTP_CODE, reset: MOCK_RESET_CODE, currentPassword: MOCK_CURRENT_PASSWORD };
