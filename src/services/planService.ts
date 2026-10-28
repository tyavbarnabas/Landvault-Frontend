// Instalment plans, phases 4–5 (backend PRs #24–#28): where a running plan
// stands (arrears and penalties), the buyer withdrawing, the developer
// revoking, and restructuring what's owed.
//
// Nothing here is worked out or stored on the frontend: every status, days
// late, penalty, amount due, refund and share is the latest response's, worked
// out by the backend for today in Lagos. Screens show what the last response
// said and never carry a standing across days.
//
// There's no demo-mode data for any of this (by design): in demo mode the
// lists are empty and the actions say they need the live service.

import { apiClient, ApiError } from "../lib/apiClient";
import { isMock } from "../lib/backends";
import type { FlexibleStanding } from "./paymentPlansService";

// ─── Where a plan stands (TransactionDto.standing) ──────────────────────────

export type PlanStatus = "on_track" | "due_today" | "overdue" | "in_arrears" | "paid_off";
export type InstalmentStatus = "upcoming" | "due_today" | "overdue" | "in_arrears" | "awaiting_verification" | "paid";

// The penalty reached on one instalment. A penalty carried from before a
// restructure reads { monthsLate: 0, penaltyPct: 0, amount } — never a 0%
// penalty (see isCarriedPenalty).
export interface Penalty {
  monthsLate: number;
  penaltyPct: number;
  amount: number;
}

export function isCarriedPenalty(p: Penalty | null | undefined): boolean {
  return !!p && p.monthsLate === 0 && p.penaltyPct === 0 && p.amount > 0;
}

export interface InstalmentStanding {
  sequence: number;
  dueDate: string;
  amount: number;
  status: InstalmentStatus;
  daysLate: number;
  // Already net of any waiver.
  penalty: Penalty | null;
  // How much of this instalment's penalty the developer waived; null when
  // nothing was. Never added back onto `penalty`.
  penaltyWaived?: number | null;
}

// The buyer's line under a waived instalment, or null. A penalty waived in
// full reads as such, not as a ₦0 penalty.
export function waivedLine(penalty: Penalty | null | undefined, penaltyWaived: number | null | undefined, money: (n: number) => string): string | null {
  if (!penaltyWaived || penaltyWaived <= 0) return null;
  return penalty && penalty.amount > 0
    ? `${money(penaltyWaived)} waived by the developer`
    : `Late-payment penalty of ${money(penaltyWaived)} waived by the developer`;
}

// Only while something is late.
export interface Arrears {
  status: string;
  instalmentsLate: number;
  amountOverdue: number;
  penaltyAmount: number;
  totalDue: number;
  overdueSince: string;
  gracePeriodDays: number;
  graceEnds: string;
  daysLate: number;
}

// A notice the developer gave (as the buyer sees it).
export interface StandingNotice {
  reason: string;
  givenAt: string;
  deadline: string;
  instalmentSequence: number;
  // The day after the deadline: when the developer may confirm revoking.
  confirmableFrom?: string | null;
}

export interface StandingRevocation {
  afterMonthsUnpaid: number;
  noticeDays: number;
  // When the plan could be revoked if nothing changes; null while nothing is late.
  revocableFrom: string | null;
  revocableNow: boolean;
  notice: StandingNotice | null;
}

export type RestructureStatus = "requested" | "proposed" | "accepted" | "rejected" | "declined" | "cancelled" | "withdrawn" | "lapsed";

export interface PlanStanding {
  status: PlanStatus;
  instalments: InstalmentStanding[];
  arrears: Arrears | null;
  revocation: StandingRevocation | null;
  // requested / proposed while a restructure is open.
  restructureStatus: RestructureStatus | null;
}

export const PLAN_STATUS_BADGE: Record<PlanStatus, { label: string; tone: "success" | "info" | "warning" | "neutral" }> = {
  on_track: { label: "On track", tone: "success" },
  due_today: { label: "Due today", tone: "info" },
  overdue: { label: "Overdue", tone: "warning" },
  in_arrears: { label: "In arrears", tone: "warning" },
  paid_off: { label: "Paid off", tone: "success" },
};

// ─── Errors ─────────────────────────────────────────────────────────────────

export function planErrorCode(err: unknown): string | undefined {
  return err instanceof ApiError ? err.body?.code : (err as { code?: string } | null)?.code;
}

function notInDemo(): never {
  throw new ApiError(409, "This needs the live service — it isn't part of demo mode.", { code: "NOT_IN_DEMO" });
}

