// Backend integration seam for the developer portal's estate management.
// See INTEGRATION.md.
//
// Reads the ONE canonical estate source (mockData.ts's ESTATES — see
// landvault-catalogue-unification-plan in project memory) rather than opening
// a parallel portal-only fixture set. A company's portal and the public
// marketplace must be looking at the same estates, or publication state and
// conflicts will disagree between the two surfaces.
//
// SCOPING: branch/tenant filtering is enforced server-side by RLS. The real
// endpoint derives scope from the JWT's tenant and branch claims; the
// `scope` argument below exists only so mock mode can stand in for that. No
// page ever filters the returned list again, and nothing here can widen a
// scope — a caller that passes a branch gets that branch.

import { ESTATES, type Estate, type GeoPoint } from "../data/mockData";
import { polygonAreaSqm, polygonOverlap } from "../lib/geometry";
import { apiClient, ApiError } from "../lib/apiClient";
import { paginateMock, type Page, type PageParams } from "../lib/pagination";
import { fetchTenantByIdSync } from "./tenantsService";
import { fetchConflicts, redetectMockConflictsForEstate } from "./listingConflictsService";
import type { ConflictChanges } from "./conflictChanges";
import { fetchCostDisclosure, isGrandfathered } from "./costDisclosureService";
import { mockHasDeclaredFees, mockHasDeclaredRefundTerms } from "./estateDisclosureService";
import type { NigerianState } from "../data/nigerianStates";

// ─── GeoJSON ─────────────────────────────────────────────────────────────────
// Coordinates are [lng, lat] — GeoJSON's own order, and the order the backend
// expects. Nothing in this app converts that by hand: Leaflet's <GeoJSON>
// component does it internally, which is precisely why EstateBoundaryMap uses
// it instead of building polygons from raw pairs.

export type GeoJsonPosition = [number, number];

export interface GeoJsonPolygon {
  type: "Polygon";
  coordinates: GeoJsonPosition[][];
}

export interface GeoJsonFeature {
  type: "Feature";
  geometry: GeoJsonPolygon;
  properties: Record<string, unknown>;
}

export interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
}

// Real continental bounds of Nigeria. The latitude and longitude ranges
// OVERLAP between 4 and 14, which is why this check alone cannot catch a
// transposed boundary inside the country — swap Abuja's 9.05/7.49 and you get
// a point that is still in Nigeria, just in the wrong state. That is the whole
// reason DP-6 renders the boundary on a map, and the reason the backend makes
// `state` required so it can narrow the check per state.
const NIGERIA_BOUNDS = { minLat: 4.0, maxLat: 14.0, minLng: 2.6, maxLng: 14.7 };

// The downloadable boundary template: a real boundary in Gwarinpa, Abuja.
// Handing a developer a working file to edit beats explaining GeoJSON
// structure — and these are the coordinates known to work end to end, so the
// template, the "use the example" button and the tests all reference one
// value. No commented-out fields or placeholders: edited, it produces a valid
// estate; it can't produce a half-filled one.
//
// Lives here rather than beside the form because the tests need it without
// pulling Leaflet (and therefore `window`) into a Node test run.
export const BOUNDARY_TEMPLATE_JSON = `{
  "type": "Polygon",
  "coordinates": [
    [
      [7.4140, 9.1070],
      [7.4195, 9.1070],
      [7.4195, 9.1115],
      [7.4140, 9.1115],
      [7.4140, 9.1070]
    ]
  ]
}`;

export interface BoundaryValidationError {
  message: string;
  // The likely-transposed case gets its own flag so the UI can lead with the
  // swap explanation rather than burying it in a generic bounds message.
  likelyTransposed: boolean;
}

export interface ParsedBoundary {
  polygon: GeoJsonPolygon;
  // True when every coordinate would ALSO be a valid Nigerian position with
  // latitude and longitude swapped — which, given the 4-to-14 overlap in the
  // country's own ranges, is most of Nigeria. It is NOT an error: a correct
  // boundary usually sets this too. It is the cue to say "confirm on the map",
  // because no automated check can separate the two cases without knowing
  // which state the estate is in.
  coordinatesAmbiguous: boolean;
}

// Mirrors the backend's own validation so a developer sees the problem before
// a round trip, not so the frontend becomes the authority: the backend still
// re-validates and is the one that rejects.
export function parseBoundary(text: string): ParsedBoundary | { error: BoundaryValidationError } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: { message: "That isn't valid JSON. Paste the GeoJSON exactly as your surveyor exported it.", likelyTransposed: false } };
  }

  // Accept a bare Polygon, or a Feature / single-feature FeatureCollection
  // wrapping one, because a one-polygon export from QGIS is a FeatureCollection
  // and rejecting it would be user-hostile. A collection of MANY features is a
  // different thing entirely — almost certainly a plots file — and says so.
  const extracted = extractPolygon(parsed);
  if ("error" in extracted) return extracted;
  const geometry = extracted.polygon;

  const ring = geometry.coordinates[0];
  if (!ring || ring.length < 4) {
    return { error: { message: "A boundary needs at least three distinct corners.", likelyTransposed: false } };
  }

  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    return { error: { message: "The boundary ring isn't closed — its last coordinate must repeat its first.", likelyTransposed: false } };
  }

  const outside = ring.filter(([lng, lat]) =>
    lat < NIGERIA_BOUNDS.minLat || lat > NIGERIA_BOUNDS.maxLat || lng < NIGERIA_BOUNDS.minLng || lng > NIGERIA_BOUNDS.maxLng);

  if (outside.length > 0) {
    // Would every offending pair land inside Nigeria if read the other way
    // round? Then this is almost certainly [lat, lng] data, and saying so is
    // far more useful than reporting a bounds failure.
    const transposed = outside.every(([lng, lat]) =>
      lng >= NIGERIA_BOUNDS.minLat && lng <= NIGERIA_BOUNDS.maxLat && lat >= NIGERIA_BOUNDS.minLng && lat <= NIGERIA_BOUNDS.maxLng);

    return {
      error: {
        likelyTransposed: transposed,
        message: transposed
          ? "These coordinates fall outside Nigeria, but they would be inside it if read the other way round — check whether latitude and longitude have been swapped. GeoJSON expects [longitude, latitude]."
          : "These coordinates fall outside Nigeria. Check whether latitude and longitude have been swapped, and that the file is in WGS 84 (EPSG:4326) rather than a projected grid.",
      },
    };
  }

  const coordinatesAmbiguous = ring.every(([lng, lat]) =>
    lat >= NIGERIA_BOUNDS.minLng && lat <= NIGERIA_BOUNDS.maxLng && lng >= NIGERIA_BOUNDS.minLat && lng <= NIGERIA_BOUNDS.maxLat);

  return { polygon: geometry, coordinatesAmbiguous };
}

