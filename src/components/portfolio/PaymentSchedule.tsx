// Renders a fetched InstallmentSchedule (portfolioService.ts) — the full
// schedule, not just the next four periods, with the next payable period
// clearly marked. Replaces PlotView.tsx's old client-side date/amount
// synthesis (looping from nextDueDate and assuming every period equals
// nextDueAmount), which diverges from real varying-amount schedules.
// Colours are the status tones (Figma "Penalty waivers" → plot page schedule):
// late is a calm warning, never red, and the penalty sits in muted text.

import { formatAmount } from "../../data/mockData";
import type { Currency } from "../../data/mockData";
import type { InstallmentPeriod } from "../../services/portfolioService";
import { formatDay } from "../../lib/formatDate";
import Badge from "../ui/Badge";
import { TONE_SURFACE, type Tone } from "../ui/tones";

const STATUS: Record<InstallmentPeriod["status"], { label: string; tone: Tone }> = {
  paid: { label: "Paid", tone: "success" },
  pending_verification: { label: "Received — awaiting verification", tone: "info" },
  due_today: { label: "Due today", tone: "info" },
  due_soon: { label: "Due soon", tone: "neutral" },
  overdue: { label: "Overdue", tone: "warning" },
  upcoming: { label: "Upcoming", tone: "neutral" },
};

interface PaymentScheduleProps {
  periods: InstallmentPeriod[];
  currency: Currency;
  nextPayablePeriodId?: string;
}

export default function PaymentSchedule({ periods, currency, nextPayablePeriodId }: PaymentScheduleProps) {
  return (
    <ol className="space-y-2" aria-label="Instalment schedule">
      {periods.map((period) => {
        const isNextPayable = period.id === nextPayablePeriodId;
        const status = STATUS[period.status];
        return (
          <li
            key={period.id}
            className={`flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg border ${TONE_SURFACE[status.tone]} ${isNextPayable ? "ring-2 ring-[var(--primary)] ring-offset-1" : ""}`}
          >
            <div className="min-w-0">
              <div className="text-sm font-medium text-[var(--foreground)] flex items-center gap-2">
                Instalment {period.sequence}
                {isNextPayable && <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--primary)] bg-[var(--card)] px-1.5 py-0.5 rounded">Pay this next</span>}
              </div>
              <div className="text-xs text-[var(--muted-foreground)]">Due {formatDay(period.dueDate)}</div>
              {period.penaltyAmount ? (
                <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  + late-payment penalty <span className="font-mono-data text-[var(--warning-text)]">{formatAmount(period.penaltyAmount, currency)}</span>
                  {period.penaltyReason && <div>{period.penaltyReason}</div>}
                </div>
              ) : null}
            </div>
            <div className="text-right space-y-1 shrink-0">
              <div className="font-mono-data font-semibold text-sm text-[var(--foreground)]">{formatAmount(period.amount, currency)}</div>
              <Badge label={status.label} variant={status.tone} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
