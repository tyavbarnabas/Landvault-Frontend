// ─── Public marketplace ─────────────────────────────────────────────────────
//
// ISOLATION BOUNDARY (architectural, non-negotiable), updated for the
// catalogue unification (see landvault-catalogue-unification-plan in project
// memory): a Listing below is now a REAL, derived projection of a canonical
// Estate (mockData.ts) — projectListing() is the one function that builds it,
// reusing estatesService.ts's tiersFromPlots() for pricing rather than a
// second, independently-authored fixture set. This is exactly what fixes the
// bug this boundary used to paper over: the old MOCK_LISTINGS array described
// estates that didn't exist anywhere else in the app.
//
// The boundary itself doesn't move: projectListing() reads a canonical
// estate's PUBLIC fields (plots, pricing, amenities, title) plus its owning
// tenant's verificationState/entitlements/status — only to decide whether a
// listing is published at all (the gate below) and to build the narrow
// `Seller { branchName, companyName }` shape. It never reads (and a Listing
// never carries) tenant-private operational data: clients, finances, staff,
// documents, other estates' data. A real backend's public projection is a
// separately-maintained, periodically-rebuilt table with exactly this same
// narrow read access into tenant state — not a live join a client could ever
// exploit into seeing more.
//
// This is also still a genuinely different SHAPE from mockData.ts's Estate:
// that one prices individual plots on a row/col grid for one company's
// detailed inventory (src/pages/estates/Browse.tsx); this one prices SIZE
// TIERS for cross-company discovery/comparison. Two projections of one
// canonical truth — not the same thing wearing different names, and not two
// unrelated things either.

import { apiClient, nullIfNotFound } from "../lib/apiClient";
import { isMock } from "../lib/backends";
import { paginateMock, type Page, type PageParams } from "../lib/pagination";
import type { NigerianState } from "../data/nigerianStates";
import { ESTATES, type Estate as MockEstate } from "../data/mockData";
import { tiersFromPlots, type PriceTier, type TierAvailability } from "./estatesService";
import { fetchTenantByIdSync, tenantDisplayName } from "./tenantsService";

// PriceTier/TierAvailability are defined once, in estatesService.ts (the
// function that actually derives tiers from real plot data) — re-exported
// here so every existing marketplace-side import keeps working unchanged.
// See landvault-catalogue-unification-plan in project memory: "one canonical
// PriceTier," not two structurally-identical interfaces with different names.
export type { PriceTier, TierAvailability };

export type TitleType = "C of O" | "R of O" | "Governor's Consent" | "Gazette";
export type PaymentPlanType = "outright" | "installment" | "milestone";
export type ListingIntent = "development" | "investment" | "both";

// SellerDto. `branchName` is null for a company-level estate, which has no
// branch. `office` is the selling branch's office — shown publicly, and null
// when there's no branch or it has no office details recorded.
export interface Seller {
  branchName: string | null;
  companyName: string;
  office?: BranchOffice | null;
}

export interface BranchOffice {
  street: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  email: string | null;
}

// One estate = one marketplace listing. `cornerPremiumPct` is set once per
// estate (a modifier applied to whichever tier a corner plot belongs to), not
// a separate tier and not duplicated per tier.
export interface Estate {
  id: string;
  name: string;
  area: string;
  city: string;
  state: NigerianState;
  description: string;
  amenities: string[];
  imageUrl?: string;
  titleType: TitleType;
  lastVerifiedDate: string;
  priceTiers: PriceTier[];
  cornerPremiumPct: number;
  paymentPlans: PaymentPlanType[];
  intent: ListingIntent;
  publishedDate: string;
}

// v1 scope: every listing is a verified company-tenant estate — `verified` is
// always true here. Independent agent listings aren't in scope yet (their
// verification model is undecided — see landvault-public-marketplace), but
// keeping `seller` as its own type, rather than inlining tenant fields onto
// Estate, is what lets an agent-backed Listing be added later without
// reshaping Estate.
export interface Listing extends Estate {
  seller: Seller;
  verified: true;
}

