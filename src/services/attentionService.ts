// Backend integration seam for the buyer dashboard's attention strip.
// See INTEGRATION.md.
//
// WHY THIS IS ITS OWN SERVICE, and the shape the backend will need:
//
// "What needs my attention?" is a fundamentally different query from "list my
// plots". It is cross-cutting (plots, upgrade requests, documents, wishlist),
// time-filtered, and returns one flat ranked list rather than one entity
// type. Writing the shape down now — before `sales`/`finance` exist — is the
// point: otherwise those modules get built to answer "list my plots" and this
// query is only discovered afterwards.
//
// The endpoint this becomes:
//
//   GET /api/me/attention?since=<iso>&dueWithinDays=<n>  ->  AttentionItem[]
//
//   AttentionItem {
//     type: 'payment_due' | 'arrears' | 'upgrade_delta_due'
//         | 'document_issued' | 'price_change'
//     severity: 'urgent' | 'normal'
//     title, detail
//     targetRoute        // where the verb takes them
//     occurredAt / dueAt
//   }
//
// Not to be confused with platformMetricsService.ts's AttentionItem — that
// one is the Super Admin console's, and is platform-scoped counts + hrefs.
// This one belongs to a single buyer, and every item carries a verb and one
// specific destination.

import { formatAmount, type OwnedPlot } from "../data/mockData";
import { apiClient } from "../lib/apiClient";
import { fetchOwnedPlots, urgencyRank } from "./portfolioService";
import { fetchMyUpgradeRequests } from "./upgradeService";
import { fetchDocuments } from "./documentsService";
import { fetchWishlistListing, listingDisplayName, listingFromPrice, listingRoute } from "./marketplaceFeedService";
import type { WishlistItem } from "./marketplaceService";
import { isActivelyOwned } from "../pages/portfolio/Portfolio";

export type AttentionType = "payment_due" | "arrears" | "upgrade_delta_due" | "document_issued" | "price_change";
export type AttentionSeverity = "urgent" | "normal";

export interface AttentionItem {
  id: string;
  type: AttentionType;
  severity: AttentionSeverity;
  title: string;
  detail: string;
  targetRoute: string;
  occurredAt?: string;
  dueAt?: string;
}

// A payment isn't something to act on until it's near. This is the window the
// dashboard treats as actionable at all; urgencyRank's own 7-day tier then
// decides which of those read as urgent rather than normal.
export const PAYMENT_DUE_WINDOW_DAYS = 14;

// How far back through the vault to look for documents issued since the last
// visit. A buyer who genuinely received more than this between two visits
// sees the newest ones plus a count — the vault itself holds the full list.
const NEW_DOCUMENT_SCAN_LIMIT = 20;

// Wishlist price moves are informational, and a long wishlist could otherwise
// crowd out the items that actually need money. Only the largest moves make
// the strip; the wishlist page shows every one of them.
const MAX_PRICE_CHANGE_ITEMS = 3;

// See Portfolio.tsx's PORTFOLIO_PAGE_SIZE note — the same "a real backend
// should answer this server-side" caveat applies, more so here: this whole
// module becomes one endpoint.
const PLOT_SCAN_LIMIT = 500;

// Ordering reuses portfolioService's urgencyRank for every plot-derived item
// rather than inventing a parallel scale. The three types with no OwnedPlot
// behind them can't go through it, so they're placed ON that same 0–3 scale:
// an upgrade's delta is money with a deadline (1, alongside a payment due
// within the week); a new document and a price move are informational (2, 3).
const UNRANKABLE_TYPE_RANK: Record<"upgrade_delta_due" | "document_issued" | "price_change", number> = {
  upgrade_delta_due: 1,
  document_issued: 2,
  price_change: 3,
};

interface RankedItem {
  item: AttentionItem;
  rank: number;
}

