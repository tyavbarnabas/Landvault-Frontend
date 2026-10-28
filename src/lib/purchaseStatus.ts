// What a purchase's state means to its buyer — the ONE place that decides, so
// no screen can drift into calling a plot "yours" early.
//
// The rule: only `verified` (the developer's finance checked the payment)
// means the plot is the buyer's. A payment confirmed by Paystack is "received,
// being verified" — never ownership. Late money (`underReview`) is never
// shown as owned either.

import type { Purchase } from "../services/paymentsService";
import { formatInCurrency } from "../data/mockData";
import type { RefundStatus } from "../services/paymentTypes";
import { planInSentence } from "../services/paymentPlansService";

export type PurchaseTone = "success" | "info" | "warning" | "neutral";

export interface PurchaseState {
  tone: PurchaseTone;
  title: string;
  body: string;
  // Paying is possible now (pending_payment, outright, NGN, nothing in flight).
  canPay: boolean;
  payLabel: string;
  // Why paying online isn't offered, when it otherwise would be.
  payNote: string | null;
  // A line about the refund, when one is under way.
  refund: string | null;
  // True ONLY for `verified`. Screens must not say "yours" unless this is set.
  owned: boolean;
}

export function refundLine(status: RefundStatus | null | undefined): string | null {
  switch (status) {
    case "pending":
    case "sending":
    case "processing": return "Your refund is on its way.";
    case "needs-attention": return "To return your money we need a bank account in your name.";
    case "processed": return "Your refund has been paid.";
    case "failed": return "There was a problem with your refund. Our team is on it.";
    default: return null;
  }
}

export function describePurchase(purchase: Purchase): PurchaseState {
  const p = purchase.payment;
  const base = { canPay: false, payLabel: "Pay", payNote: null, refund: refundLine(p?.refundStatus), owned: false };
  const plan = purchase.schedule;
  const flex = purchase.flexible ?? null;

  switch (purchase.status) {
    case "verified":
      if (plan || flex) {
        return { ...base, tone: "success", owned: true, title: "Paid in full — the plot is yours",
          body: "The developer has verified your last payment and the plot is allocated to you. Your allocation letter is in your vault." };
      }
      return { ...base, tone: "success", owned: true, title: "The plot is yours",
        body: "The developer has verified your payment and the plot is allocated to you." };

    // A deposit verified: held on the plan, never "yours", "sold" or "allocated".
    case "on_plan":
      if (flex) {
        return { ...base, tone: "info", canPay: true, payLabel: "Pay an amount", title: `Held for you on ${planInSentence(flex.planName)}`,
          body: "The plot is yours once the plan total is verified. Until then nobody else can buy it." };
      }
      return { ...base, tone: "info", canPay: true, payLabel: "Pay the next instalment",
        title: plan ? `Held for you on the ${plan.planName}` : "Held for you on your plan",
        body: "The plot is yours once your last instalment is verified. Until then nobody else can buy it." };

    case "awaiting_finance":
    case "payment_received":
      if (flex) {
        return { ...base, tone: "info", title: "Payment received — awaiting verification",
          body: "Paystack has confirmed your first payment. Once the developer's finance team verifies it, the plot is held for you on the plan and you'll get a provisional allocation letter." };
      }
      if (plan) {
        return { ...base, tone: "info", title: "Deposit received — awaiting verification",
          body: "Paystack has confirmed your deposit. Once the developer's finance team verifies it, the plot is held for you on your plan and you'll get a provisional allocation letter." };
      }
      return { ...base, tone: "info", title: "Payment received — the developer is verifying it",
        body: "Paystack has confirmed your payment. The developer's finance team checks it before allocating the plot to you. Until then it's held for you, not yet yours." };

    // A plan that ended: refunds come back in parts, one per payment.
    case "withdrawn":
      return { ...base, tone: "neutral", title: "You withdrew from this plan",
        body: "The plot is back on sale. What comes back to you is returned in parts, one per payment, under your offer's terms — see each payment below." };

    case "revoked":
      return { ...base, tone: "neutral", title: "This plan was revoked",
        body: "The developer ended the plan after the notice ran out. You're refunded exactly what withdrawing returns, in parts, one per payment. The plot is back on sale." };

    case "rejected":
      return { ...base, tone: "warning", title: "The developer didn't accept this payment",
        body: "Your money is being returned to you in full. The plot is back on sale." };

    case "abandoned":
      if (p?.underReview && p.reviewKind === "late_payment") {
        return { ...base, tone: "info", title: "We've received your payment",
          body: "It arrived after your reservation ended, so the developer is deciding next steps. You'll get your plot or a full refund." };
      }
      if (p?.underReview && p.reviewKind === "refund_due") {
        return { ...base, tone: "warning", title: "Your payment is being returned",
          body: "It arrived after your reservation ended and the plot couldn't be allocated, so your money is being returned in full." };
      }
      return { ...base, tone: "neutral", title: "This reservation ended before payment arrived",
        body: "Nothing was charged for this purchase. You can reserve the plot again if it's still available." };

    case "pending_payment": {
      // An instalment purchase needs its schedule (one opened before plans
      // existed can't be paid online); milestone isn't offered online.
      const payNote = purchase.plan === "milestone" || (purchase.plan === "installment" && !plan) ? "Online payment isn't available for this payment plan yet."
        : purchase.currency !== "NGN" ? "Online payment is in naira only for now." : null;
      const first = plan ? `Pay deposit ${formatInCurrency(plan.deposit, purchase.currency)}` : "Pay now";
      const payable = payNote === null;
      if (p?.status === "mismatched") {
        return { ...base, tone: "warning", title: "We received a payment we need to review",
          body: "The amount didn't match what was agreed. Our team will contact you." };
      }
      if (p?.status === "succeeded") {
        // Confirmed with Paystack a moment before the purchase moved on.
        return { ...base, tone: "info", title: "Payment received — confirming",
          body: "Paystack has confirmed your payment; this page will update shortly." };
      }
      if (p?.status === "failed") {
        return { ...base, tone: "warning", canPay: payable, payNote, payLabel: "Pay again", title: "Your last payment didn't go through",
          body: "Nothing was taken. You can try again — with the same card, another one, or a bank transfer." };
      }
      if (p?.status === "initialized" || p?.status === "abandoned") {
        return { ...base, tone: "neutral", canPay: payable, payNote, payLabel: "Continue payment", title: "Awaiting payment",
          body: "A payment was started but hasn't been completed. If you paid by bank transfer, it can take a few minutes to show." };
      }
      return { ...base, tone: "neutral", canPay: payable, payNote, payLabel: flex ? "Make your first payment" : first, title: "Awaiting payment",
        body: flex ? "Choose your first payment before your reservation ends. Once it's verified, the plot is held for you on the plan."
          : plan ? "Pay the deposit before your reservation ends. Once it's verified, the plot is held for you on your plan." : "Pay to secure this plot before your reservation ends." };
    }
  }
}

