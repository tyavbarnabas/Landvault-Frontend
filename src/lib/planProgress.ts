// Where an instalment plan stands, for the purchase page — read off the
// purchase's fixed schedule and the portfolio entry, never worked out.
// Every figure is the backend's: the schedule's amounts and dates, and the
// portfolio's paidAmount / installmentsPaid / nextDueDate / nextDueAmount.
// What this file decides is only WHICH row is which (verified, awaiting
// verification, next, still to come) and what to call each payment.
//
// "Paid" means verified by the developer's finance team. A payment Paystack
// confirmed but finance hasn't checked is "received — awaiting verification".

import type { OwnedPlot, Payment } from "../data/mockData";
import type { PlanSchedule } from "../services/marketplaceCheckoutService";
import type { TransactionStatus } from "../services/marketplaceCheckoutService";
import type { Penalty, PlanStanding } from "../services/planService";

export type RowState = "verified" | "awaiting" | "next" | "upcoming" | "due_today" | "overdue" | "in_arrears";

export interface ScheduleRow {
  key: string;
  label: string;
  // Null for the deposit, which is due on paying.
  dueDate: string | null;
  amount: number;
  state: RowState;
  // From today's standing (phase 4): days late, and the penalty reached — or
  // carried from before a restructure.
  daysLate?: number;
  penalty?: Penalty | null;
}

const isInstalment = (p: Payment) => p.type === "instalment" || p.type === "installment";

// A plan payment Paystack confirmed that finance hasn't verified yet.
export function awaitingVerification(owned: OwnedPlot | null | undefined): boolean {
  return !!owned?.payments.some((p) => p.status === "pending_verification");
}

// How many instalments finance has verified. A verified purchase on a plan
// is paid in full, however it got there (the last instalment or a balance).
export function instalmentsVerified(schedule: PlanSchedule, owned: OwnedPlot | null | undefined, status: TransactionStatus): number {
  if (status === "verified") return schedule.instalments.length;
  return owned?.installmentsPaid ?? 0;
}

export function scheduleRows(schedule: PlanSchedule, owned: OwnedPlot | null | undefined, status: TransactionStatus, standing?: PlanStanding | null): ScheduleRow[] {
  const count = schedule.instalments.length;
  const depositState: RowState = status === "on_plan" || status === "verified" ? "verified"
    : status === "awaiting_finance" || status === "payment_received" ? "awaiting"
      : status === "pending_payment" ? "next" : "upcoming";
  const paid = instalmentsVerified(schedule, owned, status);
  const pending = owned?.payments.find((p) => p.status === "pending_verification" && p.type !== "deposit");
  // A pay-off waiting for finance covers every instalment still owed.
  const balanceWaiting = pending?.type === "balance";
  const rows: ScheduleRow[] = [{ key: "deposit", label: "Deposit", dueDate: null, amount: schedule.deposit, state: depositState }];
  for (const i of schedule.instalments) {
    let state: RowState = "upcoming";
    if (i.sequence <= paid) state = "verified";
    else if (status === "on_plan" && (balanceWaiting || (pending && i.sequence === paid + 1))) state = "awaiting";
    else if (status === "on_plan" && !pending && i.sequence === paid + 1) state = "next";
    rows.push({ key: `i${i.sequence}`, label: `Instalment ${i.sequence} of ${count}`, dueDate: i.dueDate, amount: i.amount, state });
  }
  // A running plan's standing is today's word on every instalment: use it as
  // given (awaiting verification is never late).
  if (standing && status === "on_plan") {
    for (const r of rows) {
      const st = standing.instalments.find((i) => `i${i.sequence}` === r.key);
      if (!st) continue;
      r.state = st.status === "paid" ? "verified" : st.status === "awaiting_verification" ? "awaiting" : st.status === "upcoming" ? r.state === "next" ? "next" : "upcoming" : st.status;
      r.amount = st.amount;
      r.dueDate = st.dueDate;
      r.daysLate = st.daysLate;
      r.penalty = st.penalty;
    }
  }
  return rows;
}

// The next instalment to pay: from the portfolio entry (nextDueDate /
// nextDueAmount after installmentsPaid), matched against the schedule.
export interface NextInstalment {
  sequence: number;
  count: number;
  amount: number;
  dueDate: string | null;
}

export function nextInstalment(schedule: PlanSchedule, owned: OwnedPlot | null | undefined, status: TransactionStatus): NextInstalment | null {
  if (status !== "on_plan") return null;
  const sequence = (owned?.installmentsPaid ?? 0) + 1;
  const scheduled = schedule.instalments.find((i) => i.sequence === sequence);
  if (!scheduled) return null;
  return {
    sequence,
    count: schedule.instalments.length,
    amount: owned?.nextDueAmount ?? scheduled.amount,
    dueDate: owned?.nextDueDate ?? scheduled.dueDate,
  };
}

// The plan's payment history, oldest first, each named for what it paid.
export interface HistoryRow {
  id: string;
  label: string;
  date: string;
  amount: number;
  currency: string;
  verified: boolean;
  receiptId: string | null;
  // A late instalment's penalty, already inside `amount`.
  penaltyAmount: number | null;
}

export function paymentHistory(owned: OwnedPlot | null | undefined, schedule: PlanSchedule): HistoryRow[] {
  if (!owned) return [];
  const count = schedule.instalments.length;
  // Instalments are paid one at a time, in order: the nth instalment payment
  // is instalment n.
  let n = 0;
  return [...owned.payments]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((p) => {
      const label = p.type === "deposit" ? "Deposit"
        : p.type === "balance" ? "Balance paid off"
          : isInstalment(p) ? `Instalment ${++n} of ${count}` : "Payment";
      return { id: p.id, label, date: p.date, amount: p.amount, currency: p.currency, verified: p.status === "confirmed", receiptId: p.receiptId, penaltyAmount: p.penaltyAmount ?? null };
    });
}
