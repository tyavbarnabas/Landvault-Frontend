// The post-submission tracker for an upgrade/swap request. Mirrors
// components/resale/ResaleProgress.tsx's visual pattern closely (icon-circle
// stage rows, done/active/upcoming/failed states) and literally reuses
// VerificationProgress for the finance-verification segment rather than
// re-implementing that sub-flow. Tone: factual and reassuring throughout — a
// pending stage is never styled or worded like an error.

import { formatAmount } from "../../data/mockData";
import type { UpgradeRequest } from "../../services/upgradeService";
import VerificationProgress, { type VerificationStageStatus } from "../checkout/VerificationProgress";

type RowState = "done" | "active" | "upcoming" | "failed";

const ICONS: Record<RowState, string> = { done: "✓", active: "⏳", upcoming: "○", failed: "✕" };
const COLORS: Record<RowState, string> = {
  done: "text-emerald-700 bg-emerald-100",
  active: "text-amber-700 bg-amber-100",
  upcoming: "text-[var(--muted-foreground)] bg-[var(--muted)]",
  failed: "text-red-700 bg-red-100",
};

function Row({ state, label, detail }: { state: RowState; label: string; detail?: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${COLORS[state]}`} aria-hidden="true">{ICONS[state]}</span>
      <div>
        <div className={`text-sm font-medium ${state === "upcoming" ? "text-[var(--muted-foreground)]" : "text-[var(--foreground)]"}`}>{label}</div>
        {detail && <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{detail}</div>}
      </div>
    </li>
  );
}

function deltaPaymentRowState(r: UpgradeRequest): RowState {
  if (r.status === "developer_declined") return "upcoming";
  if (r.status === "payment_window_expired") return "failed";
  if (r.quote.delta <= 0) return "done"; // nothing to pay — trivially satisfied
  const reached = ["delta_payment", "finance_verification", "reallocation", "completed"].includes(r.stage) || r.status === "completed";
  if (!reached) return "upcoming";
  return r.stage === "delta_payment" && r.status === "in_progress" ? "active" : "done";
}

function financeVerificationReached(r: UpgradeRequest): boolean {
  return ["finance_verification", "reallocation", "completed"].includes(r.stage) || r.status === "completed" || r.status === "finance_rejected";
}

function verificationStatusFor(r: UpgradeRequest): VerificationStageStatus {
  if (r.status === "finance_rejected") return "rejected";
  if (r.status === "completed" || r.stage === "reallocation") return "verified";
  return "awaiting_finance";
}

// Shown unconditionally at the top — the full signed breakdown, never a bare
// total. See upgradeService.ts's UpgradeQuote: delta is never clamped to zero.
function QuoteBreakdown({ r }: { r: UpgradeRequest }) {
  const { quote } = r;
  return (
    <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4 mb-5 space-y-2 text-sm">
      <div className="flex justify-between"><span className="text-[var(--muted-foreground)]">Reference</span><span className="font-mono-data">{r.reference}</span></div>
      <div className="flex justify-between"><span className="text-[var(--muted-foreground)]">From</span><span className="font-mono-data">{r.fromEstateName} — {r.fromPlotLabel}</span></div>
      <div className="flex justify-between"><span className="text-[var(--muted-foreground)]">To</span><span className="font-mono-data">{r.toEstateName} — {r.toPlotLabel}</span></div>
      <div className="border-t border-[var(--border)] my-1" />
      <div className="flex justify-between"><span className="text-[var(--muted-foreground)]">Current plot price</span><span className="font-mono-data">{formatAmount(quote.currentPlotPrice, quote.currency)}</span></div>
      <div className="flex justify-between"><span className="text-[var(--muted-foreground)]">Your equity paid</span><span className="font-mono-data text-emerald-700">− {formatAmount(quote.equityPaid, quote.currency)}</span></div>
      {quote.outstandingOnCurrent > 0 && (
        <div className="flex justify-between"><span className="text-[var(--muted-foreground)]">Outstanding on current (retired, not carried forward)</span><span className="font-mono-data">{formatAmount(quote.outstandingOnCurrent, quote.currency)}</span></div>
      )}
      <div className="flex justify-between"><span className="text-[var(--muted-foreground)]">New plot base price</span><span className="font-mono-data">{formatAmount(quote.newPlotBasePrice, quote.currency)}</span></div>
      {quote.cornerPremium > 0 && (
        <div className="flex justify-between"><span className="text-[var(--muted-foreground)]">Corner premium</span><span className="font-mono-data">+ {formatAmount(quote.cornerPremium, quote.currency)}</span></div>
      )}
      <div className="flex justify-between"><span className="text-[var(--muted-foreground)]">New plot total price</span><span className="font-mono-data font-medium">{formatAmount(quote.newPlotTotalPrice, quote.currency)}</span></div>
      {quote.adminFee > 0 && (
        <div className="flex justify-between"><span className="text-[var(--muted-foreground)]">Processing fee</span><span className="font-mono-data">+ {formatAmount(quote.adminFee, quote.currency)}</span></div>
      )}
      <div className="border-t border-[var(--border)] pt-2 mt-1 flex justify-between">
        <span className="font-medium text-[var(--foreground)]">{quote.direction === "downgrade" ? "Credit due to you" : "Amount due"}</span>
        <span className={`font-mono-data font-bold text-base ${quote.direction === "downgrade" ? "text-emerald-700" : ""}`}>
          {quote.direction === "downgrade" ? formatAmount(Math.abs(quote.delta), quote.currency) : formatAmount(quote.delta + quote.adminFee, quote.currency)}
        </span>
      </div>
    </div>
  );
}

export default function UpgradeProgress({ request }: { request: UpgradeRequest }) {
  const r = request;
  const devState: RowState = r.status === "developer_declined" ? "failed" : r.stage === "developer_approval" && r.status === "in_progress" ? "active" : "done";
  const paymentState = deltaPaymentRowState(r);
  const financeReached = financeVerificationReached(r);
  const reallocState: RowState = r.status === "completed" || r.stage === "completed" ? "done" : r.stage === "reallocation" ? "active" : "upcoming";
  const completeState: RowState = r.status === "completed" ? "done" : "upcoming";

  const isFailed = r.status === "developer_declined" || r.status === "payment_window_expired" || r.status === "finance_rejected";

  return (
    <div role="status" aria-live="polite">
      <QuoteBreakdown r={r} />

      <ol className="space-y-3">
        <Row state="done" label="Request submitted" detail="Your target plot is held while this request is reviewed — no one else can reserve it in the meantime." />

        <Row
          state={devState}
          label="Awaiting developer approval"
          detail={
            r.status === "developer_declined"
              ? r.developerDeclineReason
              : devState === "active"
                ? "The developer must approve this reallocation before anything else proceeds."
                : "Developer approved the reallocation."
          }
        />

        {paymentState !== "upcoming" && financeReached ? (
          <li>
            <div className="ml-9 mb-1">
              <div className="text-sm font-medium text-[var(--foreground)]">
                {r.quote.delta > 0 ? "Delta payment & finance verification" : r.quote.direction === "downgrade" ? "Credit verification" : "Finance verification"}
              </div>
            </div>
            <div className="ml-9 p-4 bg-[var(--background)] rounded-lg border border-[var(--border)]">
              <VerificationProgress
                status={verificationStatusFor(r)}
                reference={r.reference}
                amountDue={r.quote.delta > 0 ? r.quote.delta + r.quote.adminFee : Math.abs(r.quote.delta)}
                currency={r.quote.currency}
                rejectionReason={r.financeRejectionReason}
                finalStageLabel="Ready for reallocation"
                finalStageDetail="Everything checks out — your plot can now be reallocated."
              />
            </div>
          </li>
        ) : (
          <Row
            state={paymentState}
            label={r.quote.delta > 0 ? "Delta payment" : "Finance verification"}
            detail={
              r.status === "payment_window_expired"
                ? "The delta wasn't paid within the window. Your original plot remains yours, unchanged."
                : paymentState === "active"
                  ? `You have until ${r.paymentDeadline ?? "the payment deadline"} to pay the delta.`
                  : r.quote.delta > 0
                    ? "Pay the delta once the developer approves."
                    : "No payment is due from you — Finance still confirms the reallocation before it executes."
            }
          />
        )}

        <Row
          state={reallocState}
          label="Plot reallocated & documents reissued"
          detail={
            reallocState === "done"
              ? "Your old deed and allocation letter were voided; amended ones were issued for your new plot — both permanently on record."
              : "Ownership, documents, and inventory all move together, as one step."
          }
        />

        <Row
          state={completeState}
          label="Complete"
          detail={
            completeState === "done"
              ? r.creditNoteAmount
                ? `${formatAmount(r.creditNoteAmount, r.quote.currency)} ${r.creditNoteTreatment === "refund_to_source" ? "is being refunded to your original payment method." : "has been issued as a credit note, redeemable against a future payment."}`
                : "Your new plot is now allocated and ready in your portfolio."
              : "Finalizes automatically once reallocation completes."
          }
        />
      </ol>

      {isFailed && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          <div className="font-semibold mb-1">What happens next</div>
          Your original plot returns to normal standing — nothing was lost, and you can request an upgrade again whenever you're ready.
        </div>
      )}
    </div>
  );
}
