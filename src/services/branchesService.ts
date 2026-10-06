// A company's own branches (TB-1..TB-3): GET/POST /api/portal/branches,
// PUT /api/portal/branches/{id}.
//
// Branches are the company's internal structure, not a platform concern —
// whether Estintin splits Double King into two offices is their business.
// Creating and renaming need portal.branches.manage (Executive Director only)
// AND a company-wide current scope: a branch manager able to create a sibling
// branch and assign themselves to it would widen their own reach, and the
// database alone would let them (changeset 021's WITH CHECK). So the backend
// refuses a branch-scoped caller outright (BRANCHES_REQUIRE_COMPANY_WIDE_SCOPE).
//
// A branch's office details are optional and SHOWN PUBLICLY on its listings.
// No delete route, and no parent branch: the branch wall compares exact ids,
// so a hierarchy would promise visibility that doesn't exist.

import { ApiError, apiClient } from "../lib/apiClient";
import type { NigerianState } from "../data/nigerianStates";
import { fetchTenantByIdSync } from "./tenantsService";
import type { PortalScope } from "./portalEstatesService";

// PortalBranchDto.
export interface PortalBranch {
  id: string;
  name: string;
  street: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
  createdAt: string;
}

export interface BranchInput {
  name: string;
  street?: string;
  city?: string;
  state?: NigerianState | "";
  phone?: string;
  email?: string;
}

export class BranchError extends Error {
  field: string;
  code: string;
  constructor(field: string, code: string, message: string) {
    super(message);
    this.name = "BranchError";
    this.field = field;
    this.code = code;
  }
}

// The backend's own phone rule, checked before the round trip.
const PHONE = /^\+?[0-9 ()-]{7,20}$/;

function validate(input: Partial<BranchInput>, creating: boolean): void {
  if ((creating || input.name !== undefined) && !input.name?.trim()) throw new BranchError("name", "VALIDATION", "A branch needs a name.");
  if (input.phone?.trim() && !PHONE.test(input.phone.trim())) throw new BranchError("phone", "VALIDATION", "That doesn't look like a phone number.");
  if (input.email?.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim())) throw new BranchError("email", "VALIDATION", "That doesn't look like an email address.");
}

function branchError(err: unknown, name?: string): Error {
  if (!(err instanceof ApiError)) return err instanceof Error ? err : new Error("Couldn't save the branch.");
  const body = err.body;
  const code = body?.code ?? "UNKNOWN";
  if (code === "BRANCH_NAME_TAKEN" || err.status === 409) {
    return new BranchError("name", "BRANCH_NAME_TAKEN", `Your company already has a branch called "${name?.trim() ?? ""}". Names are unique, ignoring case.`);
  }
  if (code === "BRANCHES_REQUIRE_COMPANY_WIDE_SCOPE") {
    return new BranchError("form", code, "Branches can only be created or renamed with company-wide access — not while working inside one branch.");
  }
  if (code === "UNKNOWN_STATE") return new BranchError("state", code, body?.message ?? "That isn't a Nigerian state the platform recognises.");
  if (body?.fieldErrors) {
    const [field, message] = Object.entries(body.fieldErrors)[0] ?? [];
    if (field) return new BranchError(field, "VALIDATION", message);
  }
  if (err.status === 404) return new BranchError("form", "BRANCH_NOT_FOUND", "That branch no longer exists.");
  return new BranchError("form", code, body?.message ?? "Couldn't save the branch.");
}

// Blank strings go as-is on update (a blank clears the field); on create they
// are left out.
function cleaned(input: Partial<BranchInput>, creating: boolean): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    const trimmed = String(value).trim();
    if (creating && !trimmed) continue;
    out[key] = trimmed;
  }
  return out;
}

// ─── Mock store ──────────────────────────────────────────────────────────────

const mockBranches = new Map<string, PortalBranch[]>();

