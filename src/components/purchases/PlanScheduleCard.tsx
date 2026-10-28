// The plan's fixed schedule and its payment history, from the Figma
// "Instalment plans" proposal: every payment, when it's due and its amount,
// exactly as the purchase's schedule gives them, with where each one stands.
// The history lists what was actually paid, each with its receipt. A penalty
// the developer waived shows under its instalment (Figma "Penalty waivers"),
// and a restructured schedule says when it was restructured.

import { Fragment, useState } from "react";
import type { Document, OwnedPlot } from "../../data/mockData";
import type { Purchase } from "../../services/paymentsService";
import { formatMoney } from "../../lib/formatCurrency";
import { formatDay } from "../../lib/formatDate";
import { paymentHistory, scheduleRows, type RowState, type ScheduleRow } from "../../lib/planProgress";
import { fetchRestructures, isCarriedPenalty, waivedLine } from "../../services/planService";
import { useFetch } from "../../lib/useFetch";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import ReceiptDownload from "../documents/ReceiptDownload";
import { ReceiptIcon } from "../icons";

const STATE_BADGE: Record<RowState, { label: string; variant: "success" | "warning" | "info" | "neutral" } | null> = {
  verified: { label: "Verified", variant: "success" },
  awaiting: { label: "Received — awaiting verification", variant: "info" },
  next: { label: "Next", variant: "info" },
  upcoming: null,
  due_today: { label: "Due today", variant: "info" },
  overdue: { label: "Overdue", variant: "warning" },
  in_arrears: { label: "In arrears", variant: "warning" },
};

function badgeFor(r: ScheduleRow): { label: string; variant: "success" | "warning" | "info" | "neutral" } | null {
  const b = STATE_BADGE[r.state];
  if (b && (r.state === "overdue" || r.state === "in_arrears") && r.daysLate) return { ...b, label: `${b.label} · ${r.daysLate} day${r.daysLate === 1 ? "" : "s"}` };
  return b;
}

// Shown before "Show all": the first few and the last.
const FOLDED = 4;
const UNFOLDABLE = new Set<RowState>(["next", "awaiting", "due_today", "overdue", "in_arrears"]);

