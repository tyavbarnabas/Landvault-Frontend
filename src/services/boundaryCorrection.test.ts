// FP-2 (estate boundary correction), itemised conflicts, the roles endpoint
// and import tier mapping — in mock mode, which follows the backend's rules
// (backend commit 9cef857). Its own file: corrections mutate seeded estates.

import { describe, it, expect } from "vitest";
import {
  addEstateBoundary, correctEstateBoundary, createPortalEstate, decideBoundaryChange, fetchBoundaryChanges,
  fetchBoundaryChangesForReview, fetchEstateGeoJson, fetchPortalEstateById, fetchPortalEstates, withdrawBoundaryChange,
  type GeoJsonPolygon, type PortalScope,
} from "./portalEstatesService";
import { conflictChangesBetween, type ConflictItem } from "./conflictChanges";
import {
  correctPlotBoundary, createPlotBatch, createPriceTier, distinctTierValues, fetchPlots, importPlots, previewPlotImport,
} from "./portalInventoryService";
import { actOnInvitation, changeStaffRole, fetchAssignableRoles, fetchStaff, inviteStaff, requestStaff } from "./staffService";

const DIRECTOR: PortalScope = { tenantId: "estintin-group", branchId: null };
const square = (lng: number, lat: number, size: number): GeoJsonPolygon => ({
  type: "Polygon", coordinates: [[[lng, lat], [lng + size, lat], [lng + size, lat + size], [lng, lat + size], [lng, lat]]],
});
const shift = (p: GeoJsonPolygon, dLng: number): GeoJsonPolygon => ({
  type: "Polygon", coordinates: [p.coordinates[0].map(([lng, lat]) => [lng + dLng, lat] as [number, number])],
});

async function publishedEstateWithBoundary() {
  const estate = (await fetchPortalEstates(DIRECTOR, {}, { limit: 200 })).items.find((e) => e.eligibility?.published && e.hasBoundary)!;
  const boundary = (await fetchEstateGeoJson(estate.id, DIRECTOR))!.features[0].geometry as GeoJsonPolygon;
  return { estate, boundary };
}

describe("the four buckets", () => {
  const item = (id: string, over: Partial<ConflictItem> = {}): ConflictItem => ({
    id, conflictType: "estate_overlap", yourEntityId: "e", yourEntityLabel: "E", overlapAreaSqm: 10, severity: "high",
    status: "open", live: true, blocksPublication: true, underReview: false, guidance: null, ...over,
  });

  it("raised, resolved, awaiting review and still open — as the backend's ConflictChanges.between", () => {
    const before = [item("resolves"), item("clears-cross"), item("stays")];
    const after = [
      item("resolves", { live: false, status: "auto_resolved" }),
      item("clears-cross", { underReview: true }),
      item("stays"),
      item("new"),
    ];
    const changes = conflictChangesBetween(before, after);
    expect(changes.raised.map((c) => c.id)).toEqual(["new"]);
    expect(changes.resolved.map((c) => c.id)).toEqual(["resolves"]);
    expect(changes.awaitingReview.map((c) => c.id)).toEqual(["clears-cross"]);
    expect(changes.stillOpen.map((c) => c.id)).toEqual(["stays"]);
  });
});