function extractPolygon(value: unknown): { polygon: GeoJsonPolygon } | { error: BoundaryValidationError } {
  const notPolygon = (found: string): { error: BoundaryValidationError } => ({
    error: { message: `An estate boundary must be a GeoJSON Polygon — this file contains ${found}.`, likelyTransposed: false },
  });

  if (!value || typeof value !== "object") return notPolygon("no GeoJSON object");
  const node = value as Record<string, unknown>;

  if (node.type === "Polygon" && Array.isArray(node.coordinates)) {
    return { polygon: node as unknown as GeoJsonPolygon };
  }
  if (node.type === "Feature") return extractPolygon(node.geometry);

  if (node.type === "FeatureCollection" && Array.isArray(node.features)) {
    const polygons = node.features.filter((f) => "polygon" in extractPolygon(f));
    if (polygons.length === 1) return extractPolygon(polygons[0]);
    if (polygons.length > 1) {
      // The likely mistake once plot import exists: the plots file, uploaded
      // into the boundary field.
      return {
        error: {
          likelyTransposed: false,
          message: `This file contains ${polygons.length} polygons. An estate boundary is a single Polygon — if this is your plot layout, it belongs in plot import rather than here.`,
        },
      };
    }
    return notPolygon("a FeatureCollection with no polygons in it");
  }

  return notPolygon(typeof node.type === "string" ? `a ${node.type}` : "no recognisable geometry");
}

// Converts a parsed boundary to the app's GeoPoint shape and measures it. The
// figure is a client-side sanity aid computed before anything is saved — the
// backend is still the authority on a stored estate's area.
export function boundaryAreaSqm(polygon: GeoJsonPolygon): number {
  return polygonAreaSqm(polygon.coordinates[0].map(([lng, lat]) => ({ lat, lng })));
}

function footprintToPolygon(footprint: GeoPoint[]): GeoJsonPolygon {
  const ring: GeoJsonPosition[] = footprint.map((p) => [p.lng, p.lat]);
  // Close the ring if the stored footprint doesn't already repeat its first
  // point — GeoJSON requires it, mockData's rectFootprint doesn't store it.
  const [firstLng, firstLat] = ring[0];
  const [lastLng, lastLat] = ring[ring.length - 1];
  if (firstLng !== lastLng || firstLat !== lastLat) ring.push([firstLng, firstLat]);
  return { type: "Polygon", coordinates: [ring] };
}

// ─── Publication eligibility ────────────────────────────────────────────────

// Mirrors the backend's `EstateEligibilityDto` field for field — TEN
// booleans, carried on `EstateDetailDto.eligibility`. Every one is a fact the
// server computed; none is inferred here.
//
// `noBlockingConflict` is explicit. An earlier version of this type had seven
// fields and inferred a conflict from "every named condition passes but
// `eligible` is false" — correct until the day a ninth condition is added and
// not exposed, when it would silently tell a developer the wrong reason.
//
// Grandfathered estates report TRUE for both declaration conditions.
export interface EstateEligibility {
  // Intent: the developer's own switch. Not the same as being live.
  published: boolean;
  tenantVerified: boolean;
  tenantEntitled: boolean;
  tenantActive: boolean;
  feesDeclared: boolean;
  refundTermsDeclared: boolean;
  // BG-1: no boundary, no listing — and no grandfathering. Without one the
  // estate can't be compared against neighbouring land, so "no conflict"
  // would be an absence of evidence.
  hasBoundary: boolean;
  // Changeset 063: at least one live plot (ANY status, not an available one —
  // a sold-out estate stays listed). All-withdrawn counts as none.
  hasPlots: boolean;
  noBlockingConflict: boolean;
  // Current state: the conjunction of all of the above, and exactly what the
  // public feed filters on at read time.
  eligible: boolean;
}

export type EligibilityConditionKey = keyof Omit<EstateEligibility, "eligible" | "published">;

// "published_not_live": the flag is set but a condition has lapsed — a
// suspension, a new HIGH conflict — so the listing is off the marketplace
// without having been unpublished. It returns by itself once the condition
// clears, because the flag was never touched.
export type PortalEstateStatus = "draft" | "ready_to_publish" | "published" | "published_not_live" | "blocked" | "unknown";

// Each condition the backend checks before listing, in the order a developer
// meets them, with copy they can act on. `published` is not among them — it is
// the developer's intent, not a condition — and is rendered separately.
export const ELIGIBILITY_CONDITIONS: { key: EligibilityConditionKey; label: string; reason: string }[] = [
  { key: "tenantVerified", label: "Company verification complete", reason: "Your company's verification isn't complete yet" },
  { key: "tenantEntitled", label: "Marketplace publishing enabled on your plan", reason: "Marketplace publishing isn't enabled on your company's plan" },
  { key: "tenantActive", label: "Company account active", reason: "Your company's account isn't active right now" },
  { key: "feesDeclared", label: "Fee schedule declared", reason: "The fee schedule hasn't been declared" },
  { key: "refundTermsDeclared", label: "Refund terms declared", reason: "Refund terms haven't been declared" },
  // The backend's order: boundary, then plots, then the conflict check the
  // boundary makes meaningful.
  { key: "hasBoundary", label: "Estate boundary added", reason: "This estate has no boundary, so it can't be checked against neighbouring land" },
  { key: "hasPlots", label: "At least one plot added", reason: "This estate has no plots for buyers to choose from" },
  // Never names the other party. Both sides of a boundary dispute believe
  // they are right, and the platform does not introduce them.
  { key: "noBlockingConflict", label: "No unresolved boundary conflict", reason: "This estate's boundary overlaps another registered boundary" },
];

// Conditions outside the company's immediate control.
const HARD_BLOCKER_KEYS: EligibilityConditionKey[] = ["tenantVerified", "tenantEntitled", "tenantActive", "noBlockingConflict"];
// Setup the company still has to finish itself.
const OUTSTANDING_SETUP_KEYS: EligibilityConditionKey[] = ["feesDeclared", "refundTermsDeclared", "hasBoundary", "hasPlots"];

export function conflictIsBlocking(eligibility: EstateEligibility): boolean {
  return !eligibility.noBlockingConflict;
}

export function blockingReasonsFor(eligibility: EstateEligibility): string[] {
  return ELIGIBILITY_CONDITIONS.filter((c) => !eligibility[c.key]).map((c) => c.reason);
}

// "unknown" when the backend didn't tell us — a list row, whose
// EstateSummaryDto carries no eligibility. An unknown condition is never
// reported as met.
export function statusFor(eligibility: EstateEligibility | null, hasBoundary: boolean): PortalEstateStatus {
  if (!eligibility) return "unknown";
  if (eligibility.published) return eligibility.eligible ? "published" : "published_not_live";
  if (HARD_BLOCKER_KEYS.some((k) => !eligibility[k])) return "blocked";
  // `hasBoundary` is now a server-reported condition (in OUTSTANDING_SETUP_KEYS);
  // the separate flag is kept as a second, equivalent source.
  if (!hasBoundary || OUTSTANDING_SETUP_KEYS.some((k) => !eligibility[k])) return "draft";
  return "ready_to_publish";
}

