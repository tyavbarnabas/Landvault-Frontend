// Choosing a plot against the live backend. The grid canvas needs grid
// positions the backend doesn't have; what it DOES have is the estate's
// public map (plots with a surveyed boundary) and a plot list (every plot,
// with `hasBoundary`). So: pick a tier, see the plots on the map, choose one
// from the list — including plots not yet surveyed, clearly marked.
//
// The list is one tier, one page at a time: an estate can have hundreds of
// plots in a tier, and an endless scroll of them helps nobody. Available plots
// only by default — the ones a buyer can actually choose.
//
// Prices are worked out from the tier and the estate's corner premium, which
// is exactly what the backend's plot endpoints say to do (they carry no price).

import { useEffect, useState } from "react";
import { formatInCurrency } from "../../data/mockData";
import { useFetch } from "../../lib/useFetch";
import { fetchListingMap, fetchTierPlots, plotLabel, priceForPlot, type ListingPlot } from "../../services/marketplacePlotsService";
import type { Listing } from "../../services/marketplaceService";
import EstateBoundaryMap from "../map/EstateBoundaryMap";
import LoadError from "../LoadError";

const PAGE_SIZE = 20;

export default function LivePlotPicker({ listing, selectedSizeSqm, onSelectSizeSqm, selectedPlotId, onSelectPlot }: {
  listing: Listing;
  selectedSizeSqm: number | null;
  onSelectSizeSqm: (sqm: number) => void;
  selectedPlotId: string | undefined;
  onSelectPlot: (plot: ListingPlot | null) => void;
}) {
  const map = useFetch(() => fetchListingMap(listing.id), [listing.id]);
  const tier = listing.priceTiers.find((t) => t.sizeSqm === selectedSizeSqm) ?? null;

  const [availableOnly, setAvailableOnly] = useState(true);
  // Cursor-paged: cursors[i] opens page i (page 0 needs none), so Previous is
  // stepping back through cursors already seen.
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [pageIndex, setPageIndex] = useState(0);
  useEffect(() => { setCursors([undefined]); setPageIndex(0); }, [tier?.id, availableOnly]);

  const cursor = cursors[pageIndex];
  const page = useFetch(
    () => (tier ? fetchTierPlots(listing.id, tier.id, { availableOnly, limit: PAGE_SIZE, cursor }) : Promise.resolve(null)),
    [listing.id, tier?.id, availableOnly, cursor],
  );
  const plots = page.data?.items ?? [];
  const total = page.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const first = total === 0 ? 0 : pageIndex * PAGE_SIZE + 1;
  const last = Math.min(total, pageIndex * PAGE_SIZE + plots.length);

  const goNext = () => {
    const next = page.data?.cursor;
    if (!next) return;
    setCursors((c) => [...c.slice(0, pageIndex + 1), next]);
    setPageIndex((i) => i + 1);
  };
  const goPrevious = () => setPageIndex((i) => Math.max(0, i - 1));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Plot size">
        {listing.priceTiers.map((t) => (
          <button key={t.id} type="button" onClick={() => onSelectSizeSqm(t.sizeSqm)} disabled={t.availability === "sold_out"}
            aria-pressed={t.sizeSqm === selectedSizeSqm}
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

      {tier && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--foreground)]" aria-live="polite">
            {page.loading && !page.data ? "Loading plots…"
              : total === 0 ? (availableOnly ? "No available plots of this size." : "No plots of this size.")
              : `${total} ${availableOnly ? "available " : ""}${total === 1 ? "plot" : "plots"} · showing ${first}–${last}`}
          </p>
          <label className="flex items-center gap-2 text-sm text-[var(--muted-foreground)] cursor-pointer">
            <input type="checkbox" checked={!availableOnly} onChange={(e) => setAvailableOnly(!e.target.checked)} className="w-3.5 h-3.5 accent-[var(--accent)]" />
            Show unavailable plots too
          </label>
        </div>
      )}

      {plots.some((p) => p.hasBoundary === false) && (
        <p className="text-xs text-amber-800">
          Plots marked “boundary not surveyed” aren't on the map: their exact position in the estate isn't confirmed yet.
        </p>
      )}

      {page.error ? <LoadError error={page.errorValue} what="this size's plots" onRetry={page.refetch} />
        : plots.length > 0 && (
          <ul className={`space-y-2 ${page.loading ? "opacity-60" : ""}`} aria-label="Plots" aria-busy={page.loading}>
            {plots.map((plot) => {
              const available = plot.publicAvailability === "available";
              const { final } = priceForPlot(plot, listing.priceTiers, listing.cornerPremiumPct);
              return (
                <li key={plot.id}>
                  <button type="button" onClick={() => onSelectPlot(plot)} disabled={!available}
                    aria-pressed={plot.id === selectedPlotId}
                    className={`w-full text-left px-4 py-3 rounded-lg border text-sm flex items-center gap-3 ${plot.id === selectedPlotId ? "border-[var(--accent)] bg-[var(--muted)]" : "border-[var(--border)] bg-[var(--card)]"} disabled:opacity-60`}>
                    <span className="font-medium text-[var(--foreground)]">{plotLabel(plot)}{plot.isCorner ? " ★" : ""}</span>
                    <span className="text-[var(--muted-foreground)]">{plot.sizeSqm ? `${plot.sizeSqm} sqm` : ""}</span>
                    {plot.hasBoundary === false && <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200">boundary not surveyed</span>}
                    <span className="ml-auto font-mono-data text-[var(--foreground)]">{available ? formatInCurrency(final, tier?.currency) : "Not available"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

      {total > PAGE_SIZE && (
        <nav className="flex items-center justify-between gap-3 pt-1" aria-label="Plot pages">
          <button type="button" onClick={goPrevious} disabled={pageIndex === 0 || page.loading}
            className="px-3 py-1.5 border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-40">
            ← Previous
          </button>
          <span className="text-sm text-[var(--muted-foreground)]">Page {pageIndex + 1} of {pageCount}</span>
          <button type="button" onClick={goNext} disabled={!page.data?.hasMore || page.loading}
            className="px-3 py-1.5 border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-40">
            Next →
          </button>
        </nav>
      )}
    </div>
  );
}
