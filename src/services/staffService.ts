// A company's own staff: invitations (SI-1..SI-7), branch requests (changeset
// 068) and managing the team. Endpoints:
//
//   /api/portal/staff/invitations            POST invite · GET list
//   /api/portal/staff/invitations/requests   POST — a branch manager asks
//   /api/portal/staff/invitations/{id}/…     approve · reject · cancel · revoke · resend
//   /api/portal/staff                        GET list
//   /api/portal/staff/{userId}/…             PUT role · POST deactivate · POST reactivate
//   /api/auth/invitations/preview · accept   PUBLIC — no session yet
//
// The rules that decide whether a role may be given — scope, branch, and "never
// grant what you don't hold" — live in ONE backend component (StaffRoleRules),
// shared by invitations and role changes so the two can never disagree. This
// module does not re-implement them: it shapes the form so an invalid
// role/branch pair can't be submitted, and reports the backend's verdict.

import { ApiError, apiClient, setAuthToken } from "../lib/apiClient";
import { isMock } from "../lib/backends";
import {
  mockAccountExists, mockPermissionsForRole, registerMockAccount, type AuthUser,
} from "./authService";
import { fetchTenantByIdSync, tenantDisplayName } from "./tenantsService";
import { mockBranchNameFor } from "./branchesService";

// ─── Roles ───────────────────────────────────────────────────────────────────
//
// GET /api/portal/roles lists every role a tenant may assign, so the portal
// never hard-codes them — companies may make their own one day (`custom`).
// `scope` decides the branch:
//   company — organisation-wide only; a branch is REFUSED
//   branch  — must name a branch
//   either  — a branch is optional
// `canGrant` is whether THIS caller holds every permission the role carries
// (SI-4, computed by the same backend rule that enforces it). A branch
// manager may still REQUEST a role they can't grant: the approver is checked.
export type RoleScope = "company" | "branch" | "either";

// AssignableRoleDto.
export interface AssignableRole {
  code: string;
  name: string;
  description: string | null;
  scope: RoleScope;
  permissions: string[];
  canGrant: boolean;
  custom: boolean;
}

// MOCK MODE ONLY — standing in for GET /api/portal/roles. Names from
// changeset 015, scopes from 067, permissions from 041/045/065/067/068.
export const MOCK_ROLES: Omit<AssignableRole, "canGrant">[] = [
  { code: "executive_director", name: "Executive Director", description: "Runs the company across every branch.", scope: "company", permissions: mockPermissionsForRole("executive_director"), custom: false },
  { code: "branch_manager", name: "Branch Manager", description: "Runs one branch, and asks head office for staff.", scope: "branch", permissions: mockPermissionsForRole("branch_manager"), custom: false },
  { code: "sales_manager", name: "Sales Manager", description: null, scope: "either", permissions: mockPermissionsForRole("sales_manager"), custom: false },
  { code: "surveyor_project_manager", name: "Surveyor / Project Manager", description: "Builds and maintains estate inventory.", scope: "either", permissions: mockPermissionsForRole("surveyor_project_manager"), custom: false },
  { code: "finance_officer", name: "Finance Officer", description: null, scope: "either", permissions: mockPermissionsForRole("finance_officer"), custom: false },
  { code: "legal_officer", name: "Legal Officer", description: null, scope: "either", permissions: mockPermissionsForRole("legal_officer"), custom: false },
];

export type BranchRule = "required" | "forbidden" | "optional";

// Drives the form: the branch picker is required, hidden or optional
// according to the role's scope, so an invalid pair is never submitted.
export function branchRuleForScope(scope: RoleScope): BranchRule {
  return scope === "company" ? "forbidden" : scope === "branch" ? "required" : "optional";
}

// By code, against a role list (the fetched one, or the mock catalogue). A
// role the list doesn't know is left to the backend to judge.
export function branchRuleFor(roleCode: string, roles: Pick<AssignableRole, "code" | "scope">[] = MOCK_ROLES): BranchRule {
  const role = roles.find((r) => r.code === roleCode);
  return role ? branchRuleForScope(role.scope) : "optional";
}

