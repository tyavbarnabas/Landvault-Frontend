import { describe, it, expect } from "vitest";
import {
  buildDefaultRequest, buildFeesRequest, buildRefundRequest, declareDefaultTerms, declareFees, declareRefundTerms,
  defaultDraftFrom, emptyFeeDraft, fetchDefaultTerms, fetchFeeSchedule, fetchRefundTerms, refundDraftFrom,
  toPublicFee, validateFeeDeclarations, type FeeDeclaration, type FeeDraft,
} from "./estateDisclosureService";
import * as disclosure from "./estateDisclosureService";

const fixedDraft = (overrides: Partial<FeeDraft> = {}): FeeDraft => ({
  ...emptyFeeDraft(), feeType: "application", pricing: "fixed", amount: "10000",
  dueTrigger: "at_application", refundable: false, isMandatory: true, ...overrides,
});

const INFRASTRUCTURE_VARIATION = "Subject to change due to fluctuations in the prices of building materials";

// PART 1. The distinction FeeScheduleDto exists to keep.
describe("silence is not a disclosure", () => {
  it("refuses to build a request from an untouched form", () => {
    const result = buildFeesRequest("undecided", []);

    expect(result.request).toBeUndefined();
    expect(result.errors?.mode).toMatch(/not the same as declaring no fees/);
  });

  it("does not turn an untouched form into an empty declaration even if fee rows were started and removed", () => {
    // "fees" chosen, every row deleted: still not a statement of "none".
    expect(buildFeesRequest("fees", []).request).toBeUndefined();
  });

  it("builds an empty declaration only from the explicit 'no charges' choice", () => {
    expect(buildFeesRequest("none", []).request).toEqual({ fees: [] });
  });

  it("an explicit empty declaration counts as declared; never declaring does not", async () => {
    const estateId = "silence-test-estate";
    expect((await fetchFeeSchedule(estateId)).declaredAt).toBeNull();
    expect(disclosure.mockHasDeclaredFees(estateId)).toBe(false);

    const schedule = await declareFees(estateId, { fees: [] });

    expect(schedule.fees).toEqual([]);
    expect(schedule.declaredAt).not.toBeNull();
    expect(disclosure.mockHasDeclaredFees(estateId)).toBe(true);
  });
});

// PD-2.
describe("a fee is fixed, or a range with a reason — never silence", () => {
  it("rejects a range without a variation basis as a field error, before any request", () => {
    const result = buildFeesRequest("fees", [fixedDraft({
      feeType: "infrastructure", pricing: "range", amount: "", amountMin: "3000000", amountMax: "4000000",
      dueTrigger: "on_milestone", variationBasis: "  ",
    })]);

    expect(result.request).toBeUndefined();
    expect(result.errors?.["fees.0.variationBasis"]).toMatch(/why this fee may vary/);
  });

  it("accepts the same range once the basis is stated", () => {
    const result = buildFeesRequest("fees", [fixedDraft({
      feeType: "infrastructure", pricing: "range", amountMin: "3000000", amountMax: "4000000",
      dueTrigger: "on_milestone", variationBasis: INFRASTRUCTURE_VARIATION,
    })]);

    expect(result.errors).toBeUndefined();
    expect(result.request?.fees[0]).toMatchObject({
      isFixed: false, amount: null, amountMin: 3_000_000, amountMax: 4_000_000, variationBasis: INFRASTRUCTURE_VARIATION,
    });
  });

  it("sends a fixed fee's amount and never a range beside it", () => {
    const fee = buildFeesRequest("fees", [fixedDraft({ amountMin: "1", amountMax: "2" })]).request!.fees[0];
    expect(fee).toMatchObject({ isFixed: true, amount: 10_000, amountMin: null, amountMax: null, variationBasis: null });
  });

  it("rejects a backwards range, an unnamed 'other' fee and a duplicate — the backend's own rules", () => {
    const base: FeeDeclaration = {
      feeType: "other", label: null, amount: 1, amountMin: null, amountMax: null, currency: "NGN", isFixed: true,
      variationBasis: null, dueTrigger: "at_allocation", refundable: false, isMandatory: true, notes: null,
    };
    expect(validateFeeDeclarations([base])["fees.0.label"]).toBeDefined();
    expect(validateFeeDeclarations([{ ...base, feeType: "legal" }, { ...base, feeType: "legal" }])["fees.1.feeType"]).toBeDefined();
    expect(validateFeeDeclarations([{ ...base, feeType: "survey", isFixed: false, amount: null, amountMin: 5, amountMax: 2, variationBasis: "x" }])["fees.0.amountMax"])
      .toBeDefined();
  });

  it("requires every yes/no to be answered rather than defaulting it", () => {
    const errors = buildFeesRequest("fees", [fixedDraft({ refundable: null, isMandatory: null, dueTrigger: "", pricing: "" })]).errors!;
    expect(Object.keys(errors).sort()).toEqual(["fees.0.dueTrigger", "fees.0.isMandatory", "fees.0.pricing", "fees.0.refundable"]);
  });
});