// Money is coming back to the buyer (or has): the purchase page shows the
// refund itself. Needs a payment to look the refund up by.
export function refundExpected(purchase: Purchase): boolean {
  const p = purchase.payment;
  if (!p || (p.amountPaid == null && p.status !== "succeeded")) return false;
  return p.refundStatus != null || p.reviewKind === "refund_due" || purchase.status === "rejected";
}

// ─── Where a purchase stands, in one word ────────────────────────────────────
//
// Still under way (paying, the developer's check, a late payment under
// review, a refund on its way), or null once it's settled one way or the
// other. The dashboard lists the open ones; My purchases files them.
export type PurchaseStage = "pay" | "payment_failed" | "verifying" | "on_plan" | "under_review" | "refund";

export function purchaseStage(p: Purchase): PurchaseStage | null {
  if (p.status === "pending_payment") return p.payment?.status === "failed" ? "payment_failed" : "pay";
  if (p.status === "on_plan") return "on_plan";
  if (p.status === "payment_received" || p.status === "awaiting_finance") return "verifying";
  if (refundExpected(p) && p.payment?.refundStatus !== "processed") return "refund";
  if (p.status === "abandoned" && p.payment?.underReview) return "under_review";
  return null;
}

export type PurchaseGroup = "in_progress" | "allocated" | "ended";

export function purchaseGroup(p: Purchase): PurchaseGroup {
  if (purchaseStage(p)) return "in_progress";
  return p.status === "verified" ? "allocated" : "ended";
}

