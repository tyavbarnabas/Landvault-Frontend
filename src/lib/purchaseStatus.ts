// What a purchase's state means to its buyer — the ONE place that decides, so
// no screen can drift into calling a plot "yours" early.
//
// The rule: only `verified` (the developer's finance checked the payment)
// means the plot is the buyer's. A payment confirmed by Paystack is "received,
// being verified" — never ownership. Late money (`underReview`) is never
// shown as owned either.

import type { Purchase } from "../services/paymentsService";
import type { RefundStatus } from "../services/paymentTypes";

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

  switch (purchase.status) {
    case "verified":
      return { ...base, tone: "success", owned: true, title: "The plot is yours",
        body: "The developer has verified your payment and the plot is allocated to you." };

    case "awaiting_finance":
    case "payment_received":
      return { ...base, tone: "info", title: "Payment received — the developer is verifying it",
        body: "Paystack has confirmed your payment. The developer's finance team checks it before allocating the plot to you. Until then it's held for you, not yet yours." };

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
      const payNote = purchase.plan !== "outright" ? "Online payment is for outright purchases only for now."
        : purchase.currency !== "NGN" ? "Online payment is in naira only for now." : null;
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
      return { ...base, tone: "neutral", canPay: payable, payNote, payLabel: "Pay now", title: "Awaiting payment",
        body: "Pay to secure this plot before your reservation ends." };
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
