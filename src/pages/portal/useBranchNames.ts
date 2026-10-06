// Branch ids → names, so the portal labels estates and staff by branch name
// rather than printing a UUID. A null branch is a company-level estate.

import { useFetch } from "../../lib/useFetch";
import { branchNameMap, fetchBranches } from "../../services/branchesService";
import type { PortalScope } from "../../services/portalEstatesService";

export function useBranchNames(scope: PortalScope | null): Record<string, string> {
  const branches = useFetch(async () => (scope ? fetchBranches(scope) : []), [scope?.tenantId, scope?.branchId]);
  return branchNameMap(branches.data ?? []);
}

// "Heritage branch", or "Company-level" for an estate with no branch. An id
// whose name couldn't be read is never printed raw.
export function ownershipLabel(branchId: string | null, names: Record<string, string>): string {
  if (branchId === null) return "Company-level";
  return names[branchId] ? `${names[branchId]} branch` : "Branch";
}
