// Part 1 of the buyer flow past estate detail: /marketplace/:estateId/plots
// Selecting a size tier on MarketplaceEstateDetail lands here, filtered to
// that tier's available plots. Public — plot browsing works anonymously,
// same as the rest of the marketplace; only the CTAs in PlotDetailPanel gate
// on auth.
//
// Laid out from the Figma buyer-path proposal: the checkout's steps start
// here, sizes as cards with price and stock, the map in a card, the chosen
// plot beside it — and on a phone, a bar pinned with its price.

import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { formatInCurrency } from "../../data/mockData";
import { fetchListingById, listingPlace, titleLabel, type Listing } from "../../services/marketplaceService";
import { fetchPlotById, fetchPlotsForListing, plotLabel, priceForPlot, CANVAS_PLOT_FETCH_LIMIT, type ListingPlot } from "../../services/marketplacePlotsService";
import PlotCanvas from "../../components/PlotCanvas";
import LivePlotPicker from "../../components/marketplace/LivePlotPicker";
import LoadError from "../../components/LoadError";
import { isLive } from "../../lib/backends";
import PlotDetailPanel from "../../components/marketplace/PlotDetailPanel";
import EnquiryPanel from "../../components/marketplace/EnquiryPanel";
import { CheckoutSteps } from "../../components/checkout/CheckoutShell";
import { Loading } from "../../components/ui/Page";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import TextLink from "../../components/ui/TextLink";
import { cx } from "../../components/ui/cx";
import { MapPinIcon } from "../../components/icons";

// The same journey the checkout shows: choosing the plot is step 1.
const STEPS = ["Choose a plot", "Review", "Purchase details", "Payment"];

