import { describe, it, expect } from "vitest";
import {
  BOUNDARY_TEMPLATE_JSON, ELIGIBILITY_CONDITIONS, PUBLICATION_REFUSAL_CONDITIONS, blockingReasonsFor, boundaryAreaSqm,
  EstateEditError, addEstateBoundary, conflictIsBlocking, createPortalEstate, fetchEstateGeoJson, fetchPortalEstateById, updatePortalEstate,
  fetchPortalEstates, parseBoundary, publishEstate, refusalFromError, statusFor, unpublishEstate,
  type EstateEligibility, type PortalScope,
} from "./portalEstatesService";
import { declareFees, declareRefundTerms } from "./estateDisclosureService";
import { createPlotBatch, createPriceTier, fetchPlots } from "./portalInventoryService";

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

  it("unwraps a Feature or SINGLE-feature FeatureCollection, because that's what a one-polygon GIS export is", () => {
    const polygon = JSON.parse(ABUJA_BOUNDARY);
    expect("polygon" in parseBoundary(JSON.stringify({ type: "Feature", geometry: polygon, properties: {} }))).toBe(true);
    expect("polygon" in parseBoundary(JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", geometry: polygon, properties: {} }] }))).toBe(true);
  });

  it("rejects a multi-polygon FeatureCollection and points at plot import, the likely mistake", () => {
    const polygon = JSON.parse(ABUJA_BOUNDARY);
    const plotsFile = JSON.stringify({
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: polygon, properties: { plot: "A1" } },
        { type: "Feature", geometry: polygon, properties: { plot: "A2" } },
        { type: "Feature", geometry: polygon, properties: { plot: "A3" } },
      ],
    });

    const result = parseBoundary(plotsFile);

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error.message).toContain("3 polygons");
      expect(result.error.message).toContain("single Polygon");
      expect(result.error.message).toContain("plot import");
    }
  });

  it("names the geometry it actually found instead of a generic failure", () => {
    const lineString = parseBoundary(JSON.stringify({ type: "LineString", coordinates: [[7.41, 9.10], [7.42, 9.11]] }));
    expect("error" in lineString).toBe(true);
    if ("error" in lineString) {
      expect(lineString.error.message).toContain("must be a GeoJSON Polygon");
      expect(lineString.error.message).toContain("LineString");
    }
  });

  it("flags coordinates that would also be valid transposed, without rejecting them", () => {
    // Abuja read correctly. Swapped it would be ~[9.1, 7.4] — still inside
    // Nigeria, because the country's own lat/lng ranges overlap between 4 and
    // 14. No automated check can separate the two, so this is a caution, not
    // a rejection, and the map is what actually resolves it.
    const result = parseBoundary(ABUJA_BOUNDARY);

    expect("polygon" in result).toBe(true);
    if ("polygon" in result) expect(result.coordinatesAmbiguous).toBe(true);
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

// "Cannot publish" without a reason sends the developer to support. The
// backend returns TEN booleans for exactly this reason.
describe("publication eligibility", () => {
  const allMet: EstateEligibility = {
    published: true, tenantVerified: true, tenantEntitled: true, tenantActive: true,
    feesDeclared: true, refundTermsDeclared: true, hasBoundary: true, hasPlots: true, noBlockingConflict: true, eligible: true,
  };

  it("has a row for every condition the backend reports, and only those", () => {
    // Ten fields: `published` is intent, `eligible` the fold, and the eight
    // between them are the conditions. If the DTO gains another, this fails
    // instead of the panel silently omitting it — which is exactly what
    // happened when hasBoundary and hasPlots arrived.
    const fields: (keyof EstateEligibility)[] = [
      "published", "tenantVerified", "tenantEntitled", "tenantActive",
      "feesDeclared", "refundTermsDeclared", "hasBoundary", "hasPlots", "noBlockingConflict", "eligible",
    ];
    expect(Object.keys(allMet).sort()).toEqual([...fields].sort());
    expect(ELIGIBILITY_CONDITIONS.map((c) => c.key).sort())
      .toEqual(fields.filter((f) => f !== "published" && f !== "eligible").sort());
  });

  it("an estate with no boundary or no plots says so — never every row met while eligible is false", () => {
    for (const key of ["hasBoundary", "hasPlots"] as const) {
      const eligibility = { ...allMet, published: false, [key]: false, eligible: false };
      const reasons = blockingReasonsFor(eligibility);
      expect(reasons).toEqual([ELIGIBILITY_CONDITIONS.find((c) => c.key === key)!.reason]);
      // Something the developer finishes themselves: a draft, not "blocked".
      expect(statusFor(eligibility, true)).toBe("draft");
    }
  });

  it("names the specific failing condition rather than reporting a bare refusal", () => {
    expect(blockingReasonsFor({ ...allMet, feesDeclared: false, eligible: false }))
      .toEqual(["The fee schedule hasn't been declared"]);
    expect(blockingReasonsFor({ ...allMet, tenantActive: false, eligible: false }))
      .toEqual(["Your company's account isn't active right now"]);
    expect(blockingReasonsFor({ ...allMet, refundTermsDeclared: false, eligible: false }))
      .toEqual(["Refund terms haven't been declared"]);
  });

  it("names every failing condition, not just the first", () => {
    expect(blockingReasonsFor({ ...allMet, tenantVerified: false, feesDeclared: false, eligible: false })).toHaveLength(2);
  });

  it("reports nothing to fix when every condition is met", () => {
    expect(blockingReasonsFor(allMet)).toEqual([]);
  });

  it("reads a conflict from its own boolean, never by elimination", () => {
    const conflicted: EstateEligibility = { ...allMet, published: false, noBlockingConflict: false, eligible: false };

    expect(conflictIsBlocking(conflicted)).toBe(true);
    // The reason names the overlap and nothing about who it overlaps.
    expect(blockingReasonsFor(conflicted)).toEqual(["This estate's boundary overlaps another registered boundary"]);
    expect(statusFor(conflicted, true)).toBe("blocked");

    // `eligible: false` with everything else met is NOT read as a conflict:
    // there is no inference left to do.
    expect(conflictIsBlocking({ ...allMet, eligible: false })).toBe(false);
  });

  it("separates 'blocked' from 'still being set up'", () => {
    expect(statusFor({ ...allMet, published: false, tenantVerified: false, eligible: false }, true)).toBe("blocked");
    expect(statusFor({ ...allMet, published: false, feesDeclared: false, eligible: false }, true)).toBe("draft");
    expect(statusFor({ ...allMet, published: false, refundTermsDeclared: false, eligible: false }, true)).toBe("draft");
    expect(statusFor({ ...allMet, published: false, eligible: false }, false)).toBe("draft");
    expect(statusFor({ ...allMet, published: false, eligible: false }, true)).toBe("ready_to_publish");
    expect(statusFor(allMet, true)).toBe("published");
  });

  it("shows a published estate whose conditions lapsed as published-but-not-live, not unpublished", () => {
    // PP-5: a suspension or a new HIGH conflict takes the listing down without
    // touching the flag. The status must say both things at once.
    expect(statusFor({ ...allMet, tenantActive: false, eligible: false }, true)).toBe("published_not_live");
    expect(statusFor({ ...allMet, noBlockingConflict: false, eligible: false }, true)).toBe("published_not_live");
  });

  it("reports UNKNOWN rather than met when the server didn't say", () => {
    // A list row: EstateSummaryDto carries no eligibility.
    expect(statusFor(null, true)).toBe("unknown");
    expect(statusFor(null, false)).toBe("unknown");
  });

  it("maps each PublicationRefused code to the condition it names", () => {
    const refusal = refusalFromError({ body: { code: "PUBLICATION_REFUND_TERMS_UNDECLARED", message: "Declare what a buyer gets back." } });

    expect(refusal?.condition).toBe("refundTermsDeclared");
    expect(refusal?.message).toContain("Declare");

    expect(refusalFromError({ body: { code: "PUBLICATION_CONFLICT_OUTSTANDING", message: "x" } })?.condition).toBe("noBlockingConflict");
    expect(refusalFromError({ body: { code: "PUBLICATION_FEES_UNDECLARED", message: "x" } })?.condition).toBe("feesDeclared");
    expect(refusalFromError({ body: { code: "PUBLICATION_VERIFICATION_PENDING" } })?.message)
      .toBe("Your company's verification isn't complete yet");
    // An unrelated failure is not dressed up as a refusal.
    expect(refusalFromError(new Error("network"))).toBeNull();
  });

  it("covers every refusal code the backend can send, each pointing at a real condition", () => {
    expect(Object.keys(PUBLICATION_REFUSAL_CONDITIONS).sort()).toEqual([
      "PUBLICATION_BOUNDARY_MISSING",
      "PUBLICATION_CONFLICT_OUTSTANDING",
      "PUBLICATION_ENTITLEMENT_MISSING",
      "PUBLICATION_FEES_UNDECLARED",
      "PUBLICATION_NO_PLOTS",
      "PUBLICATION_REFUND_TERMS_UNDECLARED",
      "PUBLICATION_TENANT_NOT_ACTIVE",
      "PUBLICATION_VERIFICATION_PENDING",
    ]);
    const conditionKeys = ELIGIBILITY_CONDITIONS.map((c) => c.key);
    expect(Object.values(PUBLICATION_REFUSAL_CONDITIONS).every((k) => conditionKeys.includes(k))).toBe(true);
  });
});

// PP-2 / PP-3 / PP-4, against the mock standing in for the backend.
describe("publish and unpublish", () => {
  const newDraft = () => createPortalEstate({
    name: "Publication Test Estate", description: "", area: "Guzape", city: "Abuja",
    state: "Federal Capital Territory (Abuja)", address: "", cornerPremiumPct: 0, amenities: [],
    boundary: JSON.parse(ABUJA_BOUNDARY), branchId: "heritage",
  }, DIRECTOR);

  it("refuses an estate with nothing declared, naming the first condition in the code and all of them in the message", async () => {
    const draft = await newDraft();
    const error = await publishEstate(draft.id, DIRECTOR).catch((e) => e);
    const refusal = refusalFromError(error);

    expect(refusal?.code).toBe("PUBLICATION_FEES_UNDECLARED");
    expect(refusal?.condition).toBe("feesDeclared");
    expect(refusal?.message).toContain("fee schedule");
    expect(refusal?.message).toContain("Refund terms");
    expect((await fetchPortalEstateById(draft.id, DIRECTOR))?.eligibility?.published).toBe(false);
  });

  const withAPlot = async (estateId: string) => {
    const tier = await createPriceTier(estateId, { tierType: "land_size", sizeSqm: 500, price: 20_000_000, currency: "NGN" }, DIRECTOR);
    await createPlotBatch(estateId, [{ plotNumber: "1", priceTierId: tier.id, status: "available-dev" }], DIRECTOR);
  };

  it("refuses an estate with everything declared but no plots — buyers need something to choose from", async () => {
    const draft = await newDraft();
    await declareFees(draft.id, { fees: [] });
    await declareRefundTerms(draft.id, { deductionPct: 20, processingDays: 90, appliesTo: "total_price", nonRefundableFeeTypes: [], notes: null });

    const before = await fetchPortalEstateById(draft.id, DIRECTOR);
    expect(before?.eligibility?.hasPlots).toBe(false);
    expect(before?.status).toBe("draft");

    const refusal = refusalFromError(await publishEstate(draft.id, DIRECTOR).catch((e) => e));
    expect(refusal).toMatchObject({ code: "PUBLICATION_NO_PLOTS", condition: "hasPlots" });

    await withAPlot(draft.id);
    expect((await fetchPortalEstateById(draft.id, DIRECTOR))?.eligibility?.hasPlots).toBe(true);
  });

  it("refuses an estate with no boundary, before the conflict check it makes meaningful", async () => {
    const noBoundary = await createPortalEstate({
      name: "No Boundary Estate", description: "", area: "Guzape", city: "Abuja",
      state: "Federal Capital Territory (Abuja)", address: "", cornerPremiumPct: 0, amenities: [], branchId: "heritage",
    }, DIRECTOR);
    await declareFees(noBoundary.id, { fees: [] });
    await declareRefundTerms(noBoundary.id, { deductionPct: 20, processingDays: 90, appliesTo: "total_price", nonRefundableFeeTypes: [], notes: null });
    await withAPlot(noBoundary.id);

    const refusal = refusalFromError(await publishEstate(noBoundary.id, DIRECTOR).catch((e) => e));
    expect(refusal).toMatchObject({ code: "PUBLICATION_BOUNDARY_MISSING", condition: "hasBoundary" });
  });

  it("publishes once fees (even none), refund terms and a plot are in place, and unpublishes without touching anything else", async () => {
    const draft = await newDraft();
    await withAPlot(draft.id);
    await declareFees(draft.id, { fees: [] });
    await declareRefundTerms(draft.id, { deductionPct: 20, processingDays: 90, appliesTo: "total_price", nonRefundableFeeTypes: [], notes: null });

    expect((await fetchPortalEstateById(draft.id, DIRECTOR))?.status).toBe("ready_to_publish");

    const published = await publishEstate(draft.id, DIRECTOR);
    expect(published.published).toBe(true);
    expect((await fetchPortalEstateById(draft.id, DIRECTOR))?.status).toBe("published");

    const unpublished = await unpublishEstate(draft.id, DIRECTOR);
    expect(unpublished.published).toBe(false);
    const after = await fetchPortalEstateById(draft.id, DIRECTOR);
    expect(after?.status).toBe("ready_to_publish");
    expect(after?.hasBoundary).toBe(true);
    expect(after?.eligibility?.feesDeclared).toBe(true);
  });

  it("will not publish another branch's estate", async () => {
    const draft = await newDraft();
    const error = await publishEstate(draft.id, { tenantId: "estintin-group", branchId: "premium" }).catch((e) => e);
    expect(error.status).toBe(404);
  });
});

describe("createPortalEstate", () => {
  it("creates a draft, never a published estate", async () => {
    const created = await createPortalEstate({
      name: "Test Draft Estate", description: "", area: "Guzape", city: "Abuja",
      state: "Federal Capital Territory (Abuja)", address: "", cornerPremiumPct: 10,
      amenities: [], branchId: "heritage",
    }, HERITAGE_MANAGER);

    expect(created.eligibility?.published).toBe(false);
    // The id is a generated identifier, never the name slugified — the backend
    // assigns a UUID and keeps the slug as its own field.
    expect(created.id).not.toBe(created.slug);
    expect(created.slug).toBe("test-draft-estate");
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

// One validation path, two inputs. If the file route grew its own rules the
// two would eventually disagree about what is valid.
describe("file upload and paste share one validation path", () => {
  it("produces an identical result whether the template arrives as text or as a file's contents", async () => {
    const asPaste = parseBoundary(BOUNDARY_TEMPLATE_JSON);

    // What the component does with an uploaded file is exactly this: read its
    // text, hand it to parseBoundary.
    const file = new File([BOUNDARY_TEMPLATE_JSON], "boundary.geojson", { type: "application/geo+json" });
    const asUpload = parseBoundary(await file.text());

    expect(asUpload).toEqual(asPaste);
    expect("polygon" in asUpload).toBe(true);
  });

  it("rejects a transposed file exactly as it rejects transposed pasted text", async () => {
    const transposed = JSON.stringify({
      type: "Polygon",
      coordinates: [[[6.5244, 3.3792], [6.5300, 3.3792], [6.5300, 3.3850], [6.5244, 3.3850], [6.5244, 3.3792]]],
    });
    const file = new File([transposed], "swapped.geojson", { type: "application/geo+json" });

    expect(parseBoundary(await file.text())).toEqual(parseBoundary(transposed));
    expect("error" in parseBoundary(transposed)).toBe(true);
  });
});

describe("the downloadable template", () => {
  it("is a valid boundary that parses without editing", () => {
    expect("polygon" in parseBoundary(BOUNDARY_TEMPLATE_JSON)).toBe(true);
  });

  it("sits in Gwarinpa, Abuja, in [lng, lat] order", () => {
    const result = parseBoundary(BOUNDARY_TEMPLATE_JSON);
    expect("polygon" in result).toBe(true);
    if (!("polygon" in result)) return;

    const ring = result.polygon.coordinates[0];
    // Longitude first: ~7.41 E, then latitude ~9.11 N.
    expect(ring[0][0]).toBeGreaterThan(7.3);
    expect(ring[0][0]).toBeLessThan(7.5);
    expect(ring[0][1]).toBeGreaterThan(9.0);
    expect(ring[0][1]).toBeLessThan(9.2);
    // And its ring closes, as the guidance says it must.
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it("measures a plausible estate-sized area, not a degree-sized one", () => {
    const result = parseBoundary(BOUNDARY_TEMPLATE_JSON);
    if (!("polygon" in result)) throw new Error("template should parse");

    const areaSqm = boundaryAreaSqm(result.polygon);
    // ~600m x ~500m: tens of hectares, not square degrees and not zero.
    expect(areaSqm).toBeGreaterThan(100_000);
    expect(areaSqm).toBeLessThan(1_000_000);
  });
});

// ─── PUT /api/portal/estates/{id} ────────────────────────────────────────────

describe("editing an estate's details", () => {
  const draft = (name: string) => createPortalEstate({
    name, description: "", area: "Guzape", city: "Abuja", state: "Federal Capital Territory (Abuja)",
    address: "", cornerPremiumPct: 10, amenities: ["Borehole"], branchId: "heritage",
  }, DIRECTOR);

  it("changes only what is sent, and a rename regenerates the slug", async () => {
    const estate = await draft("Edit Me Estate");
    const updated = await updatePortalEstate(estate.id, { name: "Edited Estate", address: "1 Access Road", amenities: [] }, DIRECTOR);

    expect(updated).toMatchObject({ name: "Edited Estate", slug: "edited-estate", address: "1 Access Road", amenities: [], area: "Guzape" });
  });

  it("refuses a name another of the company's estates already has, on the name field", async () => {
    await draft("Taken Name Estate");
    const other = await draft("Other Estate");
    const err = await updatePortalEstate(other.id, { name: "Taken Name Estate" }, DIRECTOR).catch((e) => e);
    expect(err).toBeInstanceOf(EstateEditError);
    expect(err).toMatchObject({ field: "name", code: "DUPLICATE_RECORD" });
  });

  it("a corner-premium change reprices every corner plot at once", async () => {
    const estate = await draft("Corner Estate");
    const tier = await createPriceTier(estate.id, { tierType: "land_size", sizeSqm: 500, price: 10_000_000, currency: "NGN" }, DIRECTOR);
    await createPlotBatch(estate.id, [
      { plotNumber: "C1", priceTierId: tier.id, status: "available-dev", isCorner: true },
      { plotNumber: "C2", priceTierId: tier.id, status: "available-dev" },
    ], DIRECTOR);

    await updatePortalEstate(estate.id, { cornerPremiumPct: 20 }, DIRECTOR);

    const plots = (await fetchPlots(estate.id, DIRECTOR)).items;
    expect(plots.find((p) => p.plotNumber === "C1")!.price).toBe(12_000_000);
    expect(plots.find((p) => p.plotNumber === "C2")!.price).toBe(10_000_000);
  });
});

// ─── POST /api/portal/estates/{id}/boundary ──────────────────────────────────

describe("adding a boundary later", () => {
  const boundaryless = () => createPortalEstate({
    name: "Boundary Later Estate", description: "", area: "Guzape", city: "Abuja", state: "Federal Capital Territory (Abuja)",
    address: "", cornerPremiumPct: 0, amenities: [], branchId: "heritage",
  }, DIRECTOR);
  const polygon = JSON.parse(ABUJA_BOUNDARY);

  it("adds one to an estate with none, which is what makes it publishable", async () => {
    const estate = await boundaryless();
    expect((await fetchPortalEstateById(estate.id, DIRECTOR))?.eligibility?.hasBoundary).toBe(false);

    const result = await addEstateBoundary(estate.id, polygon, DIRECTOR);

    expect(result.estateId).toBe(estate.id);
    expect(result.footprintAreaSqm).toBeGreaterThan(0);
    expect((await fetchPortalEstateById(estate.id, DIRECTOR))?.eligibility?.hasBoundary).toBe(true);
  });

  it("refuses to change a boundary once one is set", async () => {
    const estate = await boundaryless();
    await addEstateBoundary(estate.id, polygon, DIRECTOR);
    await expect(addEstateBoundary(estate.id, polygon, DIRECTOR)).rejects.toMatchObject({ code: "BOUNDARY_ALREADY_SET" });
  });

  it("refuses a boundary that leaves existing plots outside it, naming them, and saves nothing", async () => {
    const estate = await boundaryless();
    const tier = await createPriceTier(estate.id, { tierType: "land_size", sizeSqm: 500, price: 1, currency: "NGN" }, DIRECTOR);
    // A plot shaped well away from the boundary about to be added.
    await createPlotBatch(estate.id, [{
      plotNumber: "9", priceTierId: tier.id, status: "available-dev",
      footprint: { type: "Polygon", coordinates: [[[7.6, 9.2], [7.6001, 9.2], [7.6001, 9.2001], [7.6, 9.2001], [7.6, 9.2]]] },
    }], DIRECTOR);

    const err = await addEstateBoundary(estate.id, polygon, DIRECTOR).catch((e) => e);
    expect(err).toMatchObject({ code: "PLOT_OUTSIDE_ESTATE" });
    expect(err.message).toContain("Plot 9");
    expect((await fetchPortalEstateById(estate.id, DIRECTOR))?.hasBoundary).toBe(false);
  });
});

// ─── SB-1: the Super Admin's state override ──────────────────────────────────

describe("state override", () => {
  it("records a reason and the canonical state with its ISO code, and can be removed", async () => {
    const { setStateOverride, clearStateOverride } = await import("./estateStateOverrideService");
    const estate = await createPortalEstate({
      name: "Disputed Border Estate", description: "", area: "Mararaba", city: "Abuja", state: "Nasarawa",
      address: "", cornerPremiumPct: 0, amenities: [], branchId: "heritage",
    }, DIRECTOR);

    const set = await setStateOverride(estate.id, "Title registered with Nasarawa; GRID3 line runs through the site.");
    expect(set).toMatchObject({ estateId: estate.id, state: "Nasarawa", stateCode: "NG-NA" });
    expect(set.overriddenAt).not.toBeNull();

    const cleared = await clearStateOverride(estate.id);
    expect(cleared).toMatchObject({ overriddenAt: null, reason: null });
  });

  it("refuses without a reason, and names an unknown estate id plainly", async () => {
    const { setStateOverride } = await import("./estateStateOverrideService");
    await expect(setStateOverride("anything", "  ")).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(setStateOverride("no-such-estate", "reason")).rejects.toMatchObject({ code: "ESTATE_NOT_FOUND" });
  });
});
