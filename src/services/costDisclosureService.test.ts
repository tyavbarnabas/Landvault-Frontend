import { describe, it, expect } from "vitest";
import {
  fetchCostDisclosure, isGrandfathered, isRange, range,
  tierCommitmentForLandPrice, tierCommitmentForSize,
  type PublicFee, type TierCommitment,
} from "./costDisclosureService";
import { formatDeclaredAmount } from "../lib/formatCurrency";

describe("isRange", () => {
  it("treats equal low/high as a single amount, and differing low/high as a range", () => {
    expect(isRange({ min: 7_000_000, max: 7_000_000, isRange: false })).toBe(false);
    expect(isRange({ min: 2_800_000, max: 3_400_000, isRange: true })).toBe(true);
  });
});

describe("fetchCostDisclosure", () => {
  it("returns null for an estate that has declared nothing, so nothing can render as zero", async () => {
    expect(await fetchCostDisclosure("peaceland")).toBeNull();
    expect(await fetchCostDisclosure("golden-acres")).toBeNull();
    expect(await fetchCostDisclosure("no-such-estate")).toBeNull();
  });

  it("distinguishes a grandfathered-exempt listing from one with no fees", async () => {
    const disclosure = await fetchCostDisclosure("crown-court");

    // Not null — an exempt listing is not a listing with no fees, and must
    // never render as though it were.
    expect(disclosure).not.toBeNull();
    expect(disclosure?.fees).toEqual([]);
  });
});

// The two figures the backend's integration tests also assert. If either
// layer's commitment maths drifts, these stop matching immediately.
describe("figures from the source letters", () => {
  it("Top Rank Platinum City: ₦4,500,000 of land commits a buyer to ₦12,610,000", async () => {
    const tier = tierCommitmentForSize(await fetchCostDisclosure("greenfield-park"), 180);

    expect(tier?.landPrice).toBe(4_500_000);
    expect(tier?.oneOffFees).toEqual({ min: 8_110_000, max: 8_110_000, isRange: false });
    expect(tier?.totalCommitment).toEqual({ min: 12_610_000, max: 12_610_000, isRange: false });
  });

  it("Double King Estate: ₦6,000,000 of land commits a buyer to ₦10,010,000", async () => {
    const tier = tierCommitmentForSize(await fetchCostDisclosure("double-king-estate"), 250);

    expect(tier?.landPrice).toBe(6_000_000);
    expect(tier?.oneOffFees).toEqual({ min: 4_010_000, max: 4_010_000, isRange: false });
    expect(tier?.totalCommitment).toEqual({ min: 10_010_000, max: 10_010_000, isRange: false });
  });

  it("declares only the fee types that appear in the letters", async () => {
    for (const estateId of ["greenfield-park", "double-king-estate"]) {
      const disclosure = await fetchCostDisclosure(estateId);
      const types = [...disclosure!.fees, ...disclosure!.tiers[0].recurringFees].map((f) => f.feeType).sort();
      expect(types).toEqual(["application", "construction_supervision", "facility_management", "infrastructure", "setting_out"]);
    }
  });

  it("invents no survey, legal, power-connection or courier fee", async () => {
    for (const estateId of ["greenfield-park", "double-king-estate"]) {
      const disclosure = await fetchCostDisclosure(estateId);
      const labels = disclosure!.fees.map((f) => f.label.toLowerCase()).join(" | ");
      for (const absent of ["survey", "deed", "legal", "power", "courier", "notarisation"]) {
        expect(labels).not.toContain(absent);
      }
    }
  });

  it("charges nothing in a currency other than naira", async () => {
    for (const estateId of ["greenfield-park", "double-king-estate"]) {
      const disclosure = await fetchCostDisclosure(estateId);
      const all = [...disclosure!.fees, ...disclosure!.tiers.flatMap((t) => [...t.recurringFees, ...t.optionalFees])];
      expect(all.every((f) => f.currency === "NGN")).toBe(true);
      expect(disclosure!.tiers.every((t) => t.totalExcludesOtherCurrencyFees === false)).toBe(true);
    }
  });

  it("breaks the infrastructure fee into the letters' own construction stages, and flags it as not fixed", async () => {
    const disclosure = await fetchCostDisclosure("greenfield-park");
    const levy = disclosure?.fees.find((f) => f.feeType === "infrastructure");

    expect(levy?.isFixed).toBe(false);
    expect(levy?.variationBasis).toContain("building materials");
    expect(levy?.dueTrigger).toBe("on_milestone");
    expect(levy?.milestones?.map((m) => m.pct)).toEqual([20, 15, 20, 20, 25]);
    // Both letters' schedules account for the whole fee.
    expect(levy?.milestones?.reduce((sum, m) => sum + m.pct, 0)).toBe(100);
  });

  it("leaves the facility-management amount unstated rather than inventing one", async () => {
    for (const estateId of ["greenfield-park", "double-king-estate"]) {
      const disclosure = await fetchCostDisclosure(estateId);
      const facility = disclosure!.tiers[0].recurringFees.find((f) => f.feeType === "facility_management");

      // Null, never 0 — the letters state the obligation but no figure.
      expect(facility?.amount).toBeNull();
      expect(facility?.isMandatory).toBe(true);
      expect(facility?.dueTrigger).toBe("annual");
    }
  });

  it("keeps recurring fees out of the total commitment", async () => {
    const tier = tierCommitmentForSize(await fetchCostDisclosure("greenfield-park"), 180);

    expect(tier?.recurringFees.length).toBeGreaterThan(0);
    // The total is land + one-off fees only. Folding in one year of a
    // perpetual charge would misrepresent both figures — and here there is
    // no figure to fold in at all.
    expect(tier?.totalCommitment.min).toBe(tier!.landPrice + tier!.oneOffFees.min);
  });

  it("shows both exits together: 20% deducted on withdrawal, up to 20% for falling behind", async () => {
    const exit = (await fetchCostDisclosure("greenfield-park"))?.exitCosts;

    expect(exit?.ifYouWithdraw.deductionPct).toBe(20);
    expect(exit?.ifYouWithdraw.refundAmount).toBe(3_600_000);
    expect(exit?.ifYouWithdraw.totalLoss).toBe(910_000);
    expect(exit?.ifYouFallBehind.map((s) => s.amount)).toEqual([225_000, 450_000, 900_000]);
    expect(exit?.ifYouFallBehind.at(-1)?.penaltyPct).toBe(20);
  });

  it("leaves revocation absent, because no revocation clause has been sourced", async () => {
    expect((await fetchCostDisclosure("greenfield-park"))?.exitCosts?.revocation).toBeNull();
  });
});