export interface FetchAttentionParams {
  // Wishlist state lives in AppContext (client-side) in mock mode, so it's
  // passed in rather than fetched. The real endpoint reads it from the
  // authenticated principal and this param goes away.
  wishlist: WishlistItem[];
  // Documents issued after this timestamp count as new. Undefined on a
  // first-ever visit: with no baseline, nothing is "new" — better than
  // dumping a buyer's entire document history into the strip.
  documentsSince?: string;
  dueWithinDays?: number;
}

export async function fetchAttentionItems(params: FetchAttentionParams): Promise<AttentionItem[]> {
  const { wishlist, documentsSince, dueWithinDays = PAYMENT_DUE_WINDOW_DAYS } = params;

  if (!apiClient.isMockMode) {
    const query = new URLSearchParams({ dueWithinDays: String(dueWithinDays) });
    if (documentsSince) query.set("since", documentsSince);
    return apiClient.get<AttentionItem[]>(`/api/me/attention?${query}`);
  }

  const [plotsPage, upgrades, documentsPage] = await Promise.all([
    fetchOwnedPlots({ limit: PLOT_SCAN_LIMIT }),
    fetchMyUpgradeRequests(),
    fetchDocuments({ limit: NEW_DOCUMENT_SCAN_LIMIT }),
  ]);

  const ranked: RankedItem[] = [];

  // Retired records (resold, or superseded by an upgrade) keep their place in
  // the ledger but can never need action again — same rule as Portfolio's
  // totals.
  for (const plot of plotsPage.items.filter(isActivelyOwned)) {
    const item = plotAttentionItem(plot, dueWithinDays);
    if (item) ranked.push({ item, rank: urgencyRank(plot) });
  }

  for (const request of upgrades) {
    if (request.stage !== "delta_payment" || request.status !== "in_progress") continue;
    ranked.push({
      rank: UNRANKABLE_TYPE_RANK.upgrade_delta_due,
      item: {
        id: `upgrade-delta:${request.id}`,
        type: "upgrade_delta_due",
        severity: "urgent",
        title: `Upgrade to ${request.toEstateName} — ${request.toPlotLabel}`,
        detail: `${formatAmount(request.quote.delta + request.quote.adminFee, request.quote.currency)} difference is due to complete the swap${request.paymentDeadline ? `, by ${request.paymentDeadline}` : ""}.`,
        targetRoute: `/upgrade/request/${request.id}`,
        dueAt: request.paymentDeadline,
      },
    });
  }

  // Aggregated into one row rather than one per document: a completed
  // purchase issues a whole set at once, which would otherwise bury the items
  // that need money behind a wall of receipts.
  const newDocuments = documentsSince
    ? documentsPage.items.filter((d) => new Date(d.date).getTime() > new Date(documentsSince).getTime())
    : [];
  if (newDocuments.length > 0) {
    ranked.push({
      rank: UNRANKABLE_TYPE_RANK.document_issued,
      item: {
        id: "documents-issued",
        type: "document_issued",
        severity: "normal",
        title: newDocuments.length === 1 ? "A new document was issued" : `${newDocuments.length} new documents were issued`,
        detail: describeNewDocuments(newDocuments),
        targetRoute: "/documents",
        occurredAt: newDocuments[0].date,
      },
    });
  }

  for (const item of await priceChangeItems(wishlist)) {
    ranked.push({ rank: UNRANKABLE_TYPE_RANK.price_change, item });
  }

  return sortByUrgency(ranked);
}

function describeNewDocuments(documents: { title: string }[]): string {
  const titles = documents.map((d) => d.title);
  if (titles.length <= 2) return titles.join(" and ");
  return `${titles.slice(0, 2).join(", ")} and ${titles.length - 2} more`;
}

