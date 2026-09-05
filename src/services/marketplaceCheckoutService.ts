// Backend integration seam for marketplace checkout: payment plan → payment
// → two-step verification → allocation. Parts 6–8 of the buyer flow.
//
// CRITICAL, resolved spec (see landvault-buyer-purchase-flow in project
// memory): LandVault runs a two-step payment audit — the gateway webhook
// lands first (payment "received"), then a Finance Officer verifies before
// the plot is actually allocated. A successful payment is never instant
// allocation; the UI (VerificationProgress) must show both steps honestly.
//
// TODO (backend): allocation must be one atomic transaction touching
// inventory (plot → sold, tier stock), finance (the verification decision),
// and documents together — see the explicit TODO on runFinanceVerification
// below where mock mode necessarily runs these as sequential calls instead.

import { apiClient } from "../lib/apiClient";
import type { Currency, Document, OwnedPlot } from "../data/mockData";
import { FX_RATES } from "../data/mockData";
import type { PaymentPlanType } from "./marketplaceService";
import { addOwnedPlot, updateOwnedPlotStatus } from "./portfolioService";
import { addDocuments } from "./documentsService";
import { convertReservation } from "./reservationService";

export type MarketplacePaymentMethod = "paystack" | "monnify" | "opay" | "titan" | "virtual_account" | "wire";

// NOTE: Stripe is not a Nigerian local rail — never wire it as the default
// here. Local buyers get Nigerian gateways; diaspora buyers get a dedicated
// virtual account or SWIFT wire, per spec.
export const PAYMENT_METHOD_INFO: Record<MarketplacePaymentMethod, { label: string; desc: string; flag: string }> = {
  paystack: { label: "Paystack", desc: "Card, bank transfer, or USSD", flag: "🇳🇬" },
  monnify: { label: "Monnify", desc: "Card or bank transfer", flag: "🇳🇬" },
  opay: { label: "Opay", desc: "Opay wallet or card", flag: "🇳🇬" },
  titan: { label: "Titan card", desc: "Titan virtual/physical card", flag: "🇳🇬" },
  virtual_account: { label: "Virtual account", desc: "Dedicated account number for bank transfer", flag: "🏦" },
  wire: { label: "International wire", desc: "USD / GBP / EUR via SWIFT", flag: "🌍" },
};

export function paymentMethodsForCountry(country: string): MarketplacePaymentMethod[] {
  return country === "NG" ? ["paystack", "monnify", "opay", "titan"] : ["virtual_account", "wire"];
}

export type TransactionStatus = "pending_payment" | "payment_received" | "awaiting_finance" | "verified" | "rejected";

export interface Transaction {
  id: string;
  reference: string;
  listingId: string;
  listingName: string;
  plotId: string;
  plotLabel: string;
  sizeSqm: number;
  actualAreaSqm: number;
  isCorner: boolean;
  cornerPremiumPct?: number;
  basePrice: number;
  titleType: string;
  location: string;
  reservationId: string;
  tierId: string;
  intent: "development" | "investment";
  plan: PaymentPlanType;
  installmentMonths?: number;
  currency: Currency;
  fxRateLocked?: number;
  amountDue: number;
  totalPrice: number;
  paymentMethod?: MarketplacePaymentMethod;
  status: TransactionStatus;
  createdAt: string;
  paymentReceivedAt?: string;
  financeDecisionAt?: string;
  rejectionReason?: string;
  ownedPlotId?: string;
}

export interface InitiateTransactionInput {
  listingId: string;
  listingName: string;
  plotId: string;
  plotLabel: string;
  sizeSqm: number;
  actualAreaSqm: number;
  isCorner: boolean;
  cornerPremiumPct?: number;
  basePrice: number;
  titleType: string;
  location: string;
  reservationId: string;
  tierId: string;
  intent: "development" | "investment";
  plan: PaymentPlanType;
  installmentMonths?: number;
  currency: Currency;
  amountDue: number;
  totalPrice: number;
}

const mockTransactions = new Map<string, Transaction>();

export async function initiateTransaction(input: InitiateTransactionInput): Promise<Transaction> {
  if (!apiClient.isMockMode) return apiClient.post<Transaction>("/api/checkout/transactions", input);

  const txn: Transaction = {
    ...input,
    id: `txn-${Date.now()}`,
    reference: `LV-${Date.now().toString().slice(-9)}`,
    // Live rate shown and lockable for the checkout window when paying in
    // FX — display only, same FX_RATES table the rest of the app already uses.
    fxRateLocked: input.currency !== "NGN" ? FX_RATES[input.currency] : undefined,
    status: "pending_payment",
    createdAt: new Date().toISOString(),
  };
  mockTransactions.set(txn.id, txn);
  return txn;
}

