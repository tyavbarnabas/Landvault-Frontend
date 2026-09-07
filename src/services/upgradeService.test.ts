import { describe, it, expect } from "vitest";
import { computeUpgradeQuote, getUpgradeEligibility, UPGRADE_POLICY } from "./upgradeService";
import { makeEstate, makeListingPlot, makeOwnedPlot, makePriceTier } from "../test/factories";

describe("computeUpgradeQuote", () => {
  it("prices an upgrade: positive signed delta, admin fee applied to the delta", () => {
    const ownedPlot = makeOwnedPlot({ paidAmount: 4_000_000, currency: "NGN" });
    const targetPlot = makeListingPlot({ tierId: "e-2-500", isCorner: false });
    const targetTiers = [makePriceTier({ id: "e-2-500", price: 6_000_000 })];
    const targetEstate = makeEstate({ cornerPremiumPct: 10 });

    const quote = computeUpgradeQuote(ownedPlot, targetPlot, targetTiers, targetEstate);

    expect(quote.direction).toBe("upgrade");
    expect(quote.newPlotBasePrice).toBe(6_000_000);
    expect(quote.newPlotTotalPrice).toBe(6_000_000); // not corner — no premium applied
    expect(quote.delta).toBe(2_000_000); // 6M target - 4M equity paid, never clamped
    expect(quote.adminFee).toBe(Math.round(2_000_000 * (UPGRADE_POLICY.adminFeePct / 100)));
    expect(quote.currency).toBe("NGN");
  });

  it("prices a downgrade: NEGATIVE delta, never clamped to zero, and no admin fee", () => {
    const ownedPlot = makeOwnedPlot({ paidAmount: 8_000_000 });
    const targetPlot = makeListingPlot({ tierId: "e-2-300" });
    const targetTiers = [makePriceTier({ id: "e-2-300", price: 5_000_000 })];
    const targetEstate = makeEstate();

    const quote = computeUpgradeQuote(ownedPlot, targetPlot, targetTiers, targetEstate);

    expect(quote.direction).toBe("downgrade");
    expect(quote.delta).toBe(-3_000_000); // signed, negative — a credit is due, not zero
    expect(quote.adminFee).toBe(0); // never charged when money moves back to the buyer
  });

  it("treats an exact equity match as even, with no fee either way", () => {
    const ownedPlot = makeOwnedPlot({ paidAmount: 5_000_000 });
    const targetPlot = makeListingPlot({ tierId: "e-2-500" });
    const targetTiers = [makePriceTier({ id: "e-2-500", price: 5_000_000 })];
    const targetEstate = makeEstate();

    const quote = computeUpgradeQuote(ownedPlot, targetPlot, targetTiers, targetEstate);

    expect(quote.direction).toBe("even");
    expect(quote.delta).toBe(0);
    expect(quote.adminFee).toBe(0);
  });

  it("applies the target estate's own corner premium on top of the tier base price", () => {
    const ownedPlot = makeOwnedPlot({ paidAmount: 4_000_000 });
    const targetPlot = makeListingPlot({ tierId: "e-2-500", isCorner: true });
    const targetTiers = [makePriceTier({ id: "e-2-500", price: 6_000_000 })];
    const targetEstate = makeEstate({ cornerPremiumPct: 15 });

    const quote = computeUpgradeQuote(ownedPlot, targetPlot, targetTiers, targetEstate);

    expect(quote.newPlotBasePrice).toBe(6_000_000);
    expect(quote.newPlotTotalPrice).toBeCloseTo(6_900_000); // 6M * 1.15, floating-point %
    expect(quote.cornerPremium).toBeCloseTo(900_000);
    expect(quote.delta).toBeCloseTo(2_900_000); // computed off the corner-inclusive final price
  });

  it("reports the outstanding balance on the CURRENT plot as informational, separate from the delta", () => {
    const ownedPlot = makeOwnedPlot({ totalPrice: 10_000_000, paidAmount: 4_000_000 });
    const targetPlot = makeListingPlot({ tierId: "e-2-500" });
    const targetTiers = [makePriceTier({ id: "e-2-500", price: 6_000_000 })];
    const targetEstate = makeEstate();

    const quote = computeUpgradeQuote(ownedPlot, targetPlot, targetTiers, targetEstate);

    expect(quote.outstandingOnCurrent).toBe(6_000_000); // 10M - 4M, unrelated to the new plot's price
    expect(quote.equityPaid).toBe(4_000_000);
    expect(quote.currentPlotPrice).toBe(10_000_000);
  });

  it("never lets a fully-paid-off plot's outstanding balance go negative", () => {
    const ownedPlot = makeOwnedPlot({ totalPrice: 5_000_000, paidAmount: 5_000_000 });
    const targetPlot = makeListingPlot({ tierId: "e-2-500" });
    const targetTiers = [makePriceTier({ id: "e-2-500", price: 5_000_000 })];
    const targetEstate = makeEstate();

    const quote = computeUpgradeQuote(ownedPlot, targetPlot, targetTiers, targetEstate);

    expect(quote.outstandingOnCurrent).toBe(0);
  });
});

describe("getUpgradeEligibility", () => {
  it("allows an upgrade from good-standing statuses", () => {
    for (const status of ["installment_active", "completed", "allocated"] as const) {
      expect(getUpgradeEligibility(makeOwnedPlot({ status }))).toEqual({ eligible: true });
    }
  });

  it("blocks a plot in arrears, with a reason pointing at restructuring", () => {
    const result = getUpgradeEligibility(makeOwnedPlot({ status: "in_arrears" }));
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/arrears/i);
  });

  it("blocks a plot still processing (pending_verification or reserved)", () => {
    for (const status of ["pending_verification", "reserved"] as const) {
      const result = getUpgradeEligibility(makeOwnedPlot({ status }));
      expect(result.eligible).toBe(false);
      expect(result.reason).toMatch(/processing/i);
    }
  });

  it("blocks a plot already transferred to a new owner", () => {
    const result = getUpgradeEligibility(makeOwnedPlot({ status: "transferred" }));
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/transferred/i);
  });

  it("blocks a plot record already superseded by an earlier upgrade", () => {
    const result = getUpgradeEligibility(makeOwnedPlot({ status: "superseded" }));
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/superseded/i);
  });

  it("blocks a plot with an upgrade already pending", () => {
    const result = getUpgradeEligibility(makeOwnedPlot({ status: "upgrade_pending" }));
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/already pending/i);
  });
});
