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

import { apiClient } from "../lib/apiClient";
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
  plotNumber: number;
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
  return `Block ${plot.block}, Plot ${plot.plotNumber}`;
}

// Paginated for API-contract consistency with the other list endpoints (a
// large real estate can run into the thousands of plots), but its one
// consumer — the plot canvas — renders a spatial grid, not a scrolling list:
// "Load more" would leave holes in the map. So the canvas requests a single
// generously-sized page (comfortably above any estate in this fixture set)
// rather than paging. A future estate that ever exceeds that would need the
// canvas itself to become viewport-windowed, not paginated.
export async function fetchPlotsForListing(listingId: string, params: PageParams = {}): Promise<Page<ListingPlot>> {
  if (!apiClient.isMockMode) return apiClient.get<Page<ListingPlot>>(`/api/marketplace/listings/${listingId}/plots?${new URLSearchParams(params as Record<string, string>)}`);
  const estate = ESTATES.find((e) => e.id === listingId);
  const all = estate ? estate.plots.map((p) => toListingPlot(listingId, p)) : [];
  return paginateMock(all, params);
}

export async function fetchPlotById(listingId: string, plotId: string): Promise<ListingPlot | undefined> {
  if (!apiClient.isMockMode) {
    try { return await apiClient.get<ListingPlot>(`/api/marketplace/listings/${listingId}/plots/${plotId}`); } catch { return undefined; }
  }
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