// ─── Publication ─────────────────────────────────────────────────────────────

// The codes the backend's PublicationRefused carries, each mapped to the
// condition it names.
export const PUBLICATION_REFUSAL_CONDITIONS: Record<string, EligibilityConditionKey> = {
  PUBLICATION_VERIFICATION_PENDING: "tenantVerified",
  PUBLICATION_ENTITLEMENT_MISSING: "tenantEntitled",
  PUBLICATION_TENANT_NOT_ACTIVE: "tenantActive",
  PUBLICATION_FEES_UNDECLARED: "feesDeclared",
  PUBLICATION_REFUND_TERMS_UNDECLARED: "refundTermsDeclared",
  PUBLICATION_BOUNDARY_MISSING: "hasBoundary",
  PUBLICATION_NO_PLOTS: "hasPlots",
  PUBLICATION_CONFLICT_OUTSTANDING: "noBlockingConflict",
};

// PublicationDto.
export interface PublicationResult {
  estateId: string;
  published: boolean;
  publishedAt: string | null;
  // MEDIUM conflicts: one company's own boundaries overlapping. These don't
  // refuse publication, but the developer should be told. Always 0/null on
  // unpublish.
  warningConflictCount: number;
  warning: string | null;
}

export interface PublicationRefusal {
  code: string;
  // The condition the code names, so the readiness panel can mark that row.
  condition: EligibilityConditionKey;
  // The backend's `message` names EVERY failing condition, while `code` names
  // only the first — so the message is shown in full, never replaced.
  message: string;
}

export function refusalFromError(error: unknown): PublicationRefusal | null {
  const body = (error as { body?: { code?: string; message?: string } } | undefined)?.body;
  if (!body?.code || !(body.code in PUBLICATION_REFUSAL_CONDITIONS)) return null;
  const condition = PUBLICATION_REFUSAL_CONDITIONS[body.code];
  return {
    code: body.code,
    condition,
    message: body.message ?? ELIGIBILITY_CONDITIONS.find((c) => c.key === condition)!.reason,
  };
}

// PB-1. One deliberate action; never a side effect of creating or editing.
// Re-publishing an already-published estate re-checks every condition, which
// is how a developer finds out why a published estate isn't live.
export async function publishEstate(id: string, scope: PortalScope): Promise<PublicationResult> {
  if (!apiClient.isMockMode) return apiClient.post<PublicationResult>(`/api/portal/estates/${id}/publish`);

  const estate = ownedMockEstate(id, scope);
  const eligibility = (await projectPortalEstate(estate)).eligibility!;
  // The same order as PortalEstateService.requirePublishable: `code` is the
  // first failure, the message names all of them.
  const failing = ELIGIBILITY_CONDITIONS.filter((c) => !eligibility[c.key]);
  if (failing.length > 0) {
    const code = Object.keys(PUBLICATION_REFUSAL_CONDITIONS).find((k) => PUBLICATION_REFUSAL_CONDITIONS[k] === failing[0].key)!;
    const message = failing.map((c) => `${c.reason}.`).join(" ");
    throw new ApiError(409, message, { code, message });
  }
  if (!estate.published) {
    estate.published = true;
    estate.publishedDate = new Date().toISOString().slice(0, 10);
  }
  return { estateId: id, published: true, publishedAt: estate.publishedDate, warningConflictCount: 0, warning: null };
}

// PB-4. Only the flag changes; the estate and its plots are untouched.
export async function unpublishEstate(id: string, scope: PortalScope): Promise<PublicationResult> {
  if (!apiClient.isMockMode) return apiClient.post<PublicationResult>(`/api/portal/estates/${id}/unpublish`);

  const estate = ownedMockEstate(id, scope);
  estate.published = false;
  return { estateId: id, published: false, publishedAt: null, warningConflictCount: 0, warning: null };
}

function ownedMockEstate(id: string, scope: PortalScope): Estate {
  const estate = mockStore().find((e) => e.id === id);
  // Standing in for RLS: a branch-scoped caller reaches their own branch's
  // estates and the company-level ones (EB-2), never another branch's.
  if (!estate || estate.tenantId !== scope.tenantId || (scope.branchId && estate.branchId !== null && estate.branchId !== scope.branchId)) {
    throw new ApiError(404, "Estate not found.", { code: "ESTATE_NOT_FOUND", message: "Estate not found." });
  }
  return estate;
}

// ─── The portal's estate row ─────────────────────────────────────────────────

// What the estate is sold FOR — the backend's `intent` on EstateDto.
export type EstateIntent = "development" | "investment";

export interface PortalEstate {
  // A UUID from the backend. `slug` is a separate field — never the id, so
  // nothing may route on a name-derived string.
  id: string;
  slug: string;
  name: string;
  description: string;
  area: string;
  city: string;
  state: NigerianState;
  // Null = a company-level estate (EB-1), belonging to the organisation
  // directly. Branch staff can SEE such an estate but not change it (EB-2).
  branchId: string | null;
  tenantId: string;
  cornerPremiumPct: number;
  amenities: string[];
  // Both editable through PUT /api/portal/estates/{id}.
  address: string;
  intent: EstateIntent;
  titleType: Estate["titleType"];
  titleVerified: boolean;
  // Counts and prices arrive computed — the portal displays them, it never
  // recounts a plot grid or re-derives a price range.
  totalPlots: number;
  availablePlots: number;
  soldPlots: number;
  reservedPlots: number;
  priceFrom: number;
  priceTo: number;
  currency: "NGN";
  hasBoundary: boolean;
  // From `EstateDetailDto.eligibility`. NULL on a list row: EstateSummaryDto
  // carries no eligibility, so a list can only say "unknown" — never met.
  eligibility: EstateEligibility | null;
  status: PortalEstateStatus;
  blockingReasons: string[];
  publishedDate?: string;
}

// ─── Wire shapes ─────────────────────────────────────────────────────────────
//
// What the portal endpoints actually return. `PortalEstate` is this app's
// view model; these are the backend's records, mapped onto it below rather
// than cast — a cast would compile and then read `undefined` for every field
// the two shapes don't share.

interface PlotCountsDto {
  total: number;
  byStatus: Partial<Record<string, number>>;
}

interface EstateSummaryDto {
  id: string;
  branchId: string | null;
  name: string;
  slug: string;
  area: string;
  city: string;
  state: NigerianState;
  intent: string;
  published: boolean;
  publishedAt: string | null;
  hasFootprint: boolean;
  footprintAreaSqm: number | null;
  plotCounts: PlotCountsDto | null;
  createdAt: string;
}

