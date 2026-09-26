import { describe, it, expect, beforeAll } from "vitest";
import {
  PLOT_BATCH_LIMIT, availableCount, countFor, createBlock, createPlotBatch, createPlotsInBatches,
  createPriceTier, fetchInventoryGeoJson, fetchPlotCounts, fetchPlots, fetchPriceTiers,
  planBatches, tierDisplayLabel, validatePriceTier,
  type BatchProgress, type CreatePlotInput, type PortalPriceTier,
} from "./portalInventoryService";
import { createPortalEstate, type PortalScope } from "./portalEstatesService";

const SCOPE: PortalScope = { tenantId: "estintin-group", branchId: "heritage" };

// A real Abuja footprint, roughly 250 sqm — so the surveyed area comes out
// close to, but deliberately NOT equal to, a 250 sqm nominal size.
const PLOT_FOOTPRINT = {
  type: "Polygon" as const,
  coordinates: [[
    [7.41400, 9.10700], [7.41414, 9.10700], [7.41414, 9.10716], [7.41400, 9.10716], [7.41400, 9.10700],
  ] as [number, number][]],
};

let estateId: string;
let landTier: PortalPriceTier;
let unitTier: PortalPriceTier;

beforeAll(async () => {
  const estate = await createPortalEstate({
    name: "Inventory Test Estate", description: "", area: "Gwarinpa", city: "Abuja",
    state: "Federal Capital Territory (Abuja)", address: "", cornerPremiumPct: 10,
    amenities: [], branchId: "heritage",
  }, SCOPE);
  estateId = estate.id;

  landTier = await createPriceTier(estateId, { tierType: "land_size", sizeSqm: 250, price: 14_000_000, currency: "NGN" }, SCOPE);
  unitTier = await createPriceTier(estateId, { tierType: "unit_type", price: 62_000_000, currency: "NGN", label: "3-bed terrace" }, SCOPE);
});

describe("price tier validation", () => {
  it("requires a size for a land-size tier, as a field error rather than a generic failure", () => {
    const error = validatePriceTier({ tierType: "land_size", price: 1_000_000, currency: "NGN" });

    expect(error?.field).toBe("sizeSqm");
    expect(error?.message).toContain("square metres");
  });

  it("refuses a size on a unit-type tier, which has none of its own", () => {
    const error = validatePriceTier({ tierType: "unit_type", sizeSqm: 120, price: 1_000_000, currency: "NGN", label: "Flat" });

    expect(error?.field).toBe("sizeSqm");
  });

  it("requires a label on a unit-type tier, since that carries the meaning a size would", () => {
    expect(validatePriceTier({ tierType: "unit_type", price: 1_000_000, currency: "NGN" })?.field).toBe("label");
  });
});

describe("price tiers", () => {
  it("computes price per sqm for a land-size tier as a display-only comparison", () => {
    expect(landTier.sizeSqm).toBe(250);
    expect(landTier.pricePerSqm).toBe(56_000);
  });

  it("leaves price per sqm NULL for a unit type, not zero", () => {
    expect(unitTier.sizeSqm).toBeNull();
    // Null, because a built unit has no meaningful per-square-metre figure.
    expect(unitTier.pricePerSqm).toBeNull();
    expect(unitTier.pricePerSqm).not.toBe(0);
  });

  it("does not flag differing per-sqm rates across tiers as an inconsistency", async () => {
    const big = await createPriceTier(estateId, { tierType: "land_size", sizeSqm: 600, price: 29_000_000, currency: "NGN" }, SCOPE);

    // 250 sqm at ₦56,000/sqm beside 600 sqm at ~₦48,333/sqm is ordinary market
    // behaviour: price is the developer's own figure per tier, never derived
    // from a rate. Both simply coexist.
    expect(big.pricePerSqm).not.toBe(landTier.pricePerSqm);
  });

  it("reports how many plots are priced by each tier, starting at a real zero", async () => {
    const fresh = await createPriceTier(estateId, { tierType: "land_size", sizeSqm: 300, price: 17_000_000, currency: "NGN" }, SCOPE);
    expect(fresh.plotCount).toBe(0);
  });

  it("labels a unit-type tier by its label, and a land tier by its size", () => {
    expect(tierDisplayLabel(unitTier)).toBe("3-bed terrace");
    expect(tierDisplayLabel(landTier)).toBe("250 sqm");
  });
});

