import { describe, it, expect, beforeAll } from "vitest";
import {
  InventoryEditError, PLOT_BATCH_LIMIT, availableCount, countFor, createBlock, createPlotBatch, createPlotsInBatches,
  createPriceTier, fetchBlocks, fetchInventoryGeoJson, fetchPlotCounts, fetchPlots, fetchPriceTierImpact, fetchPriceTiers,
  planBatches, tierDisplayLabel, updateBlock, updatePriceTier, validatePriceTier,
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

// ─── Editing (IE-1, IE-2) ────────────────────────────────────────────────────

describe("tier impact preview", () => {
  it("counts by status, with an absent status meaning zero", async () => {
    const tier = await createPriceTier(estateId, { tierType: "land_size", sizeSqm: 410, price: 20_000_000, currency: "NGN" }, SCOPE);
    const empty = await fetchPriceTierImpact(estateId, tier.id, SCOPE);
    expect(empty).toEqual({ tierId: tier.id, plots: { total: 0, byStatus: {} } });

    await createPlotBatch(estateId, [
      { plotNumber: "I1", priceTierId: tier.id, status: "available-dev" },
      { plotNumber: "I2", priceTierId: tier.id, status: "reserved" },
    ], SCOPE);
    const { plots } = await fetchPriceTierImpact(estateId, tier.id, SCOPE);
    expect(plots.total).toBe(2);
    expect(countFor(plots, "reserved")).toBe(1);
    // Never a fabricated spread: sold is absent, and absent reads as zero.
    expect("sold" in plots.byStatus).toBe(false);
    expect(countFor(plots, "sold")).toBe(0);
  });
});

describe("editing a price tier", () => {
  async function tierWithPlots(sizeSqm: number) {
    const tier = await createPriceTier(estateId, { tierType: "land_size", sizeSqm, price: 10_000_000, currency: "NGN" }, SCOPE);
    const plots = await createPlotBatch(estateId, [
      { plotNumber: `${sizeSqm}-1`, priceTierId: tier.id, status: "available-dev" },
      { plotNumber: `${sizeSqm}-2`, priceTierId: tier.id, status: "available-inv" },
      { plotNumber: `${sizeSqm}-3`, priceTierId: tier.id, status: "reserved" },
      { plotNumber: `${sizeSqm}-4`, priceTierId: tier.id, status: "sold" },
    ], SCOPE);
    return { tier, plots };
  }

  it("a price change reaches every plot, and sizeChange is null because the size didn't change", async () => {
    const { tier } = await tierWithPlots(510);
    const result = await updatePriceTier(estateId, tier.id, { price: 12_000_000 }, SCOPE);

    expect(result.tier.price).toBe(12_000_000);
    // Null means the size did not change — not that nothing happened.
    expect(result.sizeChange).toBeNull();
    const { items } = await fetchPlots(estateId, SCOPE, { priceTierId: tier.id });
    expect(items.every((p) => p.basePrice === 12_000_000)).toBe(true);
  });

  it("a size change reaches available plots only, and says what it skipped, by status", async () => {
    const { tier } = await tierWithPlots(520);
    const result = await updatePriceTier(estateId, tier.id, { sizeSqm: 540 }, SCOPE);

    expect(result.sizeChange).toMatchObject({ previousSizeSqm: 520, newSizeSqm: 540, plotsUpdated: 2 });
    expect(result.sizeChange!.keptPreviousSize).toEqual({ total: 2, byStatus: { reserved: 1, sold: 1 } });
    expect(result.sizeChange!.note).toContain("keep the size their buyer agreed to");

    const { items } = await fetchPlots(estateId, SCOPE, { priceTierId: tier.id });
    const sizeOf = (status: string) => items.find((p) => p.status === status)!.nominalSizeSqm;
    expect(sizeOf("available-dev")).toBe(540);
    expect(sizeOf("available-inv")).toBe(540);
    // What's on a reserved or sold buyer's deed does not move under them.
    expect(sizeOf("reserved")).toBe(520);
    expect(sizeOf("sold")).toBe(520);
  });

  it("accepts the current tierType and currency echoed back — a full round trip works", async () => {
    const { tier } = await tierWithPlots(530);
    const result = await updatePriceTier(estateId, tier.id,
      { price: tier.price, label: "", sizeSqm: 530, tierType: "land_size", currency: "NGN" }, SCOPE);
    expect(result.sizeChange).toBeNull();
  });

  it("refuses a different tierType or currency on that field, with the reason", async () => {
    const { tier } = await tierWithPlots(550);

    const typeErr = await updatePriceTier(estateId, tier.id, { tierType: "unit_type" }, SCOPE).catch((e) => e);
    expect(typeErr).toBeInstanceOf(InventoryEditError);
    expect(typeErr).toMatchObject({ field: "tierType", code: "TIER_TYPE_IMMUTABLE" });
    expect(typeErr.message).toContain("Create a new tier");

    const currencyErr = await updatePriceTier(estateId, tier.id, { currency: "USD" }, SCOPE).catch((e) => e);
    expect(currencyErr).toMatchObject({ field: "currency", code: "TIER_CURRENCY_IMMUTABLE" });
  });

  it("refuses a size that another tier on the estate already has, on the size field", async () => {
    const { tier } = await tierWithPlots(560);
    const err = await updatePriceTier(estateId, tier.id, { sizeSqm: 250 }, SCOPE).catch((e) => e);
    expect(err).toMatchObject({ field: "sizeSqm", code: "DUPLICATE_RECORD" });
  });

  it("refuses a size on a unit-type tier", async () => {
    const err = await updatePriceTier(estateId, unitTier.id, { sizeSqm: 100 }, SCOPE).catch((e) => e);
    expect(err).toMatchObject({ field: "sizeSqm" });
  });
});

describe("renaming a block", () => {
  it("renames, and a clash is a clean message about the name — never a constraint", async () => {
    const a = await createBlock(estateId, { name: "Rename A" }, SCOPE);
    await createBlock(estateId, { name: "Rename B" }, SCOPE);

    const renamed = await updateBlock(estateId, a.id, { name: "Rename C", label: "North" }, SCOPE);
    expect(renamed).toMatchObject({ name: "Rename C", label: "North" });

    const err = await updateBlock(estateId, a.id, { name: "rename b" }, SCOPE).catch((e) => e);
    expect(err).toMatchObject({ field: "name", code: "DUPLICATE_RECORD" });
    expect(err.message).not.toMatch(/uq_|constraint/i);

    expect((await fetchBlocks(estateId, SCOPE)).find((b) => b.id === a.id)?.name).toBe("Rename C");
  });

  it("refuses a blank name, and an empty label clears the label", async () => {
    const block = await createBlock(estateId, { name: "Rename D", label: "Old" }, SCOPE);
    await expect(updateBlock(estateId, block.id, { name: "  " }, SCOPE)).rejects.toMatchObject({ field: "name" });
    expect((await updateBlock(estateId, block.id, { label: "" }, SCOPE)).label).toBeUndefined();
  });
});
