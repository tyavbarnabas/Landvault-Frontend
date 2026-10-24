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

import { apiClient, ApiError, nullIfNotFound } from "../lib/apiClient";
import { isMock } from "../lib/backends";

// The three steps below are DEMO MODE's simulation of paying and verifying.
// Live, paying is Paystack's page (paymentsService.startPayment) and the
// developer's finance team verifies in the portal — none of these is called.
function demoOnly(): never {
  throw new Error("Demo mode only: live payments go through Paystack (paymentsService).");
}
import type { Currency, Document, OwnedPlot } from "../data/mockData";
import { FX_RATES } from "../data/mockData";
import type { PaymentPlanType } from "./marketplaceService";
import { addOwnedPlot, confirmOwnedPayments, updateOwnedPlotStatus } from "./portfolioService";
import { addDocuments } from "./documentsService";
import { convertReservation } from "./reservationService";
import { mockAddressFor, type Address, type PurchaseAddress } from "./addressService";
import { mockSchedule, type PlanFrequency } from "./paymentPlansService";

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

// The backend never writes `payment_received`: a paid purchase goes straight
// from pending_payment to awaiting_finance. Kept because the enum has it; never
// relied on. `abandoned`: the reservation ended before payment arrived.
// `on_plan` (instalment plans): the deposit is verified and the plot is held
// for the buyer on the plan — never theirs until `verified`.
// `withdrawn` (the buyer left the plan) and `revoked` (the developer ended it
// after notice): the plan is over and the buyer is refunded in parts.
export type TransactionStatus = "pending_payment" | "payment_received" | "awaiting_finance" | "on_plan" | "verified" | "rejected" | "abandoned" | "withdrawn" | "revoked";

// An instalment purchase's plan, worked out by the backend from the agreed
// price when the purchase opened and never recomputed: the developer
// redeclaring plans later changes nothing. Shown as it comes.
export interface ScheduledInstalment {
  sequence: number;
  dueDate: string;
  amount: number;
  // A restructured schedule's first new instalment carries the penalties
  // already reached. Zero otherwise.
  carriedPenalty?: number;
}

export interface PlanSchedule {
  planId: string;
  planName: string;
  frequency: PlanFrequency;
  planTotal: number;
  premium: number;
  deposit: number;
  instalments: ScheduledInstalment[];
  // 2+ once restructured: paid instalments first, then the new ones.
  version?: number;
  // The late-payment terms copied onto the purchase when it opened.
  lateTerms?: {
    steps: { monthsLate: number; penaltyPct: number }[];
    penaltiesRefundable: boolean;
    revocation: { afterMonths: number; noticeDays: number } | null;
  } | null;
}

// The developer's offer letter, issued when the purchase opens (backend
// changeset 098). The buyer accepts it before paying.
export interface OfferSummary {
  id: string;
  number: string; // "HT-OFR-2026-000123"
  issuedAt: string;
  acceptedAt: string | null;
}

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
  // The declared plan chosen (instalments only), and its fixed schedule.
  planId?: string;
  schedule: PlanSchedule | null;
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
  // The address as it was when the purchase was opened — what its allocation
  // letter prints. Null on purchases opened before addresses were kept.
  buyerAddress: PurchaseAddress | null;
  // Null only on purchases opened before offers existed — those stay payable.
  offer: OfferSummary | null;
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
  // The listing's plan id (priceTiers[].paymentPlans[].planId), for
  // plan "installment". Never a number of months: the plan decides that.
  planId?: string;
  currency: Currency;
  // What's due first — the price, or the plan's deposit. Display only.
  amountDue: number;
  totalPrice: number;
  // Demo mode only, to check the buyer has an address as the backend does.
  // Never sent: the backend copies the address from the account itself.
  buyer: { email: string; address?: Address | null };
}

const mockTransactions = new Map<string, Transaction>();

// A printed verification code, "D897-0A03-3C97-202D", for demo documents.
function mockCode(): string {
  const hex = Array.from({ length: 16 }, () => "0123456789ABCDEF"[Math.floor(Math.random() * 16)]).join("");
  return hex.match(/.{4}/g)!.join("-");
}

// For paymentsService's mock mode, which walks the same purchases.
export function mockTransactionStore(): Map<string, Transaction> {
  return mockTransactions;
}

// TransactionDto. The backend recomputes the price from the plot as it was
// held — a price sent by the client is ignored — so basePrice, the corner
// premium and totalPrice are the BACKEND's, not the screen's.
interface TransactionDto {
  id: string;
  reference: string;
  estateId: string;
  plotId: string;
  reservationId: string;
  basePrice: number;
  cornerPremiumPct: number | null;
  totalPrice: number;
  intent: "development" | "investment";
  plan: PaymentPlanType;
  status: TransactionStatus;
  createdAt: string;
  buyerAddress: PurchaseAddress | null;
  offer?: OfferSummary | null;
  schedule?: PlanSchedule | null;
}