interface EstateDetailDto extends EstateSummaryDto {
  tenantId: string;
  description: string | null;
  address: string | null;
  cornerPremiumPct: number | null;
  amenities: string[] | null;
  priceTiers: { price: number; currency: string }[] | null;
  title: { titleType: Estate["titleType"] } | null;
  verificationChecks: unknown[] | null;
  eligibility: EstateEligibility;
}

function countOf(counts: PlotCountsDto | null, ...statuses: string[]): number {
  return statuses.reduce((n, s) => n + (counts?.byStatus[s] ?? 0), 0);
}

function fromSummaryDto(dto: EstateSummaryDto, tenantId: string, eligibility: EstateEligibility | null): PortalEstate {
  return {
    id: dto.id,
    slug: dto.slug,
    name: dto.name,
    description: "",
    area: dto.area,
    city: dto.city,
    state: dto.state,
    branchId: dto.branchId,
    tenantId,
    cornerPremiumPct: 0,
    amenities: [],
    address: "",
    intent: dto.intent === "investment" ? "investment" : "development",
    titleType: "Gazette",
    titleVerified: false,
    totalPlots: dto.plotCounts?.total ?? 0,
    availablePlots: countOf(dto.plotCounts, "available-dev", "available-inv"),
    soldPlots: countOf(dto.plotCounts, "sold"),
    reservedPlots: countOf(dto.plotCounts, "reserved"),
    // A summary carries no tiers. Zero is what the list already treats as
    // "no price to show" — it hides the range rather than printing ₦0.
    priceFrom: 0,
    priceTo: 0,
    currency: "NGN",
    hasBoundary: dto.hasFootprint,
    eligibility,
    status: statusFor(eligibility, dto.hasFootprint),
    blockingReasons: eligibility ? blockingReasonsFor(eligibility) : [],
    publishedDate: dto.publishedAt ?? undefined,
  };
}

// Selection, not arithmetic: the lowest and highest of the tier prices the
// server returned, in naira only — prices in other currencies are never set
// against them.
function fromDetailDto(dto: EstateDetailDto): PortalEstate {
  const ngnPrices = (dto.priceTiers ?? []).filter((t) => t.currency === "NGN").map((t) => t.price);
  return {
    ...fromSummaryDto(dto, dto.tenantId, dto.eligibility),
    description: dto.description ?? "",
    cornerPremiumPct: dto.cornerPremiumPct ?? 0,
    amenities: dto.amenities ?? [],
    address: dto.address ?? "",
    titleType: dto.title?.titleType ?? "Gazette",
    // Title verification lives in verificationChecks, which this slice does
    // not interpret. Never shown as verified by default.
    titleVerified: false,
    priceFrom: ngnPrices.length ? Math.min(...ngnPrices) : 0,
    priceTo: ngnPrices.length ? Math.max(...ngnPrices) : 0,
  };
}

export interface PortalScope {
  tenantId: string;
  // Null = not branch-scoped (an Executive Director). Ignored in real mode,
  // where the JWT's claims decide.
  branchId?: string | null;
}

export interface PortalEstateFilters {
  query?: string;
  state?: NigerianState;
  city?: string;
  published?: boolean;
  branchId?: string;
}

async function projectPortalEstate(estate: Estate): Promise<PortalEstate> {
  const tenant = fetchTenantByIdSync(estate.tenantId);
  const [conflicts, disclosure] = await Promise.all([
    fetchConflicts({ status: ["open", "investigating"], severity: ["high"] }, { limit: 500 }),
    fetchCostDisclosure(estate.id),
  ]);

  const blockingConflict = conflicts.items.some((c) => c.estateAId === estate.id || c.estateBId === estate.id);
  // A buyer-facing disclosure existing at all means fees were declared —
  // including an explicitly empty schedule, and including a grandfathered
  // estate, which the backend reports as declared too. A declaration made
  // through the portal in this session counts the same way.
  const feesDeclared = disclosure !== null || mockHasDeclaredFees(estate.id);
  const refundTermsDeclared = (disclosure !== null && (disclosure.exitCosts !== null || isGrandfathered(disclosure)))
    || mockHasDeclaredRefundTerms(estate.id);

  const conditions = {
    tenantVerified: tenant?.verificationState === "verified",
    tenantEntitled: tenant?.entitlements.marketplacePublishing === true,
    tenantActive: tenant?.status === "active",
    feesDeclared,
    refundTermsDeclared,
    hasBoundary: estate.footprint.length >= 3,
    hasPlots: estate.plots.length > 0 || mockPortalPlotCount(estate.id) > 0,
    noBlockingConflict: !blockingConflict,
  };

  // `eligible` is the conjunction of the flag and every condition — the same
  // fold the backend's eligibility view does, evaluated now, at read time.
  const eligibility: EstateEligibility = {
    published: estate.published,
    ...conditions,
    eligible: estate.published && Object.values(conditions).every(Boolean),
  };

  const hasBoundary = conditions.hasBoundary;
  const plots = estate.plots;

  return {
    id: estate.id,
    slug: estate.slug ?? estate.id,
    name: estate.name,
    description: estate.description,
    area: estate.area,
    city: estate.city,
    state: estate.state,
    branchId: estate.branchId,
    tenantId: estate.tenantId,
    cornerPremiumPct: estate.cornerPremiumPct,
    amenities: estate.amenities,
    address: estate.address ?? "",
    intent: estate.intent === "investment" ? "investment" : "development",
    titleType: estate.titleType,
    titleVerified: estate.titleVerified,
    totalPlots: estate.totalPlots,
    availablePlots: estate.availablePlots,
    soldPlots: plots.filter((p) => p.status === "sold").length,
    reservedPlots: plots.filter((p) => p.status === "reserved").length,
    priceFrom: estate.priceFrom,
    priceTo: estate.priceTo,
    currency: "NGN",
    hasBoundary,
    eligibility,
    status: statusFor(eligibility, hasBoundary),
    blockingReasons: blockingReasonsFor(eligibility),
    publishedDate: estate.published ? estate.publishedDate : undefined,
  };
}

// Mock mode only. Plots added on the inventory page live in
// portalInventoryService, which imports this module — so it registers a
// counter here rather than this module importing it back.
let mockPortalPlotCount: (estateId: string) => number = () => 0;
export function registerMockPortalPlotCounter(counter: (estateId: string) => number): void {
  mockPortalPlotCount = counter;
}

