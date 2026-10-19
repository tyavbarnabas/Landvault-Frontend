import { describe, it, expect } from "vitest";
import { describePurchase, pollUntilSettled, refundLine } from "./purchaseStatus";
import type { Purchase, PaymentSummary } from "../services/paymentsService";
import type { TransactionStatus } from "../services/marketplaceCheckoutService";

const purchase = (status: TransactionStatus, payment: Partial<PaymentSummary> | null = null, extra: Partial<Purchase> = {}): Purchase => ({
  id: "t1", reference: "LV-1", estateId: "e1", plotId: "p1", reservationId: "r1", basePrice: 15_000_000, cornerPremiumPct: null,
  totalPrice: 15_000_000, currency: "NGN", intent: "development", plan: "outright", installmentMonths: null, status,
  createdAt: "2026-10-09T10:00:00Z",
  payment: payment && { reference: "PAY-1", status: "succeeded", amountPaid: null, paidAt: null, underReview: false, reviewKind: null, refundStatus: null, receiptId: null, receiptNumber: null, ...payment },
  ...extra,
});

const ALL: TransactionStatus[] = ["pending_payment", "payment_received", "awaiting_finance", "verified", "rejected", "abandoned"];

describe("what a purchase means to its buyer", () => {
  it("only `verified` is ever the buyer's", () => {
    for (const status of ALL) {
      for (const payment of [null, { status: "succeeded" as const }, { underReview: true, reviewKind: "late_payment" as const }, { underReview: true, reviewKind: "refund_due" as const }]) {
        const state = describePurchase(purchase(status, payment));
        expect([status, state.owned]).toEqual([status, status === "verified"]);
        if (status !== "verified") expect(`${state.title} ${state.body}`).not.toMatch(/plot is yours|is allocated to you|has been allocated/i);
      }
    }
    expect(describePurchase(purchase("verified")).title).toBe("The plot is yours");
  });

  it("a paid purchase is received and being verified — not owned", () => {
    const s = describePurchase(purchase("awaiting_finance", { status: "succeeded" }));
    expect(s.title).toBe("Payment received — the developer is verifying it");
    expect(s.canPay).toBe(false);
  });

  it("rejected: money returned, with the refund's progress", () => {
    const s = describePurchase(purchase("rejected", { underReview: true, reviewKind: "refund_due", refundStatus: "processing" }));
    expect(s.body).toMatch(/returned to you in full/);
    expect(s.refund).toBe("Your refund is on its way.");
  });

  it("late money: plot-or-refund only for late_payment; refund_due says the money is coming back", () => {
    expect(describePurchase(purchase("abandoned", { underReview: true, reviewKind: "late_payment" })).body).toMatch(/your plot or a full refund/);
    const refund = describePurchase(purchase("abandoned", { underReview: true, reviewKind: "refund_due" }));
    expect(refund.title).toBe("Your payment is being returned");
    expect(refund.body).not.toMatch(/your plot or/);
    expect(describePurchase(purchase("abandoned")).title).toBe("This reservation ended before payment arrived");
  });

  it("pending: Pay now, Continue payment, or Pay again — and never for installments or non-naira", () => {
    expect(describePurchase(purchase("pending_payment"))).toMatchObject({ canPay: true, payLabel: "Pay now" });
    expect(describePurchase(purchase("pending_payment", { status: "initialized" }))).toMatchObject({ canPay: true, payLabel: "Continue payment" });
    expect(describePurchase(purchase("pending_payment", { status: "failed" }))).toMatchObject({ canPay: true, payLabel: "Pay again" });
    expect(describePurchase(purchase("pending_payment", { status: "mismatched" }))).toMatchObject({ canPay: false, title: "We received a payment we need to review" });
    expect(describePurchase(purchase("pending_payment", null, { plan: "installment" }))).toMatchObject({ canPay: false, payNote: "Online payment is for outright purchases only for now." });
    expect(describePurchase(purchase("pending_payment", null, { currency: "USD" }))).toMatchObject({ canPay: false });
  });

  it("every refund status reads as something, including sending and needs-attention", () => {
    for (const s of ["pending", "sending", "processing", "needs-attention", "processed", "failed"] as const) expect(refundLine(s)).toBeTruthy();
    expect(refundLine(null)).toBeNull();
  });
});