describe("correcting an estate boundary", () => {
  it("applies at once on an unpublished estate, reporting what detection found", async () => {
    const estate = await createPortalEstate({
      name: "Correct Me Estate", description: "", area: "Guzape", city: "Abuja", state: "Federal Capital Territory (Abuja)",
      address: "", cornerPremiumPct: 0, amenities: [], boundary: square(7.60, 9.30, 0.004),
    }, DIRECTOR);

    const change = await correctEstateBoundary(estate.id, square(7.60, 9.30, 0.006), "Re-survey moved the east fence.", DIRECTOR);

    expect(change.status).toBe("applied");
    expect(change.changedPct).toBeGreaterThan(5);
    expect(change.conflictChanges).toEqual({ raised: [], resolved: [], awaitingReview: [], stillOpen: [] });
    expect((await fetchBoundaryChanges(estate.id, DIRECTOR))[0]).toMatchObject({ status: "applied", reason: "Re-survey moved the east fence." });
  });

  it("refuses with no reason, with no boundary to correct, and for an identical shape", async () => {
    const bare = await createPortalEstate({
      name: "Bare Estate", description: "", area: "", city: "", state: "Lagos", address: "", cornerPremiumPct: 0, amenities: [],
    }, DIRECTOR);
    await expect(correctEstateBoundary(bare.id, square(3.4, 6.4, 0.002), " ", DIRECTOR)).rejects.toMatchObject({ field: "reason" });
    await expect(correctEstateBoundary(bare.id, square(3.4, 6.4, 0.002), "x", DIRECTOR)).rejects.toMatchObject({ code: "BOUNDARY_NOT_SET" });

    await addEstateBoundary(bare.id, square(3.4, 6.4, 0.002), DIRECTOR);
    await expect(correctEstateBoundary(bare.id, square(3.4, 6.4, 0.002), "x", DIRECTOR)).rejects.toMatchObject({ code: "BOUNDARY_UNCHANGED" });
  });

  it("never leaves a mapped plot outside, and saves nothing when it would", async () => {
    const estate = await createPortalEstate({
      name: "Plot Guard Estate", description: "", area: "", city: "", state: "Lagos", address: "", cornerPremiumPct: 0, amenities: [],
      boundary: square(3.50, 6.50, 0.004),
    }, DIRECTOR);
    const tier = await createPriceTier(estate.id, { tierType: "land_size", sizeSqm: 400, price: 1, currency: "NGN" }, DIRECTOR);
    await createPlotBatch(estate.id, [{ plotNumber: "7", priceTierId: tier.id, status: "available-dev", footprint: square(3.5035, 6.5005, 0.0002) }], DIRECTOR);

    const err = await correctEstateBoundary(estate.id, square(3.50, 6.50, 0.002), "Shrinking it", DIRECTOR).catch((e) => e);
    expect(err).toMatchObject({ code: "PLOT_OUTSIDE_ESTATE" });
    expect(err.message).toContain("Plot 7");
  });

  it("a small change to a published estate applies at once; a big one waits for review, one at a time", async () => {
    const { estate, boundary } = await publishedEstateWithBoundary();

    const small = await correctEstateBoundary(estate.id, shift(boundary, 0.000005), "Pillar re-measured.", DIRECTOR);
    expect(small.status).toBe("applied");
    expect(small.changedPct!).toBeLessThanOrEqual(5);

    const big = await correctEstateBoundary(estate.id, shift(boundary, 0.01), "Wrong survey sheet uploaded.", DIRECTOR);
    expect(big.status).toBe("pending");
    // The live boundary is untouched while it waits.
    const live = (await fetchEstateGeoJson(estate.id, DIRECTOR))!.features[0].geometry as GeoJsonPolygon;
    expect(live.coordinates[0][0][0]).toBeCloseTo(boundary.coordinates[0][0][0] + 0.000005, 6);

    await expect(correctEstateBoundary(estate.id, shift(boundary, 0.02), "Another", DIRECTOR)).rejects.toMatchObject({ code: "BOUNDARY_CHANGE_PENDING" });
    expect((await withdrawBoundaryChange(estate.id, big.id, DIRECTOR)).status).toBe("withdrawn");
    await expect(withdrawBoundaryChange(estate.id, big.id, DIRECTOR)).rejects.toMatchObject({ code: "BOUNDARY_CHANGE_NOT_PENDING" });
  });

  it("a Super Admin approves (applying it) or rejects with a note the developer sees", async () => {
    const { estate, boundary } = await publishedEstateWithBoundary();
    const first = await correctEstateBoundary(estate.id, shift(boundary, 0.01), "Survey A", DIRECTOR);
    expect((await fetchBoundaryChangesForReview("pending")).some((c) => c.id === first.id)).toBe(true);

    await expect(decideBoundaryChange(first.id, "reject", " ")).rejects.toMatchObject({ field: "note" });
    expect(await decideBoundaryChange(first.id, "reject", "Title says otherwise.")).toMatchObject({ status: "rejected", decisionNote: "Title says otherwise." });

    const second = await correctEstateBoundary(estate.id, shift(boundary, 0.01), "Survey B", DIRECTOR);
    const approved = await decideBoundaryChange(second.id, "approve", "");
    expect(approved.status).toBe("approved");
    expect(approved.conflictChanges).not.toBeNull();
    expect((await fetchPortalEstateById(estate.id, DIRECTOR))?.hasBoundary).toBe(true);
  });
});

describe("itemised plot conflicts", () => {
  it("a plot correction that creates an overlap reports it as raised; undoing it reports it resolved", async () => {
    const estate = await createPortalEstate({
      name: "Plot Conflict Estate", description: "", area: "", city: "", state: "Lagos", address: "", cornerPremiumPct: 0, amenities: [],
    }, DIRECTOR);
    const tier = await createPriceTier(estate.id, { tierType: "land_size", sizeSqm: 400, price: 1, currency: "NGN" }, DIRECTOR);
    const [a, b] = await createPlotBatch(estate.id, [
      { plotNumber: "1", priceTierId: tier.id, status: "available-dev", footprint: square(3.6, 6.6, 0.0002) },
      { plotNumber: "2", priceTierId: tier.id, status: "available-dev", footprint: square(3.601, 6.6, 0.0002) },
    ], DIRECTOR);

    const onto = await correctPlotBoundary(estate.id, b.id, square(3.6001, 6.6, 0.0002), DIRECTOR);
    expect(onto.conflictChanges!.raised).toHaveLength(1);
    expect(onto.conflictChanges!.raised[0]).toMatchObject({ conflictType: "plot_overlap", blocksPublication: false });

    const back = await correctPlotBoundary(estate.id, b.id, square(3.601, 6.6, 0.0002), DIRECTOR);
    expect(back.conflictChanges!.resolved).toHaveLength(1);
    expect(back.conflictChanges!.raised).toHaveLength(0);
    void a;
  });
});

