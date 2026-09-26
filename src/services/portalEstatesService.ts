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
import { polygonAreaSqm } from "../lib/geometry";
import { apiClient } from "../lib/apiClient";
import { paginateMock, type Page, type PageParams } from "../lib/pagination";
import { fetchTenantByIdSync } from "./tenantsService";
import { fetchConflicts } from "./listingConflictsService";
import { fetchCostDisclosure, isGrandfathered } from "./costDisclosureService";
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

// Mirrors the backend's `EstateEligibility` record field for field. SEVEN
// fields, not six: `refundTermsDeclared` is a condition in its own right, and
// `eligible` is the backend's own fold of everything.
//
// Note what is NOT here: there is no `noBlockingConflict` boolean. The
// conflict check exists only inside `eligible`, so a blocking conflict shows
// up as `eligible: false` while all six named conditions pass — see
// `conflictIsBlocking` below, which says that plainly rather than inventing a
// boolean the backend never sends.
//
// Grandfathered estates report TRUE for both declaration conditions.
export interface EstateEligibility {
  published: boolean;
  tenantVerified: boolean;
  tenantEntitled: boolean;
  tenantActive: boolean;
  feesDeclared: boolean;
  refundTermsDeclared: boolean;
  // The backend's fold of all six above PLUS the conflict check.
  eligible: boolean;
}

export type PortalEstateStatus = "draft" | "ready_to_publish" | "published" | "blocked" | "unknown";

// Each named condition, in the order a developer meets them, with copy they
// can act on. Kept beside the conditions so a real backend's eligibility
// response flows through exactly the same mapping as the mock's.
export const ELIGIBILITY_CONDITIONS: { key: keyof Omit<EstateEligibility, "eligible">; label: string; reason: string }[] = [
  { key: "published", label: "Listed on the public marketplace", reason: "This estate isn't listed yet" },
  { key: "tenantVerified", label: "Company verification complete", reason: "Your company's verification isn't complete yet" },
  { key: "tenantEntitled", label: "Marketplace publishing enabled on your plan", reason: "Marketplace publishing isn't enabled on your company's plan" },
  { key: "tenantActive", label: "Company account in good standing", reason: "Your company's account isn't active right now" },
  { key: "feesDeclared", label: "Fee schedule declared", reason: "The fee schedule hasn't been declared" },
  { key: "refundTermsDeclared", label: "Refund terms declared", reason: "Refund terms haven't been declared" },
];

// Conditions outside the company's immediate control.
const HARD_BLOCKER_KEYS: (keyof EstateEligibility)[] = ["tenantVerified", "tenantEntitled", "tenantActive"];
// Setup the company still has to finish itself.
const OUTSTANDING_SETUP_KEYS: (keyof EstateEligibility)[] = ["feesDeclared", "refundTermsDeclared"];

// A blocking conflict is the one condition with no boolean of its own: the
// backend folds it into `eligible` only. If every named condition passes and
// `eligible` is still false, a conflict is what is left.
export function conflictIsBlocking(eligibility: EstateEligibility): boolean {
  const namedConditionsPass = ELIGIBILITY_CONDITIONS
    .filter((c) => c.key !== "published")
    .every((c) => eligibility[c.key]);
  return namedConditionsPass && !eligibility.eligible;
}

export function blockingReasonsFor(eligibility: EstateEligibility): string[] {
  const reasons = ELIGIBILITY_CONDITIONS
    .filter((c) => c.key !== "published" && !eligibility[c.key])
    .map((c) => c.reason);
  if (conflictIsBlocking(eligibility)) {
    reasons.push("This estate's boundary overlaps another registered boundary");
  }
  return reasons;
}

// "unknown" when the backend didn't tell us — see PortalEstate.eligibility.
// An unknown condition is never reported as met.
export function statusFor(eligibility: EstateEligibility | null, hasBoundary: boolean): PortalEstateStatus {
  if (!eligibility) return "unknown";
  if (HARD_BLOCKER_KEYS.some((k) => !eligibility[k]) || conflictIsBlocking(eligibility)) return "blocked";
  if (eligibility.published) return "published";
  if (!hasBoundary || OUTSTANDING_SETUP_KEYS.some((k) => !eligibility[k])) return "draft";
  return "ready_to_publish";
}

// ─── Publication ─────────────────────────────────────────────────────────────

// The codes the backend's PublicationRefused carries, each mapped to the
// condition it belongs to. This is how a failed publish stays specific even
// though eligibility itself isn't exposed on any read endpoint yet.
export const PUBLICATION_REFUSAL_CONDITIONS: Record<string, keyof Omit<EstateEligibility, "eligible"> | "conflict"> = {
  PUBLICATION_VERIFICATION_PENDING: "tenantVerified",
  PUBLICATION_ENTITLEMENT_MISSING: "tenantEntitled",
  PUBLICATION_TENANT_NOT_ACTIVE: "tenantActive",
  PUBLICATION_FEES_UNDECLARED: "feesDeclared",
  PUBLICATION_REFUND_TERMS_UNDECLARED: "refundTermsDeclared",
  PUBLICATION_CONFLICT_OUTSTANDING: "conflict",
};

