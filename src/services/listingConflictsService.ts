// Backend integration seam for SA-3.4 — "detect duplicate & conflicting
// listings," flagged in the Super Admin backlog as the killer feature of the
// whole console: because real geometry is stored (not an address as text),
// the platform can automatically catch two different sellers listing
// overlapping land — precisely the duplicate-allocation scam LandVault
// exists to kill. See INTEGRATION.md.
//
// The detection itself is real: src/lib/geometry.ts's polygonOverlap() runs
// actual polygon-intersection math over every estate's real footprint
// (mockData.ts's Estate.footprint). What's mock here is the same thing
// that's mock everywhere else in this repo — the underlying fixture data,
// not the algorithm operating on it.
//
// TODO (backend): a real implementation runs this as a PostGIS ST_Intersects
// query (indexed, incremental — re-checked only against estates near a
// newly-published one), not an O(n²) full re-scan on every read. Fine for
// this repo's fixture set; would not scale past a few thousand estates.

import { apiClient } from "../lib/apiClient";
import { paginateMock, type Page, type PageParams } from "../lib/pagination";
import { polygonOverlap, type GeoPoint } from "../lib/geometry";
import { ESTATES, type Estate } from "../data/mockData";
import { fetchTenantByIdSync, tenantDisplayName, recordAuditEntry } from "./tenantsService";

export type { GeoPoint };

export type ConflictStatus = "open" | "investigating" | "confirmed_duplicate" | "dismissed";
// Cross-tenant overlap is the actual fraud signal SA-3.4 targets — two
// different companies both claiming to sell the same land. Same-tenant
// overlap is still surfaced (it's a real data-integrity problem worth a
// look) but ranked lower: it's a survey/data-entry error, not a buyer-facing
// scam in progress.
export type ConflictSeverity = "high" | "medium";

