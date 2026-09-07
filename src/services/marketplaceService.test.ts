import { describe, it, expect } from "vitest";
import { fromPrice, pricePerSqm, cornerPrice } from "./marketplaceService";
import { makePriceTier } from "../test/factories";

describe("fromPrice", () => {
  it("picks the lowest price among non-sold-out tiers", () => {
    const listing = {
      priceTiers: [
        makePriceTier({ id: "a", price: 8_000_000, availability: "available" }),
        makePriceTier({ id: "b", price: 5_000_000, availability: "low_stock" }),
        makePriceTier({ id: "c", price: 3_000_000, availability: "sold_out" }), // cheapest but excluded
      ],
    };
    expect(fromPrice(listing)).toBe(5_000_000);
  });

  it("falls back to the cheapest tier overall when every tier is sold out", () => {
    const listing = {
      priceTiers: [
        makePriceTier({ id: "a", price: 9_000_000, availability: "sold_out" }),
        makePriceTier({ id: "b", price: 4_000_000, availability: "sold_out" }),
      ],
    };
    expect(fromPrice(listing)).toBe(4_000_000); // never crashes or returns Infinity/0
  });
});

describe("pricePerSqm", () => {
  it("divides the tier's own price by its NOMINAL size, not actual surveyed area", () => {
    const tier = makePriceTier({ price: 10_000_000, sizeSqm: 500, actualAreaSqm: 481 });
    expect(pricePerSqm(tier)).toBe(20_000);
  });
});

describe("cornerPrice", () => {
  it("applies the listing's cornerPremiumPct on top of the tier's own price", () => {
    const tier = makePriceTier({ price: 10_000_000 });
    expect(cornerPrice(tier, { cornerPremiumPct: 12 })).toBeCloseTo(11_200_000); // floating-point %, not an exact binary fraction
  });

  it("is a no-op multiplier at 0% premium", () => {
    const tier = makePriceTier({ price: 7_500_000 });
    expect(cornerPrice(tier, { cornerPremiumPct: 0 })).toBe(7_500_000);
  });
});
