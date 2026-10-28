// A buyer's purchases and paying for them (Paystack), against the backend's
// payments module — or, in mock mode, a stand-in that walks the same states.
//
// The rule every screen built on this follows: NOTHING is "paid" or "yours"
// until the backend says so. Arriving back from Paystack proves nothing; only
// POST /api/payments/{reference}/verify does, and only a purchase whose status
// is `verified` belongs to the buyer (see lib/purchaseStatus.ts).
//
// Money is naira as the backend sends it (15000000 = ₦15,000,000); nothing
// here does arithmetic on it.

import { apiClient, ApiError, nullIfNotFound } from "../lib/apiClient";
import { isMock } from "../lib/backends";
import { paginateMock, type Page, type PageParams } from "../lib/pagination";
import type { PaymentPlanType } from "./marketplaceService";
import { mockTransactionStore, type OfferSummary, type PlanSchedule, type Transaction, type TransactionStatus } from "./marketplaceCheckoutService";
import type { PurchaseFlexible } from "./paymentPlansService";
import { addDocuments } from "./documentsService";
import { confirmOwnedPayments, fetchOwnedPlotById, recordOwnedPayment, updateOwnedPlotStatus } from "./portfolioService";
import type { PaymentStatus, RefundStatus } from "./paymentTypes";
import type { PurchaseAddress } from "./addressService";
import type { PlanStanding } from "./planService";

// Why a payment is with a person (PaymentSummary.reviewKind):
//   late_payment — paid after the reservation ended; the developer will either
//                  allocate the plot or refund it
//   refund_due   — the money is being returned (the developer rejected the
//                  purchase, or a late payment wasn't allocated)
export type ReviewKind = "late_payment" | "refund_due";

// How a purchase's payment stands — the successful attempt if there is one,
// otherwise the most recent. Null on the purchase until the buyer first pays.
export interface PaymentSummary {
  reference: string;
  status: PaymentStatus;
  amountPaid: number | null;
  paidAt: string | null;
  underReview: boolean;
  reviewKind: ReviewKind | null;
  refundStatus: RefundStatus | null;
  // HomeTrue's receipt, issued when Paystack confirms the payment; null before.
  receiptId: string | null;
  receiptNumber: string | null;
}

// A purchase exactly as the backend returns it (TransactionDto).
export interface Purchase {
  id: string;
  reference: string;
  estateId: string;
  plotId: string;
  reservationId: string;
  basePrice: number;
  cornerPremiumPct: number | null;
  totalPrice: number;
  currency: string;
  intent: "development" | "investment";
  plan: PaymentPlanType;
  installmentMonths: number | null;
  status: TransactionStatus;
  createdAt: string;
  payment: PaymentSummary | null;
  // The address copied on when the purchase was opened; null before 097.
  buyerAddress: PurchaseAddress | null;
  // The developer's offer (changeset 098); null on purchases opened before it.
  offer: OfferSummary | null;
  // An instalment purchase's fixed plan; null for outright.
  schedule: PlanSchedule | null;
  // A flexible purchase's fixed terms (no schedule); absent or null otherwise.
  flexible?: PurchaseFlexible | null;
  // Where a running plan stands today (phase 4), worked out by the backend
  // on every read. Absent before a plan runs and in demo mode.
  standing?: PlanStanding | null;
  withdrawnAt?: string | null;
  revokedAt?: string | null;
}

// One attempt to collect money (PaymentDto).
export interface Payment {
  id: string;
  transactionId: string;
  reference: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  // Paystack's own page, where the buyer picks card or bank transfer.
  authorizationUrl: string;
  createdAt: string;
  // Paystack's own words (e.g. "Insufficient Funds") — shown verbatim.
  gatewayResponse: string | null;
  channel: string | null;
  paidAt: string | null;
  underReview: boolean;
  // A late instalment's penalty, included in `amount` and fixed when Pay was
  // pressed. Shown beside it, never added to anything here.
  penaltyAmount?: number | null;
}

export async function fetchPurchase(id: string): Promise<Purchase | null> {
  if (!isMock("checkout")) {
    const p = await nullIfNotFound(apiClient.get<Purchase>(`/api/checkout/transactions/${id}`));
    return p ? { ...p, schedule: p.schedule ?? null } : null;
  }
  return mockPurchase(id);
}

// The signed-in buyer's purchases, newest first.
export async function fetchMyPurchases(params: PageParams = {}): Promise<Page<Purchase>> {
  if (!isMock("checkout")) {
    const qp = new URLSearchParams();
    if (params.limit) qp.set("limit", String(params.limit));
    if (params.cursor) qp.set("cursor", params.cursor);
    const page = await apiClient.get<{ items: Purchase[]; total: number; cursor: string | null; hasMore: boolean }>(
      `/api/checkout/transactions/mine${qp.size ? `?${qp}` : ""}`);
    return { items: page.items.map((p) => ({ ...p, schedule: p.schedule ?? null })), total: page.total, cursor: page.cursor ?? undefined, hasMore: page.hasMore };
  }
  const all = [...mockTransactionStore().keys()].map(mockPurchase).filter((p): p is Purchase => !!p)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return paginateMock(all, params);
}