describe("plots take their nominal size from the tier", () => {
  it("copies the tier's size, with no way for a caller to supply one", async () => {
    const [plot] = await createPlotBatch(estateId, [
      { plotNumber: "A1", priceTierId: landTier.id, status: "available-dev" },
    ], SCOPE);

    // CreatePlotInput has no nominalSizeSqm field at all — that's the point.
    // A caller-supplied size could contradict the tier the plot is priced by.
    expect(plot.nominalSizeSqm).toBe(250);
    expect(plot.price).toBe(landTier.price);
    expect("nominalSizeSqm" in ({ plotNumber: "x", priceTierId: "y", status: "available-dev" } as CreatePlotInput)).toBe(false);
  });

  it("honours nominalSizeSqmOverride only where the tier is a unit type", async () => {
    const [terrace] = await createPlotBatch(estateId, [
      { plotNumber: "T1", priceTierId: unitTier.id, status: "available-dev", nominalSizeSqmOverride: 180 },
    ], SCOPE);
    expect(terrace.nominalSizeSqm).toBe(180);

    // An apartment has no land of its own and leaves it null.
    const [apartment] = await createPlotBatch(estateId, [
      { plotNumber: "T2", priceTierId: unitTier.id, status: "available-dev" },
    ], SCOPE);
    expect(apartment.nominalSizeSqm).toBeNull();

    // On a land-size tier the override is ignored — the tier's size wins.
    const [land] = await createPlotBatch(estateId, [
      { plotNumber: "A2", priceTierId: landTier.id, status: "available-dev", nominalSizeSqmOverride: 999 },
    ], SCOPE);
    expect(land.nominalSizeSqm).toBe(250);
  });
});

describe("surveyed area", () => {
  it("is measured from the footprint, and differs from the nominal size", async () => {
    const [plot] = await createPlotBatch(estateId, [
      { plotNumber: "S1", priceTierId: landTier.id, status: "available-dev", footprint: PLOT_FOOTPRINT },
    ], SCOPE);

    expect(plot.actualAreaSqm).not.toBeNull();
    // Both present, and not the same number — what was sold vs what the ground
    // measures. Never reconciled.
    expect(plot.nominalSizeSqm).toBe(250);
    expect(plot.actualAreaSqm).not.toBe(plot.nominalSizeSqm);
    expect(plot.actualAreaSqm!).toBeGreaterThan(100);
    expect(plot.actualAreaSqm!).toBeLessThan(500);
  });

  it("is NULL without a footprint — never the nominal size as a fallback", async () => {
    const [plot] = await createPlotBatch(estateId, [
      { plotNumber: "S2", priceTierId: landTier.id, status: "available-dev" },
    ], SCOPE);

    expect(plot.actualAreaSqm).toBeNull();
    expect(plot.actualAreaSqm).not.toBe(plot.nominalSizeSqm);
    expect(plot.actualAreaSqm).not.toBe(0);
  });
});