// "No cap, no warning, no threshold."
describe("the platform does not regulate amounts", () => {
  it("accepts an infrastructure fee of 156% of the land price without comment", () => {
    // ₦7,000,000 on ₦4,500,000 of land — a real figure from a real letter.
    const result = buildFeesRequest("fees", [fixedDraft({ feeType: "infrastructure", amount: "7000000", dueTrigger: "on_milestone" })]);
    expect(result.errors).toBeUndefined();
  });

  it("accepts any size of figure, and zero", () => {
    expect(validateFeeDeclarations([{
      feeType: "legal", label: null, amount: 9_999_999_999, amountMin: null, amountMax: null, currency: "NGN", isFixed: true,
      variationBasis: null, dueTrigger: "at_allocation", refundable: false, isMandatory: true, notes: null,
    }])).toEqual({});
    expect(buildFeesRequest("fees", [fixedDraft({ amount: "0" })]).errors).toBeUndefined();
  });
});

// PART 1 again: versions, never edits.
describe("declaring again writes a new version", () => {
  it("increments the fee schedule version and keeps the new content", async () => {
    const estateId = "version-test-estate";
    const v1 = await declareFees(estateId, { fees: [] });
    const v2 = await declareFees(estateId, buildFeesRequest("fees", [fixedDraft()]).request!);

    expect(v2.version).toBe(v1.version + 1);
    expect((await fetchFeeSchedule(estateId)).fees).toHaveLength(1);
  });

  it("versions refund and default terms the same way", async () => {
    const estateId = "version-terms-estate";
    const refund = { deductionPct: 20, processingDays: 90, appliesTo: "total_price" as const, nonRefundableFeeTypes: [], notes: null };
    expect((await declareRefundTerms(estateId, refund)).version).toBe(1);
    expect((await declareRefundTerms(estateId, { ...refund, deductionPct: 15 })).version).toBe(2);
    expect((await fetchRefundTerms(estateId))?.deductionPct).toBe(15);

    const terms = {
      revocationTrigger: "12 months overdue", revocationNoticeDays: 30, onRevocationRefund: "Refunded less 20%.",
      developmentDeadlineMonths: 3, transferRequiresConsent: true, penaltyTiers: [], notes: null,
    };
    expect((await declareDefaultTerms(estateId, terms)).version).toBe(1);
    expect((await declareDefaultTerms(estateId, terms)).version).toBe(2);
  });

  it("offers no edit and no delete", () => {
    const exported = Object.keys(disclosure);
    expect(exported.filter((name) => /^(update|edit|delete|remove|patch)/i.test(name))).toEqual([]);
  });

  it("returns null, not zeros, for terms nobody has declared", async () => {
    expect(await fetchRefundTerms("never-declared")).toBeNull();
    expect(await fetchDefaultTerms("never-declared")).toBeNull();
  });
});

