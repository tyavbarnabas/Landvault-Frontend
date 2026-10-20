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
import { mockListingPhotos } from "../data/mockEstatePhotos";
import { mockListingTitle } from "../data/mockEstateTitles";
import { tiersFromPlots, type PriceTier, type TierAvailability } from "./estatesService";
import { fetchTenantByIdSync, tenantDisplayName } from "./tenantsService";

// PriceTier/TierAvailability are defined once, in estatesService.ts (the
// function that actually derives tiers from real plot data) — re-exported
// here so every existing marketplace-side import keeps working unchanged.
// See landvault-catalogue-unification-plan in project memory: "one canonical
// PriceTier," not two structurally-identical interfaces with different names.
export type { PriceTier, TierAvailability };

export type TitleType = "C of O" | "R of O" | "Governor's Consent" | "Gazette";
export type ListingTitleStatus = "pending" | "verified" | "rejected";
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
  // Null when no title is recorded. Never shown without titleStatus: a
  // declared title isn't a checked one.
  titleType: TitleType | null;
  // The developer declares the title; only HomeTrue verifies it. Null with
  // no title.
  titleStatus: ListingTitleStatus | null;
  // When HomeTrue verified it. Null unless titleStatus is "verified".
  titleVerifiedAt: string | null;
  // Null when the land hasn't been checked. Distinct from `verified`, which
  // is about the DEVELOPER COMPANY, not the land.
  lastVerifiedDate: string | null;
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
  // The estate's own photos, cover first, then in the developer's order.
  // `imageUrl` is the cover's. Both empty for an estate listed before photos
  // were required: show a placeholder, never a stock photo as the estate.
  photos: ListingPhoto[];
}

// The caption is the alt text; fall back to the estate name when it's null.
export interface ListingPhoto {
  url: string;
  caption: string | null;
}

// One saved listing, as the backend's wishlist returns it
// (/api/marketplace/wishlist; see wishlistService.ts). Enough to render the
// wishlist on its own: the name, today's from-price and what's left.
export interface WishlistItem {
  // "primary" | "resale" — a plain string literal here, not an import from
  // marketplaceFeedService.ts, to avoid that file's own import of this one
  // becoming a cycle. The backend accepts "primary" only until resale exists.
  listingType: "primary" | "resale";
  listingId: string;
  // The current name while listed; the name when saved once it isn't.
  name: string;
  savedAt: string;
  // A marker ONLY, for "↓ ₦1.0M since saved" — never rendered as the price.
  // Compared with currentPrice only when the two currencies match.
  priceAtSave: number | null;
  currency: "NGN" | "USD" | null;
  // On the marketplace now. False never says why.
  available: boolean;
  currentPrice: number | null;
  currentCurrency: "NGN" | "USD" | null;
  // 0 = listed but sold out; null when not available.
  plotsRemaining: number | null;
}