export interface WishlistItem {
  listingId: string;
  // "primary" | "resale" — a plain string literal here, not an import from
  // marketplaceFeedService.ts, to avoid that file's own import of this one
  // becoming a cycle. Which service to re-fetch from (marketplaceService vs
  // resaleService) is decided by this field on the Wishlist page.
  listingType: "primary" | "resale";
  savedAt: string;
  // Historical marker ONLY, for the price-change delta indicator on the
  // Wishlist page. Never used to render "the price" — that's always read
  // live via fetchListingById (or resaleService's, for a resale item). This
  // is what "never snapshot the price" and "show a delta since saved" both
  // mean at once: one number remembered purely for comparison, not display.
  priceAtSave: number;
}

export interface ListingFilters {
  query?: string;
  state?: NigerianState;
  minPrice?: number;
  maxPrice?: number;
  minSize?: number;
  maxSize?: number;
  titleType?: TitleType;
  paymentPlan?: PaymentPlanType;
  intent?: ListingIntent;
  verifiedOnly?: boolean;
  sort?: "newest" | "price_low" | "price_per_sqm" | "plots_remaining";
}

// ─── Derived/computed helpers — never stored ────────────────────────────────

export function nonSoldOutTiers(listing: Pick<Estate, "priceTiers">): PriceTier[] {
  return listing.priceTiers.filter((t) => t.availability !== "sold_out");
}

// Card "from" price — lowest available tier, falling back to the cheapest
// tier overall if every tier happens to be sold out.
export function fromPrice(listing: Pick<Estate, "priceTiers">): number {
  const candidates = nonSoldOutTiers(listing);
  const pool = candidates.length > 0 ? candidates : listing.priceTiers;
  return Math.min(...pool.map((t) => t.price));
}

export function cheapestTier(listing: Pick<Estate, "priceTiers">): PriceTier {
  const candidates = nonSoldOutTiers(listing);
  const pool = candidates.length > 0 ? candidates : listing.priceTiers;
  return pool.reduce((min, t) => (t.price < min.price ? t : min), pool[0]);
}

export function pricePerSqm(tier: PriceTier): number {
  return tier.price / tier.sizeSqm; // off the nominal size, per spec
}

export function cornerPrice(tier: PriceTier, listing: Pick<Estate, "cornerPremiumPct">): number {
  return tier.price * (1 + listing.cornerPremiumPct / 100);
}

// ─── Projection ──────────────────────────────────────────────────────────────
//
// The one function that turns a canonical Estate into a public Listing.
// Sellers reuse the tenant hierarchy already seeded in tenantsService.ts
// (Estintin Group's branches, plus Crestview Homes). Returns null — never a
// listing with placeholder/guessed fields — when the estate isn't actually
// publishable, so callers just filter out nulls rather than branch on a
// "is this real" flag.
//
// The publication gate — ALL FOUR must hold:
//   1. estate.published === true (the estate's own opt-in switch)
//   2. the owning tenant's verificationState === "verified"
//   3. the owning tenant's entitlements.marketplacePublishing === true
//   4. the owning tenant's status !== "suspended"
// This is what finally expresses in code why Citadel Homes (not yet
// verified) and Northbridge Estates (verified but suspended) don't appear
// publicly — previously only explained in a comment, now an actual runtime
// check with a tenant lookup behind it.
export function projectListing(estate: MockEstate): Listing | null {
  const tenant = fetchTenantByIdSync(estate.tenantId);
  // A company-level estate has no branch, and is listed under the company.
  const branch = estate.branchId ? tenant?.branches.find((b) => b.id === estate.branchId) : undefined;
  if (!estate.published) return null;
  if (!tenant || (estate.branchId && !branch)) return null;
  if (tenant.verificationState !== "verified") return null;
  if (!tenant.entitlements.marketplacePublishing) return null;
  if (tenant.status === "suspended") return null;

  return {
    id: estate.id,
    name: estate.name,
    area: estate.area,
    city: estate.city,
    state: estate.state,
    description: estate.description,
    amenities: estate.amenities,
    imageUrl: estate.imageUrl,
    titleType: estate.titleType,
    lastVerifiedDate: estate.lastVerified,
    priceTiers: tiersFromPlots(estate),
    cornerPremiumPct: estate.cornerPremiumPct,
    paymentPlans: estate.paymentPlans,
    intent: estate.intent,
    publishedDate: estate.publishedDate,
    // No office in mock data: none was ever recorded, and none is invented.
    seller: { branchName: branch?.name ?? null, companyName: tenantDisplayName(tenant), office: null },
    verified: true,
  };
}