// The list's badge: describePurchase's title, shortened, plus one line under
// it (the receipt, or what happened to the money).
export function purchaseBadge(p: Purchase): { label: string; tone: PurchaseTone | "error"; note: string | null } {
  const stage = purchaseStage(p);
  const refund = refundLine(p.payment?.refundStatus);
  switch (stage) {
    case "pay": return { label: "Awaiting payment", tone: "warning", note: describePurchase(p).payNote };
    case "payment_failed": return { label: "Payment failed", tone: "error", note: "Nothing was taken. You can try again." };
    case "verifying": return { label: p.schedule ? "Deposit being verified" : p.flexible ? "First payment being verified" : "Being verified", tone: "info", note: p.payment?.receiptNumber ? `Receipt ${p.payment.receiptNumber}` : null };
    case "on_plan": {
      // Where the plan stands today (phase 4–5), as the Figma title chip shows it.
      if (p.flexible) return { label: "On flexible plan", tone: "info", note: p.flexible.planName };
      const st = p.standing;
      if (st?.revocation?.notice) return { label: "Notice of revocation", tone: "warning", note: p.schedule?.planName ?? null };
      if (st?.status === "in_arrears") return { label: "In arrears", tone: "warning", note: p.schedule?.planName ?? null };
      if (st?.status === "overdue") return { label: "Overdue", tone: "warning", note: p.schedule?.planName ?? null };
      if (st?.status === "due_today") return { label: "Due today", tone: "info", note: p.schedule?.planName ?? null };
      return { label: "On instalment plan", tone: "info", note: p.schedule?.planName ?? null };
    }
    case "under_review": return { label: "Under review", tone: "info", note: "Your payment arrived after the reservation ended." };
    case "refund": return { label: p.payment?.refundStatus === "needs-attention" ? "Refund needs your details" : "Refund on its way", tone: "warning", note: refund };
  }
  if (p.status === "withdrawn") return { label: "Withdrawn", tone: "neutral", note: "Refunds come back in parts" };
  if (p.status === "revoked") return { label: "Plan revoked", tone: "neutral", note: "Refunded as on withdrawal" };
  if (p.status === "verified") return { label: p.schedule || p.flexible ? "Paid in full" : "Plot allocated", tone: "success", note: p.payment?.receiptNumber ? `Receipt ${p.payment.receiptNumber}` : null };
  if (p.payment?.refundStatus === "processed") {
    return { label: "Refunded", tone: "neutral", note: p.status === "rejected" ? "The developer didn't accept the payment; refund paid" : "Your refund has been paid" };
  }
  if (p.status === "rejected") return { label: "Not accepted", tone: "warning", note: refund };
  return { label: "Reservation ended", tone: "neutral", note: "Nothing was charged" };
}

// ─── How far it got ──────────────────────────────────────────────────────────
//
// The purchase page's progress: reserved → paid → verified → allocated, or
// where it turned off that road (ended unpaid, not accepted, refunded). Only
// the times the API holds are given; a step with none shows no date.

export type StepState = "done" | "current" | "failed" | "upcoming";

export interface TimelineStep {
  key: string;
  label: string;
  at: string | null;
  note: string | null;
  state: StepState;
}

