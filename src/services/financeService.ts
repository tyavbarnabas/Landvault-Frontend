// The developer's Finance area (portal.payments.verify — finance officers and
// Executive Directors): check paid purchases against Paystack's record and
// sell the plot or send the money back; settle payments that arrived after
// the reservation ended; see the company's payouts (read-only).
//
// Verifying is what SELLS the plot. Nothing in this module may happen by
// default or in bulk; every decision is one purchase and one person.

import { apiClient } from "../lib/apiClient";
import { isMock } from "../lib/backends";
import type { PayoutStatus } from "./paymentTypes";
import { mockPlanPaymentsAwaitingFinance, mockVerifyPlanPayment } from "./paymentsService";

// Paystack's record of the payment. `last4` is the last digits of the CARD
// (channel `card`) or of the paying BANK ACCOUNT (channel `bank_transfer`).
export interface GatewayRecord {
  reference: string;
  amountPaid: number;
  currency: string;
  channel: string | null;
  paidAt: string | null;
  last4: string | null;
  gatewayResponse: string | null;
}

// A paid purchase waiting for a person (FinanceQueueItemDto).
export interface FinanceQueueItem {
  transactionId: string;
  transactionReference: string;
  estateId: string;
  estateName: string;
  plotId: string;
  plotLabel: string;
  buyerEmail: string | null;
  expectedAmount: number;
  currency: string;
  awaitingSince: string;
  payment: GatewayRecord | null;
  // False when Paystack's amount differs from the agreed price — or there is
  // no confirmed payment. Verify is never offered then.
  amountsMatch: boolean;
  // The estate's allocation letter is approved, so verifying issues the
  // buyer's letter. False: verify is refused (LETTER_NOT_APPROVED) until the
  // Executive Director approves it.
  letterApproved: boolean;
  // What this payment is (instalment plans, changesets 101–102). A deposit
  // holds the plot on the plan and issues the provisional letter; the last
  // instalment, or a balance, sells it. `expectedAmount` is THIS payment.
  // Absent from older responses: treat as a full-price payment.
  paymentFor?: PaymentFor;
  planName?: string | null;
  instalmentSequence?: number | null;
  instalmentCount?: number | null;
  dueDate?: string | null;
}

export type PaymentFor = "full_price" | "deposit" | "instalment" | "balance";

// Verifying this payment sells the plot: a full-price payment, a plan's last
// instalment, or a balance paid off. Never a deposit.
export function verifySells(item: FinanceQueueItem): boolean {
  const kind = item.paymentFor ?? "full_price";
  if (kind === "full_price" || kind === "balance") return true;
  return kind === "instalment" && item.instalmentSequence != null && item.instalmentSequence === item.instalmentCount;
}

// Money that arrived after the reservation ended (LatePaymentDto).
export interface LatePayment {
  transactionId: string;
  transactionReference: string;
  estateName: string;
  plotLabel: string;
  buyerName: string | null;
  buyerEmail: string | null;
  paymentReference: string;
  agreedPrice: number;
  amountPaid: number;
  currency: string;
  channel: string | null;
  paidAt: string | null;
  // False: someone else has the plot now — refunding is the only option.
  plotAvailable: boolean;
  amountsMatch: boolean;
  // As on the queue: allocating issues the letter, so it needs one approved.
  letterApproved: boolean;
}

// One transfer of a sale's proceeds to the company (PayoutDto). A sale over
// Paystack's ₦10,000,000 single-transfer cap is paid in parts.
export interface Payout {
  id: string;
  transactionId: string;
  tenantId: string;
  // The company's name, from the backend: trading name, else registered name.
  // Null only when none is on record.
  companyName: string | null;
  amount: number;
  currency: string;
  partNumber: number;
  partCount: number;
  status: PayoutStatus;
  reference: string;
  // Paystack's own words — shown verbatim on a failure.
  gatewayMessage: string | null;
  bankName: string | null;
  accountLast4: string | null;
  createdAt: string;
  // Often null: shown only when the backend knows it, never guessed.
  transferredAt: string | null;
  // Set when LandVault is looking into this payout (e.g. a possible double payment).
  reviewReason: string | null;
  // What this payout is for (escrow, changeset 103): the whole sale, the
  // developer's share of one verified plan payment, or the release of what
  // HomeTrue held once the plan completes. Absent on older responses.
  tranche?: Tranche;
  trancheLabel?: string | null;
  sharePaymentId?: string | null;
}

