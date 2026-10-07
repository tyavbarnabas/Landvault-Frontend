// Choosing a plot against the live backend. The grid canvas needs grid
// positions the backend doesn't have; what it DOES have is the estate's
// public map — every plot with a surveyed boundary, its tier, corner flag,
// sizes and availability. So: pick a tier, see the plots on the map, choose
// one from the list.
//
// Prices are worked out from the tier and the estate's corner premium, which
// is exactly what the backend's map endpoint says to do (it carries no price).

import { useMemo } from "react";
import { formatInCurrency } from "../../data/mockData";
import { useFetch } from "../../lib/useFetch";
import { fetchListingMap, plotLabel, priceForPlot, type ListingPlot } from "../../services/marketplacePlotsService";
import type { Listing } from "../../services/marketplaceService";
import EstateBoundaryMap from "../map/EstateBoundaryMap";
import LoadError from "../LoadError";

export default function LivePlotPicker({ listing, plots, selectedSizeSqm, onSelectSizeSqm, selectedPlotId, onSelectPlot }: {
  listing: Listing;
  plots: ListingPlot[];
  selectedSizeSqm: number | null;
  onSelectSizeSqm: (sqm: number) => void;
  selectedPlotId: string | undefined;
  onSelectPlot: (plot: ListingPlot | null) => void;
}) {
  const map = useFetch(() => fetchListingMap(listing.id), [listing.id]);
  const tier = listing.priceTiers.find((t) => t.sizeSqm === selectedSizeSqm) ?? null;
  const inTier = useMemo(
    () => plots.filter((p) => !tier || p.tierId === tier.id)
      .sort((a, b) => Number(b.publicAvailability === "available") - Number(a.publicAvailability === "available")
        || String(a.block).localeCompare(String(b.block)) || String(a.plotNumber).localeCompare(String(b.plotNumber), undefined, { numeric: true })),
    [plots, tier],
  );
  const availableHere = inTier.filter((p) => p.publicAvailability === "available").length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Plot size">
        {listing.priceTiers.map((t) => (
          <button key={t.id} type="button" onClick={() => onSelectSizeSqm(t.sizeSqm)} disabled={t.availability === "sold_out"}
            className={`px-3 py-1.5 rounded-md border text-sm ${t.sizeSqm === selectedSizeSqm ? "border-[var(--accent)] bg-[var(--muted)] text-[var(--foreground)]" : "border-[var(--border)] text-[var(--muted-foreground)]"} disabled:opacity-50`}>
            {t.sizeSqm ? `${t.sizeSqm} sqm` : "Unit"} · {formatInCurrency(t.price, t.currency)}{t.availability === "sold_out" ? " · sold out" : ""}
          </button>
        ))}
      </div>

      {map.error ? <LoadError error={map.errorValue} what="the estate map" onRetry={map.refetch} />
        : map.data && map.data.features.length > 0 && (
          <EstateBoundaryMap
            boundary={map.data as never}
            label={`${listing.name}: plots on satellite imagery`}
            styleForFeature={(props) => props.kind !== "plot"
              ? { color: "#f59e0b", weight: 2, fillOpacity: 0.05 }
              : props.id === selectedPlotId
                ? { color: "#2563EB", weight: 3, fillOpacity: 0.6 }
                : String(props.availability).toUpperCase() === "AVAILABLE"
                  ? { color: "#16A34A", weight: 1, fillOpacity: 0.45 }
                  : { color: "#64748B", weight: 1, fillOpacity: 0.35 }}
            legend={[{ color: "#16A34A", label: "Available" }, { color: "#64748B", label: "Not available" }, { color: "#2563EB", label: "Selected" }]}
          />
        )}

      {tier && tier.plotsRemaining > availableHere && (
        // Only plots with a surveyed boundary are on the public map, so some
        // available plots can't be chosen online yet.
        <p className="text-xs text-[var(--muted-foreground)]">
          Some available plots in this size aren't on the map yet — they have no surveyed boundary — so they can't be chosen online.
        </p>
      )}

      {inTier.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">No plots of this size are on the map.</p>
      ) : (
        <ul className="space-y-2" aria-label="Plots">
          {inTier.map((plot) => {
            const available = plot.publicAvailability === "available";
            const { final } = priceForPlot(plot, listing.priceTiers, listing.cornerPremiumPct);
            return (
              <li key={plot.id}>
                <button type="button" onClick={() => onSelectPlot(plot)} disabled={!available}
                  className={`w-full text-left px-4 py-3 rounded-lg border text-sm flex items-center gap-3 ${plot.id === selectedPlotId ? "border-[var(--accent)] bg-[var(--muted)]" : "border-[var(--border)] bg-[var(--card)]"} disabled:opacity-60`}>
                  <span className="font-medium text-[var(--foreground)]">{plotLabel(plot)}{plot.isCorner ? " ★" : ""}</span>
                  <span className="text-[var(--muted-foreground)]">{plot.sizeSqm ? `${plot.sizeSqm} sqm` : ""}</span>
                  <span className="ml-auto font-mono-data text-[var(--foreground)]">{available ? formatInCurrency(final, tier?.currency) : "Not available"}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