function mockBranchesFor(tenantId: string): PortalBranch[] {
  if (!mockBranches.has(tenantId)) {
    // Seeded from the tenant's own branches, with no office details — none
    // were ever recorded, and none are invented.
    const seeded = (fetchTenantByIdSync(tenantId)?.branches ?? []).map((b) => ({
      id: b.id, name: b.name, street: null, city: null, state: null, phone: null, email: null, createdAt: "2025-03-12T00:00:00Z",
    }));
    mockBranches.set(tenantId, seeded);
  }
  return mockBranches.get(tenantId)!;
}

function mockRequireCompanyWide(scope: PortalScope): void {
  if (scope.branchId) {
    throw new BranchError("form", "BRANCHES_REQUIRE_COMPANY_WIDE_SCOPE", "Branches can only be created or renamed with company-wide access — not while working inside one branch.");
  }
}

// ─── API ─────────────────────────────────────────────────────────────────────

// Company-wide staff see every branch; branch-scoped staff see only their own.
// A company with no branches gets an empty list — never an invented "Head Office".
export async function fetchBranches(scope: PortalScope): Promise<PortalBranch[]> {
  if (!apiClient.isMockMode) return apiClient.get<PortalBranch[]>("/api/portal/branches");
  const all = mockBranchesFor(scope.tenantId);
  return scope.branchId ? all.filter((b) => b.id === scope.branchId) : [...all];
}

export async function createBranch(input: BranchInput, scope: PortalScope): Promise<PortalBranch> {
  validate(input, true);
  if (!apiClient.isMockMode) {
    try {
      return await apiClient.post<PortalBranch>("/api/portal/branches", cleaned(input, true));
    } catch (err) {
      throw branchError(err, input.name);
    }
  }
  mockRequireCompanyWide(scope);
  const all = mockBranchesFor(scope.tenantId);
  const name = input.name.trim();
  if (all.some((b) => b.name.toLowerCase() === name.toLowerCase())) {
    throw new BranchError("name", "BRANCH_NAME_TAKEN", `Your company already has a branch called "${name}". Names are unique, ignoring case.`);
  }
  const blankToNull = (v?: string) => (v?.trim() ? v.trim() : null);
  const branch: PortalBranch = {
    id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `branch-${all.length + 1}`,
    name, street: blankToNull(input.street), city: blankToNull(input.city), state: blankToNull(input.state),
    phone: blankToNull(input.phone), email: blankToNull(input.email), createdAt: new Date().toISOString(),
  };
  all.push(branch);
  return branch;
}

export async function updateBranch(id: string, input: Partial<BranchInput>, scope: PortalScope): Promise<PortalBranch> {
  validate(input, false);
  if (!apiClient.isMockMode) {
    try {
      return await apiClient.put<PortalBranch>(`/api/portal/branches/${id}`, cleaned(input, false));
    } catch (err) {
      throw branchError(err, input.name);
    }
  }
  mockRequireCompanyWide(scope);
  const all = mockBranchesFor(scope.tenantId);
  const branch = all.find((b) => b.id === id);
  if (!branch) throw new BranchError("form", "BRANCH_NOT_FOUND", "That branch no longer exists.");
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (all.some((b) => b.id !== id && b.name.toLowerCase() === name.toLowerCase())) {
      throw new BranchError("name", "BRANCH_NAME_TAKEN", `Your company already has a branch called "${name}". Names are unique, ignoring case.`);
    }
    branch.name = name;
  }
  for (const key of ["street", "city", "state", "phone", "email"] as const) {
    if (input[key] !== undefined) branch[key] = input[key]!.trim() ? input[key]!.trim() : null;
  }
  return { ...branch };
}

// id → name, for labelling estates and staff by branch name rather than id.
export function branchNameMap(branches: PortalBranch[]): Record<string, string> {
  return Object.fromEntries(branches.map((b) => [b.id, b.name]));
}

// Mock mode only: a branch's name by id, from the same store this page
// writes — so a branch created here is one staff can be invited into.
export function mockBranchNameFor(tenantId: string, branchId: string): string | undefined {
  return mockBranchesFor(tenantId).find((b) => b.id === branchId)?.name;
}