export async function fetchPortalEstates(
  scope: PortalScope,
  filters: PortalEstateFilters = {},
  params: PageParams = {},
): Promise<Page<PortalEstate>> {
  if (!apiClient.isMockMode) {
    const qp = new URLSearchParams({ ...(filters as Record<string, string>), ...(params as Record<string, string>) });
    const page = await apiClient.get<Page<EstateSummaryDto>>(`/api/portal/estates?${qp}`);
    return { ...page, items: page.items.map((dto) => fromSummaryDto(dto, scope.tenantId, null)) };
  }

  // Standing in for RLS: tenant always, branch too when the user is
  // branch-scoped. A branch-scoped caller cannot reach another branch even by
  // passing a branchId filter.
  let source = mockStore().filter((e) => e.tenantId === scope.tenantId);
  if (scope.branchId) {
    // Their branch's estates and the company's (EB-2) — never a sibling's.
    source = source.filter((e) => e.branchId === scope.branchId || e.branchId === null);
  } else if (filters.branchId) {
    source = source.filter((e) => e.branchId === filters.branchId);
  }

  if (filters.query) {
    const q = filters.query.toLowerCase();
    source = source.filter((e) => `${e.name} ${e.area} ${e.city}`.toLowerCase().includes(q));
  }
  if (filters.state) source = source.filter((e) => e.state === filters.state);
  if (filters.city) source = source.filter((e) => e.city === filters.city);
  if (filters.published !== undefined) source = source.filter((e) => e.published === filters.published);

  const page = paginateMock(source, params);
  return { ...page, items: await Promise.all(page.items.map(projectPortalEstate)) };
}

export async function fetchPortalEstateById(id: string, scope: PortalScope): Promise<PortalEstate | null> {
  if (!apiClient.isMockMode) {
    try { return fromDetailDto(await apiClient.get<EstateDetailDto>(`/api/portal/estates/${id}`)); } catch { return null; }
  }
  const estate = mockStore().find((e) => e.id === id);
  if (!estate) return null;
  // Same scope rule as the list — an id from another tenant or branch is not
  // reachable just because it was typed into the URL.
  if (estate.tenantId !== scope.tenantId) return null;
  // Company-level estates are visible to branch staff too (EB-2).
  if (scope.branchId && estate.branchId !== null && estate.branchId !== scope.branchId) return null;
  return projectPortalEstate(estate);
}

export async function fetchEstateGeoJson(id: string, scope: PortalScope): Promise<GeoJsonFeatureCollection | null> {
  if (!apiClient.isMockMode) {
    try { return await apiClient.get<GeoJsonFeatureCollection>(`/api/portal/estates/${id}/geojson`); } catch { return null; }
  }
  const estate = mockStore().find((e) => e.id === id && e.tenantId === scope.tenantId);
  if (!estate || estate.footprint.length < 3) return null;
  if (scope.branchId && estate.branchId !== null && estate.branchId !== scope.branchId) return null;
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry: footprintToPolygon(estate.footprint), properties: { name: estate.name, estateId: estate.id } }],
  };
}

export interface CreateEstateInput {
  name: string;
  description: string;
  area: string;
  city: string;
  state: NigerianState;
  address: string;
  cornerPremiumPct: number;
  amenities: string[];
  // Optional: an estate may exist as a draft before it has been surveyed.
  boundary?: GeoJsonPolygon;
  // Optional (EB-1). Left out by a company-wide caller, the estate belongs to
  // the organisation directly — a deliberate choice on the form, never an
  // empty dropdown. A branch-scoped caller always creates in their own
  // branch: the backend ignores any value they send.
  branchId?: string;
}

// Always creates a DRAFT. Publication is a separate, deliberate action (DP-14,
// a later slice) — there is no create-and-publish shortcut on purpose.
export async function createPortalEstate(input: CreateEstateInput, scope: PortalScope): Promise<PortalEstate> {
  if (!apiClient.isMockMode) {
    // The backend's field is `footprint` (CreateEstateRequest). Sending
    // `boundary` was silently dropped by Jackson — every estate came out
    // boundary-less, and since BG-1 no such estate can be published.
    const { boundary, branchId, ...rest } = input;
    // EstateDto: the summary's fields without plot counts — a new estate has none.
    const dto = await apiClient.post<Omit<EstateSummaryDto, "plotCounts"> & { tenantId: string }>(
      "/api/portal/estates", { ...rest, ...(branchId ? { branchId } : {}), ...(boundary ? { footprint: boundary } : {}) });
    return fromSummaryDto({ ...dto, plotCounts: null }, dto.tenantId, null);
  }

  const footprint: GeoPoint[] = input.boundary
    ? input.boundary.coordinates[0].map(([lng, lat]) => ({ lat, lng }))
    : [];

  const estate: Estate = {
    // The backend assigns a UUID; the slug is derived from the name and kept
    // separate. Never the other way round.
    id: generateId(),
    slug: slugify(input.name),
    name: input.name,
    description: input.description,
    area: input.area,
    city: input.city,
    state: input.state,
    location: `${input.area}, ${input.city}`,
    tenantId: scope.tenantId,
    branchId: scope.branchId ?? input.branchId ?? null,
    // A new estate has no inventory yet — plots, tiers and blocks are DP-7 to
    // DP-10. Zero here is the real count, not a placeholder.
    totalPlots: 0,
    availablePlots: 0,
    priceFrom: 0,
    priceTo: 0,
    sqmFrom: 0,
    sqmTo: 0,
    imageUrl: "",
    amenities: input.amenities,
    // No title record has been filed yet (DP-11's territory). Rendered as
    // "none on file", never as a verified placeholder.
    titleType: "Gazette",
    titleVerified: false,
    lastVerified: "",
    cornerPremiumPct: input.cornerPremiumPct,
    address: input.address,
    plots: [],
    rows: 0,
    cols: 0,
    paymentPlans: ["outright"],
    intent: "development",
    publishedDate: "",
    published: false,
    footprint,
  };

  mockCreated.push(estate);
  return projectPortalEstate(estate);
}

// Estates created during a session live alongside the seeded ones, same idiom
// as tenantsService.ts's mock store. Edits (PUT) and an added boundary mutate
// the canonical record, so the portal and the marketplace keep agreeing.
const mockCreated: Estate[] = [];

// ─── Editing an estate's details: PUT /api/portal/estates/{id} ──────────────
//
// Every field optional — left out means unchanged. A blank text field clears
// it, except `name` and `state`. `amenities` replaces the whole list.
//
// NOT here, on purpose (the backend refuses them rather than ignoring them):
// the boundary (POST .../boundary, which runs the overlap check), publication
// (publish/unpublish check every condition) and the branch (an estate can't
// move across the branch wall). So this input type has none of the three.
export interface UpdateEstateInput {
  name?: string;
  description?: string;
  area?: string;
  city?: string;
  state?: NigerianState;
  address?: string;
  // Reprices EVERY corner plot at once, live on the marketplace — prices are
  // computed on read. A buyer who already reserved keeps their price.
  cornerPremiumPct?: number;
  intent?: EstateIntent;
  amenities?: string[];
}