export function PlanScheduleCard({ purchase, owned }: { purchase: Purchase; owned: OwnedPlot | null }) {
  const schedule = purchase.schedule!;
  const rows = scheduleRows(schedule, owned, purchase.status, purchase.standing);
  const [all, setAll] = useState(rows.length <= FOLDED + 2);
  // Fold the middle, but never past a row that needs attention: late, due, next or awaiting.
  const lastKeep = Math.max(FOLDED, rows.reduce((last, r, i) => (UNFOLDABLE.has(r.state) ? i : last), -1) + 2);
  const shown = all ? rows : [...rows.slice(0, lastKeep), rows[rows.length - 1]];
  const hidden = rows.length - shown.length;
  const money = (n: number) => formatMoney(n, purchase.currency);
  const version = schedule.version ?? 1;
  // The date comes from the accepted restructure; the schedule only carries its version.
  const restructures = useFetch(() => (version > 1 ? fetchRestructures(purchase.id) : Promise.resolve(null)), [purchase.id, version]);
  const restructuredOn = restructures.data?.history
    .filter((h) => h.status === "accepted" && h.acceptedAt)
    .map((h) => h.acceptedAt!)
    .sort()
    .pop();
  return (
    <Card as="section" aria-labelledby="schedule-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3">
        <h2 id="schedule-heading" className="font-semibold text-[var(--foreground)]">Schedule</h2>
        <span className="text-xs text-[var(--muted-foreground)]">
          {version > 1 ? `Restructured${restructuredOn ? ` on ${formatDay(restructuredOn)}` : ""} · version ${version}` : "Fixed when your offer was issued"}{purchase.standing ? " · statuses as of today" : ""}
        </span>
      </div>
      <table className="w-full text-sm max-sm:hidden">
        <thead>
          <tr className="text-xs text-[var(--muted-foreground)] border-b border-[var(--border)]">
            <th className="text-left font-medium py-2">Payment</th>
            <th className="text-left font-medium py-2">Due</th>
            <th className="text-right font-medium py-2">Amount</th>
            <th className="text-right font-medium py-2"><span className="sr-only">Status</span></th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => {
            const penalty = r.penalty && r.penalty.amount > 0 ? r.penalty : null;
            const waived = waivedLine(r.penalty, r.penaltyWaived, money);
            return (<Fragment key={r.key}>
            <tr className={`${penalty || waived ? "" : "border-b"} border-[var(--border)] last:border-b-0`}>
              <td className="py-2.5 pr-3 text-[var(--foreground)]">
                {r.label}
              </td>
              <td className="py-2.5 pr-3 text-[var(--muted-foreground)]">{r.dueDate ? formatDay(r.dueDate) : "On paying"}</td>
              <td className="py-2.5 text-right font-mono-data text-[var(--foreground)]">{money(r.amount)}</td>
              <td className="py-2.5 pl-3 text-right">{badgeFor(r) && <Badge label={badgeFor(r)!.label} variant={badgeFor(r)!.variant} />}</td>
            </tr>
            {/* The penalty on its own line, as given — never added to the instalment. */}
            {penalty && (
              <tr className={waived ? "" : "border-b border-[var(--border)]"}>
                <td colSpan={2} className={`${waived ? "pb-1" : "pb-2.5"} pr-3 text-xs text-[var(--muted-foreground)]`}>
                  {isCarriedPenalty(penalty) ? "+ penalty carried from before the restructure" : `+ late-payment penalty · ${penalty.penaltyPct}%, ${penalty.monthsLate} month${penalty.monthsLate === 1 ? "" : "s"} late`}
                </td>
                <td className={`${waived ? "pb-1" : "pb-2.5"} text-right font-mono-data text-xs text-[var(--warning-text)]`}>{money(penalty.amount)}</td>
                <td />
              </tr>
            )}
            {/* What the developer waived: the penalty above is already net of it. */}
            {waived && (
              <tr className="border-b border-[var(--border)]">
                <td colSpan={4} className="pb-2.5 pr-3 text-xs text-[var(--muted-foreground)]">{waived}</td>
              </tr>
            )}
            {/* After the row's own penalty lines, so the fold never splits an instalment from its penalty. */}
            {!all && hidden > 0 && i === shown.length - 2 && (
              <tr className="border-b border-[var(--border)]">
                <td colSpan={4} className="py-2"><Button variant="link" onClick={() => setAll(true)} className="text-xs">Show {hidden} more</Button></td>
              </tr>
            )}
          </Fragment>);
          })}
        </tbody>
      </table>
      {/* On a phone each payment stacks (Figma phone frames): label and status, then due date and amount, then its penalty lines. */}
      <ul className="sm:hidden divide-y divide-[var(--border)] border-t border-[var(--border)]" aria-label="Schedule">
        {shown.map((r, i) => {
          const penalty = r.penalty && r.penalty.amount > 0 ? r.penalty : null;
          const waived = waivedLine(r.penalty, r.penaltyWaived, money);
          const b = badgeFor(r);
          return (
            <li key={r.key} className="py-3 space-y-1">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--foreground)]">{r.label}</span>
                {b && <Badge label={b.label} variant={b.variant} />}
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs text-[var(--muted-foreground)]">{r.dueDate ? formatDay(r.dueDate) : "On paying"}</span>
                <span className="font-mono-data text-sm text-[var(--foreground)]">{money(r.amount)}</span>
              </div>
              {penalty && (
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-[var(--muted-foreground)]">{isCarriedPenalty(penalty) ? "+ penalty carried from before the restructure" : `+ late-payment penalty · ${penalty.penaltyPct}%, ${penalty.monthsLate} month${penalty.monthsLate === 1 ? "" : "s"} late`}</span>
                  <span className="font-mono-data text-[var(--warning-text)]">{money(penalty.amount)}</span>
                </div>
              )}
              {waived && <p className="text-xs text-[var(--muted-foreground)]">{waived}</p>}
              {!all && hidden > 0 && i === shown.length - 2 && (
                <Button variant="link" onClick={() => setAll(true)} className="text-xs">Show {hidden} more</Button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between gap-3 pt-3 mt-1 border-t border-[var(--border)]">
        <span className="font-semibold text-sm text-[var(--foreground)]">Plan total</span>
        <span className="font-mono-data font-medium text-[var(--foreground)]">{money(schedule.planTotal)}</span>
      </div>
      <p className="text-xs text-[var(--muted-foreground)] mt-2">
        {schedule.premium > 0 ? `Includes ${money(schedule.premium)} for paying over time. ` : ""}Your offer letter sets out what a late instalment costs.
      </p>
    </Card>
  );
}

export function PlanPaymentsCard({ purchase, owned, documents }: { purchase: Purchase; owned: OwnedPlot | null; documents: Document[] }) {
  const rows = paymentHistory(owned, purchase.schedule!);
  if (rows.length === 0) return null;
  return (
    <Card as="section" aria-labelledby="history-heading">
      <h2 id="history-heading" className="font-semibold text-[var(--foreground)] mb-3">Payment history</h2>
      <ul className="space-y-2.5">
        {rows.map((r) => {
          const receipt = r.receiptId ? documents.find((d) => d.id === r.receiptId && d.type === "receipt") : undefined;
          return (
            <li key={r.id} className="flex flex-wrap items-center gap-3 border border-[var(--border)] rounded-lg px-3 py-2.5">
              <span className="w-8 h-8 shrink-0 rounded-lg bg-[var(--secondary)] text-[var(--secondary-foreground)] flex items-center justify-center"><ReceiptIcon size={16} /></span>
              <div className="flex-1 min-w-40">
                <div className="text-sm font-medium text-[var(--foreground)]">{r.label}</div>
                <div className="text-xs text-[var(--muted-foreground)]">Paid {formatDay(r.date)}{r.penaltyAmount ? ` · includes ${formatMoney(r.penaltyAmount, r.currency)} late-payment penalty` : ""}</div>
              </div>
              <span className="font-mono-data text-sm text-[var(--foreground)]">{formatMoney(r.amount, r.currency)}</span>
              <Badge label={r.verified ? "Verified" : "Received — awaiting verification"} variant={r.verified ? "success" : "warning"} />
              {receipt?.number && <ReceiptDownload receiptId={receipt.id} receiptNumber={receipt.number} />}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