describe("waiting for a payment to settle", () => {
  const noSleep = async () => {};

  it("stops as soon as the payment settles", async () => {
    const seen = ["initialized", "initialized", "succeeded"];
    let calls = 0;
    const updates: string[] = [];
    const outcome = await pollUntilSettled(async () => ({ status: seen[calls++] }), (v) => updates.push(v.status), { sleep: noSleep });
    expect(outcome).toBe("settled");
    expect(calls).toBe(3);
    expect(updates).toEqual(seen);
  });

  it("gives up after maxTries — it never polls forever", async () => {
    let calls = 0;
    const outcome = await pollUntilSettled(async () => { calls++; return { status: "initialized" }; }, () => {}, { sleep: noSleep, maxTries: 24 });
    expect(outcome).toBe("gave_up");
    expect(calls).toBe(24);
  });

  it("stops when the page goes away", async () => {
    let calls = 0;
    let gone = false;
    const outcome = await pollUntilSettled(async () => { calls++; gone = true; return { status: "initialized" }; }, () => {}, { sleep: noSleep, cancelled: () => gone });
    expect(outcome).toBe("cancelled");
    expect(calls).toBe(1);
  });
});

describe("when the purchase page shows a refund", () => {
  it("rejected, refund_due, or a refund under way — and only once money was paid", async () => {
    const { refundExpected } = await import("./purchaseStatus");
    expect(refundExpected(purchase("rejected", { status: "succeeded", amountPaid: 15_000_000 }))).toBe(true);
    expect(refundExpected(purchase("abandoned", { underReview: true, reviewKind: "refund_due", amountPaid: 15_000_000 }))).toBe(true);
    expect(refundExpected(purchase("abandoned", { refundStatus: "processed", amountPaid: 15_000_000 }))).toBe(true);
    expect(refundExpected(purchase("abandoned", { underReview: true, reviewKind: "late_payment", amountPaid: 15_000_000 }))).toBe(false);
    expect(refundExpected(purchase("abandoned"))).toBe(false);
    expect(refundExpected(purchase("pending_payment", { status: "initialized" }))).toBe(false);
    expect(refundExpected(purchase("awaiting_finance", { status: "succeeded", amountPaid: 15_000_000 }))).toBe(false);
  });
});

describe("My purchases: the badge, the tab and the progress", () => {
  it("files and labels each status", async () => {
    const { purchaseBadge, purchaseGroup } = await import("./purchaseStatus");
    const rows = [
      purchase("verified", { amountPaid: 15_000_000, paidAt: "2026-10-16T16:28:48Z", receiptNumber: "HT-RCT-2026-000010" }),
      purchase("abandoned"),
      purchase("rejected", { amountPaid: 15_000_000, refundStatus: "processed" }),
      purchase("rejected", { amountPaid: 15_000_000, refundStatus: "processing" }),
      purchase("pending_payment"),
      purchase("pending_payment", { status: "failed" }),
      purchase("awaiting_finance", { amountPaid: 15_000_000 }),
      purchase("abandoned", { amountPaid: 15_000_000, underReview: true, reviewKind: "late_payment" }),
    ];
    expect(rows.map((r) => [purchaseGroup(r), purchaseBadge(r).label])).toEqual([
      ["allocated", "Plot allocated"],
      ["ended", "Reservation ended"],
      ["ended", "Refunded"],
      ["in_progress", "Refund on its way"],
      ["in_progress", "Awaiting payment"],
      ["in_progress", "Payment failed"],
      ["in_progress", "Being verified"],
      ["in_progress", "Under review"],
    ]);
    expect(purchaseBadge(rows[0]).note).toBe("Receipt HT-RCT-2026-000010");
    expect(purchaseBadge(rows[1]).note).toBe("Nothing was charged");
  });

  it("shows how far it got, with only the times the API holds", async () => {
    const { purchaseTimeline } = await import("./purchaseStatus");
    const done = purchaseTimeline(purchase("verified", { amountPaid: 15_000_000, paidAt: "2026-10-16T16:28:48Z", receiptNumber: "HT-RCT-2026-000010" }));
    expect(done.map((s) => [s.key, s.state, s.at])).toEqual([
      ["reserved", "done", "2026-10-09T10:00:00Z"], ["paid", "done", "2026-10-16T16:28:48Z"], ["verified", "done", null], ["allocated", "done", null],
    ]);
    expect(done[1].note).toBe("₦15,000,000 confirmed by Paystack");
    expect(purchaseTimeline(purchase("abandoned")).map((s) => [s.key, s.state])).toEqual([["reserved", "done"], ["ended", "failed"]]);
    expect(purchaseTimeline(purchase("awaiting_finance", { amountPaid: 1 })).map((s) => s.state)).toEqual(["done", "done", "current", "upcoming"]);
    expect(purchaseTimeline(purchase("rejected", { amountPaid: 1, refundStatus: "processed" })).map((s) => [s.key, s.state])).toEqual([
      ["reserved", "done"], ["paid", "done"], ["verified", "failed"], ["refund", "done"],
    ]);
  });
});
