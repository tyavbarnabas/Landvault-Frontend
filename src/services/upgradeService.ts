// Backend integration seam for the upgrade / swap engine — the diaspora
// flagship feature. See INTEGRATION.md.
//
// CRITICAL (mirrors resaleService.ts's resolved spec closely — this is a
// structurally identical problem: an atomic reallocation of standing, not a
// checkout): an upgrade never touches funds directly on the client. The
// target plot is reserved against conflicting sales the moment a request is
// made (reservationService.ts, the same lock a fresh purchase takes), the
// delta (if any) is verified by Finance before anything moves, and ownership,
// documents, and inventory all move together at the end. See
// executeReallocation's TODO for the atomicity boundary.
//
// MOCK-MODE LIMITATION, stated plainly (same as resaleService.ts's header):
// this repo has exactly one signed-in session — the developer-approval and
// Finance-verification steps are simulated delays, not a second account.

import { apiClient } from "../lib/apiClient";
import type { Currency, Document, OwnedPlot, PlotAccountStatus } from "../data/mockData";
import { addDocuments, voidDocument, fetchDocumentsByPlotId } from "./documentsService";
import { fetchOwnedPlotById, updateOwnedPlotStatus, addOwnedPlot } from "./portfolioService";
import { startReservation, releaseReservation, convertReservation } from "./reservationService";
import { setPlotStatusMock, plotLabel, priceForPlot, type ListingPlot } from "./marketplacePlotsService";
import type { PriceTier, TitleType } from "./marketplaceService";
import type { Estate } from "../data/mockData";

// ─── Eligibility ─────────────────────────────────────────────────────────────

export interface UpgradeEligibility {
  eligible: boolean;
  reason?: string;
}

// Mirrors resaleService.ts's getListingEligibility closely — a plot in
// arrears, still processing, already gone, or already mid-upgrade can't start
// another request. Deliberately NOT gated on intent, same rationale as
// resale: a development-intent buyer may need to upgrade just as much as an
// investment-intent one.
export function getUpgradeEligibility(plot: OwnedPlot): UpgradeEligibility {
  if (plot.status === "in_arrears") {
    return { eligible: false, reason: "This plot is in arrears and can't start an upgrade until that's resolved — request restructuring from the plot detail page instead." };
  }
  if (plot.status === "pending_verification" || plot.status === "reserved") {
    return { eligible: false, reason: "This plot's purchase hasn't finished processing yet." };
  }
  if (plot.status === "transferred") {
    return { eligible: false, reason: "This plot has already been transferred to a new owner." };
  }
  if (plot.status === "superseded") {
    return { eligible: false, reason: "This plot record was already superseded by an earlier upgrade." };
  }
  if (plot.status === "upgrade_pending") {
    return { eligible: false, reason: "An upgrade request is already pending on this plot." };
  }
  return { eligible: true };
}

// ─── Policy ──────────────────────────────────────────────────────────────────

// TODO (backend): tenant-configurable per the estate's owning company — a
// real backend reads this from the tenant's settings, not a repo-wide
// constant. This mock applies one policy to every upgrade. Mirrors
// resaleService.ts's RESALE_POLICY shape.
export const UPGRADE_POLICY = {
  // Processing fee on the delta, applied only when money moves FROM the
  // buyer (an upgrade) — never on a downgrade, where money is already owed
  // back to them.
  adminFeePct: 1,
  // What happens to the difference on a downgrade. No wallet ledger exists
  // elsewhere in this app, so "credit_note" is an honest, non-fabricated
  // description of a real accounting instrument (redeemable against a future
  // payment) rather than implying a wallet feature that isn't built.
  downgradeTreatment: "credit_note" as "credit_note" | "refund_to_source",
};

// ─── Quote ───────────────────────────────────────────────────────────────────

export interface UpgradeQuote {
  currentPlotPrice: number; // what they're leaving — the old plot's full total price
  equityPaid: number; // what they've actually paid so far on the old plot
  outstandingOnCurrent: number; // unpaid balance on the current plot — informational only; this obligation is retired, not carried forward, once the old plot is superseded
  newPlotBasePrice: number; // target tier price, before any corner premium
  cornerPremium: number; // computed from the target estate's own cornerPremiumPct — never a re-derived per-sqm rate
  newPlotTotalPrice: number;
  adminFee: number;
  delta: number; // SIGNED — never clamped. Negative means a credit/refund is due to the buyer.
  direction: "upgrade" | "downgrade" | "even";
  currency: Currency;
}

