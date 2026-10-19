// A developer estate in the marketplace grid (and wherever estates are listed:
// similar estates, the wishlist). Redesigned from the Figma "Estate card v2":
// the price leads with the true total under it, facts are icon chips, and the
// title chip's colour is HomeTrue's actual review — a declared title is never
// shown as a checked one.

import { Link } from "react-router-dom";
import { formatAmount } from "../../data/mockData";
import { formatCompactCurrency } from "../../lib/formatCurrency";
import { fromPrice, cheapestTier, pricePerSqm, type Listing } from "../../services/marketplaceService";
import { fetchCostDisclosure, tierCommitmentForLandPrice } from "../../services/costDisclosureService";
import { useFetch } from "../../lib/useFetch";
import MoneyRangeDisplay from "../cost/MoneyRangeDisplay";
import ListingTypeBadge from "./ListingTypeBadge";
import SellerLine from "./SellerLine";
import WishlistButton from "./WishlistButton";
import { BuildingIcon, FileTextIcon, MapPinIcon, RulerIcon } from "../icons";

interface EstateCardProps {
  listing: Listing;
  // Only meaningful on the Wishlist page.
  priceChangeSinceSaved?: number;
}

function ImageIcon() {
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect width="18" height="18" x="3" y="3" rx="2" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></svg>;
}

// What HomeTrue's review said, in a few words. Rejected reads "not
// confirmed", never "pending": HomeTrue looked and couldn't confirm it.
export function titleChip(listing: Pick<Listing, "titleType" | "titleStatus">): { label: string; className: string } {
  if (!listing.titleType) return { label: "No title recorded", className: "bg-[var(--muted)] text-[var(--muted-foreground)]" };
  switch (listing.titleStatus) {
    case "verified": return { label: `${listing.titleType} verified`, className: "bg-[var(--success-surface)] text-[var(--success-text)]" };
    case "rejected": return { label: "Title not confirmed", className: "bg-[var(--error-surface)] text-[var(--error-text)]" };
    default: return { label: `${listing.titleType} declared`, className: "bg-[var(--warning-surface)] text-[var(--warning-text)]" };
  }
}

export default function EstateCard({ listing, priceChangeSinceSaved }: EstateCardProps) {
  const from = fromPrice(listing);
  const { data: disclosure } = useFetch(() => fetchCostDisclosure(listing.id), [listing.id]);
  const commitment = tierCommitmentForLandPrice(disclosure, from);
  const perSqm = pricePerSqm(cheapestTier(listing));
  const sizes = listing.priceTiers.map((t) => t.sizeSqm);
  const sizeRange = sizes.length > 1 ? `${Math.min(...sizes)}–${Math.max(...sizes)} sqm` : `${sizes[0]} sqm`;
  const plotsRemaining = listing.priceTiers.reduce((s, t) => s + t.plotsRemaining, 0);
  const title = titleChip(listing);

  return (
    <Link
      to={`/marketplace/${listing.id}`}
      className="group flex flex-col h-full bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[var(--accent)]/50 hover:shadow-md transition-all"
    >
      <div className="relative aspect-[3/2] bg-[var(--secondary)]">
        {listing.imageUrl ? (
          <img src={listing.imageUrl} alt={listing.photos[0]?.caption ?? listing.name} loading="lazy" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 text-[var(--secondary-foreground)]/70">
            <ImageIcon />
            <span className="text-xs font-medium">No photos yet</span>
          </div>
        )}
        <div className="absolute top-3 left-3"><ListingTypeBadge type="primary" /></div>
        <div className="absolute top-3 right-3"><WishlistButton listingId={listing.id} listingType="primary" fromPrice={from} /></div>
      </div>

      <div className="flex flex-col flex-1 p-4 gap-3">
        <div>
          <div className="font-semibold text-[var(--foreground)] leading-snug">{listing.name}</div>
          <div className="flex items-center gap-1 text-xs text-[var(--muted-foreground)] mt-0.5"><MapPinIcon size={13} />{listing.area}, {listing.city}, {listing.state}</div>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono-data font-medium text-lg text-[var(--foreground)]" title={formatAmount(from, "NGN")}>from {formatCompactCurrency(from)}</span>
              {priceChangeSinceSaved !== undefined && priceChangeSinceSaved !== 0 && (
                <span className={`text-xs font-medium ${priceChangeSinceSaved < 0 ? "text-[var(--success-text)]" : "text-[var(--warning-text)]"}`}>
                  {priceChangeSinceSaved < 0 ? "↓" : "↑"} {formatCompactCurrency(Math.abs(priceChangeSinceSaved))}
                </span>
              )}
            </div>
            {/* Land price AND total commitment, never one in place of the
                other: two estates at the same land price are not the same
                offer once fees are counted. */}
            {commitment && (
              <div className="text-xs text-[var(--muted-foreground)]">
                Total <MoneyRangeDisplay money={commitment.totalCommitment} currency={commitment.currency} compact className="font-mono-data text-[var(--foreground)]" /> incl. fees
              </div>
            )}
          </div>
          <span className="text-xs text-[var(--muted-foreground)] shrink-0" title="Price per sqm at the lowest available tier — the honest way to compare differently sized plots">
            {formatAmount(perSqm, "NGN")}/sqm
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--muted)] text-xs font-medium text-[var(--foreground)]"><RulerIcon size={13} />{sizeRange}</span>
          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${title.className}`}><FileTextIcon size={13} />{title.label}</span>
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 pt-3 border-t border-[var(--border)] text-xs">
          <span className="inline-flex items-center gap-1.5 min-w-0 text-[var(--muted-foreground)]">
            <BuildingIcon size={13} /><SellerLine seller={listing.seller} className="truncate" />
          </span>
          <span className="shrink-0 font-medium text-[var(--secondary-foreground)]">{plotsRemaining} {plotsRemaining === 1 ? "plot" : "plots"} left</span>
        </div>
      </div>
    </Link>
  );
}
