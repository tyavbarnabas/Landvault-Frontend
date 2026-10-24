import { describe, it, expect } from "vitest";
import {
  INVALID_INVITATION_MESSAGE, StaffError, acceptInvitation, actOnInvitation, branchRuleFor, changeStaffRole, companyOnlyPermissions,
  createRole, deleteRole, fetchAssignableRoles, groupPermissions, fetchInvitations, fetchPortalPermissions, fetchStaff, inviteStaff, mockInvitationLink,
  previewInvitation, rejectInvitation, requestStaff, setStaffActive, tokenFromHash, updateRole,
  type StaffCaller,
} from "./staffService";
import { createBranch, fetchBranches, updateBranch } from "./branchesService";
import { login, mockPermissionsForRole } from "./authService";

const DIRECTOR: StaffCaller = { tenantId: "estintin-group", branchId: null, email: "director@estintin.com" };
const HERITAGE: StaffCaller = { tenantId: "estintin-group", branchId: "heritage", email: "heritage@estintin.com" };
let n = 0;
const fresh = () => `person${++n}@estintin-work.com`;
const tokenOf = (id: string) => tokenFromHash(mockInvitationLink(id)!.split("/accept-invitation")[1]);

describe("role and branch rules", () => {
  it("a branch is required for a branch manager, refused for a director, optional otherwise", () => {
    expect(branchRuleFor("branch_manager")).toBe("required");
    expect(branchRuleFor("executive_director")).toBe("forbidden");
    expect(branchRuleFor("sales_manager")).toBe("optional");
  });

  it("refuses an invalid role/branch pair before anything is sent", async () => {
    await expect(inviteStaff({ email: fresh(), firstName: "A", lastName: "B", roleCode: "branch_manager" }, DIRECTOR))
      .rejects.toMatchObject({ field: "branchId" });
    await expect(inviteStaff({ email: fresh(), firstName: "A", lastName: "B", roleCode: "executive_director", branchId: "heritage" }, DIRECTOR))
      .rejects.toMatchObject({ field: "branchId" });
  });
});

describe("inviting", () => {
  it("refuses an email that already has an account — and says to use a work email", async () => {
    const err = await inviteStaff({ email: "emeka.okonkwo@gmail.com", firstName: "Emeka", lastName: "O", roleCode: "sales_manager" }, DIRECTOR).catch((e) => e);
    expect(err).toBeInstanceOf(StaffError);
    expect(err).toMatchObject({ code: "EMAIL_HAS_ACCOUNT", field: "email" });
    expect(err.message).toMatch(/work email/);
  });

  it("refuses a second open invitation for the same email", async () => {
    const email = fresh();
    await inviteStaff({ email, firstName: "A", lastName: "B", roleCode: "sales_manager" }, DIRECTOR);
    await expect(inviteStaff({ email, firstName: "A", lastName: "B", roleCode: "sales_manager" }, DIRECTOR)).rejects.toMatchObject({ code: "INVITATION_ALREADY_PENDING" });
  });

  it("only company-wide callers invite", async () => {
    await expect(inviteStaff({ email: fresh(), firstName: "A", lastName: "B", roleCode: "sales_manager" }, HERITAGE))
      .rejects.toMatchObject({ code: "INVITATIONS_REQUIRE_COMPANY_WIDE_SCOPE" });
  });

  it("previews, then accepts once — creating an account that can sign in, in the invited branch", async () => {
    const email = fresh();
    const inv = await inviteStaff({ email, firstName: "Amaka", lastName: "C", roleCode: "branch_manager", branchId: "double-king" }, DIRECTOR);
    expect(inv.status).toBe("pending");
    const token = tokenOf(inv.id)!;

    expect(await previewInvitation(token)).toMatchObject({ email, firstName: "Amaka", roleName: "Branch Manager", branchName: "Double King" });

    const user = await acceptInvitation(token, "a password");
    expect(user).toMatchObject({ email, tenantId: "estintin-group", branchId: "double-king" });
    // A branch manager reads estates and letters and asks for staff — never manages estates.
    expect(user.permissions).toEqual(["portal.estates.view", "portal.staff.request", "portal.documents.view"]);

    // Single use, and indistinguishable from a link that never existed.
    const reused = await previewInvitation(token).catch((e) => e);
    const unknown = await previewInvitation("never-issued").catch((e) => e);
    expect(reused.message).toBe(INVALID_INVITATION_MESSAGE);
    expect(unknown.message).toBe(INVALID_INVITATION_MESSAGE);

    expect((await login(email, "a password")).kind).toBe("authenticated");
    expect((await fetchStaff(DIRECTOR)).some((s) => s.email === email)).toBe(true);
  });

  it("revoking kills the link; resending issues a new one and the old dies", async () => {
    const inv = await inviteStaff({ email: fresh(), firstName: "A", lastName: "B", roleCode: "sales_manager" }, DIRECTOR);
    const first = tokenOf(inv.id)!;
    // Resent too soon after the first send.
    await expect(actOnInvitation(inv.id, "resend", DIRECTOR)).rejects.toMatchObject({ code: "INVITATION_RESEND_TOO_SOON" });

    await actOnInvitation(inv.id, "revoke", DIRECTOR);
    await expect(previewInvitation(first)).rejects.toMatchObject({ code: "INVITATION_INVALID" });
  });
});