function publishedListings(): Listing[] {
  return ESTATES.map(projectListing).filter((l): l is Listing => l !== null);
}

// ─── Service functions ───────────────────────────────────────────────────────

// ─── The live backend: GET /api/marketplace/estates ─────────────────────────
//
// MarketplaceListingDto, mapped onto this app's Listing. Field by field — a
// cast would compile and read `undefined` for anything the two don't share.

interface ListingTierDto {
  id: string;
  sizeSqm: number | null;
  actualAreaSqm: number | null;
  label: string | null;
  price: number;
  currency: string;
  pricePerSqm: number | null;
  availability: TierAvailability;
  plotsRemaining: number;
  commitment: unknown;
}

export interface ListingDto {
  id: string;
  name: string;
  area: string | null;
  city: string | null;
  state: string;
  description: string | null;
  amenities: string[] | null;
  imageUrl: string | null;
  titleType: string | null;
  lastVerifiedDate: string | null;
  priceTiers: ListingTierDto[];
  cornerPremiumPct: number | null;
  intent: string | null;
  publishedDate: string | null;
  seller: { branchName: string | null; companyName: string; office: BranchOffice | null };
  verified: boolean;
  fromPrice: number | null;
  fromPriceCurrency: string | null;
  plotsRemaining: number;
  hasMap: boolean;
  verificationChecks: unknown[] | null;
  costDisclosure: unknown;
}

// The raw responses, by estate id — so the cost disclosure (embedded in every
// listing) is read from what's already loaded instead of fetching per card.
const listingDtoCache = new Map<string, ListingDto>();

// The backend accepts every plan for every estate (CreateTransactionRequest
// validates the plan, not per-estate availability), so a live listing offers
// all three — what the backend actually allows, not an invented restriction.
const ALL_PLANS: PaymentPlanType[] = ["outright", "installment", "milestone"];

function fromListingDto(dto: ListingDto): Listing {
  listingDtoCache.set(dto.id, dto);
  return {
    id: dto.id,
    name: dto.name,
    area: dto.area ?? "",
    city: dto.city ?? "",
    state: dto.state as NigerianState,
    description: dto.description ?? "",
    amenities: dto.amenities ?? [],
    imageUrl: dto.imageUrl ?? undefined,
    titleType: (dto.titleType ?? "Gazette") as TitleType,
    lastVerifiedDate: dto.lastVerifiedDate ?? "",
    // A unit-type tier has no size of its own; 0 here is "no size", never a
    // figure to compute with (see INTEGRATION_TESTING.md, known limits).
    priceTiers: dto.priceTiers.map((t) => ({
      id: t.id, sizeSqm: t.sizeSqm ?? 0, actualAreaSqm: t.actualAreaSqm ?? t.sizeSqm ?? 0, price: t.price,
      availability: t.availability, plotsRemaining: t.plotsRemaining, currency: t.currency,
    })),
    cornerPremiumPct: dto.cornerPremiumPct ?? 0,
    paymentPlans: ALL_PLANS,
    intent: (dto.intent === "investment" ? "investment" : dto.intent === "both" ? "both" : "development"),
    publishedDate: dto.publishedDate ?? "",
    seller: { branchName: dto.seller.branchName, companyName: dto.seller.companyName, office: dto.seller.office },
    verified: true,
  };
}

/** The raw listing — for the cost disclosure, which the backend embeds in it. */
export async function fetchListingDto(id: string): Promise<ListingDto | null> {
  const cached = listingDtoCache.get(id);
  if (cached) return cached;
  const dto = await nullIfNotFound(apiClient.get<ListingDto>(`/api/marketplace/estates/${id}`));
  if (dto) listingDtoCache.set(id, dto);
  return dto;
}