describe("plot pricing", () => {
  it("prices a corner plot at the tier's base plus the ESTATE's premium, and shows all three figures", async () => {
    const [corner] = await createPlotBatch(estateId, [
      { plotNumber: "C1", priceTierId: landTier.id, status: "available-dev", isCorner: true },
    ], SCOPE);

    // Three fields, not just the final one: a corner plot's price matches no
    // tier on the price list, so the base and the modifier travel with it.
    expect(corner.basePrice).toBe(landTier.price);
    expect(corner.cornerPremiumPct).toBe(10);
    expect(corner.price).toBe(Math.round(landTier.price * 1.1));
    expect(corner.price).toBeGreaterThan(corner.basePrice);
  });

  it("leaves cornerPremiumPct null on a standard plot rather than reporting zero", async () => {
    const [standard] = await createPlotBatch(estateId, [
      { plotNumber: "C2", priceTierId: landTier.id, status: "available-dev" },
    ], SCOPE);

    expect(standard.cornerPremiumPct).toBeNull();
    expect(standard.price).toBe(standard.basePrice);
  });

  it("leaves pricePerSqm null for a unit type, where a rate isn't definable", async () => {
    const [apartment] = await createPlotBatch(estateId, [
      { plotNumber: "C3", priceTierId: unitTier.id, status: "available-dev" },
    ], SCOPE);

    expect(apartment.nominalSizeSqm).toBeNull();
    expect(apartment.pricePerSqm).toBeNull();
  });
});

describe("plot counts", () => {
  it("reports only statuses that occur — an absent status means zero, not missing data", async () => {
    const counts = await fetchPlotCounts(estateId, SCOPE);

    expect(counts.total).toBeGreaterThan(0);
    expect(counts.byStatus["available-dev"]).toBeGreaterThan(0);
    // Nothing is reserved on this estate, so the key is simply absent — and
    // the caller supplies its own zero.
    expect(counts.byStatus.reserved).toBeUndefined();
    expect(countFor(counts, "reserved")).toBe(0);
    expect(availableCount(counts)).toBe(countFor(counts, "available-dev") + countFor(counts, "available-inv"));
  });

  it("reports an empty map for an estate with no plots, never a fabricated spread", async () => {
    const empty = await createPortalEstate({
      name: "Countless Estate", description: "", area: "Gwarinpa", city: "Abuja",
      state: "Federal Capital Territory (Abuja)", address: "", cornerPremiumPct: 0,
      amenities: [], branchId: "heritage",
    }, SCOPE);

    const counts = await fetchPlotCounts(empty.id, SCOPE);
    expect(counts).toEqual({ total: 0, byStatus: {} });
  });
});

describe("geometry lives apart from the plot row", () => {
  it("carries hasFootprint on the row, with the shape served from /geojson", async () => {
    const [withShape] = await createPlotBatch(estateId, [
      { plotNumber: "G1", priceTierId: landTier.id, status: "available-dev", footprint: PLOT_FOOTPRINT },
    ], SCOPE);
    const [withoutShape] = await createPlotBatch(estateId, [
      { plotNumber: "G2", priceTierId: landTier.id, status: "available-dev" },
    ], SCOPE);

    expect(withShape.hasFootprint).toBe(true);
    expect(withoutShape.hasFootprint).toBe(false);
    // The geometry itself is not a field on the row.
    expect("footprint" in withShape).toBe(false);

    const geojson = await fetchInventoryGeoJson(estateId, SCOPE, null);
    const plotFeatures = geojson.features.filter((f) => f.properties.kind === "plot");
    // Only plots that actually have one appear; the rest are omitted entirely
    // rather than carrying null geometry.
    expect(plotFeatures.length).toBeGreaterThan(0);
    expect(plotFeatures.every((f) => f.geometry.type === "Polygon")).toBe(true);
    expect(plotFeatures.some((f) => f.properties.plotNumber === "G2")).toBe(false);
  });
});