// ─── 5a: the buyer withdraws ────────────────────────────────────────────────

export interface WithdrawalLine {
  reference: string;
  paymentFor: "deposit" | "instalment" | "balance" | string;
  instalmentSequence: number | null;
  amount: number;
  penaltyAmount: number;
  developerKeeps: number;
  refund: number;
  // Paystack confirmed it, finance hasn't verified it: counts the same.
  awaitingFinance: boolean;
  refundStatus: string | null;
}

// A quote while the purchase is on_plan; the settled record once withdrawn
// (or revoked, which refunds exactly as a withdrawal).
export interface Withdrawal {
  transactionId: string;
  status: string;
  withdrawnAt: string | null;
  terms: { deductionPct: number; appliesTo: string; penaltiesRefundable: boolean } | null;
  paid: number;
  refund: number;
  developerKeeps: number;
  currency: string;
  payments: WithdrawalLine[];
}

export async function fetchWithdrawal(transactionId: string): Promise<Withdrawal> {
  if (isMock("checkout")) notInDemo();
  return apiClient.get<Withdrawal>(`/api/transactions/${transactionId}/withdrawal`);
}

// Names the quote's refund: if the figures moved since, 409
// WITHDRAWAL_QUOTE_CHANGED and nothing happens.
export async function withdraw(transactionId: string, refund: number, reason?: string): Promise<Withdrawal> {
  if (isMock("checkout")) notInDemo();
  return apiClient.post<Withdrawal>(`/api/transactions/${transactionId}/withdrawal`, { refund, ...(reason?.trim() ? { reason: reason.trim() } : {}) });
}

// ─── 5c: restructuring ──────────────────────────────────────────────────────

export interface NewInstalment {
  sequence: number;
  dueDate: string;
  amount: number;
  carriedPenalty: number;
}

export interface Proposal {
  proposedAt: string | null;
  expiresOn: string | null;
  paidInstalments: number;
  instalmentCount: number;
  frequency: "monthly" | "quarterly" | string;
  firstDueDate: string;
  balance: number;
  carriedPenalty: number;
  currency: string;
  instalments: NewInstalment[];
  letterId: string | null;
  letterNumber: string | null;
}

export interface Restructure {
  id: string;
  status: RestructureStatus;
  reason: string | null;
  preferredInstalments: number | null;
  requestedAt: string;
  proposal: Proposal | null;
  acceptedAt: string | null;
  closedAt: string | null;
  closeNote: string | null;
}

export interface PlanRestructures {
  transactionId: string;
  transactionReference: string;
  planStatus: string | null;
  open: Restructure | null;
  history: Restructure[];
}

const buyerBase = (id: string) => `/api/transactions/${id}/restructure`;

export async function fetchRestructures(transactionId: string): Promise<PlanRestructures> {
  if (isMock("checkout")) notInDemo();
  return apiClient.get<PlanRestructures>(buyerBase(transactionId));
}

export async function askRestructure(transactionId: string, reason: string, preferredInstalments?: number): Promise<PlanRestructures> {
  if (isMock("checkout")) notInDemo();
  return apiClient.post<PlanRestructures>(buyerBase(transactionId), { reason: reason.trim(), ...(preferredInstalments ? { preferredInstalments } : {}) });
}

export async function cancelRestructure(transactionId: string): Promise<PlanRestructures> {
  if (isMock("checkout")) notInDemo();
  return apiClient.post<PlanRestructures>(`${buyerBase(transactionId)}/cancel`);
}

// Always the id of the proposal on screen.
export async function acceptRestructure(transactionId: string, restructureId: string): Promise<PlanRestructures> {
  if (isMock("checkout")) notInDemo();
  return apiClient.post<PlanRestructures>(`${buyerBase(transactionId)}/accept`, { restructureId });
}

export async function declineRestructure(transactionId: string, restructureId: string): Promise<PlanRestructures> {
  if (isMock("checkout")) notInDemo();
  return apiClient.post<PlanRestructures>(`${buyerBase(transactionId)}/decline`, { restructureId });
}

// ─── Developer portal: running plans (phase 4) ──────────────────────────────

export type RunningPlanFilter = "on_track" | "due_today" | "overdue" | "in_arrears" | "late";

