// Marketplace plot accessor — Part 1 of the buyer flow past estate detail.
//
// Previously this module generated its OWN seeded-random plot grid per
// listing, completely disconnected from the internal Estate/Plot model in
// mockData.ts — two independent plot stores for what was supposed to be one
// estate. That generator is gone: a marketplace listing's plots are now the
// SAME plots as the canonical estate's (mockData.ts's ESTATES), converted at
// this boundary into the ListingPlot shape the marketplace UI already
// expects. See landvault-catalogue-unification-plan in project memory.
//
// PlotStatus is re-exported directly from mockData.ts — there is now exactly
// one plot-status enum (hyphenated: "available-dev"/"available-inv"), not two
// spellings to keep in sync.

import { apiClient, nullIfNotFound } from "../lib/apiClient";
import { isMock } from "../lib/backends";
import { paginateMock, type Page, type PageParams } from "../lib/pagination";
import { ESTATES, getPlotBlockLabel, type Plot, type PlotStatus } from "../data/mockData";
import type { PriceTier } from "./marketplaceService";

// Comfortably above any estate's plot count in this fixture set (the
// largest, Golden Acres, has 320) — see fetchPlotsForListing's comment.
export const CANVAS_PLOT_FETCH_LIMIT = 5000;

export type { PlotStatus };

export interface ListingPlot {
  id: string;
  listingId: string;
  tierId: string;
  sizeSqm: number;
  block: string;
  // A real plot number can be "A3" as easily as 12.
  plotNumber: number | string;
  row: number;
  col: number;
  isCorner: boolean;
  actualAreaSqm: number;
  orientation: string;
  status: PlotStatus;
  intent?: "development" | "investment";
  // Carried through from the canonical Plot so the merged plot-detail panel
  // (components/marketplace/PlotDetailPanel.tsx) can show the internal
  // estate view's investment-projection block too — only set for
  // investment-flagged plots, same as mockData.ts's Plot.
  projectedROI?: number;
  holdingYears?: number;
  // Live mode: the marketplace's public answer, and all it gives. Reserved and
  // sold are deliberately indistinguishable to buyers (they would reveal sales
  // velocity), so an unavailable plot is never labelled one or the other.
  publicAvailability?: "available" | "unavailable";
  // Live only. False: no surveyed boundary — not on the map, its position in
  // the estate isn't confirmed, and it's outside double-allocation checks.
  // Still for sale; the buyer must be told.
  hasBoundary?: boolean;
}

// ─── Live: plots come from the estate's public map ───────────────────────────
//
// GET /api/marketplace/estates/{id}/geojson draws the plots that have a
// surveyed boundary; GET …/plots lists EVERY plot (with `hasBoundary`). The
// picker lists from …/plots and draws from …/geojson.

interface PlotFeatureProps {
  kind: "plot" | "estate";
  id: string;
  plotNumber: string;
  blockName: string | null;
  availability: string;
  isCorner: boolean;
  priceTierId: string;
  nominalSizeSqm: number | null;
  actualAreaSqm: number | null;
}

export interface EstateMapGeoJson {
  type: "FeatureCollection";
  features: { type: "Feature"; geometry: unknown; properties: PlotFeatureProps }[];
}

export async function fetchListingMap(listingId: string): Promise<EstateMapGeoJson | null> {
  return nullIfNotFound(apiClient.get<EstateMapGeoJson>(`/api/marketplace/estates/${listingId}/geojson`));
}

// GET /api/marketplace/estates/{id}/plots — every plot, boundary or not.
interface MarketplacePlotDto extends Omit<PlotFeatureProps, "kind"> {
  hasBoundary: boolean;
}

function fromPlotFeature(listingId: string, p: Omit<PlotFeatureProps, "kind"> & { hasBoundary?: boolean }): ListingPlot {
  const available = p.availability?.toUpperCase() === "AVAILABLE";
  return {
    id: p.id,
    listingId,
    tierId: p.priceTierId,
    sizeSqm: p.nominalSizeSqm ?? 0,
    block: p.blockName ?? "",
    plotNumber: p.plotNumber,
    // No grid position: the live picker uses the map, not the grid canvas.
    row: 0,
    col: 0,
    isCorner: p.isCorner,
    actualAreaSqm: p.actualAreaSqm ?? 0,
    orientation: "",
    // "available-dev" here means only "available" — the marketplace doesn't
    // expose the development/investment variant; the buyer chooses an intent
    // at checkout. Unavailable plots carry publicAvailability, and screens
    // read THAT, never this status, to say why.
    status: available ? "available-dev" : "reserved",
    publicAvailability: available ? "available" : "unavailable",
    hasBoundary: p.hasBoundary ?? true,
  };
}

// One page of one tier's plots — what the picker shows. The backend filters
// by tier and pages (cursor); a big estate is never loaded whole for a list.
// The tier filter is re-applied here too, so a backend that predates it
// shows short pages rather than another tier's plots.
export async function fetchTierPlots(listingId: string, tierId: string, opts: { availableOnly?: boolean; limit?: number; cursor?: string } = {}): Promise<Page<ListingPlot>> {
  if (isMock("marketplacePlots")) {
    const all = (await fetchPlotsForListing(listingId, { limit: CANVAS_PLOT_FETCH_LIMIT })).items
      .filter((p) => p.tierId === tierId && (!opts.availableOnly || p.status.startsWith("available")));
    return paginateMock(all, { limit: opts.limit, cursor: opts.cursor });
  }
  const qp = new URLSearchParams({ priceTierId: tierId, limit: String(opts.limit ?? 20) });
  if (opts.availableOnly) qp.set("available", "true");
  if (opts.cursor) qp.set("cursor", opts.cursor);
  const page = await apiClient.get<{ items: MarketplacePlotDto[]; total: number; cursor: string | null; hasMore: boolean }>(
    `/api/marketplace/estates/${listingId}/plots?${qp}`);
  return {
    items: page.items.filter((p) => p.priceTierId === tierId).map((p) => fromPlotFeature(listingId, p)),
    total: page.total,
    cursor: page.hasMore && page.cursor ? page.cursor : undefined,
    hasMore: page.hasMore,
  };
}