// An edit the server refused, pinned to a field — the same idea as
// portalInventoryService's InventoryEditError.
export class EstateEditError extends Error {
  field: string;
  code: string;
  constructor(field: string, code: string, message: string) {
    super(message);
    this.name = "EstateEditError";
    this.field = field;
    this.code = code;
  }
}

function estateEditError(err: unknown): Error {
  if (!(err instanceof ApiError)) return err instanceof Error ? err : new Error("Couldn't save the estate.");
  const body = err.body;
  // A rename regenerates the slug, unique per company.
  if (err.status === 409) return new EstateEditError("name", "DUPLICATE_RECORD", "Another of your estates already has a matching name.");
  if (body?.code === "UNKNOWN_STATE") return new EstateEditError("state", body.code, body.message ?? "That isn't a Nigerian state the platform recognises.");
  if (body?.code === "BOUNDARY_OUTSIDE_STATE") return new EstateEditError("state", body.code, body.message ?? "The boundary isn't inside that state.");
  if (body?.fieldErrors) {
    const [field, message] = Object.entries(body.fieldErrors)[0] ?? [];
    if (field) return new EstateEditError(field, "VALIDATION", message);
  }
  if (err.status === 404) return new EstateEditError("form", "ESTATE_NOT_FOUND", "This estate no longer exists, or isn't yours.");
  return new EstateEditError("form", body?.code ?? "UNKNOWN", body?.message ?? "Couldn't save the estate.");
}

export async function updatePortalEstate(id: string, input: UpdateEstateInput, scope: PortalScope): Promise<PortalEstate> {
  if (input.name !== undefined && !input.name.trim()) throw new EstateEditError("name", "VALIDATION", "An estate needs a name.");
  if (input.cornerPremiumPct !== undefined && !(input.cornerPremiumPct >= 0)) {
    throw new EstateEditError("cornerPremiumPct", "VALIDATION", "The corner premium can't be negative.");
  }

  if (!apiClient.isMockMode) {
    try {
      await apiClient.put(`/api/portal/estates/${id}`, input);
    } catch (err) {
      throw estateEditError(err);
    }
    // EstateDto has no eligibility or counts; the detail read has both.
    const fresh = await fetchPortalEstateById(id, scope);
    if (!fresh) throw new EstateEditError("form", "ESTATE_NOT_FOUND", "This estate no longer exists, or isn't yours.");
    return fresh;
  }

  let estate: Estate;
  try { estate = ownedMockEstate(id, scope); } catch { throw new EstateEditError("form", "ESTATE_NOT_FOUND", "This estate no longer exists, or isn't yours."); }
  if (input.name !== undefined) {
    const name = input.name.trim();
    const slug = slugify(name);
    if (mockStore().some((e) => e.id !== id && e.tenantId === estate.tenantId && (e.slug ?? e.id) === slug)) {
      throw new EstateEditError("name", "DUPLICATE_RECORD", "Another of your estates already has a matching name.");
    }
    estate.name = name;
    estate.slug = slug;
  }
  if (input.description !== undefined) estate.description = input.description.trim();
  if (input.area !== undefined) estate.area = input.area.trim();
  if (input.city !== undefined) estate.city = input.city.trim();
  if (input.state !== undefined) estate.state = input.state;
  if (input.address !== undefined) estate.address = input.address.trim();
  if (input.intent !== undefined) estate.intent = input.intent;
  if (input.amenities !== undefined) estate.amenities = input.amenities.map((a) => a.trim()).filter(Boolean);
  if (input.cornerPremiumPct !== undefined && input.cornerPremiumPct !== estate.cornerPremiumPct) {
    estate.cornerPremiumPct = input.cornerPremiumPct;
    mockCornerPremiumChanged(id, input.cornerPremiumPct);
  }
  estate.location = `${estate.area}, ${estate.city}`;
  return projectPortalEstate(estate);
}

// Mock mode only: plot rows in portalInventoryService carry a materialised
// price, so a corner-premium change is pushed to them (the backend computes
// prices on read and needs no such step).
let mockCornerPremiumChanged: (estateId: string, pct: number) => void = () => {};
export function registerMockCornerPremiumListener(listener: (estateId: string, pct: number) => void): void {
  mockCornerPremiumChanged = listener;
}

// ─── Adding a boundary later: POST /api/portal/estates/{id}/boundary ───────
//
// For an estate created before its survey was ready — and since BG-1 the only
// way such an estate can ever be published. Only when it has NO boundary yet:
// changing one is not supported (BOUNDARY_ALREADY_SET). Every plot that
// already has a shape must sit inside it, or nothing is saved. Checked for
// overlaps at once; the result says whether that blocks publication, and
// never names the other company.
export interface EstateBoundaryResult {
  estateId: string;
  footprintAreaSqm: number | null;
  publicationBlocked: boolean;
  blockReason: string | null;
  warningConflictCount: number;
  // Which conflicts this raised, resolved, left awaiting review or left open —
  // the caller's side only. The counts above remain for compatibility.
  conflictChanges: ConflictChanges | null;
}

export async function addEstateBoundary(id: string, boundary: GeoJsonPolygon, scope: PortalScope): Promise<EstateBoundaryResult> {
  if (!apiClient.isMockMode) {
    try {
      return await apiClient.post<EstateBoundaryResult>(`/api/portal/estates/${id}/boundary`, { footprint: boundary });
    } catch (err) {
      if (err instanceof ApiError) {
        const code = err.body?.code ?? "UNKNOWN";
        const fallback: Record<string, string> = {
          BOUNDARY_ALREADY_SET: "This estate already has a boundary. Changing a boundary isn't supported.",
          PLOT_OUTSIDE_ESTATE: "Some of this estate's plots fall outside that boundary, so nothing was saved.",
          INVALID_GEOMETRY: "That isn't a usable boundary polygon.",
        };
        throw new EstateEditError("boundary", code, err.body?.message ?? fallback[code] ?? "Couldn't add the boundary.");
      }
      throw err;
    }
  }

  let estate: Estate;
  try { estate = ownedMockEstate(id, scope); } catch { throw new EstateEditError("boundary", "ESTATE_NOT_FOUND", "Estate not found."); }
  if (estate.footprint.length >= 3) {
    throw new EstateEditError("boundary", "BOUNDARY_ALREADY_SET", "This estate already has a boundary. Changing a boundary isn't supported.");
  }
  const ring = boundary.coordinates[0].map(([lng, lat]) => ({ lat, lng }));
  const outside = mockPlotsOutside(id, boundary);
  if (outside.length > 0) {
    throw new EstateEditError("boundary", "PLOT_OUTSIDE_ESTATE",
      `These plots fall outside that boundary, so nothing was saved: ${outside.join(", ")}.`);
  }
  // Same shape createPortalEstate stores: the ring as given.
  estate.footprint = ring;
  return { estateId: id, footprintAreaSqm: Math.round(boundaryAreaSqm(boundary) * 100) / 100, ...mockDetectionOutcome(estate) };
}

