// Backend integration seam for the secondary market (resale). See INTEGRATION.md.
//
// CRITICAL (resolved spec — see the resale-fixes prompt): a resale is a TITLE
// TRANSFER, not a checkout. The seller never receives funds directly and the
// buyer never receives the plot directly — the developer holds title, funds
// sit in a held account until the transfer executes, and everything moves
// atomically at the end. See executeTitleTransfer's TODO for the atomicity
// boundary.
//
// MOCK-MODE LIMITATION, stated plainly: this repo has exactly one signed-in
// session at a time — there's no real second "buyer" account to drive their
// own KYC/payment steps. Every other two-party interaction in this app
// already handles that the same way (the Finance Officer, KYC reviewer, and
// developer approver are all simulated delays, never a second login) — this
// module simulates the buyer's side of the pipeline (KYC, payment) the same
// way, from the seller's (the current session's) point of view. A real
// backend would have the actual buyer complete those steps via their own
// account; only the seller-facing progress view is built here.

import { apiClient } from "../lib/apiClient";
import type { Currency, Document, OwnedPlot } from "../data/mockData";
import { addDocuments, voidDocument, fetchDocumentsByPlotId } from "./documentsService";
import { updateOwnedPlotStatus } from "./portfolioService";
import { ESTATES } from "../data/mockData";
import type { NigerianState } from "../data/nigerianStates";
import type { TitleType } from "./marketplaceService";

// ─── Eligibility (Fix 2) ─────────────────────────────────────────────────────

// TODO (backend): tenant-configurable per the estate's owning company — a
// real backend reads this from the tenant's settings, not a repo-wide
// constant. This mock applies one policy to every listing.
export const RESALE_POLICY = {
  developerTransferFeePct: 2,
  allowedOutstandingTreatments: ["deduct_from_proceeds", "transfers_to_buyer"] as const,
};
export type OutstandingTreatment = (typeof RESALE_POLICY.allowedOutstandingTreatments)[number];

export interface ListingEligibility {
  eligible: boolean;
  reason?: string;
  outstandingBalance: number;
}

// Deliberately NOT gated on intent — a development-intent buyer may
// legitimately need to exit just as much as an investment-intent one; the
// original "investment only" restriction had no stated rationale and
// contradicts letting a distressed seller list at all (see Fix 6).
export function getListingEligibility(plot: OwnedPlot): ListingEligibility {
  const outstandingBalance = Math.max(0, plot.totalPrice - plot.paidAmount);
  if (plot.status === "in_arrears") {
    return { eligible: false, reason: "This plot is in arrears and can't be listed until that's resolved — request restructuring from the plot detail page instead.", outstandingBalance };
  }
  if (plot.status === "pending_verification" || plot.status === "reserved") {
    return { eligible: false, reason: "This plot's purchase hasn't finished processing yet.", outstandingBalance };
  }
  if (plot.status === "transferred") {
    return { eligible: false, reason: "This plot has already been transferred to a new owner.", outstandingBalance };
  }
  if (plot.status === "upgrade_pending") {
    return { eligible: false, reason: "An upgrade request is pending on this plot.", outstandingBalance };
  }
  return { eligible: true, outstandingBalance };
}

// ─── Types ───────────────────────────────────────────────────────────────────

export type ResaleListingStatus = "active" | "resale_pending" | "sold" | "withdrawn";

export interface ResaleListing {
  id: string;
  plotId: string; // OwnedPlot.id — the seller's plot
  estateId: string;
  estateName: string;
  plotLabel: string;
  location: string;
  state: NigerianState; // for cross-type filtering alongside marketplace listings
  titleType: TitleType;
  sqm: number;
  isCorner: boolean;
  intent: "development" | "investment";
  asking: number;
  originalPrice: number; // seller-only — never surface this or pctPaid to a buyer's view
  paidAmount: number;
  outstandingBalance: number;
  outstandingTreatment?: OutstandingTreatment; // required if outstandingBalance > 0
  currency: Currency;
  sellerName: string;
  pctPaid: number;
  daysListed: number;
  status: ResaleListingStatus;
  createdAt: string;
}

export interface ResaleOffer {
  id: string;
  listingId: string;
  buyerName: string;
  buyerKycVerified: boolean; // simulated third-party buyer's KYC state
  amount: number;
  currency: Currency;
  date: string;
  status: "pending" | "accepted" | "declined";
  declineReason?: string;
}