export type Tranche = "sale" | "share" | "release";

// The payout's tranche in words, from the backend's label when it gives one.
export function trancheText(p: { tranche?: Tranche; trancheLabel?: string | null }): string | null {
  if (p.trancheLabel) return p.trancheLabel;
  if (p.tranche === "share") return "Developer's share of a plan payment";
  if (p.tranche === "release") return "Escrow release at plan completion";
  if (p.tranche === "sale") return "Full sale price";
  return null;
}

export interface FinanceDecision {
  transactionId: string;
  // `on_plan`: a deposit or a non-final instalment, verified — the plot is
  // held on the plan, not sold. `verified`: sold.
  status: "verified" | "on_plan" | "rejected" | "refund_due";
  // The buyer's allocation letter, issued in the same step as the sale. Null
  // on a rejection or refund. Finance can't open it (it's the buyer's), so it
  // is shown as a confirmation, never a link.
  allocationLetterId: string | null;
  allocationLetterNumber: string | null;
}

// "card ending 4081" / "account ending 7890" — never call a bank account a card.
export function paidWithLabel(channel: string | null, last4: string | null): string | null {
  if (!last4) return channel ? channelName(channel) : null;
  if (channel === "card") return `card ending ${last4}`;
  if (channel === "bank_transfer" || channel === "bank") return `account ending ${last4}`;
  return `${channel ? `${channelName(channel)} ` : ""}ending ${last4}`;
}

function channelName(channel: string): string {
  return channel === "bank_transfer" ? "bank transfer" : channel.replace(/_/g, " ");
}

export const REASON_MAX = 500;

// ─── Awaiting verification ───────────────────────────────────────────────────

export async function fetchFinanceQueue(): Promise<FinanceQueueItem[]> {
  if (!isMock("finance")) return apiClient.get<FinanceQueueItem[]>("/api/portal/finance/transactions");
  return [...mock.queue.map((q) => ({ ...q })), ...mockPlanQueue()];
}

// Demo mode: plan payments buyers made from their purchase page.
function mockPlanQueue(): FinanceQueueItem[] {
  return mockPlanPaymentsAwaitingFinance().map(({ transaction: t, payment: p, paymentFor, sequence, dueDate }) => ({
    transactionId: t.id, transactionReference: t.reference, estateId: t.listingId, estateName: t.listingName, plotId: t.plotId,
    plotLabel: t.plotLabel, buyerEmail: null, expectedAmount: p.amount, currency: "NGN", awaitingSince: p.paidAt ?? p.createdAt,
    payment: { reference: p.reference, amountPaid: p.amount, currency: "NGN", channel: p.channel, paidAt: p.paidAt, last4: null, gatewayResponse: p.gatewayResponse },
    amountsMatch: true, letterApproved: true, paymentFor, planName: t.schedule?.planName ?? null,
    instalmentSequence: sequence, instalmentCount: t.schedule?.instalments.length ?? null, dueDate,
  }));
}

// Sells the plot to the buyer. One way.
export async function verifyPurchase(transactionId: string): Promise<FinanceDecision> {
  if (!isMock("finance")) return apiClient.post<FinanceDecision>(`/api/portal/finance/transactions/${transactionId}/verify`);
  if (mockPlanQueue().some((q) => q.transactionId === transactionId)) {
    const { status, letter } = await mockVerifyPlanPayment(transactionId);
    return { transactionId, status, allocationLetterId: null, allocationLetterNumber: letter };
  }
  if (mock.queue.find((q) => q.transactionId === transactionId)?.letterApproved === false) {
    throw mockError("LETTER_NOT_APPROVED", "This estate's allocation letter isn't approved. Nothing was changed.");
  }
  const item = takeFromQueue(transactionId);
  if (!item.amountsMatch || !item.payment) throw mockError("PAYMENT_NOT_CONFIRMED", "The payment isn't confirmed for the agreed amount. Nothing was changed.");
  // Demo: no letter is drawn, so none is named. A deposit or a non-final
  // instalment leaves the plan running.
  return { transactionId, status: verifySells(item) ? "verified" : "on_plan", allocationLetterId: null, allocationLetterNumber: null };
}