// Whether one plot needs anything from its owner right now, and if so how it
// reads. Exported because it is the single place the dashboard/portfolio rule
// is applied to a plot — a fact about what you own produces null here.
export function plotAttentionItem(plot: OwnedPlot, dueWithinDays: number = PAYMENT_DUE_WINDOW_DAYS): AttentionItem | null {
  if (plot.status === "in_arrears" && plot.arrears) {
    return {
      id: `arrears:${plot.id}`,
      type: "arrears",
      severity: "urgent",
      title: `${plot.estate} — ${plot.plotLabel}`,
      // Factual and non-accusatory, matching ArrearsBanner's tone rule: this
      // states the position and points at the screen that can resolve it.
      detail: `${formatAmount(plot.arrears.amountOwed, plot.currency)} has been overdue since ${plot.arrears.overdueSinceDate}. Payment and restructuring options are both open.`,
      targetRoute: `/portfolio/${plot.id}`,
      dueAt: plot.arrears.overdueSinceDate,
    };
  }

  if (!plot.nextDueDate || plot.nextDueAmount === undefined) return null;
  const daysUntilDue = Math.round((new Date(plot.nextDueDate).getTime() - Date.now()) / 86_400_000);
  if (daysUntilDue > dueWithinDays) return null;

  const installment = plot.installmentMonths !== undefined && plot.installmentsPaid !== undefined
    ? `Installment ${plot.installmentsPaid + 1} of ${plot.installmentMonths}`
    : "Next payment";

  return {
    id: `payment-due:${plot.id}`,
    type: "payment_due",
    // urgencyRank's own definition of near-term: within the week.
    severity: urgencyRank(plot) <= 1 ? "urgent" : "normal",
    title: `${plot.estate} — ${plot.plotLabel}`,
    detail: `${installment}: ${formatAmount(plot.nextDueAmount, plot.currency)} ${describeDueIn(daysUntilDue)}.`,
    targetRoute: `/portfolio/${plot.id}`,
    dueAt: plot.nextDueDate,
  };
}

function describeDueIn(days: number): string {
  if (days < 0) return `was due ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`;
  if (days === 0) return "is due today";
  return `is due in ${days} day${days === 1 ? "" : "s"}`;
}

async function priceChangeItems(wishlist: WishlistItem[]): Promise<AttentionItem[]> {
  const resolved = await Promise.all(
    wishlist.map(async (saved) => {
      const listing = await fetchWishlistListing(saved);
      if (!listing) return null;
      // Resale listings that are no longer purchasable are the wishlist
      // page's concern (it renders them as "no longer available"), not a
      // price move to act on.
      if (listing.listingType === "resale" && listing.data.status !== "active") return null;
      const change = listingFromPrice(listing) - saved.priceAtSave;
      if (change === 0) return null;
      return { listing, change };
    })
  );

  return resolved
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))
    .slice(0, MAX_PRICE_CHANGE_ITEMS)
    .map(({ listing, change }) => ({
      id: `price-change:${listing.listingType}:${listing.data.id}`,
      type: "price_change" as const,
      severity: "normal" as const,
      title: listingDisplayName(listing),
      // NGN, matching every other marketplace price surface (EstateCard /
      // ListingCard) — listing prices are one NGN-denominated ledger; the
      // display-currency selector never reinterprets them.
      detail: `${change < 0 ? "Down" : "Up"} ${formatAmount(Math.abs(change), "NGN")} since you saved it — now from ${formatAmount(listingFromPrice(listing), "NGN")}.`,
      targetRoute: listingRoute(listing),
    }));
}

// Worst first. Within a rank, whatever is due soonest leads; anything with no
// due date falls back to most-recent-first.
function sortByUrgency(ranked: RankedItem[]): AttentionItem[] {
  return [...ranked]
    .sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.item.dueAt && b.item.dueAt) return a.item.dueAt < b.item.dueAt ? -1 : 1;
      if (a.item.occurredAt && b.item.occurredAt) return a.item.occurredAt < b.item.occurredAt ? 1 : -1;
      return 0;
    })
    .map((r) => r.item);
}
