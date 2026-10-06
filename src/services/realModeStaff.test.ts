// Real-mode contract tests for branches, staff and invitations, against a
// stubbed fetch. Responses transcribed from PortalBranchController,
// PortalStaffController, PortalStaffInvitationController,
// InvitationAcceptController and InvitationExceptionHandler (backend commits
// 16bfff3 and 6dfa23f). Mock mode never talks to the backend, so these are
// where a wrong path, body or code would show up.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

type Call = { url: string; method: string; body: unknown; credentials?: RequestCredentials };
let calls: Call[];
let store: Map<string, string>;

function respond(routes: Record<string, { status: number; body?: unknown }>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = url.replace("http://api.test", "");
    const method = (init.method ?? "GET").toUpperCase();
    calls.push({ url: path, method, body: init.body ? JSON.parse(String(init.body)) : undefined, credentials: init.credentials });
    const hit = routes[`${method} ${path}`];
    if (!hit) return new Response(JSON.stringify({ code: "NOT_FOUND" }), { status: 404 });
    return new Response(hit.body === undefined ? null : JSON.stringify(hit.body), { status: hit.status });
  }));
}

beforeEach(() => {
  calls = [];
  store = new Map([["auth_token", "access-1"]]);
  vi.stubEnv("VITE_API_BASE_URL", "http://api.test");
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const CALLER = { tenantId: "t", branchId: null, email: "ed@co.com" };
const BRANCH_CALLER = { tenantId: "t", branchId: "b1", email: "bm@co.com" };

describe("invitations", () => {
  it("a director's invitation leaves branchId out entirely", async () => {
    respond({ "POST /api/portal/staff/invitations": { status: 201, body: { id: "i1", status: "pending" } } });
    const { inviteStaff } = await import("./staffService");

    await inviteStaff({ email: "new@co.com", firstName: "N", lastName: "E", roleCode: "executive_director" }, CALLER);
    expect(calls[0].body).toEqual({ email: "new@co.com", firstName: "N", lastName: "E", roleCode: "executive_director" });
  });

  it("a branch request goes to /requests with NO branchId — the backend uses the requester's own", async () => {
    respond({ "POST /api/portal/staff/invitations/requests": { status: 201, body: { id: "r1", status: "awaiting_approval" } } });
    const { requestStaff } = await import("./staffService");

    const result = await requestStaff({ email: "s@co.com", firstName: "S", lastName: "V", roleCode: "surveyor_project_manager" }, BRANCH_CALLER);
    expect(calls[0].body).toEqual({ email: "s@co.com", firstName: "S", lastName: "V", roleCode: "surveyor_project_manager" });
    expect(result.status).toBe("awaiting_approval");
  });

  it.each([
    [409, "EMAIL_HAS_ACCOUNT", "email", /work email/],
    [403, "CANNOT_GRANT_ROLE", "roleCode", /permissions you don't hold/],
    [409, "INVITATION_ALREADY_PENDING", "email", /Resend/],
    [400, "ROLE_SCOPE_MISMATCH", "branchId", /runs a branch/],
  ])("a %i %s lands on the %s field with a reason a person can act on", async (status, code, field, text) => {
    respond({ "POST /api/portal/staff/invitations": { status, body: { code, message: "'branch_manager' runs a branch, so branchId is required." } } });
    const { inviteStaff } = await import("./staffService");

    const err = await inviteStaff({ email: "x@co.com", firstName: "X", lastName: "Y", roleCode: "sales_manager" }, CALLER).catch((e) => e);
    expect(err).toMatchObject({ code, field });
    expect(err.message).toMatch(text);
  });

  it.each(["approve", "cancel", "revoke", "resend"] as const)("%s is a POST to its own route", async (action) => {
    respond({ [`POST /api/portal/staff/invitations/i1/${action}`]: { status: 200, body: { id: "i1" } } });
    const { actOnInvitation } = await import("./staffService");
    await actOnInvitation("i1", action, CALLER);
    expect(calls[0]).toMatchObject({ method: "POST", url: `/api/portal/staff/invitations/i1/${action}` });
  });

  it("reject sends { reason }; resend limits come back as a reason, not a bare 429", async () => {
    respond({
      "POST /api/portal/staff/invitations/i1/reject": { status: 200, body: { id: "i1", status: "rejected" } },
      "POST /api/portal/staff/invitations/i2/resend": { status: 429, body: { code: "INVITATION_RESEND_TOO_SOON", message: "x" } },
    });
    const { rejectInvitation, actOnInvitation } = await import("./staffService");

    await rejectInvitation("i1", " Not now. ", CALLER);
    expect(calls[0].body).toEqual({ reason: "Not now." });
    await expect(actOnInvitation("i2", "resend", CALLER)).rejects.toMatchObject({ code: "INVITATION_RESEND_TOO_SOON", message: expect.stringMatching(/two minutes/) });
  });
});

describe("accepting (public)", () => {
  it("previews with the token in the BODY, and accept signs in with the cookie kept", async () => {
    respond({
      "POST /api/auth/invitations/preview": { status: 200, body: { email: "a@co.com", firstName: "A", companyName: "Co", roleName: "Sales Manager", branchName: null, expiresAt: "2026-10-09T00:00:00Z" } },
      "POST /api/auth/invitations/accept": { status: 200, body: { user: { email: "a@co.com", tenantId: "t", branchId: null, permissions: [] }, token: "access-2" } },
    });
    const { previewInvitation, acceptInvitation } = await import("./staffService");

    await previewInvitation("tok_1");
    const user = await acceptInvitation("tok_1", "pw");

    expect(calls[0]).toMatchObject({ url: "/api/auth/invitations/preview", body: { token: "tok_1" } });
    expect(calls[1]).toMatchObject({ url: "/api/auth/invitations/accept", body: { token: "tok_1", password: "pw" }, credentials: "include" });
    expect(user.email).toBe("a@co.com");
    expect(store.get("auth_token")).toBe("access-2");
    // Never in a URL.
    expect(calls.every((c) => !c.url.includes("tok_1"))).toBe(true);
  });

  it("an invalid link — unknown, expired, revoked or used — gets one message", async () => {
    respond({ "POST /api/auth/invitations/preview": { status: 400, body: { code: "INVITATION_INVALID", message: "x" } } });
    const { previewInvitation, INVALID_INVITATION_MESSAGE } = await import("./staffService");
    await expect(previewInvitation("tok_x")).rejects.toMatchObject({ code: "INVITATION_INVALID", message: INVALID_INVITATION_MESSAGE });
  });
});

describe("the team", () => {
  it("a role change is a PUT of { roleCode, branchId? }; deactivate sends { reason }", async () => {
    respond({
      "PUT /api/portal/staff/u1/role": { status: 200, body: { userId: "u1" } },
      "POST /api/portal/staff/u1/deactivate": { status: 200, body: { userId: "u1" } },
      "POST /api/portal/staff/u1/reactivate": { status: 200, body: { userId: "u1" } },
    });
    const { changeStaffRole, setStaffActive } = await import("./staffService");

    await changeStaffRole("u1", { roleCode: "branch_manager", branchId: "b1" }, CALLER);
    await setStaffActive("u1", false, " On leave ", CALLER);
    await setStaffActive("u1", true, "", CALLER);
    expect(calls.map((c) => [c.method, c.url, c.body])).toEqual([
      ["PUT", "/api/portal/staff/u1/role", { roleCode: "branch_manager", branchId: "b1" }],
      ["POST", "/api/portal/staff/u1/deactivate", { reason: "On leave" }],
      ["POST", "/api/portal/staff/u1/reactivate", undefined],
    ]);
  });

  it("LAST_EXECUTIVE_DIRECTOR explains what to do instead", async () => {
    respond({ "POST /api/portal/staff/u1/deactivate": { status: 409, body: { code: "LAST_EXECUTIVE_DIRECTOR" } } });
    const { setStaffActive } = await import("./staffService");
    await expect(setStaffActive("u1", false, "r", CALLER)).rejects.toMatchObject({ message: expect.stringMatching(/Appoint another first/) });
  });
});

describe("branches", () => {
  it("creates with blanks left out, and a clash is a clean message about the name", async () => {
    respond({ "POST /api/portal/branches": { status: 409, body: { code: "BRANCH_NAME_TAKEN", message: "x" } } });
    const { createBranch } = await import("./branchesService");

    const err = await createBranch({ name: "Harmony", street: "", city: "Abuja" }, { tenantId: "t" }).catch((e) => e);
    expect(calls[0].body).toEqual({ name: "Harmony", city: "Abuja" });
    expect(err).toMatchObject({ field: "name", code: "BRANCH_NAME_TAKEN" });
  });

  it("an update sends a blank to clear a field", async () => {
    respond({ "PUT /api/portal/branches/b1": { status: 200, body: { id: "b1" } } });
    const { updateBranch } = await import("./branchesService");
    await updateBranch("b1", { phone: "" }, { tenantId: "t" });
    expect(calls[0].body).toEqual({ phone: "" });
  });
});

describe("estates with no branch", () => {
  it("a company-level estate is created without a branchId", async () => {
    respond({ "POST /api/portal/estates": { status: 201, body: { id: "e1", tenantId: "t", branchId: null, name: "N", slug: "n", hasFootprint: false } } });
    const { createPortalEstate } = await import("./portalEstatesService");

    const estate = await createPortalEstate({ name: "N", description: "", area: "", city: "", state: "Lagos", address: "", cornerPremiumPct: 0, amenities: [] }, { tenantId: "t" });
    expect(calls[0].body).not.toHaveProperty("branchId");
    expect(estate.branchId).toBeNull();
  });
});