// The plot goes back on sale and LandVault refunds the buyer in full.
export async function rejectPurchase(transactionId: string, reason: string): Promise<FinanceDecision> {
  if (!isMock("finance")) return apiClient.post<FinanceDecision>(`/api/portal/finance/transactions/${transactionId}/reject`, { reason });
  takeFromQueue(transactionId);
  return { transactionId, status: "rejected", allocationLetterId: null, allocationLetterNumber: null };
}

// ─── Late payments ───────────────────────────────────────────────────────────

export async function fetchLatePayments(): Promise<LatePayment[]> {
  if (!isMock("finance")) return apiClient.get<LatePayment[]>("/api/portal/finance/late-payments");
  return mock.late.map((l) => ({ ...l }));
}

// Only while the plot is still free and the amount matches.
export async function allocateLatePayment(transactionId: string): Promise<FinanceDecision> {
  if (!isMock("finance")) return apiClient.post<FinanceDecision>(`/api/portal/finance/late-payments/${transactionId}/allocate`);
  if (mock.late.find((l) => l.transactionId === transactionId)?.letterApproved === false) {
    throw mockError("LETTER_NOT_APPROVED", "This estate's allocation letter isn't approved. Nothing was changed.");
  }
  const late = takeLate(transactionId);
  if (!late.plotAvailable) throw mockError("PLOT_NO_LONGER_AVAILABLE", "Someone else has this plot now. Nothing was changed.");
  return { transactionId, status: "verified", allocationLetterId: null, allocationLetterNumber: null };
}

// `reason` is shown to the buyer.
export async function refundLatePayment(transactionId: string, reason: string): Promise<FinanceDecision> {
  if (!isMock("finance")) return apiClient.post<FinanceDecision>(`/api/portal/finance/late-payments/${transactionId}/refund`, { reason });
  takeLate(transactionId);
  return { transactionId, status: "refund_due", allocationLetterId: null, allocationLetterNumber: null };
}

// ─── Payouts (read-only) ─────────────────────────────────────────────────────

export async function fetchCompanyPayouts(): Promise<Payout[]> {
  if (!isMock("finance")) return apiClient.get<Payout[]>("/api/portal/payouts");
  return mock.payouts.map((p) => ({ ...p }));
}

// ─── Mock mode ───────────────────────────────────────────────────────────────

function mockError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

function takeFromQueue(id: string): FinanceQueueItem {
  const i = mock.queue.findIndex((q) => q.transactionId === id);
  if (i < 0) throw mockError("TRANSACTION_NOT_AWAITING_FINANCE", "This purchase isn't waiting for verification any more. Nothing was changed.");
  return mock.queue.splice(i, 1)[0];
}

function takeLate(id: string): LatePayment {
  const i = mock.late.findIndex((l) => l.transactionId === id);
  if (i < 0) throw mockError("LATE_PAYMENT_NOT_FOUND", "This late payment has already been settled.");
  return mock.late.splice(i, 1)[0];
}

