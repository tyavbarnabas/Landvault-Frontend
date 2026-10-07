// SB-1's override, for Super Admins: POST/DELETE /api/admin/estates/{id}/state-override.
//
// For land on a genuinely disputed state border, where the reference
// boundaries (GRID3) and the land registry disagree. A person verifies the
// declared state by hand, gives a reason (required, kept), and the
// boundary-in-state check is skipped for that estate. The developer then adds
// the boundary as usual. Changing the estate's state clears the override — it
// verified the old one.
//
// Gated on admin.marketplace.conflicts: the people who already rule on
// boundary disputes between companies.
//
// There is no admin endpoint that lists estates, so the flow starts from an
// estate id: the developer meets BOUNDARY_OUTSIDE_STATE, contacts support with
// the id the portal shows them, and support enters it here.

import { ApiError, apiClient } from "../lib/apiClient";
import { isMock } from "../lib/backends";
import { STATE_ISO_CODES, type NigerianState } from "../data/nigerianStates";
import { findMockEstateForAdmin } from "./portalEstatesService";

export const STATE_OVERRIDE_PERMISSION = "admin.marketplace.conflicts";

// EstateStateOverrideDto. After a removal, `overriddenAt`, `overriddenBy` and
// `reason` are null — the check applies again.
export interface EstateStateOverride {
  estateId: string;
  state: string;
  stateCode: string;
  overriddenAt: string | null;
  overriddenBy: string | null;
  reason: string | null;
}

export class StateOverrideError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "StateOverrideError";
    this.code = code;
  }
}

function overrideError(err: unknown): Error {
  if (!(err instanceof ApiError)) return err instanceof Error ? err : new Error("Couldn't change the override.");
  if (err.status === 404) return new StateOverrideError("ESTATE_NOT_FOUND", "No estate has that id. Check it with the developer.");
  if (err.status === 400) return new StateOverrideError("VALIDATION", err.body?.message ?? "A reason is required.");
  return new StateOverrideError(err.body?.code ?? "UNKNOWN", err.body?.message ?? "Couldn't change the override.");
}

const mockOverrides = new Map<string, { overriddenAt: string; reason: string }>();

function mockResult(estateId: string): EstateStateOverride {
  const estate = findMockEstateForAdmin(estateId);
  if (!estate) throw new StateOverrideError("ESTATE_NOT_FOUND", "No estate has that id. Check it with the developer.");
  const record = mockOverrides.get(estateId);
  return {
    estateId,
    state: estate.state,
    stateCode: STATE_ISO_CODES[estate.state as NigerianState] ?? "",
    overriddenAt: record?.overriddenAt ?? null,
    overriddenBy: record ? "mock-super-admin" : null,
    reason: record?.reason ?? null,
  };
}

export async function setStateOverride(estateId: string, reason: string): Promise<EstateStateOverride> {
  const id = estateId.trim();
  if (!id) throw new StateOverrideError("VALIDATION", "Enter the estate's id.");
  if (!reason.trim()) throw new StateOverrideError("VALIDATION", "Give the reason — it's kept with the override.");
  if (!isMock("stateOverride")) {
    try {
      return await apiClient.post<EstateStateOverride>(`/api/admin/estates/${encodeURIComponent(id)}/state-override`, { reason: reason.trim() });
    } catch (err) {
      throw overrideError(err);
    }
  }
  mockResult(id);
  mockOverrides.set(id, { overriddenAt: new Date().toISOString(), reason: reason.trim() });
  return mockResult(id);
}

export async function clearStateOverride(estateId: string): Promise<EstateStateOverride> {
  const id = estateId.trim();
  if (!id) throw new StateOverrideError("VALIDATION", "Enter the estate's id.");
  if (!isMock("stateOverride")) {
    try {
      return await apiClient.del<EstateStateOverride>(`/api/admin/estates/${encodeURIComponent(id)}/state-override`);
    } catch (err) {
      throw overrideError(err);
    }
  }
  mockResult(id);
  mockOverrides.delete(id);
  return mockResult(id);
}