export interface ListingConflict {
  id: string;
  estateAId: string;
  estateAName: string;
  estateAFootprint: GeoPoint[]; // denormalized at detection time, purely for rendering — the actual overlap numbers below are already computed
  tenantAId: string;
  tenantAName: string;
  estateBId: string;
  estateBName: string;
  estateBFootprint: GeoPoint[];
  tenantBId: string;
  tenantBName: string;
  crossTenant: boolean;
  severity: ConflictSeverity;
  overlapAreaSqm: number;
  overlapPctOfA: number;
  overlapPctOfB: number;
  detectedAt: string;
  status: ConflictStatus;
  reviewedBy?: string;
  reviewedAt?: string;
  resolutionNote?: string;
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Every distinct pair of estates, once — checks all of them (not just
// published/marketplace-live ones), since a conflict is worth catching the
// moment two footprints overlap, whether or not either has gone public yet.
function detectConflicts(): ListingConflict[] {
  const found: ListingConflict[] = [];
  const detectedAt = new Date().toISOString();

  for (let i = 0; i < ESTATES.length; i++) {
    for (let j = i + 1; j < ESTATES.length; j++) {
      const a: Estate = ESTATES[i];
      const b: Estate = ESTATES[j];
      const overlap = polygonOverlap(a.footprint, b.footprint);
      if (!overlap) continue;

      const tenantA = fetchTenantByIdSync(a.tenantId);
      const tenantB = fetchTenantByIdSync(b.tenantId);
      const crossTenant = a.tenantId !== b.tenantId;

      found.push({
        id: newId("conflict"),
        estateAId: a.id,
        estateAName: a.name,
        estateAFootprint: a.footprint,
        tenantAId: a.tenantId,
        tenantAName: tenantA ? tenantDisplayName(tenantA) : a.tenantId,
        estateBId: b.id,
        estateBName: b.name,
        estateBFootprint: b.footprint,
        tenantBId: b.tenantId,
        tenantBName: tenantB ? tenantDisplayName(tenantB) : b.tenantId,
        crossTenant,
        severity: crossTenant ? "high" : "medium",
        overlapAreaSqm: overlap.areaSqm,
        overlapPctOfA: overlap.pctOfA,
        overlapPctOfB: overlap.pctOfB,
        detectedAt,
        status: "open",
      });
    }
  }
  // Worst first: high severity, then largest overlap.
  return found.sort((x, y) => (x.severity === y.severity ? y.overlapPctOfB - x.overlapPctOfB : x.severity === "high" ? -1 : 1));
}

// Computed once per session and then mutated in place as reviews land —
// same in-memory mock-store idiom as tenantsService.ts's mockTenants. Real
// estates don't change at runtime in this repo (no estate-creation flow
// exists yet), so a fresh scan on every call would just repeat the same
// work and — worse — hand out a new conflict `id` each time, breaking any
// in-flight review.
let mockConflicts: ListingConflict[] | null = null;
function store(): ListingConflict[] {
  if (mockConflicts === null) mockConflicts = detectConflicts();
  return mockConflicts;
}

export interface ConflictFilters {
  status?: ConflictStatus[];
  severity?: ConflictSeverity[];
}

export async function fetchConflicts(filters: ConflictFilters = {}, params: PageParams = {}): Promise<Page<ListingConflict>> {
  if (!apiClient.isMockMode) {
    const qp = new URLSearchParams({ ...(filters as Record<string, string>), ...(params as Record<string, string>) });
    return apiClient.get<Page<ListingConflict>>(`/api/admin/listing-conflicts?${qp}`);
  }
  let results = store();
  if (filters.status && filters.status.length > 0) {
    results = results.filter((c) => filters.status!.includes(c.status));
  }
  if (filters.severity && filters.severity.length > 0) {
    results = results.filter((c) => filters.severity!.includes(c.severity));
  }
  return paginateMock(results, params);
}

export async function fetchConflictById(id: string): Promise<ListingConflict | undefined> {
  if (!apiClient.isMockMode) {
    try { return await apiClient.get<ListingConflict>(`/api/admin/listing-conflicts/${id}`); } catch { return undefined; }
  }
  return store().find((c) => c.id === id);
}

// The three outcomes a Super Admin can record. "investigating" just marks
// it as being looked into (no note required); the other two are terminal and
// always get an audit entry against BOTH tenants involved — a conflict spans
// two companies, so both need it on their record, not just one.
export async function reviewConflict(id: string, decision: ConflictStatus, actor: string, note?: string): Promise<ListingConflict | undefined> {
  if (!apiClient.isMockMode) {
    return apiClient.post<ListingConflict>(`/api/admin/listing-conflicts/${id}/review`, { decision, note });
  }
  const conflicts = store();
  const conflict = conflicts.find((c) => c.id === id);
  if (!conflict) return undefined;

  conflict.status = decision;
  conflict.reviewedBy = actor;
  conflict.reviewedAt = new Date().toISOString();
  conflict.resolutionNote = note;

  if (decision === "confirmed_duplicate" || decision === "dismissed") {
    const detail = decision === "confirmed_duplicate"
      ? `Confirmed duplicate/overlapping listing vs. ${conflict.estateAName} / ${conflict.estateBName}${note ? ` — ${note}` : ""}`
      : `Dismissed as a false positive vs. ${conflict.estateAName} / ${conflict.estateBName}${note ? ` — ${note}` : ""}`;
    recordAuditEntry({ actor, action: "listing_conflict_reviewed", tenantId: conflict.tenantAId, tenantName: conflict.tenantAName, detail });
    // Same land, two tenants — only log a second entry when they're actually
    // different companies; a same-tenant conflict would otherwise double-log
    // one company's own record.
    if (conflict.crossTenant) {
      recordAuditEntry({ actor, action: "listing_conflict_reviewed", tenantId: conflict.tenantBId, tenantName: conflict.tenantBName, detail });
    }
  }

  return conflict;
}