// After an estate's boundary is set or changed: re-run detection and report
// it the way the backend does — blocked or not, the reason, the warning
// count, and the itemised changes. Never names the other party.
function mockDetectionOutcome(estate: Estate): Pick<EstateBoundaryResult, "publicationBlocked" | "blockReason" | "warningConflictCount" | "conflictChanges"> {
  const changes = redetectMockConflictsForEstate(estate, mockStore());
  const live = [...changes.raised, ...changes.awaitingReview, ...changes.stillOpen];
  const blocking = live.filter((c) => c.blocksPublication);
  return {
    publicationBlocked: blocking.length > 0,
    blockReason: blocking.length > 0 ? "This boundary overlaps land registered by another company, so the estate is off the marketplace until that's resolved." : null,
    warningConflictCount: live.filter((c) => !c.blocksPublication).length,
    conflictChanges: changes,
  };
}

// ─── Correcting a boundary: PUT /api/portal/estates/{id}/boundary ───────────
//
// Applied at once (200, "applied") unless the estate is PUBLISHED and more
// than 5% of its land changes — land added plus land removed, so a boundary
// that slides sideways counts even if its area doesn't. Then it waits for a
// Super Admin (202, "pending") and the current boundary stays live. Real
// survey corrections are small; a big change to a live listing is what a
// person should see before buyers do, and the one case overlap detection
// can't police (a boundary moved onto land no other company has listed).
// Same checks as adding one: inside the state, every mapped plot still inside.
// One pending correction per estate; a history is kept, never overwritten.

export type BoundaryChangeStatus = "applied" | "pending" | "approved" | "rejected" | "withdrawn";

// BoundaryChangeDto.
export interface BoundaryChange {
  id: string;
  estateId: string;
  estateName: string;
  // Reviewer views only: the developer's company.
  companyName: string | null;
  status: BoundaryChangeStatus;
  previousAreaSqm: number | null;
  proposedAreaSqm: number | null;
  // Land added plus land removed.
  changedAreaSqm: number | null;
  changedPct: number | null;
  reason: string;
  requestedBy: string | null;
  createdAt: string;
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  previousFootprint: GeoJsonPolygon | null;
  proposedFootprint: GeoJsonPolygon | null;
  // Set when this response APPLIED the boundary.
  publicationBlocked: boolean | null;
  blockReason: string | null;
  warningConflictCount: number | null;
  conflictChanges: ConflictChanges | null;
}

export const BOUNDARY_REVIEW_THRESHOLD_PCT = 5;

const BOUNDARY_MESSAGES: Record<string, string> = {
  BOUNDARY_NOT_SET: "This estate has no boundary to correct yet — add one instead.",
  BOUNDARY_CHANGE_PENDING: "A correction for this estate is already waiting for review. Withdraw it first to send a different one.",
  BOUNDARY_UNCHANGED: "That's the same shape as the current boundary.",
  BOUNDARY_CHANGE_NOT_PENDING: "That correction has already been decided or withdrawn.",
  PLOT_OUTSIDE_ESTATE: "Some of this estate's plots would fall outside that boundary, so nothing was changed.",
  INVALID_GEOMETRY: "That isn't a usable boundary polygon.",
};

function boundaryChangeError(err: unknown, field = "boundary"): Error {
  if (!(err instanceof ApiError)) return err instanceof Error ? err : new Error("Couldn't change the boundary.");
  const code = err.body?.code ?? "UNKNOWN";
  const fieldErrors = err.body?.fieldErrors;
  if (fieldErrors?.reason) return new EstateEditError("reason", "VALIDATION", fieldErrors.reason);
  if (fieldErrors?.note) return new EstateEditError("note", "VALIDATION", fieldErrors.note);
  // The server's message is preferred — it names the plots, or the state the
  // land is actually in.
  return new EstateEditError(field, code, err.body?.message ?? BOUNDARY_MESSAGES[code] ?? "Couldn't change the boundary.");
}

// ─── Mock store ──────────────────────────────────────────────────────────────

const mockBoundaryChanges: BoundaryChange[] = [];

function footprintToGeo(points: GeoPoint[]): GeoJsonPolygon {
  return { type: "Polygon", coordinates: [points.map((p) => [p.lng, p.lat] as [number, number])] };
}