// The plot LIST, not the map: the map omits plots with no boundary, and those
// are still for sale. Every page, 500 at a time (the backend's maximum).
async function livePlots(listingId: string): Promise<ListingPlot[]> {
  const plots: ListingPlot[] = [];
  let cursor: string | null = null;
  do {
    const qp: URLSearchParams = new URLSearchParams({ limit: "500", ...(cursor ? { cursor } : {}) });
    const page: { items: MarketplacePlotDto[]; cursor: string | null; hasMore: boolean } = await apiClient.get(
      `/api/marketplace/estates/${listingId}/plots?${qp}`);
    plots.push(...page.items.map((p) => fromPlotFeature(listingId, p)));
    cursor = page.hasMore ? page.cursor : null;
  } while (cursor);
  return plots;
}

// Exported (not just used internally) so pages that already hold a full
// canonical Estate — EstateDetail.tsx — can convert its plots to this shape
// directly, without a redundant fetch through fetchPlotsForListing below.
export function toListingPlot(estateId: string, plot: Plot): ListingPlot {
  const estate = ESTATES.find((e) => e.id === estateId)!;
  const { block, plotNumber } = getPlotBlockLabel(estate, plot);
  return {
    id: plot.id,
    listingId: estateId,
    // Matches estatesService.ts's tiersFromPlots() id convention exactly
    // (`${estateId}-${sizeSqm}`) — corner plots aren't in any tier, same
    // exclusion tiersFromPlots already applies.
    tierId: `${estateId}-${plot.sqm}`,
    sizeSqm: plot.sqm,
    block,
    plotNumber,
    row: plot.row,
    col: plot.col,
    isCorner: plot.type === "corner",
    actualAreaSqm: plot.actualSqm,
    orientation: plot.orientation,
    status: plot.status,
    intent: plot.intent,
    projectedROI: plot.projectedROI,
    holdingYears: plot.holdingYears,
  };
}

export function plotLabel(plot: ListingPlot): string {
  return plot.block ? `${/^block\b/i.test(plot.block) ? plot.block : `Block ${plot.block}`}, Plot ${plot.plotNumber}` : `Plot ${plot.plotNumber}`;
}

// Paginated for API-contract consistency with the other list endpoints (a
// large real estate can run into the thousands of plots), but its one
// consumer — the plot canvas — renders a spatial grid, not a scrolling list:
// "Load more" would leave holes in the map. So the canvas requests a single
// generously-sized page (comfortably above any estate in this fixture set)
// rather than paging. A future estate that ever exceeds that would need the
// canvas itself to become viewport-windowed, not paginated.
export async function fetchPlotsForListing(listingId: string, params: PageParams = {}): Promise<Page<ListingPlot>> {
  if (!isMock("marketplacePlots")) return paginateMock(await livePlots(listingId), params);
  const estate = ESTATES.find((e) => e.id === listingId);
  const all = estate ? estate.plots.map((p) => toListingPlot(listingId, p)) : [];
  return paginateMock(all, params);
}

export async function fetchPlotById(listingId: string, plotId: string): Promise<ListingPlot | undefined> {
  if (!isMock("marketplacePlots")) return (await livePlots(listingId)).find((p) => p.id === plotId);
  const estate = ESTATES.find((e) => e.id === listingId);
  const plot = estate?.plots.find((p) => p.id === plotId);
  return plot ? toListingPlot(listingId, plot) : undefined;
}

// A plot's real price: its tier's price, plus the estate's corner premium if
// it's a corner plot. Moved here (from the now-deleted
// components/marketplace/PlotCanvas.tsx) since it's plot pricing logic, not
// rendering — components/PlotCanvas.tsx and PlotDetailPanel.tsx both need it.
export function priceForPlot(plot: ListingPlot, tiers: PriceTier[], cornerPremiumPct: number): { base: number; final: number } {
  const tier = tiers.find((t) => t.id === plot.tierId);
  const base = tier?.price ?? 0;
  const final = plot.isCorner ? base * (1 + cornerPremiumPct / 100) : base;
  return { base, final };
}

// Mutates the canonical estate's plot in place — the ONE plot store now.
// Reservation/checkout call this the same way whether the flow was entered
// via /marketplace or (redirected) via the legacy /estates checkout route —
// both resolve to the same estate id and plot id. Tier stock (plotsRemaining,
// availability) is never a separately-tracked counter: estatesService.ts's
// tiersFromPlots() always recomputes it live from plot statuses, so a status
// change here is immediately reflected everywhere without a second update.
export function setPlotStatusMock(listingId: string, plotId: string, status: PlotStatus): void {
  const estate = ESTATES.find((e) => e.id === listingId);
  const plot = estate?.plots.find((p) => p.id === plotId);
  if (plot) plot.status = status;
}