export default function MarketplacePlotSelection() {
  const { estateId } = useParams<{ estateId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const [listing, setListing] = useState<Listing | undefined>();
  const [plots, setPlots] = useState<ListingPlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
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

  if (loading) return <div className="max-w-6xl mx-auto p-6"><Loading label="Loading plots…" /></div>;
  if (loadError) return <LoadError error={loadError} what="this estate's plots" />;
  if (!listing) return <div className="max-w-6xl mx-auto p-6 text-sm text-[var(--muted-foreground)]">Estate not found. <TextLink to="/marketplace">Back to the marketplace</TextLink></div>;

  const setSize = (sqm: number) => setSearchParams((prev) => { prev.set("size", String(sqm)); prev.delete("plot"); return prev; });
  const setPlot = (plot: ListingPlot | null) => { setLivePlot(plot); setSearchParams((prev) => {
    if (plot) prev.set("plot", plot.id); else prev.delete("plot");
    return prev;
  }); };
  const showPanel = () => panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  // Demo mode has every plot, so it counts them; live, the tier's own count.
  const isOpen = (p: ListingPlot) => p.status === "available-dev" || p.status === "available-inv";
  const availableIn = (sizeSqm: number, fallback: number) => live ? fallback : plots.filter((p) => p.sizeSqm === sizeSqm && isOpen(p)).length;
  const inSize = plots.filter((p) => p.sizeSqm === selectedSize);
  const titleLine = listing.titleType ? titleLabel(listing.titleType, listing.titleStatus) : null;
  const selectedPrice = selectedPlot ? priceForPlot(selectedPlot, listing.priceTiers, listing.cornerPremiumPct).final : 0;
  const selectedCurrency = listing.priceTiers.find((t) => t.id === selectedPlot?.tierId)?.currency ?? "NGN";

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 pb-28 lg:pb-10">
      <div className="mb-6"><CheckoutSteps steps={STEPS} current={0} /></div>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <TextLink to={`/marketplace/${listing.id}`} muted className="inline-block text-sm mb-2">← {listing.name}</TextLink>
          <h1 className="font-display text-3xl text-[var(--foreground)]">Choose your plot</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1 flex items-start gap-1.5">
            <MapPinIcon size={14} className="mt-0.5 shrink-0" /><span>{[listing.name, listingPlace(listing), titleLine].filter(Boolean).join(" · ")}</span>
          </p>
        </div>
        {listing.cornerPremiumPct > 0 && <p className="text-sm text-[var(--muted-foreground)]">Corner plots +{listing.cornerPremiumPct}%</p>}
      </header>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_24rem] gap-6 items-start">
        <div className="space-y-4 min-w-0">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" role="group" aria-label="Plot size">
            {listing.priceTiers.map((t) => {
              const on = t.sizeSqm === selectedSize;
              const soldOut = t.availability === "sold_out";
              const left = availableIn(t.sizeSqm, t.plotsRemaining);
              return (
                <button key={t.id} type="button" disabled={soldOut} aria-pressed={on} onClick={() => setSize(t.sizeSqm)}
                  className={cx("text-left rounded-lg border p-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                    on ? "border-2 border-[var(--primary)] bg-[var(--secondary)]" : "border-[var(--border)] bg-[var(--card)] hover:bg-[var(--muted)]")}>
                  <div className="text-sm font-semibold text-[var(--foreground)]">{t.sizeSqm ? `${t.sizeSqm} sqm` : "Unit"}</div>
                  <div className="font-mono-data text-sm text-[var(--foreground)]">{formatInCurrency(t.price, t.currency ?? "NGN")}</div>
                  <div className="text-xs text-[var(--muted-foreground)]">{soldOut ? "Sold out" : `${left} available`}</div>
                </button>
              );
            })}
          </div>

          <Card padding="md" className="space-y-3">
            {live ? (
              // The backend has a map, not a grid: choose from the map's plots.
              <LivePlotPicker listing={listing} selectedSizeSqm={selectedSize} onSelectSizeSqm={setSize}
                selectedPlotId={selectedPlotId ?? undefined} onSelectPlot={setPlot} hideSizes />
            ) : (
              <>
                <PlotCanvas estateId={listing.id} plots={plots} tiers={listing.priceTiers} cornerPremiumPct={listing.cornerPremiumPct}
                  selectedSizeSqm={selectedSize} selectedPlotId={selectedPlotId ?? undefined} onSelectPlot={setPlot} mode="select" priceCurrency="NGN"
                  caption={selectedSize !== null
                    ? `Click a plot, or tab to it and press Enter. ${inSize.filter(isOpen).length} of the ${inSize.length} plots at ${selectedSize} sqm are available. Drag to pan; zoom with the buttons or Ctrl/⌘ + scroll.`
                    : undefined} />
              </>
            )}
          </Card>
        </div>

        <div ref={panelRef} className="lg:sticky lg:top-6 scroll-mt-4">
          {selectedPlot ? (
            <PlotDetailPanel plot={selectedPlot} listing={listing} onClose={() => setPlot(null)} onOpenEnquiry={() => setEnquiryOpen(true)} />
          ) : (
            <Card className="text-center">
              <span className="w-11 h-11 mx-auto mb-3 rounded-full bg-[var(--muted)] text-[var(--muted-foreground)] flex items-center justify-center"><MapPinIcon size={20} /></span>
              <p className="text-sm font-medium text-[var(--foreground)] mb-1">Pick a plot</p>
              <p className="text-sm text-[var(--muted-foreground)]">
                {live ? "Choose an available plot from the list to see its price, details and booking options."
                  : "Click any available plot on the map to see its price, details and booking options."}
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* Phone: a chosen plot pins its price and the way on to the bottom. */}
      {selectedPlot && (
        <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border)] bg-[var(--card)] px-4 py-3 flex items-center justify-between gap-3 shadow-lg">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[var(--foreground)] truncate">{plotLabel(selectedPlot)}</div>
            <div className="font-mono-data text-xs text-[var(--muted-foreground)]">{formatInCurrency(selectedPrice, selectedCurrency)} · {selectedPlot.sizeSqm} sqm</div>
          </div>
          <Button onClick={showPanel}>View &amp; reserve</Button>
        </div>
      )}

      {enquiryOpen && selectedPlot && (
        <EnquiryPanel listing={listing} plot={selectedPlot} onClose={() => { setEnquiryOpen(false); searchParams.delete("enquire"); setSearchParams(searchParams, { replace: true }); }} />
      )}
    </div>
  );
}