export interface RunningPlan {
  transactionId: string;
  transactionReference: string;
  estateId: string;
  estateName: string;
  plotId: string;
  plotLabel: string;
  buyerEmail: string | null;
  planName: string;
  currency: string;
  instalmentCount: number;
  instalmentsPaid: number;
  nextDueDate: string | null;
  nextDueAmount: number | null;
  status: PlanStatus;
  arrears: Arrears | null;
  revocation: StandingRevocation | null;
  // Every instalment as it stands today, exactly the buyer's standing.instalments.
  instalments?: InstalmentStanding[];
  // The deposit, verified when the plan started.
  deposit?: { amount: number; verifiedAt: string } | null;
}

// Most urgent first.
export async function fetchRunningPlans(status?: RunningPlanFilter): Promise<RunningPlan[]> {
  if (isMock("finance")) return [];
  return apiClient.get<RunningPlan[]>(`/api/portal/finance/plans${status ? `?status=${status}` : ""}`);
}

// One running plan, or null when it isn't running (not started, paid off,
// withdrawn or revoked: the backend's 404 TRANSACTION_NOT_FOUND).
export async function fetchRunningPlan(transactionId: string): Promise<RunningPlan | null> {
  if (isMock("finance")) return null;
  try {
    return await apiClient.get<RunningPlan>(`/api/portal/finance/plans/${encodeURIComponent(transactionId)}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

// A schedule's rows for the developer, with runs of instalments that stand
// the same way (paid, or still to come) folded into one "Instalments 4–12".
export interface ScheduleLine {
  label: string;
  status: InstalmentStatus;
  daysLate: number;
}

export function scheduleLines(instalments: InstalmentStanding[]): ScheduleLine[] {
  const lines: (ScheduleLine & { from: number; to: number })[] = [];
  for (const i of [...instalments].sort((a, b) => a.sequence - b.sequence)) {
    const last = lines[lines.length - 1];
    const folds = i.status === "paid" || i.status === "upcoming";
    if (last && folds && last.status === i.status && last.to === i.sequence - 1) { last.to = i.sequence; continue; }
    lines.push({ label: "", status: i.status, daysLate: i.daysLate, from: i.sequence, to: i.sequence });
  }
  return lines.map(({ from, to, status, daysLate }) => ({
    label: from === to ? `Instalment ${from}` : `Instalments ${from}–${to}`, status, daysLate,
  }));
}

// ─── Developer portal: restructuring (5c) ───────────────────────────────────

export interface RestructureQueueItem {
  restructureId: string;
  transactionId: string;
  transactionReference: string;
  estateName: string;
  plotLabel: string;
  buyerEmail: string | null;
  planName: string;
  status: "requested" | "proposed";
  reason: string | null;
  preferredInstalments: number | null;
  requestedAt: string;
  expiresOn: string | null;
}

export interface ProposalTerms {
  instalmentCount: number;
  frequency: "monthly" | "quarterly";
  firstDueDate: string;
}

const portalBase = (id: string) => `/api/portal/plans/${id}/restructure`;

export async function fetchRestructureQueue(status?: "requested" | "proposed"): Promise<RestructureQueueItem[]> {
  if (isMock("finance")) return [];
  return apiClient.get<RestructureQueueItem[]>(`/api/portal/finance/restructures${status ? `?status=${status}` : ""}`);
}

export async function fetchPlanRestructures(transactionId: string): Promise<PlanRestructures> {
  if (isMock("finance")) notInDemo();
  return apiClient.get<PlanRestructures>(portalBase(transactionId));
}

// The proposal's figures, nothing written.
export async function previewRestructure(transactionId: string, terms: ProposalTerms): Promise<Proposal> {
  if (isMock("finance")) notInDemo();
  return apiClient.post<Proposal>(`${portalBase(transactionId)}/preview`, terms);
}

export async function proposeRestructure(transactionId: string, terms: ProposalTerms): Promise<PlanRestructures> {
  if (isMock("finance")) notInDemo();
  return apiClient.post<PlanRestructures>(`${portalBase(transactionId)}/propose`, terms);
}

export async function rejectRestructure(transactionId: string, reason: string): Promise<PlanRestructures> {
  if (isMock("finance")) notInDemo();
  return apiClient.post<PlanRestructures>(`${portalBase(transactionId)}/reject`, { reason: reason.trim() });
}

export async function withdrawProposal(transactionId: string, note?: string): Promise<PlanRestructures> {
  if (isMock("finance")) notInDemo();
  return apiClient.post<PlanRestructures>(`${portalBase(transactionId)}/withdraw`, note?.trim() ? { note: note.trim() } : {});
}

// ─── Developer portal: waiving a penalty (changeset 109) ────────────────────

// An unpaid instalment carrying a penalty today. `reached` includes a penalty
// carried by a restructure; `outstanding` is the most a new waiver can be.
export interface WaivablePenalty {
  instalmentSequence: number;
  dueDate: string;
  // overdue / in_arrears, or upcoming / due_today for a carried penalty.
  instalmentStatus: string;
  reached: number;
  waived: number;
  outstanding: number;
}

// waivedBy is a user id only: no name comes back, so none is shown.
export interface PenaltyWaiver {
  id: string;
  instalmentSequence: number;
  scheduleVersion: number;
  amount: number;
  reason: string;
  waivedAt: string;
  waivedBy: string;
}

export interface PenaltyWaivers {
  transactionId: string;
  transactionReference: string;
  // Waivers only while on_plan; otherwise the history is read-only.
  planStatus: string;
  currency: string;
  penalties: WaivablePenalty[];
  waivers: PenaltyWaiver[];
}

export interface WaivePenaltyRequest {
  instalmentSequence: number;
  amount: number;
  reason: string;
}

const waiverBase = (id: string) => `/api/portal/plans/${id}/penalty-waivers`;

export async function fetchPenaltyWaivers(transactionId: string): Promise<PenaltyWaivers> {
  if (isMock("finance")) notInDemo();
  return apiClient.get<PenaltyWaivers>(waiverBase(transactionId));
}

// Answers the same shape as GET: redraw from it.
export async function waivePenalty(transactionId: string, req: WaivePenaltyRequest): Promise<PenaltyWaivers> {
  if (isMock("finance")) notInDemo();
  return apiClient.post<PenaltyWaivers>(waiverBase(transactionId), { ...req, reason: req.reason.trim() });
}

export const WAIVER_REASON_MAX = 500;

// The form's own check, as a convenience: the server decides. Reads "28,125",
// "₦28,125" or "28125.50"; at most 2 decimals, above zero, at most what's
// outstanding. Returns the amount or the field errors.
export function checkWaiver(amountText: string, reason: string, outstanding: number):
  { amount: number; errors: null } | { amount: null; errors: { amount?: string; reason?: string } } {
  const errors: { amount?: string; reason?: string } = {};
  const cleaned = amountText.replace(/[₦,\s]/g, "");
  const amount = /^\d+(\.\d{1,2})?$/.test(cleaned) ? Number(cleaned) : NaN;
  if (Number.isNaN(amount)) errors.amount = "Enter an amount, like 28125 or 28125.50.";
  else if (amount <= 0) errors.amount = "Enter an amount above zero.";
  else if (amount > outstanding) errors.amount = "That's more than is still owed on this penalty.";
  if (!reason.trim()) errors.reason = "Give a reason — the buyer is emailed it.";
  else if (reason.trim().length > WAIVER_REASON_MAX) errors.reason = `Keep it to ${WAIVER_REASON_MAX} characters.`;
  return errors.amount || errors.reason ? { amount: null, errors } : { amount, errors: null };
}

// ─── Developer portal: revocation (5b, Executive Director) ──────────────────

export interface RevocationNotice {
  id: string;
  status: "notice" | "cancelled" | "cleared" | "withdrawn" | "revoked";
  reason: string;
  givenAt: string;
  deadline: string;
  confirmableFrom: string;
  instalmentSequence: number | null;
  closedAt: string | null;
  closeNote: string | null;
  // What the notice was for: "arrears" (an instalment plan), or on a flexible
  // plan "inactivity" (nothing paid for a while) or "finish_by" (past its date).
  trigger?: "arrears" | "inactivity" | "finish_by";
}

export interface PlanRevocation {
  transactionId: string;
  transactionReference: string;
  status: string;
  afterMonthsUnpaid: number;
  noticeDays: number;
  revocableFrom: string | null;
  revocableNow: boolean;
  overdueToday: number;
  notice: RevocationNotice | null;
  // What revoking now would return (exactly a withdrawal), or what was settled.
  settlement: { paid: number; refund: number; developerKeeps: number; currency: string } | null;
  history: RevocationNotice[];
  // A flexible plan's standing; null on an instalment plan.
  flexible?: FlexibleStanding | null;
}

// Finance › Flexible plans (changeset 113): every running flexible plan,
// plans the developer may give notice on first.
export interface FlexiblePlanRow {
  transactionId: string;
  transactionReference: string;
  estateId: string;
  estateName: string;
  plotId: string;
  plotLabel: string;
  buyerEmail: string | null;
  planName: string;
  currency: string;
  planTotal: number;
  standing: FlexibleStanding;
}

export async function fetchFlexiblePlans(): Promise<FlexiblePlanRow[]> {
  if (isMock("finance")) return [];
  return apiClient.get<FlexiblePlanRow[]>("/api/portal/finance/flexible-plans");
}

const revBase = (id: string) => `/api/portal/plans/${id}/revocation`;

export async function fetchRevocation(transactionId: string): Promise<PlanRevocation> {
  if (isMock("finance")) notInDemo();
  return apiClient.get<PlanRevocation>(revBase(transactionId));
}

export async function giveNotice(transactionId: string, reason: string): Promise<PlanRevocation> {
  if (isMock("finance")) notInDemo();
  return apiClient.post<PlanRevocation>(revBase(transactionId), { reason: reason.trim() });
}

export async function cancelNotice(transactionId: string, note?: string): Promise<PlanRevocation> {
  if (isMock("finance")) notInDemo();
  return apiClient.post<PlanRevocation>(`${revBase(transactionId)}/cancel`, note?.trim() ? { note: note.trim() } : {});
}

export async function confirmRevocation(transactionId: string): Promise<PlanRevocation> {
  if (isMock("finance")) notInDemo();
  return apiClient.post<PlanRevocation>(`${revBase(transactionId)}/confirm`);
}

// ─── Words for every refusal (show the message, branch on the code) ─────────

export function planErrorMessage(err: unknown, fallback = "That didn't go through. Please try again."): string {
  const code = planErrorCode(err);
  const message = err instanceof Error ? err.message : "";
  switch (code) {
    case "WITHDRAWAL_QUOTE_CHANGED": return "The figures changed since you opened this page — here are today's. Nothing has happened; check them and confirm again.";
    case "PLAN_NOT_WITHDRAWABLE": return "This plan can't be withdrawn from — it isn't running (it may be paid off, or already withdrawn or revoked).";
    case "RESTRUCTURE_ALREADY_OPEN": return "You already have a request open. The developer will reply to that one first.";
    case "PLAN_NOT_RESTRUCTURABLE": return "This plan can't be restructured now — it isn't running.";
    case "RESTRUCTURE_NOT_FOUND": return "This proposal changed — here's the latest.";
    case "RESTRUCTURE_LAPSED": return "This proposal lapsed. You can ask again.";
    case "RESTRUCTURE_OUT_OF_DATE": return "A payment changed what you owe, so this proposal is out of date. The developer can propose again.";
    case "PAYMENT_AWAITING_FINANCE": return "A payment is waiting for the developer's finance team. Try again once it's verified.";
    case "RESTRUCTURE_NOT_OPEN": return "There's no open request to answer any more — reload to see where it stands.";
    case "LETTER_NOT_APPROVED": return "Re-approve the estate's allocation letter first — a restructure letter is drawn from it.";
    case "INVALID_RESTRUCTURE_TERMS": return message || "Those terms aren't allowed: at most 60 instalments in all, and a first date after today and within 3 months.";
    case "REVOCATION_REQUIRES_COMPANY_WIDE_SCOPE": return "Switch to the company-wide view to revoke.";
    case "REVOCATION_TERMS_MISSING": return "This purchase was opened before revocation terms existed, so it can't be revoked.";
    case "REVOCATION_ALREADY_NOTIFIED": return "A notice is already running for this plan.";
    case "PLAN_NOT_REVOCABLE": return "This plan isn't running, so it can't be revoked.";
    case "NO_OPEN_REVOCATION": return "There's no notice running for this plan any more.";
    case "REVOCATION_NOTICE_RUNNING": return "The notice is still running — you can confirm once its deadline has passed.";
    case "REVOCATION_NOT_DUE": return message || "The plan can't be revoked yet.";
    case "WAIVER_TOO_LARGE": return message || "That's more than is still owed on this penalty.";
    case "PENALTY_NOT_WAIVABLE": return message || "This penalty can't be waived now — the instalment was paid or is waiting for your finance check, or the plan isn't running.";
    case "OWN_PURCHASE": return "You can't decide on your own purchase — another finance officer or director must.";
    default: return message || fallback;
  }
}
