// Super Admin payouts (admin.payouts.manage, and the admin's OWN two-factor):
// sending a verified sale's proceeds to the developer's approved account.
//
// Paystack caps one transfer at ₦10,000,000, so a bigger sale is paid in equal
// parts, each its own payout with its own code. The backend decides every
// amount and the account — the admin never types either; they only choose
// which sale to pay next and enter Paystack's code.

import { apiClient } from "../lib/apiClient";
import { isMock } from "../lib/backends";
import type { Payout } from "./financeService";
import type { PayoutBlocker, PayoutStatus, RefundStatus } from "./paymentTypes";

// A verified sale that's owed money (ReadyPayoutDto). Sales with a payout in
// flight (sending / awaiting_otp / pending) are left off this list.
export interface ReadyPayout {
  transactionId: string;
  transactionReference: string;
  tenantId: string;
  companyName: string | null;
  estateName: string;
  plotLabel: string;
  amount: number;
  currency: string;
  // These five are null only for a sale that isn't in naira.
  amountOwed: number | null;
  partCount: number | null;
  partsPaid: number | null;
  nextPart: number | null;
  nextPartAmount: number | null;
  verifiedAt: string;
  payoutAccount: { bankName: string; accountLast4: string; accountName: string } | null;
  // Non-empty: Pay out is not possible yet.
  blockers: PayoutBlocker[];
  // The most recent attempt, of any status.
  lastAttempt: Payout | null;
}

export type PayoutFilter = "all" | PayoutStatus;

export async function fetchReadyPayouts(): Promise<ReadyPayout[]> {
  if (!isMock("adminPayouts")) return apiClient.get<ReadyPayout[]>("/api/admin/payouts/ready");
  return mock.ready.filter((r) => !inFlight(r.transactionId)).map((r) => ({ ...r, lastAttempt: lastAttempt(r.transactionId) }));
}

export async function fetchPayoutHistory(status: PayoutFilter = "all"): Promise<Payout[]> {
  if (!isMock("adminPayouts")) return apiClient.get<Payout[]>(`/api/admin/payouts?status=${status}`);
  return mock.payouts.filter((p) => status === "all" || p.status === status).map((p) => ({ ...p }));
}

// Sends the NEXT part of a sale. Usually comes back `awaiting_otp`: Paystack
// texts or emails a code to the Paystack account owner.
export async function sendPayout(transactionId: string): Promise<Payout> {
  if (!isMock("adminPayouts")) return apiClient.post<Payout>("/api/admin/payouts", { transactionId });
  const sale = mock.ready.find((r) => r.transactionId === transactionId);
  if (!sale || sale.nextPart === null || sale.nextPartAmount === null) throw mockError("SALE_NOT_PAYABLE", "This sale isn't waiting for a payout.");
  if (inFlight(transactionId)) throw mockError("PAYOUT_IN_PROGRESS", "A payout for this sale is already in progress.");
  if (sale.blockers.length) throw mockError(sale.blockers[0], "This sale can't be paid out yet.");
  const payout: Payout = {
    id: `po-${Date.now()}`, transactionId, tenantId: sale.tenantId, companyName: sale.companyName, amount: sale.nextPartAmount, currency: sale.currency,
    partNumber: sale.nextPart, partCount: sale.partCount ?? 1, status: "awaiting_otp", reference: `PO-${Date.now().toString(36).toUpperCase()}`,
    gatewayMessage: null, bankName: sale.payoutAccount?.bankName ?? null, accountLast4: sale.payoutAccount?.accountLast4 ?? null,
    createdAt: new Date().toISOString(), transferredAt: null, reviewReason: null,
  };
  mock.payouts.unshift(payout);
  return { ...payout };
}

// Digits only (4–8). A wrong code is 400 OTP_REJECTED; try again.
export async function submitPayoutOtp(payoutId: string, otp: string): Promise<Payout> {
  if (!isMock("adminPayouts")) return apiClient.post<Payout>(`/api/admin/payouts/${payoutId}/otp`, { otp });
  const payout = awaitingOtp(payoutId);
  if (otp !== "123456") throw mockError("OTP_REJECTED", "Paystack didn't accept that code. Check it and try again.");
  payout.status = "success";
  payout.transferredAt = new Date().toISOString();
  const sale = mock.ready.find((r) => r.transactionId === payout.transactionId);
  if (sale && sale.partsPaid !== null && sale.partCount !== null && sale.amountOwed !== null && sale.nextPartAmount !== null) {
    sale.partsPaid += 1;
    sale.amountOwed -= sale.nextPartAmount;
    if (sale.partsPaid >= sale.partCount) mock.ready = mock.ready.filter((r) => r !== sale);
    else sale.nextPart = sale.partsPaid + 1;
  }
  return { ...payout };
}

export async function resendPayoutOtp(payoutId: string): Promise<Payout> {
  if (!isMock("adminPayouts")) return apiClient.post<Payout>(`/api/admin/payouts/${payoutId}/resend-otp`);
  return { ...awaitingOtp(payoutId) };
}

