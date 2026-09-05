// The three-stage "Pending verification" view. CRITICAL, resolved spec: the
// buyer just sent money and this screen must read as reassuring progress,
// never as failure or a broken success state. Reused by the marketplace
// checkout flow (a new purchase — final stage "Documents issued") and by
// PlotView.tsx's installment payments (an existing plot — final stage
// "Receipt issued"), so both places show the exact same honest,
// non-optimistic state instead of two slightly different banners.

import { formatAmount } from "../../data/mockData";
import type { Currency } from "../../data/mockData";

// Structurally identical to marketplaceCheckoutService.ts's TransactionStatus
// — kept as its own export here so this component doesn't need to import a
// checkout-specific service to be reused from the portfolio.
export type VerificationStageStatus = "pending_payment" | "payment_received" | "awaiting_finance" | "verified" | "rejected";

interface VerificationProgressProps {
  status: VerificationStageStatus;
  reference: string;
  amountDue: number;
  currency: Currency;
  rejectionReason?: string;
  finalStageLabel?: string;
  finalStageDetail?: string;
}

type StageState = "done" | "active" | "upcoming" | "failed";

function stageStates(status: VerificationStageStatus): [StageState, StageState, StageState] {
  switch (status) {
    case "pending_payment": return ["active", "upcoming", "upcoming"];
    case "payment_received": return ["done", "active", "upcoming"];
    case "awaiting_finance": return ["done", "active", "upcoming"];
    case "verified": return ["done", "done", "done"];
    case "rejected": return ["done", "failed", "upcoming"];
  }
}

const ICONS: Record<StageState, string> = { done: "✓", active: "⏳", upcoming: "○", failed: "✕" };
const COLORS: Record<StageState, string> = {
  done: "text-emerald-700 bg-emerald-100",
  active: "text-amber-700 bg-amber-100",
  upcoming: "text-[var(--muted-foreground)] bg-[var(--muted)]",
  failed: "text-red-700 bg-red-100",
};

export default function VerificationProgress({
  status, reference, amountDue, currency, rejectionReason,
  finalStageLabel = "Documents issued",
  finalStageDetail = "Receipt, allocation letter, deed, and POA draft land in your vault.",
}: VerificationProgressProps) {
  const [s1, s2, s3] = stageStates(status);

  return (
    <div role="status" aria-live="polite">
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-full bg-[var(--secondary)] flex items-center justify-center mx-auto mb-4 text-3xl" aria-hidden="true">
          {status === "rejected" ? "⚠️" : status === "verified" ? "✅" : "🔒"}
        </div>
        <h2 className="font-display text-2xl mb-1">
          {status === "verified" ? "Payment verified" : status === "rejected" ? "We need another look" : "Payment received — verifying"}
        </h2>
        <p className="text-sm text-[var(--muted-foreground)] max-w-sm mx-auto">
          {status === "rejected"
            ? "Our Finance team flagged this payment for review. This is not a lost payment — see the reason below."
            : "Your payment has been received. Our Finance team confirms every payment by hand before it's recorded — this keeps everyone's balance accurate."}
        </p>
      </div>

      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4 mb-6 space-y-2 text-sm">
        <div className="flex justify-between"><span className="text-[var(--muted-foreground)]">Reference</span><span className="font-mono-data">{reference}</span></div>
        <div className="flex justify-between"><span className="text-[var(--muted-foreground)]">Amount</span><span className="font-mono-data font-semibold">{formatAmount(amountDue, currency)}</span></div>
      </div>

      <ol className="space-y-3 mb-6">
        <Stage state={s1} label="Payment received" detail="Confirmed by the payment gateway." />
        <Stage state={s2} label="Awaiting finance confirmation" detail={s2 === "active" ? "Usually confirmed within 1 business day. We'll notify you the moment it's done." : rejectionReason ?? "A Finance Officer manually confirms every payment."} />
        <Stage state={s3} label={finalStageLabel} detail={finalStageDetail} />
      </ol>

      {status === "rejected" && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
          <div className="font-semibold mb-1">What happens next</div>
          Contact support with your reference number above — no funds are lost, and nothing else about your plan changes while this is resolved.
        </div>
      )}
    </div>
  );
}

function Stage({ state, label, detail }: { state: StageState; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${COLORS[state]}`} aria-hidden="true">{ICONS[state]}</span>
      <div>
        <div className={`text-sm font-medium ${state === "upcoming" ? "text-[var(--muted-foreground)]" : "text-[var(--foreground)]"}`}>{label}</div>
        <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{detail}</div>
      </div>
    </li>
  );
}