// Start (or resume) paying. It charges whatever is due NOW: the price, a
// plan's deposit, its next instalment — or with `balance`, everything still
// owed on the plan in one payment (no discount). On a flexible plan the buyer
// chooses `amount`, the one figure ever sent; the backend checks it
// (INVALID_AMOUNT). The amount charged is the backend's (`amount`). 201 = a new Paystack link; 200 = the one from the last 30
// minutes, handed back — treated the same. Send the browser to
// `authorizationUrl` next.
export async function startPayment(transactionId: string, options: { balance?: boolean; amount?: number } = {}): Promise<Payment> {
  if (!isMock("checkout")) {
    const query = options.balance ? "?balance=true" : options.amount !== undefined ? `?amount=${encodeURIComponent(String(options.amount))}` : "";
    return apiClient.post<Payment>(`/api/transactions/${transactionId}/payments${query}`);
  }

  const txn = mockTransactionStore().get(transactionId);
  if (!txn) throw Object.assign(new Error("No such purchase."), { code: "TRANSACTION_NOT_FOUND" });
  const due = mockDue(txn, !!options.balance);
  const existing = [...mockPayments.values()].find((p) => p.transactionId === transactionId && p.status === "initialized" && p.purpose === due.purpose);
  if (existing) return existing;
  const reference = `PAY-${Date.now().toString(36).toUpperCase()}`;
  // Demo mode has no Paystack: "the gateway" sends the buyer straight back.
  const payment: MockPayment = {
    id: `pay-${Date.now()}`, transactionId, reference, status: "initialized", amount: due.amount, currency: "NGN",
    authorizationUrl: `/payments/return?reference=${reference}&trxref=${reference}`, createdAt: new Date().toISOString(),
    gatewayResponse: null, channel: null, paidAt: null, underReview: false, purpose: due.purpose, sequence: due.sequence,
  };
  mockPayments.set(reference, payment);
  return payment;
}

// Ask the backend what Paystack says about a payment. Safe to repeat. The
// ONLY thing that counts after the buyer comes back.
export async function verifyPayment(reference: string): Promise<Payment> {
  if (!isMock("checkout")) return apiClient.post<Payment>(`/api/payments/${encodeURIComponent(reference)}/verify`);

  const payment = mockPayments.get(reference);
  if (!payment) throw Object.assign(new Error("We couldn't find that payment."), { code: "PAYMENT_NOT_FOUND", status: 404 });
  if (payment.status === "initialized") {
    // Demo mode: the "gateway" approves by card; the developer still has to verify.
    payment.status = "succeeded";
    payment.channel = "card";
    payment.paidAt = new Date().toISOString();
    payment.gatewayResponse = "Approved";
    const txn = mockTransactionStore().get(payment.transactionId);
    if (txn && txn.status === "pending_payment") txn.status = "awaiting_finance";
    // An instalment or a pay-off: on the plan's record, awaiting finance.
    if (txn?.status === "on_plan" && (payment.purpose === "instalment" || payment.purpose === "balance")) {
      const plot = await fetchOwnedPlotById(txn.id);
      if (plot) await recordOwnedPayment(plot.id, { id: payment.reference, date: payment.paidAt.slice(0, 10), amount: payment.amount, currency: "NGN", type: payment.purpose, status: "pending_verification", receiptId: null });
    }
  }
  const { purpose: _purpose, sequence: _sequence, financeVerifiedAt: _at, ...shown } = payment;
  return { ...shown };
}

// ─── Refunds (the buyer's side) ──────────────────────────────────────────────
//
// LandVault returns the FULL amount when the developer rejects a paid purchase
// or a late payment isn't allocated. A card payment goes back on its own; a
// bank-transfer payment can't, so the buyer is asked for an account in their
// own name (`needsAccount`). There's no name field: the bank supplies it.

export interface BuyerRefund {
  status: RefundStatus;
  amount: number;
  currency: string;
  // Waiting for the buyer's bank account (status needs-attention, not yet sent).
  needsAccount: boolean;
  accountBankName: string | null;
  accountLast4: string | null;
  expectedAt: string | null;
  refundedAt: string | null;
}

export interface Bank {
  code: string;
  name: string;
}

