import { describe, it, expect } from "vitest";
import {
  blockingReasonsFor, createPortalEstate, fetchEstateGeoJson, fetchPortalEstateById,
  fetchPortalEstates, parseBoundary, statusFor,
  type EstateEligibility, type PortalScope,
} from "./portalEstatesService";

const DIRECTOR: PortalScope = { tenantId: "estintin-group", branchId: null };
const HERITAGE_MANAGER: PortalScope = { tenantId: "estintin-group", branchId: "heritage" };

// A real Abuja rectangle, in GeoJSON's [lng, lat] order.
const ABUJA_BOUNDARY = JSON.stringify({
  type: "Polygon",
  coordinates: [[[7.4890, 9.0480], [7.4935, 9.0480], [7.4935, 9.0515], [7.4890, 9.0515], [7.4890, 9.0480]]],
});

// DP-2: the first time the frontend exercises branch scoping. A bug here is
// invisible by nature — the list just looks shorter than expected.
describe("branch scoping", () => {
  it("gives an Executive Director every estate across their company's branches", async () => {
    const page = await fetchPortalEstates(DIRECTOR, {}, { limit: 100 });

    expect(page.items.length).toBeGreaterThan(1);
    expect(new Set(page.items.map((e) => e.branchId)).size).toBeGreaterThan(1);
    expect(page.items.every((e) => e.tenantId === "estintin-group")).toBe(true);
  });

  it("gives a branch manager only their own branch", async () => {
    const page = await fetchPortalEstates(HERITAGE_MANAGER, {}, { limit: 100 });

    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((e) => e.branchId === "heritage")).toBe(true);
  });

  it("never returns another company's estates", async () => {
    const page = await fetchPortalEstates(DIRECTOR, {}, { limit: 100 });

    // crestview-homes and sunview-realty both own estates in the fixtures.
    expect(page.items.some((e) => e.tenantId !== "estintin-group")).toBe(false);
  });

  it("does not let a branch-scoped caller widen their scope with a filter", async () => {
    const page = await fetchPortalEstates(HERITAGE_MANAGER, { branchId: "premium" }, { limit: 100 });

    expect(page.items.every((e) => e.branchId === "heritage")).toBe(true);
  });

  it("hides another branch's estate even when its id is known", async () => {
    const premium = (await fetchPortalEstates(DIRECTOR, { branchId: "premium" }, { limit: 100 })).items[0];

    expect(premium).toBeDefined();
    expect(await fetchPortalEstateById(premium.id, HERITAGE_MANAGER)).toBeNull();
    expect(await fetchEstateGeoJson(premium.id, HERITAGE_MANAGER)).toBeNull();
  });
});

// DP-5: a transposed boundary produces no error anywhere else. It stores
// cleanly and puts the estate in the wrong state.
describe("parseBoundary", () => {
  it("accepts a closed Abuja polygon in [lng, lat] order", () => {
    const result = parseBoundary(ABUJA_BOUNDARY);

    expect("polygon" in result).toBe(true);
  });

  it("unwraps a Feature or FeatureCollection, because that's what GIS exports contain", () => {
    const polygon = JSON.parse(ABUJA_BOUNDARY);
    expect("polygon" in parseBoundary(JSON.stringify({ type: "Feature", geometry: polygon, properties: {} }))).toBe(true);
    expect("polygon" in parseBoundary(JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", geometry: polygon, properties: {} }] }))).toBe(true);
  });

  it("rejects a transposed boundary and says the coordinates look swapped", () => {
    // Somewhere genuinely outside Nigeria when read as [lng, lat], but inside
    // it when read the other way round — e.g. Lagos entered as [lat, lng].
    const transposed = JSON.stringify({
      type: "Polygon",
      coordinates: [[[6.5244, 3.3792], [6.5300, 3.3792], [6.5300, 3.3850], [6.5244, 3.3850], [6.5244, 3.3792]]],
    });

    const result = parseBoundary(transposed);

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.likelyTransposed).toBe(true);
      expect(result.error.message).toContain("swapped");
      expect(result.error.message).toContain("[longitude, latitude]");
    }
  });

  it("rejects coordinates outside Nigeria that are not a swap, without claiming they are", () => {
    const london = JSON.stringify({
      type: "Polygon",
      coordinates: [[[-0.1278, 51.5074], [-0.1200, 51.5074], [-0.1200, 51.5100], [-0.1278, 51.5100], [-0.1278, 51.5074]]],
    });

    const result = parseBoundary(london);

    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error.likelyTransposed).toBe(false);
  });

  it("rejects an unclosed ring", () => {
    const unclosed = JSON.stringify({
      type: "Polygon",
      coordinates: [[[7.4890, 9.0480], [7.4935, 9.0480], [7.4935, 9.0515], [7.4890, 9.0515]]],
    });

    const result = parseBoundary(unclosed);

    expect("error" in result).toBe(true);
    if ("error" in result) expect(result.error.message).toContain("closed");
  });

  it("rejects text that isn't JSON, and JSON that isn't a polygon", () => {
    expect("error" in parseBoundary("not json at all")).toBe(true);
    expect("error" in parseBoundary(JSON.stringify({ type: "Point", coordinates: [7.49, 9.05] }))).toBe(true);
  });
});