export function roleName(roleCode: string, roles: Pick<AssignableRole, "code" | "name">[] = MOCK_ROLES): string {
  return roles.find((r) => r.code === roleCode)?.name ?? roleCode;
}

// What a branch manager may ask for: anything branch-level.
export function requestableRoles<T extends Pick<AssignableRole, "scope">>(roles: T[]): T[] {
  return roles.filter((r) => r.scope !== "company");
}

function holdsAll(held: string[] | undefined, needed: string[]): boolean {
  // Without the caller's permissions in hand (a caller built without them),
  // the mock can't judge — the real backend always can.
  return !held || needed.every((p) => held.includes(p));
}

export async function fetchAssignableRoles(caller: StaffCaller): Promise<AssignableRole[]> {
  if (!isMock("staff")) return apiClient.get<AssignableRole[]>("/api/portal/roles");
  return MOCK_ROLES.map((r) => ({ ...r, permissions: [...r.permissions], canGrant: holdsAll(caller.permissions, r.permissions) }));
}

// ─── Types (DTOs) ────────────────────────────────────────────────────────────

export type InvitationStatus = "awaiting_approval" | "rejected" | "pending" | "expired" | "accepted" | "revoked";
export type StaffStatus = "active" | "pending_verification" | "suspended" | "deactivated";

// StaffInvitationDto. The link itself is NEVER here: it goes by email only.
export interface StaffInvitation {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roleCode: string;
  roleName: string;
  branchId: string | null;
  branchName: string | null;
  status: InvitationStatus;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  sendCount: number;
  approvalRequired: boolean;
  // Who invited — or, for a request, who asked.
  requestedBy: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
}

export interface StaffRole {
  roleCode: string;
  roleName: string;
  branchId: string | null;
  branchName: string | null;
}

// StaffMemberDto.
export interface StaffMember {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  status: StaffStatus;
  roles: StaffRole[];
  lastLoginAt: string | null;
  createdAt: string;
}

// InvitationPreviewDto — what the invited person sees before committing.
export interface InvitationPreview {
  email: string;
  firstName: string;
  companyName: string;
  roleName: string;
  branchName: string | null;
  expiresAt: string;
}

export interface InviteInput {
  email: string;
  firstName: string;
  lastName: string;
  roleCode: string;
  branchId?: string;
  // The chosen role's scope, from the fetched role list, so the branch rule
  // is checked against what the backend said — never a guess. Not sent.
  scope?: RoleScope;
}