// PD-5.
describe("refund terms", () => {
  it("requires appliesTo to be chosen rather than defaulting it", () => {
    const result = buildRefundRequest({ ...refundDraftFrom(null), deductionPct: "20", processingDays: "90" });
    expect(result.errors?.appliesTo).toMatch(/different figures/);
  });

  it("builds a request once appliesTo is chosen", () => {
    const result = buildRefundRequest({ ...refundDraftFrom(null), deductionPct: "20", processingDays: "90", appliesTo: "amount_paid", nonRefundableFeeTypes: ["application"] });
    expect(result.request).toEqual({ deductionPct: 20, processingDays: 90, appliesTo: "amount_paid", nonRefundableFeeTypes: ["application"], notes: null });
  });
});

// PD-6.
describe("default terms", () => {
  it("requires what happens to money already paid", () => {
    const result = buildDefaultRequest({ ...defaultDraftFrom(null), revocationTrigger: "12 months overdue", transferRequiresConsent: false });
    expect(result.errors?.onRevocationRefund).toMatch(/money already paid/);
  });

  it("requires the transfer-consent question to be answered", () => {
    const result = buildDefaultRequest({ ...defaultDraftFrom(null), revocationTrigger: "x", onRevocationRefund: "y" });
    expect(result.errors?.transferRequiresConsent).toBeDefined();
  });

  it("accepts the source letter's ladder — 5% at 3, 10% at 6, 20% at 12 — and rejects a repeated month", () => {
    const base = { ...defaultDraftFrom(null), revocationTrigger: "x", onRevocationRefund: "y", transferRequiresConsent: true };
    const ladder = [{ monthsLate: "3", penaltyPct: "5" }, { monthsLate: "6", penaltyPct: "10" }, { monthsLate: "12", penaltyPct: "20" }];
    expect(buildDefaultRequest({ ...base, penaltyTiers: ladder }).request?.penaltyTiers).toHaveLength(3);
    expect(buildDefaultRequest({ ...base, penaltyTiers: [...ladder, { monthsLate: "6", penaltyPct: "15" }] }).errors?.["penaltyTiers.3.monthsLate"])
      .toBeDefined();
  });
});

// PD-7: the declaration shown in the buyer's components, reshaped not recomputed.
describe("toPublicFee", () => {
  it("keeps a range as its two ends and never produces a midpoint", () => {
    const fee = toPublicFee({
      feeType: "infrastructure", label: null, amount: null, amountMin: 3_000_000, amountMax: 4_000_000, currency: "NGN",
      isFixed: false, variationBasis: INFRASTRUCTURE_VARIATION, dueTrigger: "on_milestone", refundable: false, isMandatory: true, notes: null,
    });
    expect(fee.amount).toEqual({ min: 3_000_000, max: 4_000_000, isRange: true });
    expect(fee.label).toBe("Infrastructure");
  });

  it("leaves an amount the source never stated as absent, not zero", () => {
    const fee = toPublicFee({
      feeType: "facility_management", label: null, amount: null, amountMin: null, amountMax: null, currency: "NGN",
      isFixed: false, variationBasis: null, dueTrigger: "annual", refundable: false, isMandatory: true, notes: null,
    });
    expect(fee.amount).toBeNull();
  });
});

describe("seeded schedules agree with the buyer-facing fixtures", () => {
  it("gives Greenfield Park the same fees the marketplace shows, as version 1", async () => {
    const schedule = await fetchFeeSchedule("greenfield-park");
    expect(schedule.version).toBe(1);
    expect(schedule.declaredAt).not.toBeNull();
    expect(schedule.fees.map((f) => f.feeType).sort())
      .toEqual(["application", "construction_supervision", "facility_management", "infrastructure", "setting_out"]);
    // The letters state no facility-management figure; none is invented.
    const fm = schedule.fees.find((f) => f.feeType === "facility_management")!;
    expect([fm.amount, fm.amountMin, fm.amountMax]).toEqual([null, null, null]);
  });
});