// The screen's display fields (estate name, plot label, location…) are kept
// from what the buyer was shown; every money figure comes from the backend.
function fromTransactionDto(dto: TransactionDto, { buyer: _buyer, ...shown }: InitiateTransactionInput): Transaction {
  return {
    ...shown,
    id: dto.id,
    reference: dto.reference,
    listingId: dto.estateId,
    plotId: dto.plotId,
    reservationId: dto.reservationId,
    basePrice: dto.basePrice,
    cornerPremiumPct: dto.cornerPremiumPct ?? undefined,
    totalPrice: dto.totalPrice,
    intent: dto.intent,
    plan: dto.plan,
    status: dto.status,
    createdAt: dto.createdAt,
    buyerAddress: dto.buyerAddress ?? null,
    offer: dto.offer ?? null,
    schedule: dto.schedule ?? null,
    // The first payment is the schedule's deposit, never a figure from the page.
    amountDue: dto.schedule ? dto.schedule.deposit : dto.totalPrice,
  };
}

export async function initiateTransaction(input: InitiateTransactionInput): Promise<Transaction> {
  if (!isMock("checkout")) {
    // CreateTransactionRequest: { reservationId, intent, plan, planId (plan
    // "installment" only) }. Nothing else — prices are the backend's, and
    // installmentMonths is refused (400 INVALID_PAYMENT_PLAN).
    const dto = await apiClient.post<TransactionDto>("/api/checkout/transactions", {
      reservationId: input.reservationId,
      intent: input.intent,
      plan: input.plan,
      ...(input.plan === "installment" ? { planId: input.planId } : {}),
    });
    return fromTransactionDto(dto, input);
  }

  // 409 ADDRESS_REQUIRED, as the backend answers: nothing is created and
  // the hold is untouched.
  const { buyer, ...shown } = input;
  const address = mockAddressFor(buyer.email) ?? buyer.address ?? null;
  if (!address) throw new ApiError(409, "Add your address before buying.", { code: "ADDRESS_REQUIRED" });
  // 409 PLAN_NOT_OFFERED: the developer changed the plans since the listing loaded.
  let schedule: PlanSchedule | null = null;
  if (input.plan === "installment") {
    schedule = input.planId ? mockSchedule(input.listingId, input.planId, input.totalPrice) : null;
    if (!schedule) throw new ApiError(409, "This estate doesn't offer that plan any more.", { code: "PLAN_NOT_OFFERED" });
  }
  const txn: Transaction = {
    ...shown,
    buyerAddress: { line1: address.line1, line2: address.line2, city: address.city, state: address.state, postalCode: address.postalCode, country: address.country },
    id: `txn-${Date.now()}`,
    reference: `LV-${Date.now().toString().slice(-9)}`,
    // Live rate shown and lockable for the checkout window when paying in
    // FX — display only, same FX_RATES table the rest of the app already uses.
    fxRateLocked: input.currency !== "NGN" ? FX_RATES[input.currency] : undefined,
    status: "pending_payment",
    createdAt: new Date().toISOString(),
    offer: null,
    schedule,
    amountDue: schedule ? schedule.deposit : input.totalPrice,
  };
  // The developer's offer, issued as the purchase opens. Demo documents have
  // no file behind them; the real letter is drawn by the backend.
  const seq = String(mockTransactions.size + 1).padStart(6, "0");
  const offer: OfferSummary = { id: `ofr-${txn.id}`, number: `HT-OFR-${new Date().getFullYear()}-${seq}`, issuedAt: txn.createdAt, acceptedAt: null };
  txn.offer = offer;
  await addDocuments([{
    id: offer.id, type: "offer_letter", title: `Offer letter ${offer.number} — ${shown.plotLabel}, ${shown.listingName}`,
    date: offer.issuedAt, issuedAt: offer.issuedAt, status: "issued", acceptedAt: null, number: offer.number,
    qrCode: mockCode(), size: null, transactionId: txn.id,
  }]);
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
  if (!isMock("checkout")) demoOnly();

  const txn = mockTransactions.get(transactionId);
  if (txn?.offer && !txn.offer.acceptedAt) throw new ApiError(409, "Accept the offer letter before paying.", { code: "OFFER_NOT_ACCEPTED" });
  if (txn) txn.paymentMethod = method;
  if (method === "virtual_account" || method === "wire") {
    return { requiresTransfer: true, account: { bankName: "Providus Bank", accountNumber: "5901 2847 3301", accountName: `HomeTrue — ${transactionId} Escrow` } };
  }
  return { requiresTransfer: false };
}

