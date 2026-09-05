// Renders a fetched InstallmentSchedule (portfolioService.ts) — the full
// schedule, not just the next four periods, with the next payable period
// clearly marked. Replaces PlotView.tsx's old client-side date/amount
// synthesis (looping from nextDueDate and assuming every period equals
// nextDueAmount), which diverges from real varying-amount schedules.

import { formatAmount } from "../../data/mockData";
import type { Currency } from "../../data/mockData";
import type { InstallmentPeriod } from "../../services/portfolioService";

const STATUS_STYLES: Record<InstallmentPeriod["status"], string> = {
  paid: "bg-emerald-50 border-emerald-200",
  pending_verification: "bg-amber-50 border-amber-200",
  due_today: "bg-amber-50 border-amber-200",
  due_soon: "bg-[var(--secondary)] border-[var(--border)]",
  overdue: "bg-red-50 border-red-200",
  upcoming: "bg-[var(--muted)] border-transparent",
};

const STATUS_LABELS: Record<InstallmentPeriod["status"], { text: string; color: string }> = {
  paid: { text: "Paid", color: "text-emerald-700" },
  pending_verification: { text: "Pending verification", color: "text-amber-700" },
  due_today: { text: "Due today", color: "text-amber-700" },
  due_soon: { text: "Due soon", color: "text-[var(--foreground)]" },
  overdue: { text: "Overdue", color: "text-red-700" },
  upcoming: { text: "Upcoming", color: "text-[var(--muted-foreground)]" },
};

interface PaymentScheduleProps {
  periods: InstallmentPeriod[];
  currency: Currency;
  nextPayablePeriodId?: string;
}

export default function PaymentSchedule({ periods, currency, nextPayablePeriodId }: PaymentScheduleProps) {
  return (
    <ol className="space-y-2" aria-label="Installment schedule">
      {periods.map((period) => {
        const isNextPayable = period.id === nextPayablePeriodId;
        const label = STATUS_LABELS[period.status];
        return (
          <li
            key={period.id}
            className={`flex items-center justify-between py-2.5 px-3 rounded-lg border ${STATUS_STYLES[period.status]} ${isNextPayable ? "ring-2 ring-[var(--primary)] ring-offset-1" : ""}`}
          >
            <div>
              <div className="text-sm font-medium flex items-center gap-2">
                Installment {period.sequence}
                {isNextPayable && <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--primary)] bg-[var(--secondary)] px-1.5 py-0.5 rounded">Pay this next</span>}
              </div>
              <div className="text-xs font-mono-data text-[var(--muted-foreground)]">{period.dueDate}</div>
              {period.penaltyAmount ? (
                <div className="text-xs text-red-700 mt-0.5">+{formatAmount(period.penaltyAmount, currency)} penalty{period.penaltyReason ? ` — ${period.penaltyReason}` : ""}</div>
              ) : null}
            </div>
            <div className="text-right">
              <div className="font-mono-data font-semibold text-sm">{formatAmount(period.amount, currency)}</div>
              <span className={`text-xs font-medium ${label.color}`}>{label.text}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