describe("branch requests", () => {
  it("a branch manager asks for their own branch; nothing is sent until approved", async () => {
    const email = fresh();
    const req = await requestStaff({ email, firstName: "Sola", lastName: "D", roleCode: "surveyor_project_manager" }, HERITAGE);
    expect(req).toMatchObject({ status: "awaiting_approval", approvalRequired: true, branchId: "heritage" });
    expect(mockInvitationLink(req.id)).toBeNull();

    // Visible to the branch and to head office.
    expect((await fetchInvitations(HERITAGE)).some((i) => i.id === req.id)).toBe(true);

    const approved = await actOnInvitation(req.id, "approve", DIRECTOR);
    expect(approved.status).toBe("pending");
    expect(mockInvitationLink(req.id)).not.toBeNull();
  });

  it("a company-wide role can't be requested, and a director doesn't request", async () => {
    await expect(requestStaff({ email: fresh(), firstName: "A", lastName: "B", roleCode: "executive_director" }, HERITAGE))
      .rejects.toMatchObject({ field: "roleCode" });
    await expect(requestStaff({ email: fresh(), firstName: "A", lastName: "B", roleCode: "sales_manager" }, DIRECTOR))
      .rejects.toMatchObject({ code: "INVITATION_REQUESTS_REQUIRE_BRANCH_SCOPE" });
  });

  it("rejecting needs a reason, which the branch sees; the requester can cancel their own", async () => {
    const r1 = await requestStaff({ email: fresh(), firstName: "A", lastName: "B", roleCode: "sales_manager" }, HERITAGE);
    await expect(rejectInvitation(r1.id, " ", DIRECTOR)).rejects.toMatchObject({ field: "reason" });
    const rejected = await rejectInvitation(r1.id, "No headcount this quarter.", DIRECTOR);
    expect(rejected).toMatchObject({ status: "rejected", rejectionReason: "No headcount this quarter." });

    const r2 = await requestStaff({ email: fresh(), firstName: "A", lastName: "B", roleCode: "sales_manager" }, HERITAGE);
    await expect(actOnInvitation(r2.id, "cancel", DIRECTOR)).rejects.toMatchObject({ code: "INVITATION_NOT_FOUND" });
    expect((await actOnInvitation(r2.id, "cancel", HERITAGE)).status).toBe("rejected");
  });
});