// The six seller-facing stages, in order. "offer_accepted" isn't tracked here
// — a transfer only ever exists once an offer has been accepted, so it's
// always shown as done by ResaleProgress rather than a state to reach.
export type ResaleTransferStage = "developer_approval" | "buyer_kyc" | "buyer_payment" | "finance_verification" | "title_transfer" | "settlement";
export type ResaleTransferStatus = "in_progress" | "developer_declined" | "payment_window_expired" | "finance_rejected" | "completed";

export interface ResaleTransfer {
  id: string;
  reference: string;
  listingId: string;
  offerId: string;
  plotId: string;
  estateName: string;
  plotLabel: string;
  sellerName: string;
  buyerName: string;
  amount: number; // accepted offer amount
  currency: Currency;
  transferFeePct: number;
  outstandingDeduction: number;
  netProceeds: number;
  stage: ResaleTransferStage;
  status: ResaleTransferStatus;
  buyerKycVerified: boolean;
  developerDeclineReason?: string;
  financeRejectionReason?: string;
  paymentDeadline?: string;
  createdAt: string;
  completedAt?: string;
}

// ─── Mock stores ─────────────────────────────────────────────────────────────

// l1 is deliberately tied to the signed-in demo user's own real plot
// (op-002, Emerald Park) with sellerName matching MOCK_CLIENT_USER, so the
// accept → transfer pipeline is immediately testable end-to-end (including
// the plot genuinely leaving the portfolio) without first having to create a
// listing by hand. l2–l4 are other sellers' listings for marketplace browse
// variety — never reachable via "My listings" in this single-session mock.
const mockListings: ResaleListing[] = [
  { id: "l1", plotId: "op-002", estateId: "golden-acres", estateName: "Golden Acres", plotLabel: "Block G, Plot 9", location: "Sagamu Interchange, Sagamu", state: "Ogun", titleType: "R of O", sqm: 300, isCorner: false, intent: "investment", asking: 15_800_000, originalPrice: 13_200_000, paidAmount: 13_200_000, outstandingBalance: 0, currency: "NGN", sellerName: "Emeka Okonkwo", pctPaid: 100, daysListed: 3, status: "active", createdAt: "2026-09-01" },
  { id: "l2", plotId: "op-ext-2", estateId: "peaceland", estateName: "Peaceland", plotLabel: "Block D, Plot 2", location: "Lekki, Lagos", state: "Lagos", titleType: "C of O", sqm: 300, isCorner: false, intent: "investment", asking: 38_000_000, originalPrice: 32_000_000, paidAmount: 32_000_000, outstandingBalance: 0, currency: "NGN", sellerName: "O. Nwosu", pctPaid: 100, daysListed: 14, status: "active", createdAt: "2026-08-21" },
  { id: "l3", plotId: "op-ext-3", estateId: "sunrise-gardens", estateName: "Sunrise Gardens", plotLabel: "Block B, Plot 11", location: "Maitama Extension, Abuja", state: "Federal Capital Territory (Abuja)", titleType: "Governor's Consent", sqm: 300, isCorner: false, intent: "investment", asking: 24_500_000, originalPrice: 20_000_000, paidAmount: 20_000_000, outstandingBalance: 0, currency: "NGN", sellerName: "F. Okafor", pctPaid: 100, daysListed: 7, status: "active", createdAt: "2026-08-28" },
  { id: "l4", plotId: "op-ext-4", estateId: "peaceland", estateName: "Peaceland", plotLabel: "Block A, Plot 7", location: "Lekki, Lagos", state: "Lagos", titleType: "C of O", sqm: 400, isCorner: true, intent: "investment", asking: 52_000_000, originalPrice: 45_500_000, paidAmount: 45_500_000, outstandingBalance: 0, currency: "NGN", sellerName: "T. Adeyemi", pctPaid: 100, daysListed: 21, status: "active", createdAt: "2026-08-14" },
];

const mockOffers: ResaleOffer[] = [
  { id: "o1", listingId: "l1", buyerName: "E. Obi", buyerKycVerified: true, amount: 16_200_000, currency: "NGN", date: "2026-08-22", status: "pending" },
  { id: "o2", listingId: "l1", buyerName: "K. Ibrahim", buyerKycVerified: false, amount: 15_500_000, currency: "NGN", date: "2026-08-19", status: "pending" },
];

