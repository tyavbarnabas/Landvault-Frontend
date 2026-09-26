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
import { apiClient } from "../lib/apiClient";
import { paginateMock, type Page, type PageParams } from "../lib/pagination";
import { fetchTenantByIdSync } from "./tenantsService";
import { fetchConflicts } from "./listingConflictsService";
import { fetchCostDisclosure } from "./costDisclosureService";
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

export interface BoundaryValidationError {
  message: string;
  // The likely-transposed case gets its own flag so the UI can lead with the
  // swap explanation rather than burying it in a generic bounds message.
  likelyTransposed: boolean;
}

// Mirrors the backend's own validation so a developer sees the problem before
// a round trip, not so the frontend becomes the authority: the backend still
// re-validates and is the one that rejects.
export function parseBoundary(text: string): { polygon: GeoJsonPolygon } | { error: BoundaryValidationError } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: { message: "That isn't valid JSON. Paste the GeoJSON exactly as your surveyor exported it.", likelyTransposed: false } };
  }

  // Accept either a bare Polygon or a Feature/FeatureCollection wrapping one,
  // because that is what real GIS exports actually contain.
  const geometry = extractPolygon(parsed);
  if (!geometry) {
    return { error: { message: "No polygon found. The boundary must be a GeoJSON Polygon (or a Feature or FeatureCollection containing one).", likelyTransposed: false } };
  }

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

  return { polygon: geometry };
}

function extractPolygon(value: unknown): GeoJsonPolygon | null {
  if (!value || typeof value !== "object") return null;
  const node = value as Record<string, unknown>;
  if (node.type === "Polygon" && Array.isArray(node.coordinates)) return node as unknown as GeoJsonPolygon;
  if (node.type === "Feature") return extractPolygon(node.geometry);
  if (node.type === "FeatureCollection" && Array.isArray(node.features)) {
    for (const feature of node.features) {
      const found = extractPolygon(feature);
      if (found) return found;
    }
  }
  return null;
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

// The backend returns these as six separate booleans specifically so a
// refusal can name the failing one. "Cannot publish" on its own sends the
// developer to support; naming the condition tells them what to do.
export interface EstateEligibility {
  publishedFlag: boolean;
  tenantVerified: boolean;
  tenantEntitled: boolean;
  tenantActive: boolean;
  noBlockingConflict: boolean;
  feeScheduleDeclared: boolean;
}

export type PortalEstateStatus = "draft" | "ready_to_publish" | "published" | "blocked";

// Conditions the company cannot simply finish on its own — verification,
// entitlement, account standing, or an unresolved boundary conflict.
const HARD_BLOCKERS: { key: keyof EstateEligibility; reason: string }[] = [
  { key: "tenantVerified", reason: "Your company's verification isn't complete yet" },
  { key: "tenantEntitled", reason: "Marketplace publishing isn't enabled on your company's plan" },
  { key: "tenantActive", reason: "Your company's account is currently suspended" },
  { key: "noBlockingConflict", reason: "This estate's boundary overlaps another registered boundary" },
];

// Setup the company still has to finish itself.
const OUTSTANDING_SETUP: { key: keyof EstateEligibility; reason: string }[] = [
  { key: "feeScheduleDeclared", reason: "The fee schedule hasn't been declared" },
];

// Maps the backend's booleans to something a person can act on. Kept here,
// beside the conditions themselves, so a real backend's eligibility response
// flows through exactly the same mapping as the mock's.
export function blockingReasonsFor(eligibility: EstateEligibility): string[] {
  return [...HARD_BLOCKERS, ...OUTSTANDING_SETUP]
    .filter((c) => !eligibility[c.key])
    .map((c) => c.reason);
}

export function statusFor(eligibility: EstateEligibility, hasBoundary: boolean): PortalEstateStatus {
  if (HARD_BLOCKERS.some((c) => !eligibility[c.key])) return "blocked";
  if (eligibility.publishedFlag) return "published";
  if (!hasBoundary || OUTSTANDING_SETUP.some((c) => !eligibility[c.key])) return "draft";
  return "ready_to_publish";
}

// ─── The portal's estate row ─────────────────────────────────────────────────

export interface PortalEstate {
  id: string;
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
  eligibility: EstateEligibility;
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

  const eligibility: EstateEligibility = {
    publishedFlag: estate.published,
    tenantVerified: tenant?.verificationState === "verified",
    tenantEntitled: tenant?.entitlements.marketplacePublishing === true,
    tenantActive: tenant?.status === "active",
    noBlockingConflict: !conflicts.items.some((c) => c.estateAId === estate.id || c.estateBId === estate.id),
    feeScheduleDeclared: disclosure?.status === "declared",
  };

  const hasBoundary = estate.footprint.length >= 3;
  const plots = estate.plots;

  return {
    id: estate.id,
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
    id: slugify(input.name),
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