// The change since it was saved, or null when there's nothing comparable:
// no price either side, or the cheapest price is now in another currency.
export function priceChangeSinceSaved(item: WishlistItem): number | null {
  if (item.priceAtSave === null || item.currentPrice === null) return null;
  if (!item.currency || item.currency !== item.currentCurrency) return null;
  return item.currentPrice - item.priceAtSave;
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

// What a buyer reads about the LAND. `verified` on a listing is about the
// developer company; these say plainly when the land has nothing recorded or
// checked, so an absence can never read as a clean bill of health.
// The developer declares a title and HomeTrue verifies it, so a type alone is
// "declared" (also what an unknown status means), and only HomeTrue's
// verification drops the qualifier. `long` adds the date, for detail pages.
export function titleLabel(
  titleType: TitleType | null | undefined,
  titleStatus?: ListingTitleStatus | null,
  verifiedAt?: string | null,
  long = false,
): string {
  if (!titleType) return "Title not recorded";
  if (titleStatus === "verified") {
    const on = long && verifiedAt ? ` on ${new Date(verifiedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : "";
    return `${titleType}, verified by HomeTrue${on}`;
  }
  if (titleStatus === "rejected") return `${titleType} (declared, not confirmed)`;
  return `${titleType} (declared)`;
}

export function isTitleVerified(listing: Pick<Estate, "titleType" | "titleStatus">): boolean {
  return !!listing.titleType && listing.titleStatus === "verified";
}

// The marketplace's title filter: "C of O" means a C of O HomeTrue has
// verified, never one only declared by the developer.
export function matchesTitleFilter(listing: Pick<Estate, "titleType" | "titleStatus">, titleType: TitleType): boolean {
  return listing.titleType === titleType && isTitleVerified(listing);
}

// "Mowe, Ogun" — the estate's area, city and state with repeats dropped
// (an estate whose city and state share a name would otherwise read
// "Mowe, Ogun, Ogun"), and blanks skipped.
export function listingPlace(listing: Pick<Estate, "area" | "city" | "state">): string {
  const parts: string[] = [];
  for (const part of [listing.area, listing.city, listing.state]) {
    const p = part?.trim();
    if (p && !parts.some((q) => q.toLowerCase() === p.toLowerCase())) parts.push(p);
  }
  return parts.join(", ");
}

export function landCheckLabel(lastVerifiedDate: string | null | undefined): string {
  return lastVerifiedDate ? `Land checked ${lastVerifiedDate}` : "Land not checked yet";
}

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

  const photos = mockListingPhotos(estate.id);
  const title = mockListingTitle(estate.id);
  return {
    id: estate.id,
    name: estate.name,
    area: estate.area,
    city: estate.city,
    state: estate.state,
    description: estate.description,
    amenities: estate.amenities,
    // The cover, as the backend sends it — so a cover chosen in the portal shows here.
    imageUrl: photos[0]?.url,
    // From the title record, never the demo estate's own field: an estate
    // created in the portal has no title until one is declared.
    ...title,
    lastVerifiedDate: [estate.lastVerified, title.titleVerifiedAt?.slice(0, 10)].filter(Boolean).sort().pop() ?? null,
    priceTiers: tiersFromPlots(estate),
    cornerPremiumPct: estate.cornerPremiumPct,
    paymentPlans: estate.paymentPlans,
    intent: estate.intent,
    publishedDate: estate.publishedDate,
    // No office in mock data: none was ever recorded, and none is invented.
    seller: { branchName: branch?.name ?? null, companyName: tenantDisplayName(tenant), office: null },
    verified: true,
    photos,
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
  photos: ListingPhoto[] | null;
  titleType: string | null;
  titleStatus?: string | null;
  titleVerifiedAt?: string | null;
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
    // Null means nothing is recorded — never filled in with a plausible title.
    titleType: (dto.titleType ?? null) as TitleType | null,
    // Anything but a known value reads as declared, never as verified.
    titleStatus: dto.titleType ? (dto.titleStatus === "verified" || dto.titleStatus === "rejected" ? dto.titleStatus : "pending") : null,
    titleVerifiedAt: dto.titleStatus === "verified" ? dto.titleVerifiedAt ?? null : null,
    lastVerifiedDate: dto.lastVerifiedDate,
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
    photos: dto.photos ?? [],
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
    let items = page.items.map(fromListingDto);
    // The backend matches the title type only, declared or verified; until it
    // filters by status too, the declared ones are taken out here.
    const titleType = filters.titleType;
    if (titleType) items = items.filter((l) => matchesTitleFilter(l, titleType));
    return { items, total: page.total - (page.items.length - items.length), cursor: page.cursor ?? undefined, hasMore: page.hasMore };
  }

  let results = publishedListings();

  if (filters.query) {
    const q = filters.query.toLowerCase();
    results = results.filter((l) => l.name.toLowerCase().includes(q) || l.area.toLowerCase().includes(q) || l.city.toLowerCase().includes(q) || l.state.toLowerCase().includes(q));
  }
  if (filters.state) results = results.filter((l) => l.state === filters.state);
  if (filters.titleType) results = results.filter((l) => matchesTitleFilter(l, filters.titleType!));
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