describe("managing the team", () => {
  it("never yourself, and never the last executive director", async () => {
    const me = (await fetchStaff(DIRECTOR)).find((s) => s.email === DIRECTOR.email)!;
    await expect(changeStaffRole(me.userId, { roleCode: "sales_manager" }, DIRECTOR)).rejects.toMatchObject({ code: "CANNOT_MANAGE_YOURSELF" });
    // Seen from a second director's side: Chidi is the only active director.
    const other: StaffCaller = { ...DIRECTOR, email: "someone-else@estintin.com" };
    await expect(setStaffActive(me.userId, false, "leaving", other)).rejects.toMatchObject({ code: "LAST_EXECUTIVE_DIRECTOR" });
  });

  it("a role change replaces every role under the invitation rules; deactivate needs a reason; reactivate restores", async () => {
    const tunde = (await fetchStaff(DIRECTOR)).find((s) => s.email === HERITAGE.email)!;
    await expect(changeStaffRole(tunde.userId, { roleCode: "branch_manager" }, DIRECTOR)).rejects.toMatchObject({ field: "branchId" });
    const changed = await changeStaffRole(tunde.userId, { roleCode: "branch_manager", branchId: "premium" }, DIRECTOR);
    expect(changed.roles).toEqual([{ roleCode: "branch_manager", roleName: "Branch Manager", branchId: "premium", branchName: "Premium" }]);

    await expect(setStaffActive(tunde.userId, false, "", DIRECTOR)).rejects.toMatchObject({ field: "reason" });
    expect((await setStaffActive(tunde.userId, false, "On leave", DIRECTOR)).status).toBe("deactivated");
    expect((await setStaffActive(tunde.userId, true, "", DIRECTOR)).status).toBe("active");
    await changeStaffRole(tunde.userId, { roleCode: "branch_manager", branchId: "heritage" }, DIRECTOR);
  });

  it("a branch-scoped caller sees only their branch's staff, and can't manage anyone", async () => {
    expect((await fetchStaff(HERITAGE)).every((s) => s.roles.some((r) => r.branchId === "heritage"))).toBe(true);
    const anyone = (await fetchStaff(DIRECTOR))[0];
    await expect(setStaffActive(anyone.userId, false, "x", HERITAGE)).rejects.toMatchObject({ code: "STAFF_MANAGEMENT_REQUIRES_COMPANY_WIDE_SCOPE" });
  });
});

describe("branches", () => {
  const SCOPE = { tenantId: "estintin-group", branchId: null };

  it("creates a branch with optional public office details; names unique ignoring case", async () => {
    const created = await createBranch({ name: "Harmony", city: "Abuja", phone: "+234 809 000 0000" }, SCOPE);
    expect(created).toMatchObject({ name: "Harmony", city: "Abuja", street: null, email: null });
    await expect(createBranch({ name: "harmony" }, SCOPE)).rejects.toMatchObject({ field: "name", code: "BRANCH_NAME_TAKEN" });
    expect((await updateBranch(created.id, { city: "" }, SCOPE)).city).toBeNull();
  });

  it("a branch-scoped caller can't create a sibling — and sees only their own branch", async () => {
    await expect(createBranch({ name: "My Own Annex" }, { tenantId: "estintin-group", branchId: "heritage" }))
      .rejects.toMatchObject({ code: "BRANCHES_REQUIRE_COMPANY_WIDE_SCOPE" });
    expect((await fetchBranches({ tenantId: "estintin-group", branchId: "heritage" })).map((b) => b.id)).toEqual(["heritage"]);
  });

  it("refuses a malformed phone number with the backend's own rule", async () => {
    await expect(createBranch({ name: "Phone Test", phone: "call me" }, SCOPE)).rejects.toMatchObject({ field: "phone" });
  });
});

describe("the token comes from the URL fragment", () => {
  it("reads #token=…, never a query string", () => {
    expect(tokenFromHash("#token=abc123")).toBe("abc123");
    expect(tokenFromHash("#other=1&token=x%2By")).toBe("x+y");
    expect(tokenFromHash("")).toBeNull();
  });
});