const mockTransfers: ResaleTransfer[] = [];

// ─── Listings ────────────────────────────────────────────────────────────────

export async function fetchListings(): Promise<ResaleListing[]> {
  if (!apiClient.isMockMode) return apiClient.get<ResaleListing[]>("/api/resale/listings");
  return mockListings.filter((l) => l.status === "active");
}

export async function fetchListingById(id: string): Promise<ResaleListing | undefined> {
  if (!apiClient.isMockMode) {
    try { return await apiClient.get<ResaleListing>(`/api/resale/listings/${id}`); } catch { return undefined; }
  }
  // Deliberately not filtered to status "active" — the wishlist and a buyer
  // returning to a listing they were mid-offer on both need to see a
  // resale_pending/sold/withdrawn listing too, just rendered as unavailable
  // rather than silently disappearing. See PART 7 of the unification spec.
  return mockListings.find((l) => l.id === id);
}

// "My" listings — this mock has one session, so every listing the current
// user created is tagged by sellerName === the signed-in user's name at
// creation time.
export async function fetchMyListings(sellerName: string): Promise<ResaleListing[]> {
  if (!apiClient.isMockMode) return apiClient.get<ResaleListing[]>(`/api/resale/listings?seller=${encodeURIComponent(sellerName)}`);
  return mockListings.filter((l) => l.sellerName === sellerName);
}

export interface CreateListingInput {
  plot: OwnedPlot;
  asking: number;
  sellerName: string;
  outstandingTreatment?: OutstandingTreatment;
}

export async function createListing(input: CreateListingInput): Promise<ResaleListing> {
  const { plot, asking, sellerName, outstandingTreatment } = input;
  const eligibility = getListingEligibility(plot);
  if (!eligibility.eligible) throw new Error(eligibility.reason ?? "This plot isn't eligible for resale.");
  if (eligibility.outstandingBalance > 0 && !outstandingTreatment) {
    throw new Error("Choose how the outstanding balance will be handled before publishing.");
  }

  const internalEstate = ESTATES.find((e) => e.id === plot.estateId);
  const listing: ResaleListing = {
    id: `l-${Date.now()}`,
    plotId: plot.id,
    estateId: plot.estateId,
    estateName: plot.estate,
    plotLabel: plot.plotLabel,
    location: plot.location,
    // One canonical Estate model now — its `state` is already the typed
    // NigerianState union, no bridging lookup needed (see
    // landvault-catalogue-unification-plan in project memory).
    state: internalEstate?.state ?? ("Federal Capital Territory (Abuja)" as NigerianState),
    titleType: plot.titleType ?? internalEstate?.titleType ?? "C of O",
    sqm: plot.sqm,
    isCorner: !!plot.isCorner,
    intent: plot.intent,
    asking,
    originalPrice: plot.totalPrice,
    paidAmount: plot.paidAmount,
    outstandingBalance: eligibility.outstandingBalance,
    outstandingTreatment: eligibility.outstandingBalance > 0 ? outstandingTreatment : undefined,
    currency: plot.currency,
    sellerName,
    pctPaid: plot.totalPrice > 0 ? Math.round((plot.paidAmount / plot.totalPrice) * 100) : 0,
    daysListed: 0,
    status: "active",
    createdAt: new Date().toISOString().split("T")[0],
  };

  if (!apiClient.isMockMode) return apiClient.post<ResaleListing>("/api/resale/listings", listing);
  mockListings.unshift(listing);
  return listing;
}

// ─── Offers ──────────────────────────────────────────────────────────────────

export async function fetchOffersForListing(listingId: string): Promise<ResaleOffer[]> {
  if (!apiClient.isMockMode) return apiClient.get<ResaleOffer[]>(`/api/resale/listings/${listingId}/offers`);
  return mockOffers.filter((o) => o.listingId === listingId);
}

export async function fetchMyOffersReceived(sellerName: string): Promise<{ listing: ResaleListing; offers: ResaleOffer[] }[]> {
  const mine = await fetchMyListings(sellerName);
  return Promise.all(mine.map(async (listing) => ({ listing, offers: await fetchOffersForListing(listing.id) })));
}