// Priced off the nominal tier, exactly like the canvas/checkout do — actual
// surveyed area is display-only, never part of this math.
export function computeUpgradeQuote(ownedPlot: OwnedPlot, targetPlot: ListingPlot, targetTiers: PriceTier[], targetEstate: Estate): UpgradeQuote {
  const { base, final } = priceForPlot(targetPlot, targetTiers, targetEstate.cornerPremiumPct);
  const equityPaid = ownedPlot.paidAmount;
  const outstandingOnCurrent = Math.max(0, ownedPlot.totalPrice - ownedPlot.paidAmount);

  // The real fix: a signed difference, never Math.max(0, ...)'d away. A
  // buyer moving from a plot they've paid more into than the new plot costs
  // sees that surplus explicitly, not silently absorbed.
  const delta = final - equityPaid;
  const direction: UpgradeQuote["direction"] = delta > 0 ? "upgrade" : delta < 0 ? "downgrade" : "even";
  const adminFee = direction === "upgrade" ? Math.round(delta * (UPGRADE_POLICY.adminFeePct / 100)) : 0;

  return {
    currentPlotPrice: ownedPlot.totalPrice,
    equityPaid,
    outstandingOnCurrent,
    newPlotBasePrice: base,
    cornerPremium: final - base,
    newPlotTotalPrice: final,
    adminFee,
    delta,
    direction,
    // This mock's canonical Estate carries no per-estate settlement currency
    // — every price is one NGN-denominated ledger, and `currency` is a
    // display/payment-rail preference set once at the buyer's original
    // purchase (see marketplaceCheckoutService.ts). The old plot's own
    // currency is therefore the only one that can be authoritative here;
    // never silently reinterpret the buyer's global display-currency
    // selector as the transaction currency for money math.
    currency: ownedPlot.currency,
  };
}

// ─── Request lifecycle ───────────────────────────────────────────────────────

export type UpgradeStage = "developer_approval" | "delta_payment" | "finance_verification" | "reallocation" | "completed";
export type UpgradeStatus = "in_progress" | "developer_declined" | "payment_window_expired" | "finance_rejected" | "completed";
export type DeltaPaymentMethod = "outright" | "installment";

export interface UpgradeRequest {
  id: string;
  reference: string;
  ownedPlotId: string; // the OLD OwnedPlot.id
  previousStatus: PlotAccountStatus; // restored on any failure path
  fromEstateId: string;
  fromEstateName: string;
  fromPlotLabel: string;
  toEstateId: string;
  toEstateName: string;
  toPlotId: string; // canonical grid plot id on the target estate
  toPlotLabel: string;
  toTierId: string;
  toSizeSqm: number;
  toActualAreaSqm: number;
  toIsCorner: boolean;
  toCornerPremiumPct: number;
  toLocation: string;
  toTitleType: TitleType;
  isCrossEstate: boolean;
  intent: "development" | "investment"; // carried forward from the old plot, unchanged by an upgrade
  quote: UpgradeQuote;
  deltaPaymentMethod?: DeltaPaymentMethod; // undefined when delta <= 0 — nothing to choose
  installmentMonths?: number; // only when deltaPaymentMethod === "installment"
  reservationId: string; // target-plot reservation, released on any failure path
  stage: UpgradeStage;
  status: UpgradeStatus;
  developerDeclineReason?: string;
  paymentDeadline?: string;
  financeRejectionReason?: string;
  newOwnedPlotId?: string; // set once reallocation completes
  creditNoteAmount?: number; // set for a downgrade, per UPGRADE_POLICY.downgradeTreatment
  creditNoteTreatment?: "credit_note" | "refund_to_source";
  buyerName: string;
  createdAt: string;
  completedAt?: string;
}

export interface RequestUpgradeInput {
  ownedPlot: OwnedPlot;
  targetEstate: Estate;
  targetPlot: ListingPlot;
  targetTiers: PriceTier[];
  quote: UpgradeQuote;
  deltaPaymentMethod: DeltaPaymentMethod;
  installmentMonths?: number;
  buyerName: string;
}

const mockRequests: UpgradeRequest[] = [];