describe("creating a tenant invites its first Executive Director", () => {
  it("refuses a primary contact whose email already has an account, with the backend's code", async () => {
    const { createTenantDraft } = await import("./tenantsService");
    const err = await createTenantDraft({
      identity: {} as never, presence: {} as never, plan: "starter",
      primaryContact: { fullName: "Emeka O", roleTitle: "MD", workEmail: "emeka.okonkwo@gmail.com", phone: "", govIdType: "NIN", govIdNumber: "" },
    }).catch((e) => e);
    expect(err).toMatchObject({ status: 409, body: { code: "EMAIL_ALREADY_REGISTERED" } });
  });
});

describe("company-made roles", () => {
  // With permissions, so "never grant what you don't hold" is checked.
  const ED: StaffCaller = { ...DIRECTOR, permissions: mockPermissionsForRole("executive_director") };
  const FINANCE: StaffCaller = { ...DIRECTOR, email: "finance@estintin.com", permissions: mockPermissionsForRole("finance_officer") };
  let r = 0;
  const name = () => `Accounts Clerk ${++r}`;

  it("lists the 11 portal permissions, marking those you hold and the company-wide-only ones", async () => {
    const all = await fetchPortalPermissions(FINANCE);
    expect(all).toHaveLength(11);
    expect(all.filter((p) => p.held).map((p) => p.code).sort()).toEqual(["portal.documents.view", "portal.estates.view", "portal.payments.verify"]);
    expect(all.filter((p) => p.requiresCompanyWide).map((p) => p.code).sort())
      .toEqual(["portal.branches.manage", "portal.documents.manage", "portal.plans.revoke", "portal.roles.manage", "portal.settlement.manage", "portal.staff.invite"]);
    expect(companyOnlyPermissions("either", ["portal.estates.view", "portal.staff.invite"], all)).toEqual(["portal.staff.invite"]);
    expect(companyOnlyPermissions("company", ["portal.staff.invite"], all)).toEqual([]);
  });

  it("groups the catalogue under the backend's headings, in the backend's order", async () => {
    const groups = groupPermissions(await fetchPortalPermissions(ED));
    expect(groups.map((g) => g.label)).toEqual(["Estates", "Money", "Branches", "Staff and roles", "Documents"]);
    expect(groups[3].permissions.map((p) => p.code)).toEqual(["portal.staff.invite", "portal.staff.request", "portal.roles.manage"]);
    // Never re-sorted: a group's first appearance decides its place.
    expect(groupPermissions([{ group: "b", groupLabel: "B" }, { group: "a", groupLabel: "A" }, { group: "b", groupLabel: "B" }]).map((g) => [g.group, g.permissions.length]))
      .toEqual([["b", 2], ["a", 1]]);
  });

  it("creates a custom role that the pickers offer next to the standard ones, and invitations use by code", async () => {
    const role = await createRole({ name: name(), description: "Checks payments.", scope: "either", permissions: ["portal.estates.view", "portal.payments.verify"] }, ED);
    expect(role).toMatchObject({ custom: true, scope: "either", canGrant: true });
    expect(role.code).toMatch(/^custom_/);
    const roles = await fetchAssignableRoles(ED);
    expect(roles.find((x) => x.code === role.code)).toMatchObject({ custom: true });
    expect(roles.find((x) => x.code === "sales_manager")).toMatchObject({ custom: false });

    const inv = await inviteStaff({ email: fresh(), firstName: "A", lastName: "B", roleCode: role.code, scope: role.scope }, ED);
    expect(inv.roleName).toBe(role.name);
    // Offered by an open invitation, so it can't be deleted yet.
    await expect(deleteRole(role.code, ED)).rejects.toMatchObject({ code: "ROLE_IN_USE" });
    await actOnInvitation(inv.id, "revoke", ED);
    await deleteRole(role.code, ED);
    expect((await fetchAssignableRoles(ED)).some((x) => x.code === role.code)).toBe(false);
  });

  it("refuses what the backend refuses", async () => {
    const base = { description: "", scope: "either" as const, permissions: ["portal.estates.view"] };
    await expect(createRole({ ...base, name: " " }, ED)).rejects.toMatchObject({ field: "name" });
    await expect(createRole({ ...base, name: name(), permissions: [] }, ED)).rejects.toMatchObject({ field: "permissions" });
    // Can't reuse a standard role's name, in any case.
    await expect(createRole({ ...base, name: "sales MANAGER" }, ED)).rejects.toMatchObject({ code: "ROLE_NAME_TAKEN", field: "name" });
    await expect(createRole({ ...base, name: name(), permissions: ["portal.staff.invite"] }, ED))
      .rejects.toMatchObject({ code: "PERMISSION_REQUIRES_COMPANY_SCOPE", field: "permissions" });
    await expect(createRole({ ...base, name: name(), permissions: ["portal.estates.manage"] }, FINANCE))
      .rejects.toMatchObject({ code: "CANNOT_GRANT_PERMISSION" });
    await expect(createRole({ ...base, name: name() }, { ...ED, branchId: "heritage" }))
      .rejects.toMatchObject({ code: "ROLES_REQUIRE_COMPANY_WIDE_SCOPE" });
  });

  it("edits name, description and permissions — never the scope — and locks standard roles", async () => {
    const role = await createRole({ name: name(), description: "x", scope: "company", permissions: ["portal.staff.invite"] }, ED);
    const edited = await updateRole(role.code, { description: "", permissions: ["portal.staff.invite", "portal.branches.manage"] }, ED);
    expect(edited).toMatchObject({ scope: "company", description: null, permissions: ["portal.staff.invite", "portal.branches.manage"] });

    const other = await createRole({ name: name(), description: "", scope: "either", permissions: ["portal.estates.view"] }, ED);
    await expect(updateRole(other.code, { name: role.name.toUpperCase() }, ED)).rejects.toMatchObject({ code: "ROLE_NAME_TAKEN" });
    await expect(updateRole("sales_manager", { name: "Sales" }, ED)).rejects.toMatchObject({ code: "STANDARD_ROLE_LOCKED" });
    await expect(deleteRole("sales_manager", ED)).rejects.toMatchObject({ code: "STANDARD_ROLE_LOCKED" });
    await expect(updateRole("custom_nope", { name: "X" }, ED)).rejects.toMatchObject({ code: "ROLE_NOT_FOUND" });
    // Someone holding less than the role carries can't change it.
    await expect(updateRole(role.code, { name: "Mine now" }, FINANCE)).rejects.toMatchObject({ code: "CANNOT_MANAGE_ROLE" });
    await deleteRole(role.code, ED);
    await deleteRole(other.code, ED);
  });

  it("caps a company at 30 roles of its own", async () => {
    const made = [];
    for (let i = 0; i < 30; i++) made.push(await createRole({ name: name(), description: "", scope: "either", permissions: ["portal.estates.view"] }, ED));
    await expect(createRole({ name: name(), description: "", scope: "either", permissions: ["portal.estates.view"] }, ED))
      .rejects.toMatchObject({ code: "ROLE_LIMIT_REACHED" });
    for (const role of made) await deleteRole(role.code, ED);
  });

  it("an accepted invitation into a custom role carries exactly its permissions", async () => {
    const role = await createRole({ name: name(), description: "", scope: "either", permissions: ["portal.estates.view", "portal.payments.verify"] }, ED);
    const inv = await inviteStaff({ email: fresh(), firstName: "Ngozi", lastName: "E", roleCode: role.code, scope: role.scope }, ED);
    const user = await acceptInvitation(tokenOf(inv.id)!, "a password");
    expect(user.permissions).toEqual(["portal.estates.view", "portal.payments.verify"]);
    // Now held by someone — deactivated or not, it stays.
    await expect(deleteRole(role.code, ED)).rejects.toMatchObject({ code: "ROLE_IN_USE" });
  });
});