// Null when no refund has started yet (404 REFUND_NOT_FOUND) — "being
// arranged". A payment that isn't the buyer's (404 PAYMENT_NOT_FOUND) throws.
export async function fetchRefund(paymentReference: string): Promise<BuyerRefund | null> {
  if (!isMock("checkout")) {
    try {
      return await apiClient.get<BuyerRefund>(`/api/payments/${encodeURIComponent(paymentReference)}/refund`);
    } catch (err) {
      if ((err as { body?: { code?: string } }).body?.code === "REFUND_NOT_FOUND") return null;
      throw err;
    }
  }
  return mockRefunds.get(paymentReference) ?? null;
}

let banksCache: Promise<Bank[]> | null = null;

export function fetchBanks(): Promise<Bank[]> {
  if (!isMock("checkout")) {
    banksCache ??= apiClient.get<Bank[]>("/api/payments/banks").catch((err) => { banksCache = null; throw err; });
    return banksCache;
  }
  return Promise.resolve(MOCK_BANKS);
}

// Tell LandVault where to send a bank-transfer refund. Replaceable until it's sent.
export async function submitRefundAccount(paymentReference: string, account: { bankCode: string; accountNumber: string }): Promise<BuyerRefund> {
  if (!isMock("checkout")) {
    return apiClient.post<BuyerRefund>(`/api/payments/${encodeURIComponent(paymentReference)}/refund-account`, account);
  }
  const refund = mockRefunds.get(paymentReference);
  if (!refund) throw Object.assign(new Error("No refund has started for this payment."), { code: "REFUND_NOT_FOUND" });
  if (refund.status !== "needs-attention") throw Object.assign(new Error("This refund isn't waiting for an account."), { code: "REFUND_NOT_AWAITING_ACCOUNT" });
  const bank = MOCK_BANKS.find((b) => b.code === account.bankCode);
  if (!bank) throw Object.assign(new Error("We don't recognise that bank."), { code: "UNKNOWN_BANK" });
  refund.accountBankName = bank.name;
  refund.accountLast4 = account.accountNumber.slice(-4);
  return { ...refund };
}

// ─── Mock mode ───────────────────────────────────────────────────────────────

const MOCK_BANKS: Bank[] = [
  { code: "044", name: "Access Bank" }, { code: "058", name: "Guaranty Trust Bank" }, { code: "011", name: "First Bank of Nigeria" },
  { code: "033", name: "United Bank For Africa" }, { code: "057", name: "Zenith Bank" },
];
const mockRefunds = new Map<string, BuyerRefund>();

// What a demo payment was for — the backend keeps this to itself (PaymentDto
// has no purpose); the return page reads the purchase instead.
type PaymentPurpose = "full_price" | "deposit" | "instalment" | "balance";
type MockPayment = Payment & { purpose: PaymentPurpose; sequence?: number; financeVerifiedAt?: string };
const mockPayments = new Map<string, MockPayment>();

function refuse(code: string, message: string): never {
  throw new ApiError(409, message, { code });
}

// Which instalments finance has verified so far, by the backend's rules.
function verifiedThrough(txn: Transaction): number {
  const mine = [...mockPayments.values()].filter((p) => p.transactionId === txn.id && p.financeVerifiedAt);
  if (mine.some((p) => p.purpose === "balance")) return txn.schedule?.instalments.length ?? 0;
  return Math.max(0, ...mine.filter((p) => p.purpose === "instalment").map((p) => p.sequence ?? 0));
}

// What Pay charges now, refused as the backend refuses it.
function mockDue(txn: Transaction, balance: boolean): { amount: number; purpose: PaymentPurpose; sequence?: number } {
  const s = txn.schedule;
  if (balance && (txn.status !== "on_plan" || !s)) refuse("NOTHING_TO_PAY_OFF", "There's no active plan on this purchase to pay off.");
  if (txn.status === "on_plan" && s) {
    const waiting = [...mockPayments.values()].some((p) => p.transactionId === txn.id && p.status === "succeeded" && !p.financeVerifiedAt);
    if (waiting) refuse("INSTALMENT_AWAITING_VERIFICATION", "Your last payment is waiting for the developer's finance team to verify it.");
    const left = s.instalments.filter((i) => i.sequence > verifiedThrough(txn));
    if (left.length === 0) refuse("TRANSACTION_NOT_PAYABLE", "This plan is already paid off.");
    // Demo arithmetic standing in for the backend's: what's still owed.
    if (balance) return { amount: Math.round(left.reduce((sum, i) => sum + i.amount, 0) * 100) / 100, purpose: "balance" };
    return { amount: left[0].amount, purpose: "instalment", sequence: left[0].sequence };
  }
  if (txn.status !== "pending_payment") refuse("TRANSACTION_NOT_PAYABLE", "This purchase can't be paid for now.");
  if (txn.offer && !txn.offer.acceptedAt) refuse("OFFER_NOT_ACCEPTED", "Accept the offer letter before paying.");
  return s ? { amount: s.deposit, purpose: "deposit" } : { amount: txn.totalPrice, purpose: "full_price" };
}