// Land added plus land removed — the symmetric difference.
function mockChangedArea(previous: GeoPoint[], proposed: GeoPoint[]): { previousArea: number; proposedArea: number; changed: number } {
  const previousArea = polygonAreaSqm(previous);
  const proposedArea = polygonAreaSqm(proposed);
  const shared = polygonOverlap(previous, proposed)?.areaSqm ?? 0;
  return { previousArea, proposedArea, changed: Math.max(0, previousArea + proposedArea - 2 * shared) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function mockApply(estate: Estate, change: BoundaryChange, proposed: GeoPoint[]): BoundaryChange {
  estate.footprint = proposed;
  return { ...change, ...mockDetectionOutcome(estate) };
}

// ─── API ─────────────────────────────────────────────────────────────────────

export async function correctEstateBoundary(id: string, boundary: GeoJsonPolygon, reason: string, scope: PortalScope): Promise<BoundaryChange> {
  if (!reason.trim()) throw new EstateEditError("reason", "VALIDATION", "Say why it changed — it's kept in the history and shown to a reviewer.");
  if (!apiClient.isMockMode) {
    try {
      // 200 applied, or 202 pending — both carry the change.
      return await apiClient.put<BoundaryChange>(`/api/portal/estates/${id}/boundary`, { footprint: boundary, reason: reason.trim() });
    } catch (err) {
      throw boundaryChangeError(err);
    }
  }

  let estate: Estate;
  try { estate = ownedMockEstate(id, scope); } catch { throw new EstateEditError("boundary", "ESTATE_NOT_FOUND", "Estate not found."); }
  if (estate.footprint.length < 3) throw new EstateEditError("boundary", "BOUNDARY_NOT_SET", BOUNDARY_MESSAGES.BOUNDARY_NOT_SET);
  if (mockBoundaryChanges.some((c) => c.estateId === id && c.status === "pending")) {
    throw new EstateEditError("boundary", "BOUNDARY_CHANGE_PENDING", BOUNDARY_MESSAGES.BOUNDARY_CHANGE_PENDING);
  }
  const proposed = boundary.coordinates[0].map(([lng, lat]) => ({ lat, lng }));
  const { previousArea, proposedArea, changed } = mockChangedArea(estate.footprint, proposed);
  if (changed < 1) throw new EstateEditError("boundary", "BOUNDARY_UNCHANGED", BOUNDARY_MESSAGES.BOUNDARY_UNCHANGED);
  const outside = mockPlotsOutside(id, boundary);
  if (outside.length > 0) {
    throw new EstateEditError("boundary", "PLOT_OUTSIDE_ESTATE", `These plots would fall outside that boundary, so nothing was changed: ${outside.join(", ")}.`);
  }

  const changedPct = previousArea > 0 ? (changed / previousArea) * 100 : 100;
  const needsReview = estate.published && changedPct > BOUNDARY_REVIEW_THRESHOLD_PCT;
  const change: BoundaryChange = {
    id: generateId(), estateId: id, estateName: estate.name, companyName: fetchTenantByIdSync(estate.tenantId)?.identity?.tradingName ?? null,
    status: needsReview ? "pending" : "applied",
    previousAreaSqm: round2(previousArea), proposedAreaSqm: round2(proposedArea), changedAreaSqm: round2(changed), changedPct: round2(changedPct),
    reason: reason.trim(), requestedBy: null, createdAt: new Date().toISOString(), decidedBy: null, decidedAt: null, decisionNote: null,
    previousFootprint: footprintToGeo(estate.footprint), proposedFootprint: boundary,
    publicationBlocked: null, blockReason: null, warningConflictCount: null, conflictChanges: null,
  };
  const result = needsReview ? change : mockApply(estate, change, proposed);
  mockBoundaryChanges.unshift(result);
  return result;
}

// Every correction, newest first, with both shapes.
export async function fetchBoundaryChanges(id: string, scope: PortalScope): Promise<BoundaryChange[]> {
  if (!apiClient.isMockMode) return apiClient.get<BoundaryChange[]>(`/api/portal/estates/${id}/boundary-changes`);
  try { ownedMockEstate(id, scope); } catch { return []; }
  return mockBoundaryChanges.filter((c) => c.estateId === id).map((c) => ({ ...c }));
}

export async function withdrawBoundaryChange(id: string, changeId: string, scope: PortalScope): Promise<BoundaryChange> {
  if (!apiClient.isMockMode) {
    try {
      return await apiClient.post<BoundaryChange>(`/api/portal/estates/${id}/boundary-changes/${changeId}/withdraw`);
    } catch (err) {
      throw boundaryChangeError(err, "form");
    }
  }
  ownedMockEstate(id, scope);
  const change = mockBoundaryChanges.find((c) => c.id === changeId && c.estateId === id);
  if (!change || change.status !== "pending") throw new EstateEditError("form", "BOUNDARY_CHANGE_NOT_PENDING", BOUNDARY_MESSAGES.BOUNDARY_CHANGE_NOT_PENDING);
  change.status = "withdrawn";
  change.decidedAt = new Date().toISOString();
  return { ...change };
}

// ─── Super Admin review ──────────────────────────────────────────────────────

// Oldest first, with both shapes, the share of land changed, the reason and
// the company. Gated on admin.marketplace.conflicts.
export async function fetchBoundaryChangesForReview(status: BoundaryChangeStatus = "pending"): Promise<BoundaryChange[]> {
  if (!apiClient.isMockMode) return apiClient.get<BoundaryChange[]>(`/api/admin/boundary-changes?status=${status}`);
  return mockBoundaryChanges.filter((c) => c.status === status).map((c) => ({ ...c })).reverse();
}

// Approval RE-CHECKS that every plot still fits (plots may have been mapped
// while it waited), then applies and re-runs detection.
export async function decideBoundaryChange(changeId: string, decision: "approve" | "reject", note: string): Promise<BoundaryChange> {
  if (decision === "reject" && !note.trim()) throw new EstateEditError("note", "VALIDATION", "Give a reason — the developer sees it.");
  if (!apiClient.isMockMode) {
    try {
      const body = note.trim() ? { note: note.trim() } : {};
      return await apiClient.post<BoundaryChange>(`/api/admin/boundary-changes/${changeId}/${decision}`, body);
    } catch (err) {
      throw boundaryChangeError(err, "form");
    }
  }
  const index = mockBoundaryChanges.findIndex((c) => c.id === changeId);
  const change = mockBoundaryChanges[index];
  if (!change || change.status !== "pending") throw new EstateEditError("form", "BOUNDARY_CHANGE_NOT_PENDING", BOUNDARY_MESSAGES.BOUNDARY_CHANGE_NOT_PENDING);
  const decided = { ...change, decidedAt: new Date().toISOString(), decidedBy: "mock-super-admin", decisionNote: note.trim() || null };
  if (decision === "reject") {
    mockBoundaryChanges[index] = { ...decided, status: "rejected" };
    return { ...mockBoundaryChanges[index] };
  }
  const estate = findMockEstateForAdmin(change.estateId)!;
  const outside = mockPlotsOutside(change.estateId, change.proposedFootprint!);
  if (outside.length > 0) {
    throw new EstateEditError("form", "PLOT_OUTSIDE_ESTATE", `Plots mapped since the request now fall outside it: ${outside.join(", ")}. Reject it, or ask the developer to resubmit.`);
  }
  const applied = mockApply(estate, { ...decided, status: "approved" }, change.proposedFootprint!.coordinates[0].map(([lng, lat]) => ({ lat, lng })));
  mockBoundaryChanges[index] = applied;
  return { ...applied };
}

// Mock mode only: which of the estate's plots (with shapes) fall outside a
// proposed boundary. Registered by portalInventoryService, which holds them.
let mockPlotsOutside: (estateId: string, boundary: GeoJsonPolygon) => string[] = () => [];
export function registerMockPlotsOutsideCheck(check: (estateId: string, boundary: GeoJsonPolygon) => string[]): void {
  mockPlotsOutside = check;
}

// Mock mode only, for the Super Admin's state override: platform staff look
// an estate up by id across every company — no tenant scope applies.
// EB-2: branch staff can see a company-level estate but never change it —
// the backend refuses every write (ESTATE_READ_ONLY_FOR_BRANCH). Applied in
// the UI too, so no screen offers an action that can only fail.
export function isReadOnlyForScope(estate: Pick<PortalEstate, "branchId">, scope: PortalScope | null): boolean {
  return !!scope?.branchId && estate.branchId === null;
}

export function findMockEstateForAdmin(id: string): Estate | undefined {
  return mockStore().find((e) => e.id === id);
}

function mockStore(): Estate[] {
  return [...ESTATES, ...mockCreated];
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `estate-${mockCreated.length + 1}`;
}

// Stands in for the backend's UUID primary key, so nothing in the frontend can
// come to depend on an id being readable or derived from a name.
function generateId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `est-${Math.random().toString(16).slice(2, 10)}`;
}