export interface PublicationResult {
  estateId: string;
  published: boolean;
  publishedAt?: string;
  // MEDIUM conflicts: one company's own boundaries overlapping. These don't
  // refuse publication, but the developer should be told. Always 0/absent on
  // unpublish.
  warningConflictCount: number;
  warning?: string;
}

export interface PublicationRefusal {
  code: string;
  // Which condition the code points at, so the readiness panel can mark that
  // specific row rather than showing a bare failure.
  condition: keyof Omit<EstateEligibility, "eligible"> | "conflict" | "unknown";
  message: string;
}

export function refusalFromError(error: unknown): PublicationRefusal | null {
  const body = (error as { body?: { code?: string; message?: string } } | undefined)?.body;
  if (!body?.code || !(body.code in PUBLICATION_REFUSAL_CONDITIONS)) return null;
  return {
    code: body.code,
    condition: PUBLICATION_REFUSAL_CONDITIONS[body.code] ?? "unknown",
    message: body.message ?? "This estate can't be published yet.",
  };
}

// ─── The portal's estate row ─────────────────────────────────────────────────

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
  branchId: string;
  tenantId: string;
  cornerPremiumPct: number;
  amenities: string[];
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
  // NULL when the backend didn't report it. `EstateEligibility` is computed
  // server-side but is not currently on any portal read DTO — a real backend
  // therefore leaves this null and the UI must render every condition as
  // UNKNOWN rather than met. See the backend note for the change that fixes
  // this.
  eligibility: EstateEligibility | null;
  status: PortalEstateStatus;
  blockingReasons: string[];
  publishedDate?: string;
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
  // A disclosure existing at all means fees were declared — including an
  // explicitly empty schedule, and including a grandfathered estate, which the
  // backend reports as declared too.
  const feesDeclared = disclosure !== null;
  const refundTermsDeclared = disclosure !== null && (disclosure.exitCosts !== null || isGrandfathered(disclosure));

  const named = {
    published: estate.published,
    tenantVerified: tenant?.verificationState === "verified",
    tenantEntitled: tenant?.entitlements.marketplacePublishing === true,
    tenantActive: tenant?.status === "active",
    feesDeclared,
    refundTermsDeclared,
  };

  // `eligible` folds in every named condition PLUS the conflict check — the
  // same fold the backend does, which is why the conflict has no boolean of
  // its own anywhere in this shape.
  const eligibility: EstateEligibility = {
    ...named,
    eligible: Object.values(named).every(Boolean) && !blockingConflict,
  };

  const hasBoundary = estate.footprint.length >= 3;
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

export async function fetchPortalEstates(
  scope: PortalScope,
  filters: PortalEstateFilters = {},
  params: PageParams = {},
): Promise<Page<PortalEstate>> {
  if (!apiClient.isMockMode) {
    const qp = new URLSearchParams({ ...(filters as Record<string, string>), ...(params as Record<string, string>) });
    return apiClient.get<Page<PortalEstate>>(`/api/portal/estates?${qp}`);
  }

  // Standing in for RLS: tenant always, branch too when the user is
  // branch-scoped. A branch-scoped caller cannot reach another branch even by
  // passing a branchId filter.
  let source = mockStore().filter((e) => e.tenantId === scope.tenantId);
  if (scope.branchId) {
    source = source.filter((e) => e.branchId === scope.branchId);
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
    try { return await apiClient.get<PortalEstate>(`/api/portal/estates/${id}`); } catch { return null; }
  }
  const estate = mockStore().find((e) => e.id === id);
  if (!estate) return null;
  // Same scope rule as the list — an id from another tenant or branch is not
  // reachable just because it was typed into the URL.
  if (estate.tenantId !== scope.tenantId) return null;
  if (scope.branchId && estate.branchId !== scope.branchId) return null;
  return projectPortalEstate(estate);
}

export async function fetchEstateGeoJson(id: string, scope: PortalScope): Promise<GeoJsonFeatureCollection | null> {
  if (!apiClient.isMockMode) {
    try { return await apiClient.get<GeoJsonFeatureCollection>(`/api/portal/estates/${id}/geojson`); } catch { return null; }
  }
  const estate = mockStore().find((e) => e.id === id && e.tenantId === scope.tenantId);
  if (!estate || estate.footprint.length < 3) return null;
  if (scope.branchId && estate.branchId !== scope.branchId) return null;
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
  branchId: string;
}

// Always creates a DRAFT. Publication is a separate, deliberate action (DP-14,
// a later slice) — there is no create-and-publish shortcut on purpose.
export async function createPortalEstate(input: CreateEstateInput, scope: PortalScope): Promise<PortalEstate> {
  if (!apiClient.isMockMode) {
    return apiClient.post<PortalEstate>("/api/portal/estates", input);
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
    branchId: input.branchId,
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
// as tenantsService.ts's mock store. Seeded estates are never mutated here —
// the backend has no update endpoints, so the portal offers no edit path.
const mockCreated: Estate[] = [];

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
