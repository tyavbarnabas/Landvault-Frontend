import { describe, it, expect } from "vitest";
import { getListingEligibility } from "./resaleService";
import { makeOwnedPlot } from "../test/factories";

describe("getListingEligibility", () => {
  it("computes the outstanding balance and allows a listing from good-standing statuses", () => {
    const result = getListingEligibility(makeOwnedPlot({ status: "installment_active", totalPrice: 10_000_000, paidAmount: 4_000_000 }));
    expect(result).toEqual({ eligible: true, outstandingBalance: 6_000_000 });
  });

  it("never lets the outstanding balance go negative on an overpaid/fully-paid plot", () => {
    const result = getListingEligibility(makeOwnedPlot({ status: "completed", totalPrice: 5_000_000, paidAmount: 5_000_000 }));
    expect(result.outstandingBalance).toBe(0);
  });

  it("blocks a plot in arrears, with a restructuring-pointing reason", () => {
    const result = getListingEligibility(makeOwnedPlot({ status: "in_arrears" }));
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/arrears/i);
  });

  it("blocks a plot still processing (pending_verification or reserved)", () => {
    for (const status of ["pending_verification", "reserved"] as const) {
      const result = getListingEligibility(makeOwnedPlot({ status }));
      expect(result.eligible).toBe(false);
      expect(result.reason).toMatch(/processing/i);
    }
  });

  it("blocks a plot already transferred to a new owner", () => {
    const result = getListingEligibility(makeOwnedPlot({ status: "transferred" }));
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/transferred/i);
  });

  it("blocks a plot record superseded by an upgrade", () => {
    const result = getListingEligibility(makeOwnedPlot({ status: "superseded" }));
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/superseded/i);
  });

  it("blocks a plot with an upgrade already pending", () => {
    const result = getListingEligibility(makeOwnedPlot({ status: "upgrade_pending" }));
    expect(result.eligible).toBe(false);
    expect(result.reason).toMatch(/pending/i);
  });

  it("every ineligible status still reports the real outstanding balance, not zero", () => {
    const result = getListingEligibility(makeOwnedPlot({ status: "in_arrears", totalPrice: 10_000_000, paidAmount: 3_000_000 }));
    expect(result.eligible).toBe(false);
    expect(result.outstandingBalance).toBe(7_000_000);
  });
});