export async function requestUpgrade(input: RequestUpgradeInput): Promise<UpgradeRequest> {
  const { ownedPlot, targetEstate, targetPlot, quote, deltaPaymentMethod, installmentMonths, buyerName } = input;

  const eligibility = getUpgradeEligibility(ownedPlot);
  if (!eligibility.eligible) throw new Error(eligibility.reason ?? "This plot isn't eligible for an upgrade.");

  if (!apiClient.isMockMode) {
    return apiClient.post<UpgradeRequest>("/api/upgrades", input);
  }

  // Reserve the target plot against conflicting sales — the same lock a
  // fresh purchase takes out. Two buyers (or a buyer and a fresh marketplace
  // sale) can never both land on the same target plot mid-upgrade.
  const reservation = await startReservation(targetEstate.id, targetPlot.id);

  const previousStatus = ownedPlot.status;
  await updateOwnedPlotStatus(ownedPlot.id, "upgrade_pending");

  const request: UpgradeRequest = {
    id: `ur-${Date.now()}`,
    reference: `UPG-${Date.now().toString().slice(-9)}`,
    ownedPlotId: ownedPlot.id,
    previousStatus,
    fromEstateId: ownedPlot.estateId,
    fromEstateName: ownedPlot.estate,
    fromPlotLabel: ownedPlot.plotLabel,
    toEstateId: targetEstate.id,
    toEstateName: targetEstate.name,
    toPlotId: targetPlot.id,
    toPlotLabel: plotLabel(targetPlot),
    toTierId: targetPlot.tierId,
    toSizeSqm: targetPlot.sizeSqm,
    toActualAreaSqm: targetPlot.actualAreaSqm,
    toIsCorner: targetPlot.isCorner,
    toCornerPremiumPct: targetEstate.cornerPremiumPct,
    toLocation: targetEstate.location,
    toTitleType: targetEstate.titleType,
    isCrossEstate: targetEstate.id !== ownedPlot.estateId,
    intent: ownedPlot.intent,
    quote,
    deltaPaymentMethod: quote.delta > 0 ? deltaPaymentMethod : undefined,
    installmentMonths: quote.delta > 0 && deltaPaymentMethod === "installment" ? installmentMonths : undefined,
    reservationId: reservation.id,
    stage: "developer_approval",
    status: "in_progress",
    buyerName,
    createdAt: new Date().toISOString(),
  };
  mockRequests.unshift(request);

  runUpgradePipeline(request.id); // fire-and-forget — see below
  return request;
}

// ─── Demo triggers (mock-mode only) ──────────────────────────────────────────
// Same convention as resaleService.ts's DEMO_DEVELOPER_DECLINE_AMOUNT etc.
// UNLIKE resale's, this amount is DERIVED (the signed delta), not typed by
// the buyer, so hitting these exact values requires deliberately choosing a
// target plot whose price puts the delta at exactly this figure — reachable
// via the real UI, not guaranteed on the first plot you click. This mirrors
// a limitation the codebase already accepts elsewhere: marketplaceCheckoutService.ts's
// runFinanceVerification has no reachable failure trigger at all today, since
// its amount is likewise computed rather than typed.
const DEMO_DEVELOPER_DECLINE_AMOUNT = 2;
const DEMO_PAYMENT_EXPIRE_AMOUNT = 3;
const DEMO_FINANCE_REJECT_AMOUNT = 4;

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Any failure path returns both plots to normal standing: the target plot's
// reservation releases (back to its pre-reservation status), and the old
// plot's status is restored to whatever it was before the request started —
// never left stuck on "upgrade_pending".
async function revertRequest(r: UpgradeRequest): Promise<void> {
  await releaseReservation(r.reservationId);
  await updateOwnedPlotStatus(r.ownedPlotId, r.previousStatus);
}

