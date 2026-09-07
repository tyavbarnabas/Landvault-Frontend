import { describe, it, expect } from "vitest";
import { priceForPlot } from "./marketplacePlotsService";
import { makeListingPlot, makePriceTier } from "../test/factories";

describe("priceForPlot", () => {
  it("prices a standard plot at its tier's price, with no premium", () => {
    const plot = makeListingPlot({ tierId: "t-1", isCorner: false });
    const tiers = [makePriceTier({ id: "t-1", price: 6_000_000 })];
    expect(priceForPlot(plot, tiers, 10)).toEqual({ base: 6_000_000, final: 6_000_000 });
  });

  it("adds the estate's corner premium on top of the tier's price for a corner plot", () => {
    const plot = makeListingPlot({ tierId: "t-1", isCorner: true });
    const tiers = [makePriceTier({ id: "t-1", price: 6_000_000 })];
    const { base, final } = priceForPlot(plot, tiers, 15);
    expect(base).toBe(6_000_000);
    expect(final).toBeCloseTo(6_900_000); // floating-point %, not an exact binary fraction
  });

  it("falls back to a zero base price when the plot's tier can't be found, rather than throwing", () => {
    const plot = makeListingPlot({ tierId: "missing-tier" });
    const tiers = [makePriceTier({ id: "t-1", price: 6_000_000 })];
    expect(priceForPlot(plot, tiers, 10)).toEqual({ base: 0, final: 0 });
  });
});