// Who is acting — for the mock to stand in for TenantContext and the token's
// subject. The real backend reads all of this from the session.
export interface StaffCaller {
  tenantId: string;
  branchId: string | null;
  email: string;
  userId?: string;
  // Mock mode uses these for SI-4 ("never grant what you don't hold").
  permissions?: string[];
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export class StaffError extends Error {
  field: string;
  code: string;
  constructor(field: string, code: string, message: string) {
    super(message);
    this.name = "StaffError";
    this.field = field;
    this.code = code;
  }
}

// Each backend code, said in a way an Executive Director can act on — and on
// the field it belongs to. Codes transcribed from InvitationExceptionHandler.
const MESSAGES: Record<string, { field: string; message: string }> = {
  // A deliberate refusal, not a bug: a buyer account that also held a company
  // role would keep its buyer role — and silently lose its branch wall.
  EMAIL_HAS_ACCOUNT: { field: "email", message: "This email already has a LandVault account — often a personal buyer account. Use the person's work email instead: one account can't be both a buyer and company staff." },
  CANNOT_GRANT_ROLE: { field: "roleCode", message: "You can't give this role: it carries permissions you don't hold yourself." },
  ROLE_NOT_INVITABLE: { field: "roleCode", message: "That role can't be given by a company." },
  INVITATION_ALREADY_PENDING: { field: "email", message: "There's already an open invitation for this email. Resend it from the list instead." },
  INVITATIONS_REQUIRE_COMPANY_WIDE_SCOPE: { field: "form", message: "Inviting staff needs company-wide access — not while working inside one branch." },
  INVITATION_REQUESTS_REQUIRE_BRANCH_SCOPE: { field: "form", message: "Requests are for branch managers. With company-wide access, invite the person directly." },
  INVITATION_RESEND_TOO_SOON: { field: "form", message: "This invitation was sent moments ago. Wait two minutes before resending." },
  INVITATION_RESEND_LIMIT_REACHED: { field: "form", message: "This invitation has been sent five times, the most allowed. Revoke it and invite again if needed." },
  INVITATION_REQUEST_EXPIRED: { field: "form", message: "This request lapsed after 14 days without a decision. It can still be rejected to close it." },
  INVITATION_NOT_OPEN: { field: "form", message: "This invitation has already been accepted, revoked or has expired. Refresh the list." },
  INVITATION_NOT_AWAITING_APPROVAL: { field: "form", message: "This request has already been decided. Refresh the list." },
  INVITATION_AWAITING_APPROVAL: { field: "form", message: "This is still a request awaiting approval — nothing has been sent yet." },
  INVITATION_NOT_FOUND: { field: "form", message: "That invitation no longer exists." },
  TENANT_NOT_ACTIVE: { field: "form", message: "Your company's account isn't active, so staff can't be invited right now." },
  CANNOT_MANAGE_YOURSELF: { field: "form", message: "You can't change your own role or deactivate yourself. Ask another Executive Director." },
  CANNOT_MANAGE_STAFF_MEMBER: { field: "form", message: "This person holds permissions you don't, so you can't change their access." },
  LAST_EXECUTIVE_DIRECTOR: { field: "form", message: "This is your company's last active Executive Director. Appoint another first — a company must always have someone who can manage it." },
  STAFF_ALREADY_DEACTIVATED: { field: "form", message: "This person is already deactivated." },
  STAFF_NOT_DEACTIVATED: { field: "form", message: "This person isn't deactivated." },
  STAFF_MANAGEMENT_REQUIRES_COMPANY_WIDE_SCOPE: { field: "form", message: "Managing staff needs company-wide access — not while working inside one branch." },
  STAFF_NOT_FOUND: { field: "form", message: "That staff member no longer exists." },
};

function fail(code: string, serverMessage?: string): StaffError {
  const known = MESSAGES[code];
  // Scope and branch problems carry the backend's own wording, which names
  // the role ("'branch_manager' runs a branch, so branchId is required").
  if (code === "ROLE_SCOPE_MISMATCH" || code === "BRANCH_NOT_FOUND") return new StaffError("branchId", code, serverMessage ?? "That branch doesn't fit this role.");
  return new StaffError(known?.field ?? "form", code, known?.message ?? serverMessage ?? "That didn't go through.");
}

function staffError(err: unknown): Error {
  if (!(err instanceof ApiError)) return err instanceof Error ? err : new Error("That didn't go through.");
  const body = err.body;
  if (body?.fieldErrors) {
    const [field, message] = Object.entries(body.fieldErrors)[0] ?? [];
    if (field) return new StaffError(field, "VALIDATION", message);
  }
  return fail(body?.code ?? `HTTP_${err.status}`, body?.message);
}

function validateInvite(input: InviteInput): void {
  if (!input.firstName.trim()) throw new StaffError("firstName", "VALIDATION", "Enter their first name.");
  if (!input.lastName.trim()) throw new StaffError("lastName", "VALIDATION", "Enter their last name.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim())) throw new StaffError("email", "VALIDATION", "Enter a valid email address.");
  if (!input.roleCode) throw new StaffError("roleCode", "VALIDATION", "Choose a role.");
  const rule = input.scope ? branchRuleForScope(input.scope) : branchRuleFor(input.roleCode);
  if (rule === "required" && !input.branchId) throw new StaffError("branchId", "VALIDATION", `A ${roleName(input.roleCode)} runs a branch — choose which one.`);
  if (rule === "forbidden" && input.branchId) throw new StaffError("branchId", "VALIDATION", `A ${roleName(input.roleCode)} is company-wide and can't be limited to a branch.`);
}

function inviteBody(input: InviteInput): Record<string, string> {
  return {
    email: input.email.trim(), firstName: input.firstName.trim(), lastName: input.lastName.trim(), roleCode: input.roleCode,
    // Left out entirely for a company-wide role — the backend refuses one.
    ...(input.branchId && (input.scope ? branchRuleForScope(input.scope) : branchRuleFor(input.roleCode)) !== "forbidden" ? { branchId: input.branchId } : {}),
  };
}

// ─── Mock store ──────────────────────────────────────────────────────────────

const INVITATION_TTL_MS = 72 * 60 * 60 * 1000;
const REQUEST_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const RESEND_MIN_INTERVAL_MS = 2 * 60 * 1000;
const MAX_SENDS = 5;

interface MockInvitation extends StaffInvitation {
  tenantId: string;
  token: string | null;
  lastSentAt: number | null;
  requesterEmail: string;
}

const mockInvitations: MockInvitation[] = [];
const mockStaff = new Map<string, (StaffMember & { tenantId: string })[]>();
let mockSeq = 0;
const mockId = (prefix: string) => `${prefix}-${++mockSeq}-${Math.random().toString(36).slice(2, 8)}`;

// Seeded with the two portal accounts mock login already has — nobody invented.
function mockStaffFor(tenantId: string): (StaffMember & { tenantId: string })[] {
  if (!mockStaff.has(tenantId)) {
    mockStaff.set(tenantId, tenantId !== "estintin-group" ? [] : [
      { tenantId, userId: "staff-chidi", firstName: "Chidi", lastName: "Okeke", email: "director@estintin.com", phone: "+234 803 111 2222",
        status: "active", roles: [{ roleCode: "executive_director", roleName: "Executive Director", branchId: null, branchName: null }],
        lastLoginAt: null, createdAt: "2025-03-12T00:00:00Z" },
      { tenantId, userId: "staff-tunde", firstName: "Tunde", lastName: "Bakare", email: "heritage@estintin.com", phone: "+234 803 333 4444",
        status: "active", roles: [{ roleCode: "branch_manager", roleName: "Branch Manager", branchId: "heritage", branchName: "Heritage" }],
        lastLoginAt: null, createdAt: "2025-03-12T00:00:00Z" },
    ]);
  }
  return mockStaff.get(tenantId)!;
}

function mockBranchName(tenantId: string, branchId: string | null | undefined): string | null {
  if (!branchId) return null;
  const name = mockBranchNameFor(tenantId, branchId);
  if (!name) throw fail("BRANCH_NOT_FOUND", "That branch doesn't belong to your company.");
  return name;
}

function refreshMockStatus(inv: MockInvitation): void {
  // Lapsed: an unanswered request after 14 days, an unaccepted link after 72h.
  if ((inv.status === "pending") && Date.parse(inv.expiresAt) < Date.now()) inv.status = "expired";
}

function publicView(inv: MockInvitation): StaffInvitation {
  refreshMockStatus(inv);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { tenantId, token, lastSentAt, requesterEmail, ...dto } = inv;
  return { ...dto };
}

function mockEmailTaken(tenantId: string, email: string): boolean {
  const lower = email.trim().toLowerCase();
  return mockAccountExists(lower) || [...mockStaff.values()].flat().some((s) => s.email.toLowerCase() === lower)
    || (tenantId === "estintin-group" && ["director@estintin.com", "heritage@estintin.com"].includes(lower));
}

function issueMockLink(inv: MockInvitation): void {
  inv.token = `mock_${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  inv.status = "pending";
  inv.expiresAt = new Date(Date.now() + INVITATION_TTL_MS).toISOString();
  inv.lastSentAt = Date.now();
  inv.sendCount += 1;
}

/** Mock mode ONLY — there is no email, so the demo shows the link it would
 * have sent. The real API never returns a link; it goes by email only. */
export function mockInvitationLink(invitationId: string): string | null {
  const token = mockInvitations.find((i) => i.id === invitationId)?.token;
  return token ? `/accept-invitation#token=${token}` : null;
}

// ─── Invitations ─────────────────────────────────────────────────────────────

export async function inviteStaff(input: InviteInput, caller: StaffCaller): Promise<StaffInvitation> {
  validateInvite(input);
  if (!isMock("staff")) {
    try {
      return await apiClient.post<StaffInvitation>("/api/portal/staff/invitations", inviteBody(input));
    } catch (err) {
      throw staffError(err);
    }
  }
  if (caller.branchId) throw fail("INVITATIONS_REQUIRE_COMPANY_WIDE_SCOPE");
  return mockCreate(input, caller, false);
}

// A branch manager asks; nothing is sent to the person until a company-wide
// approver approves. The branch is always the requester's own — there is no
// picker, and any other branch is refused.
export async function requestStaff(input: Omit<InviteInput, "branchId">, caller: StaffCaller): Promise<StaffInvitation> {
  const full: InviteInput = { ...input, branchId: caller.branchId ?? undefined };
  if ((input.scope ? branchRuleForScope(input.scope) : branchRuleFor(input.roleCode)) === "forbidden") {
    throw new StaffError("roleCode", "ROLE_SCOPE_MISMATCH", "A company-wide role can't be requested for a branch.");
  }
  validateInvite(full);
  if (!isMock("staff")) {
    try {
      // The backend fills in the requester's own branch.
      const { branchId: _ignored, ...body } = inviteBody(full);
      void _ignored;
      return await apiClient.post<StaffInvitation>("/api/portal/staff/invitations/requests", body);
    } catch (err) {
      throw staffError(err);
    }
  }
  if (!caller.branchId) throw fail("INVITATION_REQUESTS_REQUIRE_BRANCH_SCOPE");
  return mockCreate(full, caller, true);
}

function mockRole(roleCode: string) {
  const role = MOCK_ROLES.find((r) => r.code === roleCode);
  if (!role) throw fail("ROLE_NOT_INVITABLE");
  return role;
}

function mockCreate(input: InviteInput, caller: StaffCaller, request: boolean): StaffInvitation {
  // SI-4 applies to whoever GRANTS: the inviter here, the approver for a request.
  if (!request && !holdsAll(caller.permissions, mockRole(input.roleCode).permissions)) throw fail("CANNOT_GRANT_ROLE");
  if (mockEmailTaken(caller.tenantId, input.email)) throw fail("EMAIL_HAS_ACCOUNT");
  const open = mockInvitations.some((i) => i.tenantId === caller.tenantId && i.email.toLowerCase() === input.email.trim().toLowerCase()
    && (i.status === "pending" || i.status === "awaiting_approval"));
  if (open) throw fail("INVITATION_ALREADY_PENDING");
  const branchId = branchRuleFor(input.roleCode) === "forbidden" ? null : (input.branchId ?? null);
  const inv: MockInvitation = {
    id: mockId("inv"), tenantId: caller.tenantId, email: input.email.trim(), firstName: input.firstName.trim(), lastName: input.lastName.trim(),
    roleCode: input.roleCode, roleName: roleName(input.roleCode), branchId, branchName: mockBranchName(caller.tenantId, branchId),
    status: "awaiting_approval", createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + REQUEST_TTL_MS).toISOString(),
    acceptedAt: null, revokedAt: null, sendCount: 0, approvalRequired: request, requestedBy: caller.userId ?? caller.email,
    approvedAt: null, rejectedAt: null, rejectionReason: null, token: null, lastSentAt: null, requesterEmail: caller.email,
  };
  if (!request) issueMockLink(inv);
  mockInvitations.push(inv);
  return publicView(inv);
}

// Company-wide callers see everything; a branch-scoped caller sees only
// invitations into their own branch.
export async function fetchInvitations(caller: StaffCaller): Promise<StaffInvitation[]> {
  if (!isMock("staff")) return apiClient.get<StaffInvitation[]>("/api/portal/staff/invitations");
  return mockInvitations
    .filter((i) => i.tenantId === caller.tenantId && (!caller.branchId || i.branchId === caller.branchId))
    .map(publicView)
    .reverse();
}

type InvitationAction = "approve" | "cancel" | "revoke" | "resend";

export async function actOnInvitation(id: string, action: InvitationAction, caller: StaffCaller): Promise<StaffInvitation> {
  if (!isMock("staff")) {
    try {
      return await apiClient.post<StaffInvitation>(`/api/portal/staff/invitations/${id}/${action}`);
    } catch (err) {
      throw staffError(err);
    }
  }
  const inv = mockInvitations.find((i) => i.id === id && i.tenantId === caller.tenantId);
  if (!inv) throw fail("INVITATION_NOT_FOUND");
  refreshMockStatus(inv);
  switch (action) {
    case "approve":
      if (caller.branchId) throw fail("INVITATIONS_REQUIRE_COMPANY_WIDE_SCOPE");
      if (inv.status !== "awaiting_approval") throw fail("INVITATION_NOT_AWAITING_APPROVAL");
      if (Date.parse(inv.expiresAt) < Date.now()) throw fail("INVITATION_REQUEST_EXPIRED");
      if (!holdsAll(caller.permissions, mockRole(inv.roleCode).permissions)) throw fail("CANNOT_GRANT_ROLE");
      // Re-checked: an account may have appeared while the request waited.
      if (mockEmailTaken(caller.tenantId, inv.email)) throw fail("EMAIL_HAS_ACCOUNT");
      inv.approvedAt = new Date().toISOString();
      issueMockLink(inv);
      break;
    case "cancel":
      // The requester's own only — anyone else's is "not found".
      if (inv.requesterEmail !== caller.email) throw fail("INVITATION_NOT_FOUND");
      if (inv.status !== "awaiting_approval") throw fail("INVITATION_NOT_AWAITING_APPROVAL");
      inv.status = "rejected";
      inv.rejectedAt = new Date().toISOString();
      inv.rejectionReason = "Cancelled by the requester.";
      break;
    case "revoke":
      if (inv.status !== "pending") throw fail(inv.status === "awaiting_approval" ? "INVITATION_AWAITING_APPROVAL" : "INVITATION_NOT_OPEN");
      inv.status = "revoked";
      inv.revokedAt = new Date().toISOString();
      inv.token = null;
      break;
    case "resend":
      if (inv.status === "awaiting_approval") throw fail("INVITATION_AWAITING_APPROVAL");
      if (inv.status !== "pending" && inv.status !== "expired") throw fail("INVITATION_NOT_OPEN");
      if (inv.sendCount >= MAX_SENDS) throw fail("INVITATION_RESEND_LIMIT_REACHED");
      if (inv.lastSentAt && Date.now() - inv.lastSentAt < RESEND_MIN_INTERVAL_MS) throw fail("INVITATION_RESEND_TOO_SOON");
      // A new token: the old link dies — never two live links.
      issueMockLink(inv);
      break;
  }
  return publicView(inv);
}

// A rejection needs a reason, which the branch manager who asked will see.
export async function rejectInvitation(id: string, reason: string, caller: StaffCaller): Promise<StaffInvitation> {
  if (!reason.trim()) throw new StaffError("reason", "VALIDATION", "Give a reason — the branch manager who asked will see it.");
  if (!isMock("staff")) {
    try {
      return await apiClient.post<StaffInvitation>(`/api/portal/staff/invitations/${id}/reject`, { reason: reason.trim() });
    } catch (err) {
      throw staffError(err);
    }
  }
  const inv = mockInvitations.find((i) => i.id === id && i.tenantId === caller.tenantId);
  if (!inv) throw fail("INVITATION_NOT_FOUND");
  if (caller.branchId) throw fail("INVITATIONS_REQUIRE_COMPANY_WIDE_SCOPE");
  if (inv.status !== "awaiting_approval") throw fail("INVITATION_NOT_AWAITING_APPROVAL");
  inv.status = "rejected";
  inv.rejectedAt = new Date().toISOString();
  inv.rejectionReason = reason.trim();
  return publicView(inv);
}

// ─── Accepting (public) ──────────────────────────────────────────────────────
//
// The token comes from the URL FRAGMENT (#token=…), which never reaches a
// server — so it never lands in an access log or a Referer header. It is read
// client-side and sent in the body. An unknown, expired, revoked or used link
// all get ONE response (INVITATION_INVALID): telling them apart would reveal
// which links once existed.

export function tokenFromHash(hash: string): string | null {
  const match = /(?:^#|&)token=([^&]+)/.exec(hash);
  return match ? decodeURIComponent(match[1]) : null;
}

export const INVALID_INVITATION_MESSAGE = "This invitation link isn't valid. It may have expired, been used already, or been replaced by a newer one. Ask whoever invited you to send it again.";

function invalidInvitation(): StaffError {
  return new StaffError("form", "INVITATION_INVALID", INVALID_INVITATION_MESSAGE);
}

function acceptError(err: unknown): Error {
  if (!(err instanceof ApiError)) return err instanceof Error ? err : new Error("That didn't go through.");
  const code = err.body?.code;
  if (code === "INVITATION_INVALID") return invalidInvitation();
  if (code === "EMAIL_HAS_ACCOUNT") return new StaffError("form", code, "An account with this email was created after you were invited. Ask your company to invite a different (work) email.");
  if (code === "TENANT_NOT_ACTIVE") return new StaffError("form", code, "This company's account isn't active right now, so the invitation can't be accepted yet.");
  if (err.body?.fieldErrors?.password) return new StaffError("password", "VALIDATION", "Choose a password.");
  return new StaffError("form", code ?? "UNKNOWN", err.body?.message ?? "That didn't go through.");
}

function mockByToken(token: string): MockInvitation {
  const inv = mockInvitations.find((i) => i.token === token);
  if (!inv) throw invalidInvitation();
  refreshMockStatus(inv);
  if (inv.status !== "pending") throw invalidInvitation();
  return inv;
}

export async function previewInvitation(token: string): Promise<InvitationPreview> {
  if (!isMock("staff")) {
    try {
      return await apiClient.post<InvitationPreview>("/api/auth/invitations/preview", { token }, { skipAuthRefresh: true });
    } catch (err) {
      throw acceptError(err);
    }
  }
  const inv = mockByToken(token);
  const tenant = fetchTenantByIdSync(inv.tenantId);
  return {
    email: inv.email, firstName: inv.firstName, companyName: tenant ? tenantDisplayName(tenant) : inv.tenantId,
    roleName: inv.roleName, branchName: inv.branchName, expiresAt: inv.expiresAt,
  };
}

// Creates the account with the company, role and branch FROM THE INVITATION —
// never from this request — and signs the person in exactly as login does:
// an access token in the body, the refresh token as an HttpOnly cookie (hence
// credentials: "include"). The password carries registration's rule only.
export async function acceptInvitation(token: string, password: string): Promise<AuthUser> {
  if (!password) throw new StaffError("password", "VALIDATION", "Choose a password.");
  if (!isMock("staff")) {
    try {
      const body = await apiClient.post<{ user: AuthUser; token: string }>(
        "/api/auth/invitations/accept", { token, password }, { credentials: "include", skipAuthRefresh: true });
      setAuthToken(body.token);
      return body.user;
    } catch (err) {
      throw acceptError(err);
    }
  }
  const inv = mockByToken(token);
  if (mockEmailTaken(inv.tenantId, inv.email)) throw acceptError(new ApiError(409, "", { code: "EMAIL_HAS_ACCOUNT" }));
  inv.status = "accepted";
  inv.acceptedAt = new Date().toISOString();
  inv.token = null; // single use
  const user: AuthUser = {
    name: `${inv.firstName} ${inv.lastName}`, email: inv.email, phone: "", country: "NG", currency: "NGN",
    kycStatus: "unsubmitted", kycType: "local", twoFAEnabled: false, role: "client",
    permissions: mockPermissionsForRole(inv.roleCode), tenantId: inv.tenantId, branchId: inv.branchId,
  };
  registerMockAccount(user);
  mockStaffFor(inv.tenantId).push({
    tenantId: inv.tenantId, userId: mockId("staff"), firstName: inv.firstName, lastName: inv.lastName, email: inv.email, phone: null,
    status: "active", roles: [{ roleCode: inv.roleCode, roleName: inv.roleName, branchId: inv.branchId, branchName: inv.branchName }],
    lastLoginAt: new Date().toISOString(), createdAt: new Date().toISOString(),
  });
  return user;
}

// ─── The team ────────────────────────────────────────────────────────────────

// A branch-scoped caller sees only their branch's staff.
export async function fetchStaff(caller: StaffCaller): Promise<StaffMember[]> {
  if (!isMock("staff")) return apiClient.get<StaffMember[]>("/api/portal/staff");
  return mockStaffFor(caller.tenantId)
    .filter((s) => !caller.branchId || s.roles.some((r) => r.branchId === caller.branchId))
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .map(({ tenantId, ...member }) => ({ ...member, roles: member.roles.map((r) => ({ ...r })) }));
}

function mockManageable(userId: string, caller: StaffCaller): StaffMember & { tenantId: string } {
  if (caller.branchId) throw fail("STAFF_MANAGEMENT_REQUIRES_COMPANY_WIDE_SCOPE");
  const member = mockStaffFor(caller.tenantId).find((s) => s.userId === userId);
  if (!member) throw fail("STAFF_NOT_FOUND");
  if (member.email.toLowerCase() === caller.email.toLowerCase()) throw fail("CANNOT_MANAGE_YOURSELF");
  return member;
}

function isActiveDirector(s: StaffMember): boolean {
  return s.status === "active" && s.roles.some((r) => r.roleCode === "executive_director");
}

function mockRequireAnotherDirector(member: StaffMember, tenantId: string): void {
  if (!isActiveDirector(member)) return;
  const others = mockStaffFor(tenantId).filter((s) => s.userId !== member.userId && isActiveDirector(s));
  if (others.length === 0) throw fail("LAST_EXECUTIVE_DIRECTOR");
}

// Replaces EVERY role the person holds with this one, under the same rules as
// an invitation. Their sessions end — but an access token already issued
// rides out its remaining 15 minutes. Not instant.
export async function changeStaffRole(userId: string, input: { roleCode: string; branchId?: string; scope?: RoleScope }, caller: StaffCaller): Promise<StaffMember> {
  const rule = input.scope ? branchRuleForScope(input.scope) : branchRuleFor(input.roleCode);
  if (rule === "required" && !input.branchId) throw new StaffError("branchId", "VALIDATION", `A ${roleName(input.roleCode)} runs a branch — choose which one.`);
  const body = { roleCode: input.roleCode, ...(input.branchId && rule !== "forbidden" ? { branchId: input.branchId } : {}) };
  if (!isMock("staff")) {
    try {
      return await apiClient.put<StaffMember>(`/api/portal/staff/${userId}/role`, body);
    } catch (err) {
      throw staffError(err);
    }
  }
  const member = mockManageable(userId, caller);
  if (!holdsAll(caller.permissions, mockRole(input.roleCode).permissions)) throw fail("CANNOT_GRANT_ROLE");
  if (input.roleCode !== "executive_director") mockRequireAnotherDirector(member, caller.tenantId);
  const branchId = rule === "forbidden" ? null : (input.branchId ?? null);
  member.roles = [{ roleCode: input.roleCode, roleName: roleName(input.roleCode), branchId, branchName: mockBranchName(caller.tenantId, branchId) }];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { tenantId, ...dto } = member;
  return { ...dto };
}

// Not a delete: login and refresh refuse a deactivated account, and
// reactivation restores it with its role untouched.
export async function setStaffActive(userId: string, active: boolean, reason: string, caller: StaffCaller): Promise<StaffMember> {
  if (!active && !reason.trim()) throw new StaffError("reason", "VALIDATION", "Give a reason — it's kept in the audit log.");
  if (!isMock("staff")) {
    try {
      return active
        ? await apiClient.post<StaffMember>(`/api/portal/staff/${userId}/reactivate`)
        : await apiClient.post<StaffMember>(`/api/portal/staff/${userId}/deactivate`, { reason: reason.trim() });
    } catch (err) {
      throw staffError(err);
    }
  }
  const member = mockManageable(userId, caller);
  if (active) {
    if (member.status !== "deactivated") throw fail("STAFF_NOT_DEACTIVATED");
    member.status = "active";
  } else {
    if (member.status === "deactivated") throw fail("STAFF_ALREADY_DEACTIVATED");
    mockRequireAnotherDirector(member, caller.tenantId);
    member.status = "deactivated";
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { tenantId, ...dto } = member;
  return { ...dto };
}