export function purchaseTimeline(p: Purchase): TimelineStep[] {
  const pay = p.payment;
  const paid = pay?.paidAt != null || pay?.amountPaid != null || ["payment_received", "awaiting_finance", "on_plan", "verified", "withdrawn", "revoked"].includes(p.status);
  const paidNote = pay?.amountPaid != null ? `${formatInCurrency(pay.amountPaid, p.currency)} confirmed by Paystack` : null;
  const steps: TimelineStep[] = [{ key: "reserved", label: "Reserved", at: p.createdAt, note: "Held for you while you pay", state: "done" }];

  if (p.status === "abandoned" && !paid) {
    steps.push({ key: "ended", label: "Reservation ended", at: null, note: "It ended before payment arrived. Nothing was charged.", state: "failed" });
    return steps;
  }
  if (p.status === "pending_payment") {
    const failed = pay?.status === "failed";
    steps.push({ key: "paid", label: failed ? "Payment didn't go through" : "Waiting for your payment", at: null, note: failed ? "Nothing was taken. You can try again." : null, state: failed ? "failed" : "current" });
  } else {
    steps.push({ key: "paid", label: p.status === "abandoned" ? "Paid, after the reservation ended" : "Paid", at: pay?.paidAt ?? null, note: paidNote, state: "done" });
  }

  const refund = refundLine(pay?.refundStatus);
  if (p.status === "rejected") {
    steps.push({ key: "verified", label: "The developer didn't accept the payment", at: null, note: "The plot is back on sale.", state: "failed" });
    steps.push({ key: "refund", label: pay?.refundStatus === "processed" ? "Refunded" : "Refund", at: null, note: refund, state: pay?.refundStatus === "processed" ? "done" : "current" });
    return steps;
  }
  if (p.status === "abandoned") {
    if (pay?.reviewKind === "refund_due" || pay?.refundStatus) {
      steps.push({ key: "refund", label: pay?.refundStatus === "processed" ? "Refunded" : "Refund", at: null, note: refund ?? "Your money is being returned in full.", state: pay?.refundStatus === "processed" ? "done" : "current" });
    } else {
      steps.push({ key: "review", label: "Under review", at: null, note: "The developer is deciding: your plot or a full refund.", state: "current" });
    }
    return steps;
  }

  const verifying = p.status === "payment_received" || p.status === "awaiting_finance";
  // A plan: the deposit's check holds the plot on the plan; only the last
  // instalment (or a pay-off) being verified makes it the buyer's.
  // A flexible plan: the first payment's check holds the plot on the plan; the
  // payment that reaches the plan total, verified, makes it the buyer's.
  if (p.flexible && p.status !== "withdrawn" && p.status !== "revoked") {
    // The purchase carries only its latest payment: once the plan runs, that
    // may be a later one, so the first payment's line names no date or amount.
    const running = p.status === "on_plan" || p.status === "verified";
    steps[1] = p.status === "pending_payment" ? steps[1] : running ? { ...steps[1], label: "First payment made", at: null, note: null } : { ...steps[1], label: "First payment made" };
    const onPlan = p.status === "on_plan" || p.status === "verified";
    steps.push({ key: "verified", label: "First payment verified — held for you on the plan", at: null,
      note: verifying ? "Their finance team is checking the money arrived." : onPlan ? "Your provisional allocation letter is in your vault." : null,
      state: onPlan ? "done" : verifying ? "current" : "upcoming" });
    steps.push({ key: "allocated", label: "Paid in full — the plot is yours", at: null,
      note: p.status === "verified" ? "Your allocation letter is in your vault." : "When the payment that reaches the plan total is verified.",
      state: p.status === "verified" ? "done" : p.status === "on_plan" ? "current" : "upcoming" });
    return steps;
  }
  if (p.schedule && (p.status === "withdrawn" || p.status === "revoked")) {
    steps[1] = { ...steps[1], label: "Deposit paid" };
    steps.push({ key: "verified", label: "Held for you on the plan", at: null, note: null, state: "done" });
    steps.push({ key: "ended", label: p.status === "withdrawn" ? "You withdrew" : "Revoked by the developer", at: (p.status === "withdrawn" ? p.withdrawnAt : p.revokedAt) ?? null,
      note: "Refunded in parts, as on withdrawal.", state: "failed" });
    return steps;
  }
  if (p.schedule) {
    steps[1] = { ...steps[1], label: "Deposit paid", note: pay?.amountPaid != null && verifying ? paidNote : steps[1].note };
    const onPlan = p.status === "on_plan" || p.status === "verified";
    steps.push({ key: "verified", label: "Deposit verified — held for you on the plan", at: null,
      note: verifying ? "Their finance team is checking the money arrived." : onPlan ? "Your provisional allocation letter is in your vault." : null,
      state: onPlan ? "done" : verifying ? "current" : "upcoming" });
    steps.push({ key: "allocated", label: "Paid in full — the plot is yours", at: null,
      note: p.status === "verified" ? "Your allocation letter is in your vault." : "When your last instalment, or a pay-off, is verified.",
      state: p.status === "verified" ? "done" : p.status === "on_plan" ? "current" : "upcoming" });
    return steps;
  }
  steps.push({ key: "verified", label: "Verified by the developer", at: null, note: verifying ? "Their finance team is checking the money arrived." : null, state: p.status === "verified" ? "done" : verifying ? "current" : "upcoming" });
  steps.push({ key: "allocated", label: "Plot allocated", at: null, note: p.status === "verified" ? "The plot is yours." : null, state: p.status === "verified" ? "done" : "upcoming" });
  return steps;
}

// ─── Waiting for a payment to settle ─────────────────────────────────────────
//
// After Paystack, a bank transfer can take minutes. Ask every `intervalMs` up
// to `maxTries` times while the payment is still in flight, then stop — the
// screen offers "check again" rather than polling forever.

export interface PollOptions {
  intervalMs?: number;
  // 24 × 5s ≈ 2 minutes, then "check again".
  maxTries?: number;
  sleep?: (ms: number) => Promise<void>;
  cancelled?: () => boolean;
}

export const IN_FLIGHT: ReadonlySet<string> = new Set(["initialized", "abandoned"]);

export async function pollUntilSettled<T extends { status: string }>(
  check: () => Promise<T>,
  onUpdate: (value: T) => void,
  options: PollOptions = {},
): Promise<"settled" | "gave_up" | "cancelled"> {
  const { intervalMs = 5000, maxTries = 24, sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)), cancelled = () => false } = options;
  for (let i = 0; i < maxTries; i++) {
    if (cancelled()) return "cancelled";
    const value = await check();
    if (cancelled()) return "cancelled";
    onUpdate(value);
    if (!IN_FLIGHT.has(value.status)) return "settled";
    if (i < maxTries - 1) await sleep(intervalMs);
  }
  return "gave_up";
}