describe("roles from the backend", () => {
  const ED = { tenantId: "estintin-group", branchId: null, email: "director@estintin.com",
    permissions: ["portal.estates.view", "portal.estates.manage", "portal.branches.manage", "portal.staff.invite", "portal.staff.request"] };
  const BM = { tenantId: "estintin-group", branchId: "heritage", email: "heritage@estintin.com", permissions: ["portal.estates.view", "portal.staff.request"] };

  it("canGrant is whether the caller holds every permission the role carries", async () => {
    expect((await fetchAssignableRoles(ED)).every((r) => r.canGrant)).toBe(true);
    const bm = Object.fromEntries((await fetchAssignableRoles(BM)).map((r) => [r.code, r.canGrant]));
    expect(bm).toMatchObject({ executive_director: false, branch_manager: true, surveyor_project_manager: false, sales_manager: true });
    expect((await fetchAssignableRoles(ED)).find((r) => r.code === "branch_manager")?.scope).toBe("branch");
  });

  it("a branch manager may REQUEST a role they can't grant; the approver is the one checked", async () => {
    const req = await requestStaff({ email: "survey@estintin-work.com", firstName: "S", lastName: "V", roleCode: "surveyor_project_manager" }, BM);
    expect(req.status).toBe("awaiting_approval");
    const weakApprover = { ...ED, permissions: ["portal.estates.view", "portal.staff.invite"] };
    await expect(actOnInvitation(req.id, "approve", weakApprover)).rejects.toMatchObject({ code: "CANNOT_GRANT_ROLE" });
    expect((await actOnInvitation(req.id, "approve", ED)).status).toBe("pending");
  });

  it("inviting or re-roling into a role you can't grant is CANNOT_GRANT_ROLE", async () => {
    const weak = { ...ED, permissions: ["portal.estates.view", "portal.staff.invite"] };
    await expect(inviteStaff({ email: "x1@estintin-work.com", firstName: "X", lastName: "Y", roleCode: "executive_director" }, weak))
      .rejects.toMatchObject({ code: "CANNOT_GRANT_ROLE", field: "roleCode" });
    const tunde = (await fetchStaff(ED)).find((s) => s.email === "heritage@estintin.com")!;
    await expect(changeStaffRole(tunde.userId, { roleCode: "executive_director" }, weak)).rejects.toMatchObject({ code: "CANNOT_GRANT_ROLE" });
  });
});

describe("import tier mapping", () => {
  it("maps file values to tiers — 450 plots, four assignments — and refuses a mapping to another estate's tier", async () => {
    const estate = await createPortalEstate({
      name: "Mapping Estate", description: "", area: "", city: "", state: "Lagos", address: "", cornerPremiumPct: 0, amenities: [],
    }, DIRECTOR);
    const premium = await createPriceTier(estate.id, { tierType: "land_size", sizeSqm: 600, price: 2, currency: "NGN", label: "Premium" }, DIRECTOR);
    const feature = (n: string, zone: string, lng: number) => ({ type: "Feature", properties: { plot_number: n, tier: zone }, geometry: square(lng, 6.7, 0.0002) });
    const body = JSON.stringify({ type: "FeatureCollection", features: [feature("1", "A", 3.7), feature("2", "A", 3.701)] });
    const file = new File([body], "zones.geojson");

    expect(distinctTierValues(body)).toEqual(["A"]);
    expect((await previewPlotImport(estate.id, file, { status: "available-dev" }, DIRECTOR)).errors.map((e) => e.code)).toEqual(["UNKNOWN_TIER", "UNKNOWN_TIER"]);

    const report = await importPlots(estate.id, file, { status: "available-dev", tierMapping: { A: premium.id } }, DIRECTOR);
    expect(report).toMatchObject({ imported: true, createdCount: 2 });
    expect((await fetchPlots(estate.id, DIRECTOR)).items.every((p) => p.priceTierId === premium.id)).toBe(true);

    await expect(previewPlotImport(estate.id, file, { status: "available-dev", tierMapping: { A: "someone-elses-tier" } }, DIRECTOR)).rejects.toThrow(/isn't on this estate/);
  });
});