// Advances a request through its stages with realistic mock delays, mutating
// the shared store in place. UpgradeProgress polls fetchUpgradeRequest to
// reflect this live — same idiom as resaleService.ts's
// runResaleTransferPipeline / ResaleProgress.
async function runUpgradePipeline(requestId: string): Promise<void> {
  const r = mockRequests.find((x) => x.id === requestId);
  if (!r) return;

  await sleep(1800); // developer review
  if (Math.round(r.quote.delta) === DEMO_DEVELOPER_DECLINE_AMOUNT) {
    r.status = "developer_declined";
    r.developerDeclineReason = "The developer did not approve this reallocation. Contact support for details.";
    await revertRequest(r);
    return;
  }

  r.stage = "delta_payment";
  if (r.quote.delta > 0) {
    r.paymentDeadline = addDays(5);
    await sleep(1800); // buyer paying the delta
    if (Math.round(r.quote.delta) === DEMO_PAYMENT_EXPIRE_AMOUNT) {
      r.status = "payment_window_expired";
      await revertRequest(r);
      return;
    }
  }
  // delta <= 0: no payment due from the buyer — proceeds straight to
  // verification. A downgrade still needs Finance to sign off on the credit
  // note before anything moves, same audit discipline as a real payment.

  r.stage = "finance_verification";
  await sleep(2000); // Finance Officer review, same two-step audit as any other payment
  if (Math.round(r.quote.delta) === DEMO_FINANCE_REJECT_AMOUNT) {
    r.status = "finance_rejected";
    r.financeRejectionReason = "The payment gateway flagged this transaction for manual review and it could not be verified. Your original plot remains yours — no reallocation has occurred.";
    await revertRequest(r);
    return;
  }

  r.stage = "reallocation";
  await executeReallocation(r);

  r.stage = "completed";
  r.status = "completed";
  r.completedAt = new Date().toISOString();
}

