// Backend integration seam for estates. Components should call these functions
// (never import ESTATES from data/mockData directly) so the mock-mode branch
// here is the only place that needs to change once the real API exists.
// See INTEGRATION.md.

import { ESTATES, type Estate, type Plot } from "../data/mockData";
import { apiClient } from "../lib/apiClient";

export async function fetchEstates(): Promise<Estate[]> {
  if (apiClient.isMockMode) return ESTATES;
  return apiClient.get<Estate[]>("/api/estates");
}

export async function fetchEstateById(id: string): Promise<Estate | undefined> {
  if (apiClient.isMockMode) return ESTATES.find((e) => e.id === id);
  try {
    return await apiClient.get<Estate>(`/api/estates/${id}`);
  } catch {
    return undefined;
  }
}

// ─── Price tier list (Part 3) ────────────────────────────────────────────────
//
// The ONE canonical PriceTier type — marketplaceService.ts imports and
// re-exports this rather than defining its own (see the catalogue
// unification plan in project memory). A tier is a real, non-fabricated size
// the estate's plots actually come in — never a synthesized "+100sqm"
// category. Corner plots are deliberately excluded from the tier list (a
// corner is a per-plot modifier on the standard/edge tier's price, not its
// own menu item — see mockData.ts's generatePlots) and shown only on the plot
// detail panel.

export type TierAvailability = "available" | "low_stock" | "sold_out";

export interface PriceTier {
  id: string;
  sizeSqm: number; // nominal
  actualAreaSqm: number; // representative surveyed area across plots of this size — display only
  price: number; // this tier's own developer-set price, never derived from a single per-sqm rate
  availability: TierAvailability;
  plotsRemaining: number;
}

// Exported so marketplaceService.ts's projectListing() can reuse this exact
// derivation for a listing's priceTiers — the "one projectListing() function"
// the catalogue unification calls for reuses this rather than re-deriving
// tiers a second way. See landvault-catalogue-unification-plan in project
// memory.
export function tiersFromPlots(estate: Estate): PriceTier[] {
  const nonCorner: Plot[] = estate.plots.filter((p) => p.type !== "corner");
  const sizes = Array.from(new Set(nonCorner.map((p) => p.sqm))).sort((a, b) => a - b);

  return sizes.map((size) => {
    const plotsOfSize = nonCorner.filter((p) => p.sqm === size);
    const remaining = plotsOfSize.filter((p) => p.status === "available-dev" || p.status === "available-inv");
    const avgActualArea = Math.round(plotsOfSize.reduce((s, p) => s + p.actualSqm, 0) / plotsOfSize.length);
    return {
      id: `${estate.id}-${size}`,
      sizeSqm: size,
      actualAreaSqm: avgActualArea,
      price: plotsOfSize[0].price, // every plot at a given non-corner size already shares one real price
      availability: remaining.length === 0 ? "sold_out" : remaining.length <= 3 ? "low_stock" : "available",
      plotsRemaining: remaining.length,
    };
  });
}

// TODO (backend): a real developer sets this price list directly, rather
// than it being derived from generated plot inventory as this mock does.
export async function fetchPriceTiers(estateId: string): Promise<PriceTier[]> {
  if (!apiClient.isMockMode) return apiClient.get<PriceTier[]>(`/api/estates/${estateId}/price-tiers`);
  const estate = await fetchEstateById(estateId);
  return estate ? tiersFromPlots(estate) : [];
}