// Nothing is sent; the sale is owed again and goes back to the ready list.
export async function cancelPayout(payoutId: string): Promise<Payout> {
  if (!isMock("adminPayouts")) return apiClient.post<Payout>(`/api/admin/payouts/${payoutId}/cancel`);
  const payout = awaitingOtp(payoutId);
  payout.status = "cancelled";
  return { ...payout };
}

// ─── Refunds (Super Admin) ───────────────────────────────────────────────────
//
// Always the FULL amount, to the payment's own source: a card payment goes
// back to the card; a bank-transfer payment needs the buyer's account
// (`needs-attention`), which the admin sends once the buyer has given it.
// Starting a refund and sending it to an account need the admin's two-factor.

// A payment owed back to its buyer (RefundDueDto).
export interface RefundDue {
  paymentId: string;
  paymentReference: string;
  transactionId: string;
  buyerName: string | null;
  buyerEmail: string | null;
  amount: number;
  currency: string;
  channel: string | null;
  last4: string | null;
  paidAt: string | null;
  // Why it's owed, e.g. "Refund due: finance rejected this payment — …".
  reason: string | null;
  requestedAt: string;
  lastAttempt: AdminRefund | null;
}

// RefundDto.
export interface AdminRefund {
  id: string;
  paymentId: string;
  paymentReference: string | null;
  transactionId: string;
  buyerName: string | null;
  buyerEmail: string | null;
  amount: number;
  currency: string;
  status: RefundStatus;
  // Paystack's own words.
  gatewayMessage: string | null;
  reason: string | null;
  createdAt: string;
  expectedAt: string | null;
  refundedAt: string | null;
  // The buyer's account for a bank-transfer refund; the NAME is the bank's.
  account: { bankName: string; accountNumber: string; accountName: string; submittedAt: string; sentAt: string | null } | null;
  // Null until an account is given. False is a warning, not a block.
  accountNameMatchesBuyer: boolean | null;
}

export type RefundFilter = "all" | RefundStatus;

// Where a started refund stands, for the Refunds screen and the dashboard.
// A bank-transfer refund waits for the buyer's account; once they give one,
// it waits on HomeTrue to check the name and send it.
export type RefundStage = "ready_to_send" | "waiting_on_buyer" | "in_progress" | "refunded" | "failed";

export function refundStage(r: AdminRefund): RefundStage {
  if (r.status === "processed") return "refunded";
  if (r.status === "failed") return "failed";
  if (r.status === "needs-attention") return !r.account ? "waiting_on_buyer" : r.account.sentAt ? "in_progress" : "ready_to_send";
  return "in_progress";
}

export async function fetchRefundsDue(): Promise<RefundDue[]> {
  if (!isMock("adminPayouts")) return apiClient.get<RefundDue[]>("/api/admin/refunds/due");
  return mock.due.map((d) => ({ ...d, lastAttempt: mock.refunds.find((r) => r.paymentId === d.paymentId) ?? null }));
}

export async function fetchRefunds(status: RefundFilter = "all"): Promise<AdminRefund[]> {
  if (!isMock("adminPayouts")) return apiClient.get<AdminRefund[]>(`/api/admin/refunds?status=${encodeURIComponent(status)}`);
  return mock.refunds.filter((r) => status === "all" || r.status === status).map((r) => ({ ...r }));
}

// Always the full amount. Never an amount typed by anyone.
export async function startRefund(paymentReference: string): Promise<AdminRefund> {
  if (!isMock("adminPayouts")) return apiClient.post<AdminRefund>("/api/admin/refunds", { paymentReference });
  const due = mock.due.find((d) => d.paymentReference === paymentReference);
  if (!due) throw mockError("REFUND_NOT_DUE", "No refund is due for this payment.");
  mock.due = mock.due.filter((d) => d !== due);
  const refund: AdminRefund = {
    id: `rf-${Date.now()}`, paymentId: due.paymentId, paymentReference, transactionId: due.transactionId, buyerName: due.buyerName,
    buyerEmail: due.buyerEmail, amount: due.amount, currency: due.currency,
    // A card goes straight back; a bank transfer needs the buyer's account.
    status: due.channel === "card" ? "processing" : "needs-attention",
    gatewayMessage: null, reason: due.reason, createdAt: new Date().toISOString(),
    expectedAt: due.channel === "card" ? new Date(Date.now() + 5 * 864e5).toISOString() : null, refundedAt: null,
    account: null, accountNameMatchesBuyer: null,
  };
  mock.refunds.unshift(refund);
  return { ...refund };
}