// Step 1 of the two-step audit: the gateway webhook confirms the payment
// landed. This is NOT allocation — it creates a pending-verification
// portfolio record so the buyer can close the tab and find it again, then
// waits for runFinanceVerification below. Equity doesn't advance before
// finance verifies, so the record shows nothing paid yet.
export async function confirmPayment(transactionId: string): Promise<Transaction> {
  if (!isMock("checkout")) demoOnly();

  const txn = mockTransactions.get(transactionId);
  if (!txn) throw new Error("Transaction not found.");

  await new Promise((resolve) => setTimeout(resolve, 1200)); // gateway webhook

  txn.status = "awaiting_finance";
  txn.paymentReceivedAt = new Date().toISOString();

  const schedule = txn.schedule;
  const today = new Date().toISOString().split("T")[0];
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
    transactionId: txn.id,
    intent: txn.intent,
    plan: schedule ? "installment" : txn.plan === "milestone" ? "milestone" : "outright",
    totalPrice: schedule ? schedule.planTotal : txn.totalPrice,
    paidAmount: 0,
    currency: txn.currency,
    acquiredDate: null,
    status: "pending_verification",
    installmentMonths: schedule ? schedule.instalments.length : undefined,
    installmentsPaid: schedule ? 0 : undefined,
    payments: [{
      id: `p-${Date.now()}`, date: today, amount: txn.amountDue, currency: txn.currency,
      type: schedule ? "deposit" : "outright", status: "pending_verification", receiptId: txn.reference,
    }],
  };

  const saved = await addOwnedPlot(ownedPlot);
  txn.ownedPlotId = saved.id;
  return txn;
}

function buildDocumentsForTransaction(txn: Transaction): Document[] {
  const date = new Date().toISOString().split("T")[0];
  const base = { plotId: txn.ownedPlotId, transactionId: txn.id, date, status: "valid" as const };
  // A plan's deposit gets a provisional letter; the final one comes when the
  // plan is paid in full.
  if (txn.schedule) {
    return [
      { id: `doc-${txn.id}-rcp`, type: "receipt", title: `Payment Receipt — ${txn.reference}`, qrCode: `QR-RCP-${txn.id}`, size: "94 KB", ...base },
      { id: `doc-${txn.id}-pal`, type: "provisional_allocation_letter", title: `Provisional allocation letter — ${txn.listingName}, ${txn.plotLabel}`, qrCode: mockCode(), size: null, ...base },
    ];
  }
  return [
    { id: `doc-${txn.id}-rcp`, type: "receipt", title: `Payment Receipt — ${txn.reference}`, qrCode: `QR-RCP-${txn.id}`, size: "94 KB", ...base },
    { id: `doc-${txn.id}-alc`, type: "allocation_letter", title: `Allocation letter — ${txn.listingName}, ${txn.plotLabel}`, qrCode: `QR-ALC-${txn.id}`, size: "203 KB", ...base },
    { id: `doc-${txn.id}-doa`, type: "deed_of_assignment", title: `Deed of Assignment — ${txn.listingName}, ${txn.plotLabel}`, qrCode: `QR-DOA-${txn.id}`, size: "347 KB", ...base },
    { id: `doc-${txn.id}-poa`, type: "poa_draft", title: `POA Draft — ${txn.listingName}, ${txn.plotLabel}`, qrCode: `QR-POA-${txn.id}`, size: "128 KB", ...base },
  ];
}

// Step 2 of the two-step audit: a Finance Officer reviews and decides. Mock
// mode always approves (same convention as checkoutService.ts's
// confirmPayment) — the "rejected" status and its UI exist and are typed for
// a real backend, exercised the way KYC's reject path is (see kycService.ts).
// A plan's deposit doesn't sell: the purchase goes on_plan and the plot is
// held for the buyer on it.
export async function runFinanceVerification(transactionId: string): Promise<Transaction> {
  if (!isMock("checkout")) demoOnly();

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
  const schedule = txn.schedule;
  txn.status = schedule ? "on_plan" : "verified";
  txn.financeDecisionAt = new Date().toISOString();

  if (txn.ownedPlotId) {
    const first = schedule?.instalments[0];
    await updateOwnedPlotStatus(txn.ownedPlotId, schedule ? "installment_active" : "completed", {
      paidAmount: txn.amountDue,
      acquiredDate: new Date().toISOString().split("T")[0],
      nextDueDate: first?.dueDate,
      nextDueAmount: first?.amount,
    });
    await confirmOwnedPayments(txn.ownedPlotId);
    await addDocuments(buildDocumentsForTransaction(txn));
  }

  return txn;
}

export async function fetchTransaction(id: string): Promise<Transaction | undefined> {
  if (!isMock("checkout")) {
    // Unused by any screen today. Live, this is the backend's TransactionDto —
    // without the display fields a screen adds from what the buyer was shown.
    return (await nullIfNotFound(apiClient.get<Transaction>(`/api/checkout/transactions/${id}`))) ?? undefined;
  }
  return mockTransactions.get(id);
}