// The atomic step.
// TODO (backend): inventory (target plot -> sold, tier stock — tier stock
// drops for free via tiersFromPlots' live derivation once the plot is sold),
// the old plot's retirement, finance settlement (the credit note/refund on a
// downgrade), and document issuance must be ONE atomic backend transaction —
// identical boundary to resaleService.ts's executeTitleTransfer. A partial
// failure here (e.g. the new plot allocated but the old one never retired)
// leaves a buyer owning two plots or none — precisely the state corruption
// this platform exists to prevent. Mock mode necessarily runs these as
// sequential calls; a real implementation must not.
async function executeReallocation(r: UpgradeRequest): Promise<void> {
  // 1. Target plot: the reservation converts to sold.
  await convertReservation(r.reservationId);

  const oldPlot = await fetchOwnedPlotById(r.ownedPlotId);

  // 2. Old plot's canonical grid cell released back to the pool, best-effort.
  // NOTE: this mock's seeded OwnedPlot records were hand-authored independent
  // of the canonical Estate.plots grid (a pre-existing decoupling — see
  // landvault-catalogue-unification-plan in project memory), so the
  // coordinate this releases may not have reflected this exact buyer as
  // "sold" in the first place. The OwnedPlot ledger below is the real source
  // of truth regardless of what the grid cell shows.
  if (oldPlot) {
    setPlotStatusMock(oldPlot.estateId, oldPlot.plotId, oldPlot.intent === "investment" ? "available-inv" : "available-dev");
  }

  // 3. Old plot's record retired — never hard-deleted, just marked
  // superseded so its full payment history stays on the audit record. Its
  // next-due obligation is retired along with it (see UpgradeQuote's
  // outstandingOnCurrent comment) — never left showing a payment reminder
  // for a plan that no longer applies.
  await updateOwnedPlotStatus(r.ownedPlotId, "superseded", { nextDueDate: undefined, nextDueAmount: undefined });

  // 4. Documents: void the old deed + allocation letter, issue amended ones
  // for the new plot — each referencing the transaction and what it
  // supersedes, so the chain is provable.
  const existingDocs = await fetchDocumentsByPlotId(r.ownedPlotId);
  const oldDeed = existingDocs.find((d) => d.type === "deed_of_assignment" && d.status === "valid");
  const oldAllocation = existingDocs.find((d) => d.type === "allocation_letter" && d.status === "valid");
  if (oldDeed) await voidDocument(oldDeed.id);
  if (oldAllocation) await voidDocument(oldAllocation.id);

  const newOwnedPlotId = `op-upg-${r.id}`;
  const date = new Date().toISOString().split("T")[0];
  const newDocs: Document[] = [
    {
      id: `doc-${r.id}-deed`,
      plotId: newOwnedPlotId,
      type: "deed_of_assignment",
      title: `Deed of Assignment — ${r.toEstateName}, ${r.toPlotLabel}`,
      date,
      status: "valid",
      qrCode: `QR-DOA-${r.id}`,
      size: "348 KB",
      transactionId: r.id,
      supersedes: oldDeed?.id,
    },
    {
      id: `doc-${r.id}-alc`,
      plotId: newOwnedPlotId,
      type: "allocation_letter",
      title: `Amended Allocation Letter — ${r.toEstateName}, ${r.toPlotLabel}`,
      date,
      status: "valid",
      qrCode: `QR-ALC-${r.id}`,
      size: "207 KB",
      transactionId: r.id,
      supersedes: oldAllocation?.id,
    },
  ];
  await addDocuments(newDocs);

  // 5. New OwnedPlot record — carries forward equity, payment history,
  // intent, and plan. Never starts a fresh empty ledger.
  const deltaPaidNow = r.quote.delta > 0 && r.deltaPaymentMethod === "outright" ? r.quote.delta + r.quote.adminFee : 0;
  const paidAmount = Math.min(r.quote.equityPaid + deltaPaidNow, r.quote.newPlotTotalPrice);
  const remaining = r.quote.newPlotTotalPrice - paidAmount;
  const isInstallmentDelta = r.quote.delta > 0 && r.deltaPaymentMethod === "installment" && !!r.installmentMonths;

  const carriedPayments = oldPlot ? [...oldPlot.payments] : [];
  if (deltaPaidNow > 0) {
    carriedPayments.push({
      id: `p-${r.id}-delta`,
      date,
      amount: deltaPaidNow,
      currency: r.quote.currency,
      type: "delta",
      status: "confirmed",
      receiptId: r.reference,
      verifiedAt: new Date().toISOString(),
    });
  }

  const newPlot: OwnedPlot = {
    id: newOwnedPlotId,
    estateId: r.toEstateId,
    plotId: r.toPlotId,
    plotLabel: r.toPlotLabel,
    estate: r.toEstateName,
    location: r.toLocation,
    sqm: r.toSizeSqm,
    actualSqm: r.toActualAreaSqm,
    isCorner: r.toIsCorner,
    cornerPremiumPct: r.toIsCorner ? r.toCornerPremiumPct : undefined,
    basePrice: r.toIsCorner ? r.quote.newPlotBasePrice : undefined,
    titleType: r.toTitleType,
    titleVerified: true,
    intent: r.intent,
    plan: remaining <= 0 ? "outright" : "installment",
    totalPrice: r.quote.newPlotTotalPrice,
    paidAmount,
    currency: r.quote.currency,
    acquiredDate: date,
    status: remaining <= 0 ? "completed" : "installment_active",
    nextDueDate: remaining > 0 ? addMonths(date, 1) : undefined,
    nextDueAmount: remaining > 0 && isInstallmentDelta ? Math.round(remaining / r.installmentMonths!) : undefined,
    installmentMonths: isInstallmentDelta ? r.installmentMonths : undefined,
    installmentsPaid: isInstallmentDelta ? 0 : undefined,
    payments: carriedPayments,
    supersedes: r.ownedPlotId,
  };
  await addOwnedPlot(newPlot);
  r.newOwnedPlotId = newOwnedPlotId;

  if (r.quote.direction === "downgrade") {
    r.creditNoteAmount = Math.abs(r.quote.delta);
    r.creditNoteTreatment = UPGRADE_POLICY.downgradeTreatment;
  }
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split("T")[0];
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export async function fetchUpgradeRequest(id: string): Promise<UpgradeRequest | undefined> {
  if (!apiClient.isMockMode) {
    try { return await apiClient.get<UpgradeRequest>(`/api/upgrades/${id}`); } catch { return undefined; }
  }
  return mockRequests.find((r) => r.id === id);
}

// So a buyer can find any in-flight or past request after closing the tab,
// and PlotView.tsx can surface an in-flight request on the plot it started
// from without needing the request id in the URL.
export async function fetchMyUpgradeRequests(): Promise<UpgradeRequest[]> {
  if (!apiClient.isMockMode) return apiClient.get<UpgradeRequest[]>("/api/upgrades");
  return mockRequests;
}

export async function fetchUpgradeRequestForPlot(ownedPlotId: string): Promise<UpgradeRequest | undefined> {
  const mine = await fetchMyUpgradeRequests();
  return mine.find((r) => r.ownedPlotId === ownedPlotId && r.status === "in_progress");
}