// A needs-attention refund, once the buyer has given an account.
export async function sendRefundToAccount(refundId: string): Promise<AdminRefund> {
  if (!isMock("adminPayouts")) return apiClient.post<AdminRefund>(`/api/admin/refunds/${refundId}/send-to-account`);
  const refund = mock.refunds.find((r) => r.id === refundId);
  if (!refund) throw mockError("REFUND_NOT_FOUND", "We couldn't find that refund.");
  if (refund.status !== "needs-attention") throw mockError("REFUND_NOT_AWAITING_ACCOUNT", "This refund isn't waiting to be sent to an account.");
  if (!refund.account) throw mockError("REFUND_ACCOUNT_MISSING", "The buyer hasn't given an account yet.");
  refund.status = "processing";
  refund.account.sentAt = new Date().toISOString();
  return { ...refund };
}

// ─── Mock mode ───────────────────────────────────────────────────────────────

function mockError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

function inFlight(transactionId: string): boolean {
  return mock.payouts.some((p) => p.transactionId === transactionId && ["sending", "awaiting_otp", "pending"].includes(p.status));
}

function lastAttempt(transactionId: string): Payout | null {
  return mock.payouts.find((p) => p.transactionId === transactionId) ?? null;
}

function awaitingOtp(id: string): Payout {
  const payout = mock.payouts.find((p) => p.id === id);
  if (!payout) throw mockError("PAYOUT_NOT_FOUND", "We couldn't find that payout.");
  if (payout.status !== "awaiting_otp") throw mockError("PAYOUT_NOT_AWAITING_OTP", "This payout isn't waiting for a code any more.");
  return payout;
}

const GTB = { bankName: "Guaranty Trust Bank", accountLast4: "1234", accountName: "ESTINTIN GROUP LIMITED" };

const mock: { ready: ReadyPayout[]; payouts: Payout[]; due: RefundDue[]; refunds: AdminRefund[] } = {
  due: [
    { paymentId: "pm-1", paymentReference: "PAY-DEMO2", transactionId: "txn-demo-2", buyerName: "Aisha Bello", buyerEmail: "aisha@example.com",
      amount: 11_500_000, currency: "NGN", channel: "bank_transfer", last4: "7890", paidAt: "2026-10-08T14:08:00Z",
      reason: "Refund due: finance rejected this payment — amount paid doesn't match the agreed price", requestedAt: "2026-10-08T15:00:00Z", lastAttempt: null },
    { paymentId: "pm-2", paymentReference: "PAY-DEMO4", transactionId: "txn-demo-4", buyerName: null, buyerEmail: "ngozi@example.com",
      amount: 15_000_000, currency: "NGN", channel: "card", last4: "4081", paidAt: "2026-10-06T11:20:00Z",
      reason: "Late payment refunded: the plot was sold to another buyer", requestedAt: "2026-10-07T09:00:00Z", lastAttempt: null },
  ],
  refunds: [
    { id: "rf-old", paymentId: "pm-0", paymentReference: "PAY-DEMO0", transactionId: "txn-demo-0", buyerName: "Tunde Bakare", buyerEmail: "tunde@example.com",
      amount: 9_000_000, currency: "NGN", status: "needs-attention", gatewayMessage: null, reason: "Late payment refunded",
      createdAt: "2026-10-05T10:00:00Z", expectedAt: null, refundedAt: null,
      account: { bankName: "Zenith Bank", accountNumber: "2012345678", accountName: "BAKARE ADETUNDE", submittedAt: "2026-10-06T08:00:00Z", sentAt: null },
      accountNameMatchesBuyer: false },
  ],
  ready: [
    { transactionId: "txn-demo-10", transactionReference: "LV-DEMO0010", tenantId: "estintin-group", companyName: "Estintin Group",
      estateName: "Lekki Gardens Phase 2", plotLabel: "Block A, Plot 14", amount: 15_000_000, currency: "NGN",
      amountOwed: 15_000_000, partCount: 2, partsPaid: 0, nextPart: 1, nextPartAmount: 7_500_000, verifiedAt: "2026-10-08T10:00:00Z",
      payoutAccount: GTB, blockers: [], lastAttempt: null },
    { transactionId: "txn-demo-11", transactionReference: "LV-DEMO0011", tenantId: "northbridge-estates", companyName: "Northbridge Estates",
      estateName: "Northbridge Court", plotLabel: "Block C, Plot 2", amount: 6_000_000, currency: "NGN",
      amountOwed: 6_000_000, partCount: 1, partsPaid: 0, nextPart: 1, nextPartAmount: 6_000_000, verifiedAt: "2026-10-07T16:00:00Z",
      payoutAccount: null, blockers: ["NO_APPROVED_PAYOUT_ACCOUNT"], lastAttempt: null },
  ],
  payouts: [
    { id: "po-old-1", transactionId: "txn-demo-9", tenantId: "estintin-group", companyName: "Estintin Group", amount: 4_000_000, currency: "NGN", partNumber: 1, partCount: 1,
      status: "failed", reference: "PO-DEMO-9", gatewayMessage: "Your balance is not enough to fulfil this request", bankName: "Guaranty Trust Bank",
      accountLast4: "1234", createdAt: "2026-10-06T09:00:00Z", transferredAt: null, reviewReason: null },
  ],
};
