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
// Laid out from the Figma buyer-path proposal: the price first, in the
// estate's own currency (naira) with the buyer's display currency as an
// approximation under it, then a short fact list, then the actions.

import { useNavigate, useLocation } from "react-router-dom";
import { formatAmount, formatInCurrency } from "../../data/mockData";
import type { Listing } from "../../services/marketplaceService";
import { pricePerSqm, fromPrice, titleLabel } from "../../services/marketplaceService";
import type { ListingPlot } from "../../services/marketplacePlotsService";
import { plotLabel, priceForPlot } from "../../services/marketplacePlotsService";
import { useApp } from "../../contexts/AppContext";
import { stashPendingIntent } from "../../lib/pendingIntent";
import { formatDay } from "../../lib/formatDate";
import Button from "../ui/Button";
import Alert from "../ui/Alert";
import Badge from "../ui/Badge";
import { CalendarIcon, MessageIcon, XIcon } from "../icons";
import WishlistButton from "./WishlistButton";

interface PlotDetailPanelProps {
  plot: ListingPlot;
  listing: Listing;
  onClose?: () => void;
  onOpenEnquiry?: () => void;
}

const FACING: Record<string, string> = {
  N: "north", S: "south", E: "east", W: "west", NE: "north-east", NW: "north-west", SE: "south-east", SW: "south-west",
};

export default function PlotDetailPanel({ plot, listing, onClose, onOpenEnquiry }: PlotDetailPanelProps) {
  const { isAuthenticated, currency } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  const tier = listing.priceTiers.find((t) => t.id === plot.tierId);
  const priceCurrency = tier?.currency ?? "NGN";
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
  // Live, the marketplace says only "unavailable" — reserved and sold are
  // deliberately indistinguishable, so neither is claimed.
  const status = isAvailable ? { label: "Available", variant: "success" as const }
    : plot.publicAvailability === "unavailable" ? { label: "Not available", variant: "neutral" as const }
      : plot.status === "sold" ? { label: "Sold", variant: "error" as const } : { label: "Reserved", variant: "warning" as const };
  const facing = plot.orientation ? FACING[plot.orientation.toUpperCase()] : undefined;

  const facts: [string, string][] = [
    ["Surveyed area", plot.hasBoundary === false ? "Not surveyed yet" : `${plot.actualAreaSqm} sqm`],
    ["Type", plot.isCorner ? `Corner plot (+${listing.cornerPremiumPct}%)` : "Standard"],
    // Live plots carry no orientation; leave the row out rather than guess.
    ...(plot.orientation ? [["Orientation", facing ? `Faces ${facing}` : plot.orientation] as [string, string]] : []),
    ["Title", titleLabel(listing.titleType, listing.titleStatus)],
    ["Land checked", listing.lastVerifiedDate ? formatDay(listing.lastVerifiedDate) : "Not checked yet"],
  ];

  return (
    <section aria-labelledby="plot-heading" className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1.5">
          <h2 id="plot-heading" className="font-display text-2xl text-[var(--foreground)]">{plotLabel(plot)}</h2>
          <div className="flex flex-wrap gap-1.5">
            <Badge label={status.label} variant={status.variant} />
            {plot.isCorner && <Badge label="Corner" variant="info" />}
          </div>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="p-1 -m-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]" aria-label="Close plot details">
            <XIcon size={18} />
          </button>
        )}
      </div>

      <div>
        <div className="font-mono-data font-medium text-2xl text-[var(--foreground)]">{formatInCurrency(final, priceCurrency)}</div>
        {plot.isCorner && (
          <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
            {formatInCurrency(base, priceCurrency)} + {listing.cornerPremiumPct}% corner premium
          </div>
        )}
        <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{formatInCurrency(perSqm, priceCurrency)}/sqm · {plot.sizeSqm} sqm plot</div>
        {/* The estate prices in its own currency; the buyer's display currency
            is only ever an approximation of it. */}
        {currency !== priceCurrency && (
          <div className="text-xs text-[var(--muted-foreground)] mt-0.5">≈ {formatAmount(final, currency)} in your display currency</div>
        )}
      </div>

      <dl className="divide-y divide-[var(--border)] border-y border-[var(--border)]">
        {facts.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 py-2 text-sm">
            <dt className="text-[var(--muted-foreground)]">{k}</dt>
            <dd className="font-medium text-[var(--foreground)] text-right">{v}</dd>
          </div>
        ))}
      </dl>

      {!isAvailable && (
        <Alert>
          {plot.publicAvailability === "unavailable"
            ? "This plot isn't available right now. Choose another available plot on the map."
            : `This plot is ${plot.status === "sold" ? "already sold" : "reserved by another buyer"}. Choose another available plot on the map.`}
        </Alert>
      )}

      {plot.hasBoundary === false && (
        // The backend's own rule: never present an unsurveyed plot like a surveyed one.
        <Alert>
          <span className="font-semibold">Boundary not surveyed yet.</span> This plot isn't on the map, its exact position in the estate isn't confirmed, and it isn't covered by HomeTrue's double-allocation check until it's surveyed. Ask the developer before you commit.
        </Alert>
      )}

      {plot.projectedROI && (
        <Alert tone="info" title="Investment projection (estimate)">
          ~{plot.projectedROI}% capital appreciation over {plot.holdingYears} years. Not a guarantee of returns.
        </Alert>
      )}

      <div className="space-y-2">
        <Button size="lg" fullWidth onClick={handleReserve} disabled={!isAvailable}>Reserve this plot</Button>
        <Button size="lg" variant="secondary" fullWidth onClick={handleInspect} className="inline-flex items-center justify-center gap-2">
          <CalendarIcon size={16} />Book an inspection
        </Button>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1">
          <Button variant="link" onClick={handleEnquire} className="inline-flex items-center gap-1.5"><MessageIcon size={14} />Ask the developer</Button>
          <WishlistButton listingId={listing.id} listingType="primary" fromPrice={fromPrice(listing)} label="Save estate"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent)] hover:underline" />
        </div>
      </div>

      <p className="text-xs text-[var(--muted-foreground)]">
        Stays open to other buyers until you reserve — inspecting or asking the developer doesn't hold it.
      </p>
    </section>
  );
}
