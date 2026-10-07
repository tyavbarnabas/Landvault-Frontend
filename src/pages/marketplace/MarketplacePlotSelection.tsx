// Part 1 of the buyer flow past estate detail: /marketplace/:estateId/plots
// Selecting a size tier on MarketplaceEstateDetail lands here, filtered to
// that tier's available plots. Public — plot browsing works anonymously,
// same as the rest of the marketplace; only the CTAs in PlotDetailPanel gate
// on auth.

import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { fetchListingById, type Listing } from "../../services/marketplaceService";
import { fetchPlotById, fetchPlotsForListing, CANVAS_PLOT_FETCH_LIMIT, type ListingPlot } from "../../services/marketplacePlotsService";
import PlotCanvas from "../../components/PlotCanvas";
import LivePlotPicker from "../../components/marketplace/LivePlotPicker";
import LoadError from "../../components/LoadError";
import { isLive } from "../../lib/backends";
import PlotDetailPanel from "../../components/marketplace/PlotDetailPanel";
import EnquiryPanel from "../../components/marketplace/EnquiryPanel";

export default function MarketplacePlotSelection() {
  const { estateId } = useParams<{ estateId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [listing, setListing] = useState<Listing | undefined>();
  const [plots, setPlots] = useState<ListingPlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  // Live: the picker loads one page at a time, so the chosen plot is kept
  // here rather than looked up in a full plot list.
  const live = isLive("marketplacePlots");
  const [livePlot, setLivePlot] = useState<ListingPlot | null>(null);

  const sizeParam = searchParams.get("size");
  const selectedSize = sizeParam ? Number(sizeParam) : null;
  const selectedPlotId = searchParams.get("plot");
  const selectedPlot = live
    ? (livePlot?.id === selectedPlotId ? livePlot : null)
    : plots.find((p) => p.id === selectedPlotId) ?? null;

  // A link straight to a plot (shared, or resuming after sign-in): look it up.
  useEffect(() => {
    if (!live || !estateId || !selectedPlotId || livePlot?.id === selectedPlotId) return;
    let cancelled = false;
    fetchPlotById(estateId, selectedPlotId).then((p) => { if (!cancelled) setLivePlot(p ?? null); }).catch(() => {});
    return () => { cancelled = true; };
  }, [live, estateId, selectedPlotId, livePlot?.id]);

  useEffect(() => {
    if (!estateId) return;
    setLoading(true);
    setLoadError(null);
    // Live, the whole estate is never loaded for the list — the picker pages it.
    const allPlots = live ? Promise.resolve({ items: [] as ListingPlot[], total: 0, hasMore: false }) : fetchPlotsForListing(estateId, { limit: CANVAS_PLOT_FETCH_LIMIT });
    Promise.all([fetchListingById(estateId), allPlots]).catch((err) => {
      setLoadError(err);
      setLoading(false);
      return null;
    }).then((result) => {
      if (!result) return;
      const [l, plotsPage] = result;
      setListing(l);
      setPlots(plotsPage.items);
      setLoading(false);
      // Default to the requested size, else the first tier with stock.
      if (l && !sizeParam) {
        const first = l.priceTiers.find((t) => t.availability !== "sold_out");
        if (first) setSearchParams((prev) => { prev.set("size", String(first.sizeSqm)); return prev; }, { replace: true });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estateId]);

  // Resume an "enquire" intent after auth (see pendingIntent.ts / Login.tsx).
  useEffect(() => {
    if (searchParams.get("enquire") === "1" && selectedPlotId) setEnquiryOpen(true);
  }, [searchParams, selectedPlotId]);

  if (loading) return <div className="p-8 text-[var(--muted-foreground)] text-sm">Loading plots…</div>;
  if (loadError) return <LoadError error={loadError} what="this estate's plots" />;
  if (!listing) return <div className="p-8 text-[var(--muted-foreground)] text-sm">Estate not found.</div>;

  const setSize = (sqm: number) => setSearchParams((prev) => { prev.set("size", String(sqm)); prev.delete("plot"); return prev; });
  const setPlot = (plot: ListingPlot | null) => { setLivePlot(plot); setSearchParams((prev) => {
    if (plot) prev.set("plot", plot.id); else prev.delete("plot");
    return prev;
  }); };

  return (
    <div className="max-w-6xl mx-auto p-6">
      <nav className="text-xs text-[var(--muted-foreground)] mb-4 flex items-center gap-1.5">
        <button onClick={() => navigate(`/marketplace/${listing.id}`)} className="hover:text-[var(--foreground)]">{listing.name}</button>
        <span>/</span>
        <span className="text-[var(--foreground)]">Select a plot</span>
      </nav>

      <div className="mb-6">
        <h1 className="font-display text-2xl text-[var(--foreground)] mb-1">{listing.name} — select a plot</h1>
        <p className="text-sm text-[var(--muted-foreground)]">{listing.area}, {listing.city}, {listing.state}. Choose a size tier, then {isLive("marketplacePlots") ? "pick an available plot from the list" : "click an available plot on the map"}.</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {live ? (
            // The backend has a map, not a grid: choose from the map's plots.
            <LivePlotPicker
              listing={listing}
              selectedSizeSqm={selectedSize}
              onSelectSizeSqm={setSize}
              selectedPlotId={selectedPlotId ?? undefined}
              onSelectPlot={setPlot}
            />
          ) : (
          <PlotCanvas
            estateId={listing.id}
            plots={plots}
            tiers={listing.priceTiers}
            cornerPremiumPct={listing.cornerPremiumPct}
            selectedSizeSqm={selectedSize}
            onSelectSizeSqm={setSize}
            selectedPlotId={selectedPlotId ?? undefined}
            onSelectPlot={setPlot}
            mode="select"
          />
          )}
        </div>

        <div>
          {selectedPlot ? (
            <PlotDetailPanel
              plot={selectedPlot}
              listing={listing}
              onClose={() => setPlot(null)}
              onOpenEnquiry={() => setEnquiryOpen(true)}
            />
          ) : (
            <div className="bg-[var(--muted)] rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted-foreground)]">
              <div className="text-2xl mb-2">👆</div>
              {live ? "Pick an available plot from the list to see its details, pricing, and booking options."
                : "Click any available plot on the map to see its details, pricing, and booking options."}
            </div>
          )}
        </div>
      </div>

      {enquiryOpen && selectedPlot && (
        <EnquiryPanel listing={listing} plot={selectedPlot} onClose={() => { setEnquiryOpen(false); searchParams.delete("enquire"); setSearchParams(searchParams, { replace: true }); }} />
      )}

      <Link to={`/marketplace/${listing.id}`} className="inline-block mt-8 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">← Back to {listing.name}</Link>
    </div>
  );
}