// DP-3: "cannot publish" without a reason sends the developer to support.
describe("publication eligibility", () => {
  const allMet: EstateEligibility = {
    publishedFlag: true, tenantVerified: true, tenantEntitled: true,
    tenantActive: true, noBlockingConflict: true, feeScheduleDeclared: true,
  };

  it("names the specific failing condition rather than reporting a bare refusal", () => {
    expect(blockingReasonsFor({ ...allMet, feeScheduleDeclared: false })).toEqual(["The fee schedule hasn't been declared"]);
    expect(blockingReasonsFor({ ...allMet, tenantActive: false })).toEqual(["Your company's account is currently suspended"]);
  });

  it("names every failing condition, not just the first", () => {
    expect(blockingReasonsFor({ ...allMet, tenantVerified: false, feeScheduleDeclared: false })).toHaveLength(2);
  });

  it("reports nothing to fix when all six conditions are met", () => {
    expect(blockingReasonsFor(allMet)).toEqual([]);
  });

  it("separates 'blocked' from 'still being set up'", () => {
    // Outside the company's immediate control → blocked.
    expect(statusFor({ ...allMet, publishedFlag: false, tenantVerified: false }, true)).toBe("blocked");
    expect(statusFor({ ...allMet, publishedFlag: false, noBlockingConflict: false }, true)).toBe("blocked");
    // The company's own outstanding setup → draft.
    expect(statusFor({ ...allMet, publishedFlag: false, feeScheduleDeclared: false }, true)).toBe("draft");
    expect(statusFor({ ...allMet, publishedFlag: false }, false)).toBe("draft");
    // Everything done, just not live yet.
    expect(statusFor({ ...allMet, publishedFlag: false }, true)).toBe("ready_to_publish");
    expect(statusFor(allMet, true)).toBe("published");
  });

  it("shows a published estate as blocked once a condition lapses, not still live", () => {
    expect(statusFor({ ...allMet, tenantActive: false }, true)).toBe("blocked");
  });
});

describe("createPortalEstate", () => {
  it("creates a draft, never a published estate", async () => {
    const created = await createPortalEstate({
      name: "Test Draft Estate", description: "", area: "Guzape", city: "Abuja",
      state: "Federal Capital Territory (Abuja)", address: "", cornerPremiumPct: 10,
      amenities: [], branchId: "heritage",
    }, HERITAGE_MANAGER);

    expect(created.eligibility.publishedFlag).toBe(false);
    expect(created.status).not.toBe("published");
    // No inventory yet — a real zero, not a placeholder.
    expect(created.totalPlots).toBe(0);
    expect(created.hasBoundary).toBe(false);
    expect(created.titleVerified).toBe(false);
  });

  it("stores a submitted boundary so the map can render it back", async () => {
    const parsed = parseBoundary(ABUJA_BOUNDARY);
    expect("polygon" in parsed).toBe(true);
    if (!("polygon" in parsed)) return;

    const created = await createPortalEstate({
      name: "Boundary Estate", description: "", area: "Guzape", city: "Abuja",
      state: "Federal Capital Territory (Abuja)", address: "", cornerPremiumPct: 0,
      amenities: [], branchId: "heritage", boundary: parsed.polygon,
    }, HERITAGE_MANAGER);

    expect(created.hasBoundary).toBe(true);

    const geojson = await fetchEstateGeoJson(created.id, HERITAGE_MANAGER);
    expect(geojson?.type).toBe("FeatureCollection");
    // Round-trips in [lng, lat] order — longitude first, still Abuja.
    const ring = geojson!.features[0].geometry.coordinates[0];
    expect(ring[0][0]).toBeCloseTo(7.4890, 4);
    expect(ring[0][1]).toBeCloseTo(9.0480, 4);
    // And the ring comes back closed.
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });
});