const mock: { queue: FinanceQueueItem[]; late: LatePayment[]; payouts: Payout[] } = {
  queue: [
    {
      transactionId: "txn-demo-1", transactionReference: "LV-DEMO0001", estateId: "lekki-gardens", estateName: "Lekki Gardens Phase 2",
      plotId: "plot-a14", plotLabel: "Block A, Plot 14", buyerEmail: "emeka@example.com", expectedAmount: 15_000_000, currency: "NGN",
      awaitingSince: "2026-10-08T09:30:00Z",
      payment: { reference: "PAY-DEMO1", amountPaid: 15_000_000, currency: "NGN", channel: "card", paidAt: "2026-10-08T09:29:00Z", last4: "4081", gatewayResponse: "Approved" },
      amountsMatch: true, letterApproved: true,
    },
    {
      transactionId: "txn-demo-2", transactionReference: "LV-DEMO0002", estateId: "lekki-gardens", estateName: "Lekki Gardens Phase 2",
      plotId: "plot-b03", plotLabel: "Block B, Plot 3", buyerEmail: "aisha@example.com", expectedAmount: 12_000_000, currency: "NGN",
      awaitingSince: "2026-10-08T14:10:00Z",
      payment: { reference: "PAY-DEMO2", amountPaid: 11_500_000, currency: "NGN", channel: "bank_transfer", paidAt: "2026-10-08T14:08:00Z", last4: "7890", gatewayResponse: "Successful" },
      amountsMatch: false, letterApproved: true,
    },
    {
      // Paid, matched — but the estate's letter lapsed (its fees changed), so
      // it can't be verified until the director approves the letter again.
      transactionId: "txn-demo-5", transactionReference: "LV-DEMO0005", estateId: "greenfield-park", estateName: "Greenfield Park",
      plotId: "plot-c07", plotLabel: "Block C, Plot 7", buyerEmail: "chinedu@example.com", expectedAmount: 8_500_000, currency: "NGN",
      awaitingSince: "2026-10-09T11:00:00Z",
      payment: { reference: "PAY-DEMO5", amountPaid: 8_500_000, currency: "NGN", channel: "card", paidAt: "2026-10-09T10:58:00Z", last4: "1123", gatewayResponse: "Approved" },
      amountsMatch: true, letterApproved: false,
    },
    {
      // A plan's deposit: verifying holds the plot on the plan, never sells it.
      transactionId: "txn-demo-6", transactionReference: "LV-DEMO0006", estateId: "greenfield-park", estateName: "Greenfield Park",
      plotId: "plot-a03", plotLabel: "Block A, Plot 3", buyerEmail: "ifeoma@example.com", expectedAmount: 1_485_000, currency: "NGN",
      awaitingSince: "2026-10-10T09:15:00Z",
      payment: { reference: "PAY-DEMO6", amountPaid: 1_485_000, currency: "NGN", channel: "card", paidAt: "2026-10-10T09:14:00Z", last4: "5521", gatewayResponse: "Approved" },
      amountsMatch: true, letterApproved: true, paymentFor: "deposit", planName: "12-month plan", instalmentSequence: null, instalmentCount: 12, dueDate: null,
    },
    {
      // The last instalment: verifying sells the plot and issues the letter.
      transactionId: "txn-demo-7", transactionReference: "LV-DEMO0007", estateId: "greenfield-park", estateName: "Greenfield Park",
      plotId: "plot-b11", plotLabel: "Block B, Plot 11", buyerEmail: "segun@example.com", expectedAmount: 288_750, currency: "NGN",
      awaitingSince: "2026-10-11T16:40:00Z",
      payment: { reference: "PAY-DEMO7", amountPaid: 288_750, currency: "NGN", channel: "bank_transfer", paidAt: "2026-10-11T16:38:00Z", last4: "0042", gatewayResponse: "Successful" },
      amountsMatch: true, letterApproved: true, paymentFor: "instalment", planName: "12-month plan", instalmentSequence: 12, instalmentCount: 12, dueDate: "2026-10-12",
    },
  ],
  late: [
    {
      transactionId: "txn-demo-3", transactionReference: "LV-DEMO0003", estateName: "Lekki Gardens Phase 2", plotLabel: "Block C, Plot 9",
      buyerName: "Tunde Bakare", buyerEmail: "tunde@example.com", paymentReference: "PAY-DEMO3", agreedPrice: 9_000_000, amountPaid: 9_000_000,
      currency: "NGN", channel: "bank_transfer", paidAt: "2026-10-07T18:45:00Z", plotAvailable: true, amountsMatch: true, letterApproved: true,
    },
    {
      transactionId: "txn-demo-4", transactionReference: "LV-DEMO0004", estateName: "Lekki Gardens Phase 2", plotLabel: "Block A, Plot 2",
      buyerName: null, buyerEmail: "ngozi@example.com", paymentReference: "PAY-DEMO4", agreedPrice: 15_000_000, amountPaid: 15_000_000,
      currency: "NGN", channel: "card", paidAt: "2026-10-06T11:20:00Z", plotAvailable: false, amountsMatch: true, letterApproved: true,
    },
  ],
  payouts: [
    { id: "po-2", transactionId: "txn-demo-0", tenantId: "estintin-group", companyName: "Estintin Group", amount: 7_500_000, currency: "NGN", partNumber: 2, partCount: 2, status: "pending",
      reference: "PO-DEMO-2", gatewayMessage: null, bankName: "Guaranty Trust Bank", accountLast4: "1234", createdAt: "2026-10-05T10:02:00Z", transferredAt: null, reviewReason: null },
    { id: "po-1", transactionId: "txn-demo-0", tenantId: "estintin-group", companyName: "Estintin Group", amount: 7_500_000, currency: "NGN", partNumber: 1, partCount: 2, status: "success",
      reference: "PO-DEMO-1", gatewayMessage: null, bankName: "Guaranty Trust Bank", accountLast4: "1234", createdAt: "2026-10-05T10:00:00Z", transferredAt: "2026-10-05T10:01:00Z", reviewReason: null },
    { id: "po-3", transactionId: "txn-demo-8", tenantId: "estintin-group", companyName: "Estintin Group", amount: 222_750, currency: "NGN", partNumber: 1, partCount: 1, status: "success",
      reference: "PO-DEMO-3", gatewayMessage: null, bankName: "Guaranty Trust Bank", accountLast4: "1234", createdAt: "2026-10-09T12:00:00Z", transferredAt: "2026-10-09T12:01:00Z", reviewReason: null,
      tranche: "share", trancheLabel: "Developer's share of the deposit", sharePaymentId: "pay-demo-8" },
  ],
};