export interface SubmitOfferInput {
  listingId: string;
  buyerName: string;
  amount: number;
  currency: Currency;
}

export async function submitOffer(input: SubmitOfferInput): Promise<ResaleOffer> {
  if (!Number.isFinite(input.amount) || Number.isNaN(input.amount) || input.amount <= 0) {
    throw new Error("Enter a valid offer amount greater than zero.");
  }
  const offer: ResaleOffer = {
    id: `o-${Date.now()}`,
    listingId: input.listingId,
    buyerName: input.buyerName,
    buyerKycVerified: true, // the signed-in session making the offer is a real buyer, already KYC-gated elsewhere in the app
    amount: input.amount,
    currency: input.currency,
    date: new Date().toISOString().split("T")[0],
    status: "pending",
  };
  if (!apiClient.isMockMode) return apiClient.post<ResaleOffer>(`/api/resale/listings/${input.listingId}/offers`, input);
  mockOffers.push(offer);
  return offer;
}

export async function declineOffer(offerId: string, reason?: string): Promise<void> {
  if (!apiClient.isMockMode) { await apiClient.post(`/api/resale/offers/${offerId}/decline`, { reason }); return; }
  const offer = mockOffers.find((o) => o.id === offerId);
  if (offer) { offer.status = "declined"; offer.declineReason = reason; }
}

// ─── Demo triggers (mock-mode only) ─────────────────────────────────────────
// Same convention as kycService.ts's DEMO_REJECT_NIN and
// portfolioService.ts's DEMO_REJECT_AMOUNT — a distinct offer amount
// deterministically exercises each failure path so it's actually reachable,
// not just typed.
const DEMO_DEVELOPER_DECLINE_AMOUNT = 2;
const DEMO_PAYMENT_EXPIRE_AMOUNT = 3;
const DEMO_FINANCE_REJECT_AMOUNT = 4;

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

// Fix 1, step 1: accept one offer, auto-decline every other open offer on the
// same listing, pull the listing off the public market, and start the
// transfer pipeline.
export async function acceptOffer(offerId: string): Promise<ResaleTransfer> {
  const offer = mockOffers.find((o) => o.id === offerId);
  if (!offer) throw new Error("Offer not found.");
  const listing = mockListings.find((l) => l.id === offer.listingId);
  if (!listing) throw new Error("Listing not found.");

  offer.status = "accepted";
  for (const other of mockOffers) {
    if (other.listingId === listing.id && other.id !== offer.id && other.status === "pending") {
      other.status = "declined";
      other.declineReason = "Another offer on this plot was accepted.";
    }
  }
  listing.status = "resale_pending"; // removed from the public market — see fetchListings' active-only filter

  const outstandingDeduction = listing.outstandingTreatment === "deduct_from_proceeds" ? listing.outstandingBalance : 0;
  const fee = Math.round(offer.amount * (RESALE_POLICY.developerTransferFeePct / 100));
  const transfer: ResaleTransfer = {
    id: `rt-${Date.now()}`,
    reference: `RSL-${Date.now().toString().slice(-9)}`,
    listingId: listing.id,
    offerId: offer.id,
    plotId: listing.plotId,
    estateName: listing.estateName,
    plotLabel: listing.plotLabel,
    sellerName: listing.sellerName,
    buyerName: offer.buyerName,
    amount: offer.amount,
    currency: listing.currency,
    transferFeePct: RESALE_POLICY.developerTransferFeePct,
    outstandingDeduction,
    netProceeds: offer.amount - fee - outstandingDeduction,
    stage: "developer_approval",
    status: "in_progress",
    buyerKycVerified: offer.buyerKycVerified,
    createdAt: new Date().toISOString(),
  };
  mockTransfers.unshift(transfer);

  runResaleTransferPipeline(transfer.id); // fire-and-forget — see below
  return transfer;
}