// ─── Demo finance, for plan payments made from the purchase page ────────────
//
// The portal's finance queue (financeService) lists these in demo mode, and
// verifying one moves the plan on as the backend does: a deposit holds the
// plot on the plan; the last instalment, or a balance, sells it.

export interface MockPlanQueueItem {
  transaction: Transaction;
  payment: Payment;
  paymentFor: "deposit" | "instalment" | "balance";
  sequence: number | null;
  dueDate: string | null;
}

export function mockPlanPaymentsAwaitingFinance(): MockPlanQueueItem[] {
  return [...mockPayments.values()].flatMap((p) => {
    const txn = mockTransactionStore().get(p.transactionId);
    if (!txn?.schedule || p.status !== "succeeded" || p.financeVerifiedAt || p.purpose === "full_price") return [];
    const due = p.sequence ? txn.schedule.instalments.find((i) => i.sequence === p.sequence) : undefined;
    return [{ transaction: txn, payment: p, paymentFor: p.purpose, sequence: p.sequence ?? null, dueDate: due?.dueDate ?? null }];
  });
}

export async function mockVerifyPlanPayment(transactionId: string): Promise<{ status: "on_plan" | "verified"; letter: string | null }> {
  const txn = mockTransactionStore().get(transactionId);
  const p = [...mockPayments.values()].find((x) => x.transactionId === transactionId && x.status === "succeeded" && !x.financeVerifiedAt);
  if (!txn?.schedule || !p) refuse("TRANSACTION_NOT_AWAITING_FINANCE", "This payment isn't waiting for verification any more.");
  p.financeVerifiedAt = new Date().toISOString();
  const s = txn.schedule;
  const through = verifiedThrough(txn);
  const done = p.purpose === "balance" || through >= s.instalments.length;
  txn.status = done ? "verified" : "on_plan";
  const plot = await fetchOwnedPlotById(txn.id);
  const next = s.instalments.find((i) => i.sequence === through + 1);
  const date = new Date().toISOString().slice(0, 10);
  const doc = { plotId: plot?.id, transactionId: txn.id, date, status: "valid" as const, size: null };
  let letter: string | null = null;
  if (p.purpose === "deposit") {
    letter = `HT-PAL-${new Date().getFullYear()}-${txn.reference.slice(-6)}`;
    await addDocuments([{ ...doc, id: `doc-${txn.id}-pal`, type: "provisional_allocation_letter", number: letter, title: `Provisional allocation letter ${letter} — ${txn.plotLabel}, ${txn.listingName}`, qrCode: `QR-PAL-${txn.id}` }]);
  } else if (done) {
    letter = `HT-ALC-${new Date().getFullYear()}-${txn.reference.slice(-6)}`;
    await addDocuments([{ ...doc, id: `doc-${txn.id}-alc`, type: "allocation_letter", number: letter, title: `Allocation letter ${letter} — ${txn.plotLabel}, ${txn.listingName}`, qrCode: `QR-ALC-${txn.id}` }]);
  }
  if (plot) {
    await confirmOwnedPayments(plot.id);
    await updateOwnedPlotStatus(plot.id, done ? "completed" : "installment_active", {
      paidAmount: plot.paidAmount + p.amount,
      installmentsPaid: through,
      nextDueDate: done ? undefined : next?.dueDate,
      nextDueAmount: done ? undefined : next?.amount,
    });
  }
  return { status: txn.status, letter };
}

function mockPurchase(id: string): Purchase | null {
  const txn = mockTransactionStore().get(id);
  if (!txn) return null;
  const payments = [...mockPayments.values()].filter((p) => p.transactionId === id);
  const shown = payments.find((p) => p.status === "succeeded") ?? payments.at(-1);
  return {
    id: txn.id, reference: txn.reference, estateId: txn.listingId, plotId: txn.plotId, reservationId: txn.reservationId,
    basePrice: txn.basePrice, cornerPremiumPct: txn.cornerPremiumPct ?? null, totalPrice: txn.totalPrice, currency: "NGN",
    intent: txn.intent, plan: txn.plan, installmentMonths: txn.schedule?.instalments.length ?? null, status: txn.status, createdAt: txn.createdAt,
    buyerAddress: txn.buyerAddress ?? null,
    offer: txn.offer ? { ...txn.offer } : null,
    schedule: txn.schedule ?? null,
    payment: shown ? {
      reference: shown.reference, status: shown.status, amountPaid: shown.status === "succeeded" ? shown.amount : null,
      paidAt: shown.paidAt, underReview: false, reviewKind: null, refundStatus: null, receiptId: null, receiptNumber: null,
    } : null,
  };
}