export interface VirtualAccountDetails {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

// Selecting a method — for a transfer-based method (diaspora), returns the
// account/wire details to show while we wait for the transfer to land.
export async function initiatePayment(transactionId: string, method: MarketplacePaymentMethod): Promise<{ requiresTransfer: boolean; account?: VirtualAccountDetails }> {
  if (!apiClient.isMockMode) return apiClient.post(`/api/checkout/transactions/${transactionId}/payments`, { method });

  const txn = mockTransactions.get(transactionId);
  if (txn) txn.paymentMethod = method;
  if (method === "virtual_account" || method === "wire") {
    return { requiresTransfer: true, account: { bankName: "Providus Bank", accountNumber: "5901 2847 3301", accountName: `LandVault — ${transactionId} Escrow` } };
  }
  return { requiresTransfer: false };
}

// Step 1 of the two-step audit: the gateway webhook confirms the payment
// landed. This is NOT allocation — it creates a pending-verification
// portfolio record so the buyer can close the tab and find it again, then
// waits for runFinanceVerification below.
export async function confirmPayment(transactionId: string): Promise<Transaction> {
  if (!apiClient.isMockMode) return apiClient.get<Transaction>(`/api/checkout/transactions/${transactionId}`);

  const txn = mockTransactions.get(transactionId);
  if (!txn) throw new Error("Transaction not found.");

  await new Promise((resolve) => setTimeout(resolve, 1200)); // gateway webhook

  txn.status = "payment_received";
  txn.paymentReceivedAt = new Date().toISOString();

  const isOutright = txn.plan === "outright";
  const remaining = txn.totalPrice - txn.amountDue;
  const installmentAmount = !isOutright && txn.installmentMonths ? remaining / txn.installmentMonths : undefined;

  const ownedPlot: OwnedPlot = {
    id: `op-mkt-${Date.now()}`,
    estateId: txn.listingId,
    plotId: txn.plotId,
    plotLabel: txn.plotLabel,
    estate: txn.listingName,
    location: txn.location,
    sqm: txn.sizeSqm,
    actualSqm: txn.actualAreaSqm,
    isCorner: txn.isCorner,
    cornerPremiumPct: txn.isCorner ? txn.cornerPremiumPct : undefined,
    basePrice: txn.isCorner ? txn.basePrice : undefined,
    titleType: txn.titleType as OwnedPlot["titleType"],
    titleVerified: true, // every marketplace listing is a verified estate (see marketplaceService.ts)
    intent: txn.intent,
    plan: txn.plan === "milestone" ? "milestone" : isOutright ? "outright" : "installment",
    totalPrice: txn.totalPrice,
    paidAmount: txn.amountDue,
    currency: txn.currency,
    acquiredDate: new Date().toISOString().split("T")[0],
    status: "pending_verification",
    installmentMonths: isOutright ? undefined : txn.installmentMonths,
    installmentsPaid: isOutright ? undefined : 0,
    payments: [
      {
        id: `p-${Date.now()}`,
        date: new Date().toISOString().split("T")[0],
        amount: txn.amountDue,
        currency: txn.currency,
        type: isOutright ? "outright" : "deposit",
        status: "confirmed",
        receiptId: txn.reference,
      },
    ],
  };
  void installmentAmount; // set as nextDueAmount only once finance verifies — see below

  const saved = await addOwnedPlot(ownedPlot);
  txn.ownedPlotId = saved.id;
  return txn;
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function buildDocumentsForTransaction(txn: Transaction): Document[] {
  const date = new Date().toISOString().split("T")[0];
  const base = { plotId: txn.ownedPlotId, transactionId: txn.id, date, status: "valid" as const };
  return [
    { id: `doc-${txn.id}-rcp`, type: "receipt", title: `Payment Receipt — ${txn.reference}`, qrCode: `QR-RCP-${txn.id}`, size: "94 KB", ...base },
    { id: `doc-${txn.id}-alc`, type: "allocation_letter", title: `Provisional Allocation Letter — ${txn.listingName}, ${txn.plotLabel}`, qrCode: `QR-ALC-${txn.id}`, size: "203 KB", ...base },
    { id: `doc-${txn.id}-doa`, type: "deed_of_assignment", title: `Deed of Assignment — ${txn.listingName}, ${txn.plotLabel}`, qrCode: `QR-DOA-${txn.id}`, size: "347 KB", ...base },
    { id: `doc-${txn.id}-poa`, type: "poa_draft", title: `POA Draft — ${txn.listingName}, ${txn.plotLabel}`, qrCode: `QR-POA-${txn.id}`, size: "128 KB", ...base },
  ];
}

// Step 2 of the two-step audit: a Finance Officer reviews and decides. Mock
// mode always approves (same convention as checkoutService.ts's
// confirmPayment) — the "rejected" status and its UI exist and are typed for
// a real backend, exercised the way KYC's reject path is (see kycService.ts).
export async function runFinanceVerification(transactionId: string): Promise<Transaction> {
  if (!apiClient.isMockMode) return apiClient.post<Transaction>(`/api/checkout/transactions/${transactionId}/verify`);

  const txn = mockTransactions.get(transactionId);
  if (!txn) throw new Error("Transaction not found.");

  txn.status = "awaiting_finance";
  await new Promise((resolve) => setTimeout(resolve, 2200)); // Finance Officer review

  // TODO (backend): the three calls below — convert the reservation
  // (inventory), record this decision (finance), and issue documents — must
  // be a single atomic transaction. Sequencing them as separate mock calls
  // is exactly the shape a real implementation must NOT have; a partial
  // failure here would leave a plot sold with no documents, or documents
  // issued for a plot nobody actually allocated.
  await convertReservation(txn.reservationId);
  txn.status = "verified";
  txn.financeDecisionAt = new Date().toISOString();

  if (txn.ownedPlotId) {
    const isOutright = txn.plan === "outright";
    const remaining = txn.totalPrice - txn.amountDue;
    await updateOwnedPlotStatus(txn.ownedPlotId, isOutright ? "completed" : "installment_active", {
      nextDueDate: isOutright ? undefined : addDays(30),
      nextDueAmount: isOutright || !txn.installmentMonths ? undefined : remaining / txn.installmentMonths,
    });
    await addDocuments(buildDocumentsForTransaction(txn));
  }

  return txn;
}

export async function fetchTransaction(id: string): Promise<Transaction | undefined> {
  if (!apiClient.isMockMode) {
    try { return await apiClient.get<Transaction>(`/api/checkout/transactions/${id}`); } catch { return undefined; }
  }
  return mockTransactions.get(id);
}
