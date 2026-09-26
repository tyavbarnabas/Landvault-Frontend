// Backend integration seam for auth. See INTEGRATION.md.
//
// Single login point for the whole app: one form, one login() call. Mock mode
// decides which account to return by matching the email entered — this is
// standing in for the real backend returning a user with their actual role
// and permission set. Menus render off `permissions`, not a hardcoded role
// switch, so plugging in real per-user RBAC later (see the Developer Portal's
// DP-1.4 / Super Admin's SA-2.1 stories) is additive, not a rewrite.

import type { Currency, KYCStatus } from "../data/mockData";
import { apiClient, setAuthToken } from "../lib/apiClient";

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
  // branch.
  //
  // CONTRACT GAP (see the backend note at the end of this slice): the login
  // response (`AuthUserResponse`) carries NEITHER today. `tenantId` has to be
  // read from `GET /api/me`, and `branchId` is exposed only by
  // `/api/me/tenant-scope`, which its own Javadoc calls a debug endpoint. Both
  // are optional here for exactly that reason, and every consumer must cope
  // with them being absent rather than assuming a scope.
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
  twoFAEnabled: true,
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
  twoFAEnabled: true,
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
  permissions: PORTAL_PERMISSIONS,
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
  twoFAEnabled: true,
  role: "client",
  permissions: PORTAL_PERMISSIONS,
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

export async function login(email: string, password?: string): Promise<AuthUser> {
  if (apiClient.isMockMode) {
    return MOCK_ACCOUNTS_BY_EMAIL[email.trim().toLowerCase()] ?? MOCK_CLIENT_USER;
  }
  const { user, token } = await apiClient.post<{ user: AuthUser; token: string }>("/api/auth/login", { email, password });
  setAuthToken(token);
  return user;
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
  const { user, token } = await apiClient.post<{ user: AuthUser; token: string }>("/api/auth/register", input);
  setAuthToken(token);
  return user;
}

export function logout(): void {
  setAuthToken(null);
}
