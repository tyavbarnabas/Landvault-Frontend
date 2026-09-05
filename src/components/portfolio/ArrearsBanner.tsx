// Shown on the portfolio card and plot detail when a plot is in arrears.
// Tone requirement (explicit): a buyer in arrears may be under real
// financial strain — copy is factual, respectful, and solution-oriented,
// never punitive or pressuring. The restructuring action is surfaced at
// least as prominently as the warning, not as an afterthought link.

import { formatAmount } from "../../data/mockData";
import type { ArrearsInfo, Currency } from "../../data/mockData";

interface ArrearsBannerProps {
  arrears: ArrearsInfo;
  currency: Currency;
  restructureStatus?: "none" | "pending" | "approved" | "rejected";
  onRequestRestructure?: () => void;
  requesting?: boolean;
}

function daysOverdue(overdueSinceDate: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const since = new Date(overdueSinceDate); since.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - since.getTime()) / 86_400_000));
}

export default function ArrearsBanner({ arrears, currency, restructureStatus = "none", onRequestRestructure, requesting }: ArrearsBannerProps) {
  const overdue = daysOverdue(arrears.overdueSinceDate);
  const graceActive = new Date() < new Date(arrears.graceEndsDate);

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4" role="status">
      <div className="flex items-start gap-2.5 mb-3">
        <span aria-hidden="true" className="text-lg mt-0.5">⚠️</span>
        <div>
          <div className="text-sm font-semibold text-red-900">Payment overdue</div>
          <p className="text-xs text-red-800 mt-0.5 leading-relaxed">
            {formatAmount(arrears.amountOwed, currency)} has been overdue since {arrears.overdueSinceDate} ({overdue} day{overdue === 1 ? "" : "s"}).
            {arrears.penaltyAmount ? ` A ${formatAmount(arrears.penaltyAmount, currency)} penalty has been applied.` : ""}
          </p>
          {arrears.penaltyReason && <p className="text-xs text-red-700 mt-1">{arrears.penaltyReason}</p>}
        </div>
      </div>

      <div className="text-xs text-red-800 bg-white/60 rounded-lg p-3 mb-3 leading-relaxed">
        <span className="font-medium">What happens next: </span>
        {graceActive
          ? `You're within the ${arrears.gracePeriodDays}-day grace period, which ends ${arrears.graceEndsDate}. Pay before then to avoid further penalties.`
          : "The grace period has passed. Continued non-payment may lead to reclamation under the estate's terms — reach out any time to talk through your options."}
      </div>

      {restructureStatus === "pending" ? (
        <div className="text-xs font-medium text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 inline-block">
          Restructuring request submitted — awaiting a response from the seller.
        </div>
      ) : restructureStatus === "approved" ? (
        <div className="text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2 inline-block">
          Your restructuring request was approved. Updated terms will appear here shortly.
        </div>
      ) : (
        onRequestRestructure && (
          <button
            onClick={onRequestRestructure}
            disabled={requesting}
            className="text-sm font-semibold px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {requesting ? "Submitting…" : "Request restructuring"}
          </button>
        )
      )}
    </div>
  );
}
