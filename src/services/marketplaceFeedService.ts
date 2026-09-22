// Unifies the primary marketplace (developer estate listings) and the resale
// secondary market (owner-listed plots) into one discovery surface. See the
// marketplace-unification spec in project memory.
//
// ISOLATION BOUNDARY, preserved: this module still only ever reads from each
// side's own public listing projection (marketplaceService.fetchListings for
// primary, resaleService.fetchListings for resale — itself a published,
// opt-in projection of a plot the owner chose to list). It never reaches into
// either side's private data directly — see both services' own header
// comments for the boundary they each already enforce.
//
// Discovery is shared here; the transaction is NOT — see
// MarketplaceEstateDetail.tsx (Reserve) vs MarketplaceResaleDetail.tsx (Make
// an offer). This file only merges, filters, and sorts for browsing.

import {
  fetchListings as fetchPrimaryListings, fetchListingById as fetchPrimaryListingById,
  fromPrice, cheapestTier, pricePerSqm,
  type Listing, type ListingFilters, type TitleType, type WishlistItem,
} from "./marketplaceService";
import {
  fetchListings as fetchResaleListingsRaw, fetchListingById as fetchResaleListingById,
  type ResaleListing,
} from "./resaleService";
import type { NigerianState } from "../data/nigerianStates";
import { paginateMock, type Page, type PageParams } from "../lib/pagination";

// Both sides of the merge are fetched in full (a generous limit, well above
// this fixture set's real size) rather than composed from two independently-
// paginated sub-fetches — merging two already-paginated, differently-shaped
// sources into one correctly-ordered cursor is a real cross-type-pagination
// problem a real backend would need its own indexing/materialized-view
// strategy for. This mock merges everything, then paginates the merged
// result — honest about the exposed Page<T> contract, simplified about how
// it's sourced.
const MERGE_FETCH_LIMIT = 5000;

export type MarketplaceListingType = "primary" | "resale";

export interface PrimaryMarketplaceListing {
  listingType: "primary";
  data: Listing;
}
export interface ResaleMarketplaceListing {
  listingType: "resale";
  data: ResaleListing;
}
export type MarketplaceListing = PrimaryMarketplaceListing | ResaleMarketplaceListing;

export function listingUid(item: MarketplaceListing): string {
  return `${item.listingType}:${item.data.id}`;
}

// ─── Normalized accessors — how filtering/sorting compares two genuinely
// different shapes without forcing them into one artificial schema ─────────

export function listingDisplayName(item: MarketplaceListing): string {
  return item.listingType === "primary" ? item.data.name : item.data.estateName;
}

export function listingState(item: MarketplaceListing): NigerianState {
  return item.data.state;
}

export function listingTitleType(item: MarketplaceListing): TitleType {
  return item.data.titleType;
}

// "from" price — a primary listing's cheapest available tier; a resale
// listing's single asking price (there is no tier, it's one specific plot).
export function listingFromPrice(item: MarketplaceListing): number {
  return item.listingType === "primary" ? fromPrice(item.data) : item.data.asking;
}

export function listingPricePerSqm(item: MarketplaceListing): number {
  return item.listingType === "primary" ? pricePerSqm(cheapestTier(item.data)) : item.data.asking / item.data.sqm;
}

export function listingSizeRange(item: MarketplaceListing): [number, number] {
  if (item.listingType === "primary") {
    const sizes = item.data.priceTiers.map((t) => t.sizeSqm);
    return [Math.min(...sizes), Math.max(...sizes)];
  }
  return [item.data.sqm, item.data.sqm];
}

// `wanted` comes from ListingFilters.intent, whose type allows "both" even
// though the filter UI never actually offers it as a selection (only a
// listing's own intent is ever "both") — treated as a no-op filter if it
// somehow arrives, rather than a type error.
export function listingIntentMatches(item: MarketplaceListing, wanted: "development" | "investment" | "both"): boolean {
  if (wanted === "both") return true;
  return item.listingType === "primary" ? item.data.intent === wanted || item.data.intent === "both" : item.data.intent === wanted;
}

// Degrades sensibly rather than being omitted: a resale listing is exactly
// one specific plot, so it's always "1 remaining" for this purpose.
export function listingPlotsRemaining(item: MarketplaceListing): number {
  return item.listingType === "primary" ? item.data.priceTiers.reduce((s, t) => s + t.plotsRemaining, 0) : 1;
}

export function listingSortDate(item: MarketplaceListing): string {
  return item.listingType === "primary" ? item.data.publishedDate : item.data.createdAt;
}

// Where a listing's own detail page lives. The two types deliberately sit on
// different path shapes (a 1-segment estate id vs a 2-segment resale id) so
// they can never collide — see MarketplaceResaleDetail.tsx.
export function listingRoute(item: MarketplaceListing): string {
  return item.listingType === "primary" ? `/marketplace/${item.data.id}` : `/marketplace/resale/${item.data.id}`;
}

