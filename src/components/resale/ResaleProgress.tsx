// The post-acceptance tracker — replaces the old terminal "settlement has
// been initiated" message. Follows VerificationProgress's visual pattern
// (icon-circle stage rows, done/active/upcoming/failed states) and literally
// reuses VerificationProgress itself for the "Finance verification" segment
// (Fix 1, step 5) rather than re-implementing that sub-flow. Tone: factual
// and reassuring throughout — large sums are in flight, and a pending stage
// is never styled or worded like an error.

import { formatAmount } from "../../data/mockData";
import type { ResaleTransfer } from "../../services/resaleService";
import VerificationProgress from "../checkout/VerificationProgress";

type RowState = "done" | "active" | "upcoming" | "failed";

function buyerPaymentRowState(t: ResaleTransfer): RowState {
  if (t.status === "developer_declined") return "upcoming";
  if (t.status === "payment_window_expired") return "failed";
  const reached = ["buyer_kyc", "buyer_payment", "finance_verification", "title_transfer", "settlement"].includes(t.stage) || t.status === "completed";
  if (!reached) return "upcoming";
  const stillHere = t.stage === "buyer_kyc" || t.stage === "buyer_payment";
  return stillHere && t.status === "in_progress" ? "active" : "done";
}

function financeVerificationReached(t: ResaleTransfer): boolean {
  return ["finance_verification", "title_transfer", "settlement"].includes(t.stage) || t.status === "completed" || t.status === "finance_rejected";
}

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

export default function ResaleProgress({ transfer }: { transfer: ResaleTransfer }) {
  const devState: RowState = transfer.status === "developer_declined" ? "failed" : transfer.stage === "developer_approval" && transfer.status === "in_progress" ? "active" : "done";
  const paymentState = buyerPaymentRowState(transfer);
  const financeReached = financeVerificationReached(transfer);
  const titleState: RowState = transfer.status === "completed" || transfer.stage === "settlement" ? "done" : transfer.stage === "title_transfer" ? "active" : "upcoming";
  const settlementState: RowState = transfer.status === "completed" ? "done" : transfer.stage === "settlement" ? "active" : "upcoming";

  const financeStatus = transfer.status === "finance_rejected" ? "rejected" as const
    : transfer.status === "completed" || ["title_transfer", "settlement"].includes(transfer.stage) ? "verified" as const
    : "awaiting_finance" as const;

  return (
    <div role="status" aria-live="polite">
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4 mb-5 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-[var(--muted-foreground)]">Reference</span><span className="font-mono-data">{transfer.reference}</span></div>
        <div className="flex justify-between"><span className="text-[var(--muted-foreground)]">Accepted offer</span><span className="font-mono-data font-semibold">{formatAmount(transfer.amount, transfer.currency)}</span></div>
      </div>

      <ol className="space-y-3">
        <Row state="done" label="Offer accepted" detail={`${transfer.buyerName}'s offer was accepted; every other open offer on this plot was automatically declined.`} />

        <Row
          state={devState}
          label="Awaiting developer approval"
          detail={
            transfer.status === "developer_declined"
              ? transfer.developerDeclineReason
              : devState === "active"
                ? "The developer must consent to this assignment before anything else proceeds — they're issuing the new deed."
                : "Developer consented to the assignment."
          }
        />

        {paymentState !== "upcoming" && financeReached ? (
          <li>
            <div className="ml-9 mb-1">
              <div className="text-sm font-medium text-[var(--foreground)]">Buyer payment &amp; finance verification</div>
              {transfer.buyerKycVerified && (
                <div className="text-xs text-emerald-700 mt-0.5">Buyer identity verified ✓</div>
              )}
            </div>
            <div className="ml-9 p-4 bg-[var(--background)] rounded-lg border border-[var(--border)]">
              {/* Funds are held, never sent directly to the seller — the trust
                  feature this entire flow exists to make explicit. */}
              <p className="text-xs text-[var(--muted-foreground)] mb-3">
                The buyer's payment is held in a developer-controlled account, released only once the title transfer below executes — never sent to you directly.
              </p>
              <VerificationProgress
                status={financeStatus}
                reference={transfer.reference}
                amountDue={transfer.amount}
                currency={transfer.currency}
                rejectionReason={transfer.financeRejectionReason}
                finalStageLabel="Ready for title transfer"
                finalStageDetail="Funds are held and title transfer can now proceed."
              />
            </div>
          </li>
        ) : (
          <Row
            state={paymentState}
            label="Buyer payment"
            detail={
              transfer.status === "payment_window_expired"
                ? "The buyer didn't complete payment within the window. The listing has returned to the market."
                : paymentState === "active"
                  ? transfer.stage === "buyer_kyc"
                    ? "The buyer is completing identity verification — required before their first purchase, same as any buyer on the platform."
                    : `The buyer has until ${transfer.paymentDeadline ?? "the payment deadline"} to pay into the held account.`
                  : "Held funds, released only after title transfer — never sent to you directly."
            }
          />
        )}

        <Row state={titleState} label="Title transferred" detail={titleState === "done" ? "Your deed was voided and a new deed issued to the buyer — both permanently on record." : "Ownership, documents, and the funds release all happen together, as one step."} />

        <Row
          state={settlementState}
          label="Proceeds released"
          detail={
            settlementState === "done"
              ? `${formatAmount(transfer.amount, transfer.currency)} − ${transfer.transferFeePct}% fee${transfer.outstandingDeduction ? ` − ${formatAmount(transfer.outstandingDeduction, transfer.currency)} outstanding balance` : ""} = ${formatAmount(transfer.netProceeds, transfer.currency)} net, now released to your verified account.`
              : "Released to your verified account only after title transfer completes."
          }
        />
      </ol>

      {(transfer.status === "developer_declined" || transfer.status === "payment_window_expired" || transfer.status === "finance_rejected") && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          <div className="font-semibold mb-1">What happens next</div>
          Your plot returns to normal standing — nothing was lost, and you can list it again whenever you're ready.
        </div>
      )}
    </div>
  );
}
