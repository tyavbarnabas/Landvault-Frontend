// The ONE plot detail panel, for both /estates and /marketplace — merged
// from what used to be two components (this file, and EstateDetail.tsx's
// local PlotDetailPanel function, now gone). Carries the four CTAs the
// estate/plot page needs — Reserve, Book inspection, Enquire, Wishlist —
// with Reserve and Book inspection given equal visual weight, per the
// explicit design note: in this market most buyers inspect before paying, so
// inspection is not a minor action. Also carries the internal estate view's
// investment-projection block (only rendered when the plot has one — see
// mockData.ts's Plot.projectedROI). See landvault-catalogue-unification-plan
// in project memory.
//
// Superseded, on purpose: the old internal panel's "Save plot" (per-plot)
// button is gone — Wishlist (per-estate, below) is now the one bookmarking
// mechanism on both surfaces, not two different-grained ones.

import { useNavigate, useLocation } from "react-router-dom";
import { formatAmount } from "../../data/mockData";
import type { Listing } from "../../services/marketplaceService";
import { pricePerSqm, fromPrice } from "../../services/marketplaceService";
import type { ListingPlot } from "../../services/marketplacePlotsService";
import { plotLabel, priceForPlot } from "../../services/marketplacePlotsService";
import { useApp } from "../../contexts/AppContext";
import { stashPendingIntent } from "../../lib/pendingIntent";
import VerifiedBadge from "./VerifiedBadge";
import WishlistButton from "./WishlistButton";

interface PlotDetailPanelProps {
  plot: ListingPlot;
  listing: Listing;
  onClose?: () => void;
  onOpenEnquiry?: () => void;
}

export default function PlotDetailPanel({ plot, listing, onClose, onOpenEnquiry }: PlotDetailPanelProps) {
  const { isAuthenticated, currency } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  const tier = listing.priceTiers.find((t) => t.id === plot.tierId);
  const { base, final } = priceForPlot(plot, listing.priceTiers, listing.cornerPremiumPct);
  const perSqm = tier ? pricePerSqm(tier) : 0;

  const requireAuth = (action: "reserve" | "inspect" | "enquire") => {
    if (isAuthenticated) return true;
    stashPendingIntent({ action, listingId: listing.id, plotId: plot.id });
    navigate(`/register?returnUrl=${encodeURIComponent(location.pathname + location.search)}`);
    return false;
  };

  const handleReserve = () => {
    if (!requireAuth("reserve")) return;
    navigate(`/marketplace/checkout/${listing.id}/${plot.id}`);
  };

  const handleInspect = () => {
    if (!requireAuth("inspect")) return;
    navigate(`/inspections/new?listingId=${listing.id}&plotId=${plot.id}`);
  };

  const handleEnquire = () => {
    if (!requireAuth("enquire")) return;
    onOpenEnquiry?.();
  };

  const isAvailable = plot.status === "available-dev" || plot.status === "available-inv";

  return (
    <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          {plotLabel(plot)}
          {plot.isCorner && <span className="text-[var(--accent)] text-xs">★ Corner</span>}
        </h3>
        {onClose && <button onClick={onClose} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-lg leading-none" aria-label="Close plot details">×</button>}
      </div>

      <div className="p-5 space-y-4">
        {!isAvailable && (
          <div className="text-xs font-medium px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800">
            This plot is {plot.status === "sold" ? "already sold / allocated" : "currently reserved by another buyer"}. Browse similar available plots on the map.
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Nominal size", value: `${plot.sizeSqm} sqm` },
            { label: "Actual surveyed area", value: `${plot.actualAreaSqm} sqm` },
            { label: "Type", value: plot.isCorner ? "Corner piece ★" : "Standard" },
            { label: "Orientation", value: plot.orientation },
            { label: "Block reference", value: plotLabel(plot) },
            { label: "Title type", value: listing.titleType },
          ].map((d) => (
            <div key={d.label} className="bg-[var(--muted)] rounded-lg p-3">
              <div className="text-xs text-[var(--muted-foreground)] mb-0.5">{d.label}</div>
              <div className="text-sm font-medium">{d.value}</div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <VerifiedBadge />
          <span className="text-xs text-[var(--muted-foreground)]">verified {listing.lastVerifiedDate}</span>
        </div>

        <div className="pt-3 border-t border-[var(--border)]">
          <div className="text-xs text-[var(--muted-foreground)] mb-0.5">Price</div>
          {plot.isCorner ? (
            <>
              <div className="font-display text-2xl text-[var(--foreground)]">{formatAmount(final, currency)}</div>
              <div className="text-xs text-[var(--accent)] mt-0.5">
                {formatAmount(base, currency)} + {listing.cornerPremiumPct}% corner premium = {formatAmount(final, currency)}
              </div>
            </>
          ) : (
            <div className="font-display text-2xl text-[var(--foreground)]">{formatAmount(final, currency)}</div>
          )}
          <div className="text-xs text-[var(--muted-foreground)] mt-1">{formatAmount(perSqm, currency)}/sqm</div>
        </div>

        {plot.projectedROI && (
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
            <div className="text-xs font-medium text-blue-900 mb-1">Investment projection (estimate)</div>
            <div className="text-sm text-blue-800">~{plot.projectedROI}% capital appreciation over {plot.holdingYears} years.</div>
            <div className="text-xs text-blue-600 mt-1">Not a guarantee of returns.</div>
          </div>
        )}

        {/* The four CTAs — Reserve and Book inspection carry equal visual weight */}
        <div className="flex flex-col gap-2 pt-2">
          <button
            onClick={handleReserve}
            disabled={!isAvailable}
            className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Reserve this plot
          </button>
          <button
            onClick={handleInspect}
            className="w-full py-2.5 border-2 border-[var(--primary)] text-[var(--primary)] rounded-md text-sm font-semibold hover:bg-[var(--secondary)] transition-colors"
          >
            📅 Book an inspection
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={handleEnquire} className="py-2 text-sm rounded-md border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors">
              Enquire
            </button>
            <WishlistButton
              listingId={listing.id}
              listingType="primary"
              fromPrice={fromPrice(listing)}
              className="py-2 text-sm rounded-md border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors flex items-center justify-center gap-1.5"
            />
          </div>
        </div>

        <p className="text-xs text-[var(--muted-foreground)] pt-1">
          This plot stays open to other buyers until reserved — inspecting or enquiring doesn't hold it. Save the estate to your wishlist to track it in the meantime.
        </p>
      </div>
    </div>
  );
}
