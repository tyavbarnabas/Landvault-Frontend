// The signed-in user's tenant and branch claims, in the shape the portal
// service expects.
//
// This is NOT the frontend deciding what it may see. Scoping is enforced
// server-side by RLS; the real endpoint reads these same claims off the JWT.
// Mock mode has no token, so the claims are read off the user object instead —
// and a branch-scoped user's scope can never be widened here, because
// `branchId` is passed through exactly as the account carries it.

import { useApp } from "../../contexts/AppContext";
import type { PortalScope } from "../../services/portalEstatesService";

export function usePortalScope(): PortalScope | null {
  const { user } = useApp();
  if (!user?.tenantId) return null;
  return { tenantId: user.tenantId, branchId: user.branchId ?? null };
}