// Advances a transfer through its stages with realistic mock delays,
// mutating the shared store in place. ResaleProgress polls
// fetchResaleTransfer to reflect this live, which is also what makes the
// transfer "reachable later" from My listings — the record (and, within the
// same session, its in-progress pipeline) persists independent of any one
// component being mounted.
async function runResaleTransferPipeline(transferId: string): Promise<void> {
  const t = mockTransfers.find((x) => x.id === transferId);
  if (!t) return;

  await sleep(1800); // developer review
  if (t.amount === DEMO_DEVELOPER_DECLINE_AMOUNT) {
    t.status = "developer_declined";
    t.developerDeclineReason = "The developer did not consent to this assignment. Contact support for details.";
    // Return the listing to the market and the plot to normal standing.
    const listing = mockListings.find((l) => l.id === t.listingId);
    if (listing) listing.status = "active";
    return;
  }

  t.stage = "buyer_kyc";
  if (!t.buyerKycVerified) {
    await sleep(1200); // buyer completing KYC — skipped entirely if already verified
    t.buyerKycVerified = true;
  }

  t.stage = "buyer_payment";
  t.paymentDeadline = addDays(5);
  await sleep(1800); // buyer paying into the held account
  if (t.amount === DEMO_PAYMENT_EXPIRE_AMOUNT) {
    t.status = "payment_window_expired";
    const listing = mockListings.find((l) => l.id === t.listingId);
    if (listing) listing.status = "active";
    return;
  }

  t.stage = "finance_verification";
  await sleep(2000); // Finance Officer verification, same two-step audit as any other payment
  if (t.amount === DEMO_FINANCE_REJECT_AMOUNT) {
    t.status = "finance_rejected";
    t.financeRejectionReason = "The payment gateway flagged this transaction for manual review and it could not be verified. The held funds are safe — no title action has been taken.";
    return;
  }

  t.stage = "title_transfer";
  await executeTitleTransfer(t);

  t.stage = "settlement";
  t.status = "completed";
  t.completedAt = new Date().toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fix 1, step 6 — legal execution.
// TODO (backend): ownership (plot status + removal from seller's portfolio),
// documents (void the seller's deed, issue the buyer's), and the funds
// release must be ONE atomic backend transaction — a partial failure here
// (e.g. documents issued but ownership not moved) is exactly the kind of
// state corruption this platform exists to prevent. Mock mode necessarily
// runs these as sequential calls; a real implementation must not.
async function executeTitleTransfer(t: ResaleTransfer): Promise<void> {
  await updateOwnedPlotStatus(t.plotId, "transferred");

  const existingDocs = await fetchDocumentsByPlotId(t.plotId);
  const sellerDeed = existingDocs.find((d) => d.type === "deed_of_assignment" && d.status === "valid");
  if (sellerDeed) await voidDocument(sellerDeed.id);

  // The buyer has no real account in this single-session mock (see the
  // module header) — their new deed is represented here as the durable
  // record of the transfer, referencing what it supersedes, but isn't
  // attached to any vault a person can open. A real backend issues this into
  // the buyer's own document vault via their own account.
  const newDeed: Document = {
    id: `doc-${t.id}-transfer`,
    plotId: t.plotId,
    type: "deed_of_assignment",
    title: `Deed of Assignment — ${t.estateName}, ${t.plotLabel} (transferred to ${t.buyerName})`,
    date: new Date().toISOString().split("T")[0],
    status: "void", // void from the SELLER's vault's perspective — they no longer hold this plot
    qrCode: `QR-DOA-${t.id}`,
    size: "351 KB",
    transactionId: t.id,
    supersedes: sellerDeed?.id,
  };
  await addDocuments([newDeed]);

  const listing = mockListings.find((l) => l.id === t.listingId);
  if (listing) listing.status = "sold";
}

// ─── Reading transfers ───────────────────────────────────────────────────────

export async function fetchResaleTransfer(id: string): Promise<ResaleTransfer | undefined> {
  if (!apiClient.isMockMode) {
    try { return await apiClient.get<ResaleTransfer>(`/api/resale/transfers/${id}`); } catch { return undefined; }
  }
  return mockTransfers.find((t) => t.id === id);
}

// So a seller can find any in-flight or past transfer from My listings after
// closing the tab, without needing the transfer id in the URL.
export async function fetchMyResaleTransfers(sellerName: string): Promise<ResaleTransfer[]> {
  if (!apiClient.isMockMode) return apiClient.get<ResaleTransfer[]>(`/api/resale/transfers?seller=${encodeURIComponent(sellerName)}`);
  return mockTransfers.filter((t) => t.sellerName === sellerName);
}