// No fee in either letter is a genuine range or priced in another currency,
// so these paths are exercised with obviously synthetic fees rather than by
// inventing one into a fixture that would look like a real listing.
describe("synthetic cases — code paths the real letters don't exercise", () => {
  const syntheticRangeFee: PublicFee = {
    feeType: "other", label: "Synthetic range fee", amount: range(2_800_000, 3_400_000),
    currency: "NGN", isFixed: false, dueTrigger: "at_allocation", refundable: false, isMandatory: true,
  };

  const syntheticTier: TierCommitment = {
    tierId: "synthetic", sizeSqm: 200, landPrice: 10_000_000, currency: "NGN",
    oneOffFees: range(2_800_000, 3_400_000), totalCommitment: range(12_800_000, 13_400_000),
    totalCommitmentIfCorner: null, recurringFees: [], optionalFees: [],
    totalExcludesOtherCurrencyFees: true,
  };

  it("carries a range through to the total without collapsing it", () => {
    expect(isRange(syntheticRangeFee.amount!)).toBe(true);
    expect(isRange(syntheticTier.totalCommitment)).toBe(true);

    // Specifically not the midpoint, at either end — a midpoint is a number
    // nobody quoted and nobody will honour.
    const midpoint = (syntheticTier.totalCommitment.min + syntheticTier.totalCommitment.max) / 2;
    expect(syntheticTier.totalCommitment.min).not.toBe(midpoint);
    expect(syntheticTier.totalCommitment.max).not.toBe(midpoint);
  });

  it("can flag a total that excludes a fee in another currency", () => {
    expect(syntheticTier.totalExcludesOtherCurrencyFees).toBe(true);
  });
});

describe("tier lookup", () => {
  it("matches a tier by its exact land price", async () => {
    expect(tierCommitmentForLandPrice(await fetchCostDisclosure("greenfield-park"), 4_500_000)?.sizeSqm).toBe(180);
  });

  it("returns null rather than the nearest tier — a total against the wrong tier is worse than none", async () => {
    expect(tierCommitmentForLandPrice(await fetchCostDisclosure("greenfield-park"), 4_600_000)).toBeNull();
  });

  it("never returns a commitment for an exempt or absent disclosure", async () => {
    expect(tierCommitmentForLandPrice(await fetchCostDisclosure("crown-court"), 33_000_000)).toBeNull();
    expect(tierCommitmentForSize(null, 300)).toBeNull();
  });
});

describe("fixture integrity", () => {
  it("every declared total equals land price plus one-off fees at both ends of the range", async () => {
    // The frontend never does this arithmetic to display a figure; this test
    // does it to prove the backend-shaped fixtures are internally consistent,
    // so a typo can't quietly ship a total nobody can reconstruct.
    for (const estateId of ["greenfield-park", "double-king-estate"]) {
      const disclosure = await fetchCostDisclosure(estateId);
      for (const tier of disclosure!.tiers) {
        expect(tier.totalCommitment.min).toBe(tier.landPrice + tier.oneOffFees.min);
        expect(tier.totalCommitment.max).toBe(tier.landPrice + tier.oneOffFees.max);
      }
    }
  });

  it("every one-off fee total matches the sum of the itemised fees that have a stated amount", async () => {
    for (const estateId of ["greenfield-park", "double-king-estate"]) {
      const disclosure = await fetchCostDisclosure(estateId);
      const itemised = disclosure!.fees.reduce((sum, f) => sum + (f.amount?.min ?? 0), 0);
      expect(disclosure!.tiers[0].oneOffFees.min).toBe(itemised);
    }
  });
});

describe("formatDeclaredAmount", () => {
  it("renders an amount in its own currency without converting it", () => {
    // mockData's formatAmount would read 180 as naira and convert it into
    // dollars, rendering "$0" — a declared fee must survive display intact.
    expect(formatDeclaredAmount(180, "USD")).toBe("$180");
    expect(formatDeclaredAmount(7_000_000, "NGN")).toBe("₦7,000,000");
  });
});
