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
  fetchListings as fetchPrimaryListings, fromPrice, cheapestTier, pricePerSqm,
  type Listing, type ListingFilters, type TitleType,
} from "./marketplaceService";
import { fetchListings as fetchResaleListingsRaw, type ResaleListing } from "./resaleService";
import type { NigerianState } from "../data/nigerianStates";

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

function listingQueryText(item: MarketplaceListing): string {
  return item.listingType === "primary"
    ? `${item.data.name} ${item.data.area} ${item.data.city} ${item.data.state}`.toLowerCase()
    : `${item.data.estateName} ${item.data.plotLabel} ${item.data.location} ${item.data.state}`.toLowerCase();
}

// ─── Merged fetch ────────────────────────────────────────────────────────────

export interface UnifiedListingFilters extends ListingFilters {
  type?: MarketplaceListingType; // undefined = both (the default, single-view point of this unification)
}

export async function fetchUnifiedListings(filters: UnifiedListingFilters = {}): Promise<MarketplaceListing[]> {
  const wantPrimary = filters.type !== "resale";
  const wantResale = filters.type !== "primary";

  // Fetched unfiltered from each side, then filtered/sorted uniformly here —
  // resaleService.fetchListings() has no filter params of its own (it only
  // ever returns active listings), so this is the one place cross-type
  // filters are actually applied, rather than duplicating filter logic into
  // two services that model listings completely differently.
  const [primaryRaw, resaleRaw] = await Promise.all([
    wantPrimary ? fetchPrimaryListings() : Promise.resolve([]),
    wantResale ? fetchResaleListingsRaw() : Promise.resolve([]),
  ]);

  let merged: MarketplaceListing[] = [
    ...primaryRaw.map((data): MarketplaceListing => ({ listingType: "primary", data })),
    ...resaleRaw.map((data): MarketplaceListing => ({ listingType: "resale", data })),
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

  return merged;
}