function liveQuery(filters: ListingFilters, params: PageParams): string {
  const qp = new URLSearchParams();
  // The backend's parameter names. `paymentPlan` and `verifiedOnly` have no
  // backend filter: every listing is verified and accepts every plan.
  if (filters.query) qp.set("q", filters.query);
  if (filters.state) qp.set("state", filters.state);
  if (filters.minPrice !== undefined) qp.set("minPrice", String(filters.minPrice));
  if (filters.maxPrice !== undefined) qp.set("maxPrice", String(filters.maxPrice));
  if (filters.minSize !== undefined) qp.set("minSize", String(filters.minSize));
  if (filters.maxSize !== undefined) qp.set("maxSize", String(filters.maxSize));
  if (filters.titleType) qp.set("titleType", filters.titleType);
  if (filters.intent) qp.set("intent", filters.intent);
  if (filters.sort) qp.set("sort", filters.sort);
  if (params.limit) qp.set("limit", String(params.limit));
  if (params.cursor) qp.set("cursor", params.cursor);
  return qp.toString();
}

export async function fetchListings(filters: ListingFilters = {}, params: PageParams = {}): Promise<Page<Listing>> {
  if (!isMock("marketplace")) {
    const page = await apiClient.get<{ items: ListingDto[]; total: number; cursor: string | null; hasMore: boolean }>(
      `/api/marketplace/estates?${liveQuery(filters, params)}`);
    return { items: page.items.map(fromListingDto), total: page.total, cursor: page.cursor ?? undefined, hasMore: page.hasMore };
  }

  let results = publishedListings();

  if (filters.query) {
    const q = filters.query.toLowerCase();
    results = results.filter((l) => l.name.toLowerCase().includes(q) || l.area.toLowerCase().includes(q) || l.city.toLowerCase().includes(q) || l.state.toLowerCase().includes(q));
  }
  if (filters.state) results = results.filter((l) => l.state === filters.state);
  if (filters.titleType) results = results.filter((l) => l.titleType === filters.titleType);
  if (filters.paymentPlan) results = results.filter((l) => l.paymentPlans.includes(filters.paymentPlan!));
  if (filters.intent) results = results.filter((l) => l.intent === filters.intent || l.intent === "both");
  if (filters.verifiedOnly) results = results.filter((l) => l.verified);
  if (filters.minPrice !== undefined) results = results.filter((l) => fromPrice(l) >= filters.minPrice!);
  if (filters.maxPrice !== undefined) results = results.filter((l) => fromPrice(l) <= filters.maxPrice!);
  if (filters.minSize !== undefined) results = results.filter((l) => l.priceTiers.some((t) => t.sizeSqm >= filters.minSize!));
  if (filters.maxSize !== undefined) results = results.filter((l) => l.priceTiers.some((t) => t.sizeSqm <= filters.maxSize!));

  switch (filters.sort) {
    case "price_low": results.sort((a, b) => fromPrice(a) - fromPrice(b)); break;
    case "price_per_sqm": results.sort((a, b) => pricePerSqm(cheapestTier(a)) - pricePerSqm(cheapestTier(b))); break;
    case "plots_remaining": results.sort((a, b) => b.priceTiers.reduce((s, t) => s + t.plotsRemaining, 0) - a.priceTiers.reduce((s, t) => s + t.plotsRemaining, 0)); break;
    case "newest": default: results.sort((a, b) => (a.publishedDate < b.publishedDate ? 1 : -1)); break;
  }

  return paginateMock(results, params);
}

export async function fetchListingById(id: string): Promise<Listing | undefined> {
  if (!isMock("marketplace")) {
    // Always fresh for a detail view; only a 404 means "not listed".
    const dto = await nullIfNotFound(apiClient.get<ListingDto>(`/api/marketplace/estates/${id}`));
    return dto ? fromListingDto(dto) : undefined;
  }
  const estate = ESTATES.find((e) => e.id === id);
  return estate ? (projectListing(estate) ?? undefined) : undefined;
}

// TODO (backend): this should be a PostGIS radius query against the estate's
// coordinates, not a text match on state — see landvault-public-marketplace.
export async function fetchSimilarListings(id: string, limit = 3): Promise<Listing[]> {
  if (!isMock("marketplace")) {
    // No /similar on the backend: other listings in the same state, from the
    // feed itself — a selection, nothing computed.
    const current = await fetchListingById(id);
    if (!current) return [];
    const page = await fetchListings({ state: current.state }, { limit: limit + 1 });
    return page.items.filter((l) => l.id !== id).slice(0, limit);
  }
  const current = ESTATES.find((e) => e.id === id);
  if (!current) return [];
  return publishedListings().filter((l) => l.id !== id && l.state === current.state).slice(0, limit);
}