describe("batching above the 500 cap", () => {
  it("rejects a single request over the cap, exactly as the endpoint would", async () => {
    const tooMany: CreatePlotInput[] = Array.from({ length: PLOT_BATCH_LIMIT + 1 }, (_, i) => ({
      plotNumber: `X${i}`, priceTierId: landTier.id, status: "available-dev",
    }));

    await expect(createPlotBatch(estateId, tooMany, SCOPE)).rejects.toThrow(/at most 500/);
  });

  it("splits a larger set across requests rather than failing at 501", async () => {
    const plots: CreatePlotInput[] = Array.from({ length: 501 }, (_, i) => ({
      plotNumber: `B${i}`, priceTierId: landTier.id, status: "available-dev",
    }));

    const progress: BatchProgress[] = [];
    const created = await createPlotsInBatches(estateId, plots, SCOPE, (p) => progress.push(p));

    expect(created).toHaveLength(501);
    expect(progress.map((p) => p.batch)).toEqual([1, 2]);
    expect(progress.at(-1)).toMatchObject({ totalBatches: 2, created: 501, total: 501 });
  });

  it("plans the batch count before sending, so the UI can say what will happen", () => {
    expect(planBatches(1)).toBe(1);
    expect(planBatches(500)).toBe(1);
    expect(planBatches(501)).toBe(2);
    expect(planBatches(1200)).toBe(3);
  });
});

describe("plot listing and map data", () => {
  it("counts plots against the tier that prices them", async () => {
    const tiers = await fetchPriceTiers(estateId, SCOPE);
    const land = tiers.find((t) => t.id === landTier.id);

    // Every plot created above against this tier is counted — a real count.
    expect(land!.plotCount).toBeGreaterThan(500);
  });

  it("filters by status, tier and corner flag", async () => {
    const block = await createBlock(estateId, { name: "Block Z" }, SCOPE);
    await createPlotBatch(estateId, [
      { plotNumber: "F1", priceTierId: landTier.id, status: "sold", blockId: block.id, isCorner: true },
    ], SCOPE);

    const sold = await fetchPlots(estateId, SCOPE, { status: "sold" }, { limit: 50 });
    expect(sold.items.every((p) => p.status === "sold")).toBe(true);

    const corners = await fetchPlots(estateId, SCOPE, { isCorner: true }, { limit: 50 });
    expect(corners.items.every((p) => p.isCorner)).toBe(true);

    const inBlock = await fetchPlots(estateId, SCOPE, { blockId: block.id }, { limit: 50 });
    expect(inBlock.items.every((p) => p.blockId === block.id)).toBe(true);
    expect(inBlock.items[0].blockName).toBe("Block Z");
  });

  it("keeps both availability variants distinct rather than collapsing them", async () => {
    // The backend's own enum comment says these are deliberately not
    // redundant, and its reservation sweeper restores whichever one a plot
    // had. Collapsing them here would lose that.
    const [dev] = await createPlotBatch(estateId, [
      { plotNumber: "V1", priceTierId: landTier.id, status: "available-dev" },
    ], SCOPE);
    const [inv] = await createPlotBatch(estateId, [
      { plotNumber: "V2", priceTierId: landTier.id, status: "available-inv" },
    ], SCOPE);

    expect(dev.status).toBe("available-dev");
    expect(inv.status).toBe("available-inv");
    expect(dev.status).not.toBe(inv.status);
  });
});

describe("scoping", () => {
  it("refuses another branch's estate", async () => {
    const otherBranch: PortalScope = { tenantId: "estintin-group", branchId: "premium" };

    await expect(createPlotBatch(estateId, [
      { plotNumber: "Z1", priceTierId: landTier.id, status: "available-dev" },
    ], otherBranch)).rejects.toThrow(/not found/i);

    expect((await fetchPlots(estateId, otherBranch, {}, { limit: 10 })).items).toEqual([]);
    expect(await fetchPriceTiers(estateId, otherBranch)).toEqual([]);
  });
});

describe("blocks", () => {
  it("rejects a duplicate name within the estate", async () => {
    await createBlock(estateId, { name: "Block Q" }, SCOPE);
    await expect(createBlock(estateId, { name: "block q" }, SCOPE)).rejects.toThrow(/already has a block/);
  });
});
