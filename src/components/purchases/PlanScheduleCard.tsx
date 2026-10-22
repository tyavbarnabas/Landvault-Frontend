// The plan's fixed schedule and its payment history, from the Figma
// "Instalment plans" proposal: every payment, when it's due and its amount,
// exactly as the purchase's schedule gives them, with where each one stands.
// The history lists what was actually paid, each with its receipt.

import { useState } from "react";
import type { Document, OwnedPlot } from "../../data/mockData";
import type { Purchase } from "../../services/paymentsService";
import { formatMoney } from "../../lib/formatCurrency";
import { formatDay } from "../../lib/formatDate";
import { paymentHistory, scheduleRows, type RowState } from "../../lib/planProgress";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import ReceiptDownload from "../documents/ReceiptDownload";
import { ReceiptIcon } from "../icons";

const STATE_BADGE: Record<RowState, { label: string; variant: "success" | "warning" | "info" | "neutral" } | null> = {
  verified: { label: "Verified", variant: "success" },
  awaiting: { label: "Received — awaiting verification", variant: "warning" },
  next: { label: "Next", variant: "info" },
  upcoming: null,
};

// Shown before "Show all": the first few and the last.
const FOLDED = 4;

export function PlanScheduleCard({ purchase, owned }: { purchase: Purchase; owned: OwnedPlot | null }) {
  const schedule = purchase.schedule!;
  const rows = scheduleRows(schedule, owned, purchase.status);
  const [all, setAll] = useState(rows.length <= FOLDED + 2);
  // Fold the middle, but never past the row that's next or awaiting.
  const lastKeep = Math.max(FOLDED, rows.findIndex((r) => r.state === "next" || r.state === "awaiting") + 2);
  const shown = all ? rows : [...rows.slice(0, lastKeep), rows[rows.length - 1]];
  const hidden = rows.length - shown.length;
  const money = (n: number) => formatMoney(n, purchase.currency);
  return (
    <Card as="section" aria-labelledby="schedule-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3">
        <h2 id="schedule-heading" className="font-semibold text-[var(--foreground)]">Schedule</h2>
        <span className="text-xs text-[var(--muted-foreground)]">Fixed when your offer was issued</span>
      </div>
      <table className="w-full text-sm">
        <thead className="max-sm:sr-only">
          <tr className="text-xs text-[var(--muted-foreground)] border-b border-[var(--border)]">
            <th className="text-left font-medium py-2">Payment</th>
            <th className="text-left font-medium py-2">Due</th>
            <th className="text-right font-medium py-2">Amount</th>
            <th className="text-right font-medium py-2"><span className="sr-only">Status</span></th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={r.key} className="border-b border-[var(--border)] last:border-b-0">
              <td className="py-2.5 pr-3 text-[var(--foreground)]">
                {r.label}
                {!all && hidden > 0 && i === shown.length - 2 && (
                  <div><Button variant="link" onClick={() => setAll(true)} className="text-xs mt-1">Show {hidden} more</Button></div>
                )}
              </td>
              <td className="py-2.5 pr-3 text-[var(--muted-foreground)]">{r.dueDate ? formatDay(r.dueDate) : "On paying"}</td>
              <td className="py-2.5 text-right font-mono-data text-[var(--foreground)]">{money(r.amount)}</td>
              <td className="py-2.5 pl-3 text-right">{STATE_BADGE[r.state] && <Badge label={STATE_BADGE[r.state]!.label} variant={STATE_BADGE[r.state]!.variant} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
                <div className="text-xs text-[var(--muted-foreground)]">Paid {formatDay(r.date)}</div>
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