// A failure that a later payout for the same sale didn't put right.
export function failedPayouts(payouts: Payout[]): Payout[] {
  return payouts.filter((p) => (p.status === "failed" || p.status === "reversed")
    && !payouts.some((q) => q.transactionId === p.transactionId && q.status === "success" && q.createdAt > p.createdAt));
}

export interface SaleGroupData { transactionId: string; parts: Payout[]; amount: number; currency: string; started: string; retried: boolean;
  // What the group pays (a tranche of a plan sale, or the whole sale); null on older payouts.
  label: string | null }

// One sale's payouts together, newest sale first, its parts in order. The
// sale's amount is what is paid or still moving — a failed attempt that was
// retried isn't counted twice.
export function saleGroups(payouts: Payout[]): SaleGroupData[] {
  const by = new Map<string, Payout[]>();
  // A plan sale is paid in tranches; each tranche is its own group.
  const key = (p: Payout) => `${p.transactionId}|${p.tranche ?? "sale"}|${p.sharePaymentId ?? ""}`;
  for (const p of payouts) by.set(key(p), [...(by.get(key(p)) ?? []), p]);
  return [...by].map(([groupKey, list]) => {
    const transactionId = groupKey.split("|")[0];
    const parts = [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const live = parts.filter((p) => !["failed", "reversed", "cancelled"].includes(p.status));
    const amount = live.length ? live.reduce((n, p) => n + p.amount, 0) : Math.max(...parts.map((p) => p.amount));
    return { transactionId, parts, amount, currency: parts[0].currency, started: parts[0].createdAt, retried: live.length > 0 && live.length < parts.length, label: trancheText(parts[0]) };
  }).sort((a, b) => b.parts[b.parts.length - 1].createdAt.localeCompare(a.parts[a.parts.length - 1].createdAt));
}
