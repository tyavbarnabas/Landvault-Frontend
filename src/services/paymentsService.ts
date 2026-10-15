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

import { apiClient, nullIfNotFound } from "../lib/apiClient";
import { isMock } from "../lib/backends";
import { paginateMock, type Page, type PageParams } from "../lib/pagination";
import type { PaymentPlanType } from "./marketplaceService";
import { mockTransactionStore, type TransactionStatus } from "./marketplaceCheckoutService";
import type { PaymentStatus, RefundStatus } from "./paymentTypes";

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
}

export async function fetchPurchase(id: string): Promise<Purchase | null> {
  if (!isMock("checkout")) return nullIfNotFound(apiClient.get<Purchase>(`/api/checkout/transactions/${id}`));
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
    return { items: page.items, total: page.total, cursor: page.cursor ?? undefined, hasMore: page.hasMore };
  }
  const all = [...mockTransactionStore().keys()].map(mockPurchase).filter((p): p is Purchase => !!p)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return paginateMock(all, params);
}

// Start (or resume) paying. 201 = a new Paystack link; 200 = the one from the
// last 30 minutes, handed back — treated the same. Send the browser to
// `authorizationUrl` next.
export async function startPayment(transactionId: string): Promise<Payment> {
  if (!isMock("checkout")) return apiClient.post<Payment>(`/api/transactions/${transactionId}/payments`);

  const txn = mockTransactionStore().get(transactionId);
  if (!txn) throw Object.assign(new Error("No such purchase."), { code: "TRANSACTION_NOT_FOUND" });
  if (txn.status !== "pending_payment") throw Object.assign(new Error("This purchase can't be paid for now."), { code: "TRANSACTION_NOT_PAYABLE" });
  const existing = [...mockPayments.values()].find((p) => p.transactionId === transactionId && p.status === "initialized");
  if (existing) return existing;
  const reference = `PAY-${Date.now().toString(36).toUpperCase()}`;
  // Demo mode has no Paystack: "the gateway" sends the buyer straight back.
  const payment: Payment = {
    id: `pay-${Date.now()}`, transactionId, reference, status: "initialized", amount: txn.totalPrice, currency: "NGN",
    authorizationUrl: `/payments/return?reference=${reference}&trxref=${reference}`, createdAt: new Date().toISOString(),
    gatewayResponse: null, channel: null, paidAt: null, underReview: false,
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
  }
  return { ...payment };
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

const mockPayments = new Map<string, Payment>();

function mockPurchase(id: string): Purchase | null {
  const txn = mockTransactionStore().get(id);
  if (!txn) return null;
  const payments = [...mockPayments.values()].filter((p) => p.transactionId === id);
  const shown = payments.find((p) => p.status === "succeeded") ?? payments.at(-1);
  return {
    id: txn.id, reference: txn.reference, estateId: txn.listingId, plotId: txn.plotId, reservationId: txn.reservationId,
    basePrice: txn.basePrice, cornerPremiumPct: txn.cornerPremiumPct ?? null, totalPrice: txn.totalPrice, currency: "NGN",
    intent: txn.intent, plan: txn.plan, installmentMonths: txn.installmentMonths ?? null, status: txn.status, createdAt: txn.createdAt,
    payment: shown ? {
      reference: shown.reference, status: shown.status, amountPaid: shown.status === "succeeded" ? shown.amount : null,
      paidAt: shown.paidAt, underReview: false, reviewKind: null, refundStatus: null,
    } : null,
  };
}