// Re-reads a saved wishlist entry from whichever side actually owns it, and
// hands back the tagged union. Every caller re-fetches live rather than
// trusting the saved copy — WishlistItem.priceAtSave is a historical marker
// for the delta only, never "the price". Returns null when the listing is
// gone entirely (delisted, or an id that no longer resolves).
export async function fetchWishlistListing(saved: WishlistItem): Promise<MarketplaceListing | null> {
  if (saved.listingType === "resale") {
    const listing = await fetchResaleListingById(saved.listingId);
    return listing ? { listingType: "resale", data: listing } : null;
  }
  const listing = await fetchPrimaryListingById(saved.listingId);
  return listing ? { listingType: "primary", data: listing } : null;
}

function listingQueryText(item: MarketplaceListing): string {
  return item.listingType === "primary"
    ? `${item.data.name} ${item.data.area} ${item.data.city} ${item.data.state}`.toLowerCase()
    : `${item.data.estateName} ${item.data.plotLabel} ${item.data.location} ${item.data.state}`.toLowerCase();
}

// ─── Merged fetch ────────────────────────────────────────────────────────────

export interface UnifiedListingFilters extends ListingFilters {
  type?: MarketplaceListingType; // undefined = both (the default, single-view point of this unification)
}

export async function fetchUnifiedListings(filters: UnifiedListingFilters = {}, params: PageParams = {}): Promise<Page<MarketplaceListing>> {
  const wantPrimary = filters.type !== "resale";
  const wantResale = filters.type !== "primary";

  // Fetched unfiltered from each side, then filtered/sorted uniformly here —
  // resaleService.fetchListings() has no filter params of its own (it only
  // ever returns active listings), so this is the one place cross-type
  // filters are actually applied, rather than duplicating filter logic into
  // two services that model listings completely differently.
  const [primaryPage, resalePage] = await Promise.all([
    wantPrimary ? fetchPrimaryListings({}, { limit: MERGE_FETCH_LIMIT }) : Promise.resolve({ items: [], total: 0, hasMore: false } as Page<Listing>),
    wantResale ? fetchResaleListingsRaw({ limit: MERGE_FETCH_LIMIT }) : Promise.resolve({ items: [], total: 0, hasMore: false } as Page<ResaleListing>),
  ]);

  let merged: MarketplaceListing[] = [
    ...primaryPage.items.map((data): MarketplaceListing => ({ listingType: "primary", data })),
    ...resalePage.items.map((data): MarketplaceListing => ({ listingType: "resale", data })),
  ];

  if (filters.query) {
    const q = filters.query.toLowerCase();
    merged = merged.filter((l) => listingQueryText(l).includes(q));
  }
  if (filters.state) merged = merged.filter((l) => listingState(l) === filters.state);
  if (filters.titleType) merged = merged.filter((l) => listingTitleType(l) === filters.titleType);
  if (filters.intent) merged = merged.filter((l) => listingIntentMatches(l, filters.intent!));
  if (filters.minPrice !== undefined) merged = merged.filter((l) => listingFromPrice(l) >= filters.minPrice!);
  if (filters.maxPrice !== undefined) merged = merged.filter((l) => listingFromPrice(l) <= filters.maxPrice!);
  if (filters.minSize !== undefined) merged = merged.filter((l) => listingSizeRange(l)[1] >= filters.minSize!);
  if (filters.maxSize !== undefined) merged = merged.filter((l) => listingSizeRange(l)[0] <= filters.maxSize!);
  // A resale listing is a single negotiated price, not a payment plan — this
  // filter genuinely doesn't apply to it. Degrade by excluding resale from
  // this specific filter (not silently — MarketplaceFeed shows a caption
  // when this combination is active) rather than pretending it matches.
  if (filters.paymentPlan) merged = merged.filter((l) => l.listingType === "primary" && l.data.paymentPlans.includes(filters.paymentPlan!));
  // verifiedOnly is a pass-through, not an excluding filter: every listing on
  // this platform is already verified in one of two ways (see
  // ListingTypeBadge) — there's no unverified tier to filter out.

  switch (filters.sort) {
    case "price_low": merged.sort((a, b) => listingFromPrice(a) - listingFromPrice(b)); break;
    case "price_per_sqm": merged.sort((a, b) => listingPricePerSqm(a) - listingPricePerSqm(b)); break;
    case "plots_remaining": merged.sort((a, b) => listingPlotsRemaining(b) - listingPlotsRemaining(a)); break;
    case "newest":
    default:
      merged.sort((a, b) => (listingSortDate(a) < listingSortDate(b) ? 1 : -1));
      break;
  }

  return paginateMock(merged, params);
}
