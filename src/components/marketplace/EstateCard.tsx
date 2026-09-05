import { Link } from "react-router-dom";
import { formatAmount } from "../../data/mockData";
import { formatCompactCurrency } from "../../lib/formatCurrency";
import { fromPrice, cheapestTier, pricePerSqm, type Listing } from "../../services/marketplaceService";
import ListingTypeBadge from "./ListingTypeBadge";
import SellerLine from "./SellerLine";
import WishlistButton from "./WishlistButton";

interface EstateCardProps {
  listing: Listing;
  // Only passed on the Wishlist page — the delta since the user saved it.
  // Undefined means "don't show an indicator at all" (feed/similar-estates use).
  priceChangeSinceSaved?: number;
}

export default function EstateCard({ listing, priceChangeSinceSaved }: EstateCardProps) {
  const from = fromPrice(listing);
  const perSqm = pricePerSqm(cheapestTier(listing));
  const sizes = listing.priceTiers.map((t) => t.sizeSqm);
  const sizeRange = sizes.length > 1 ? `${Math.min(...sizes)}–${Math.max(...sizes)} sqm` : `${sizes[0]} sqm`;
  const plotsRemaining = listing.priceTiers.reduce((s, t) => s + t.plotsRemaining, 0);

  return (
    <Link
      to={`/marketplace/${listing.id}`}
      className="block bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[var(--accent)]/50 hover:shadow-sm transition-all"
    >
      <div className="relative aspect-[4/3] bg-[var(--muted)]">
        {listing.imageUrl ? (
          <img src={listing.imageUrl} alt={listing.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--muted-foreground)]/40">
              <path d="M9 3L3 5v16l6-2 6 2 6-2V5l-6 2-6-2Z" />
              <path d="M9 3v16M15 5v16" />
            </svg>
          </div>
        )}
        <div className="absolute top-2.5 left-2.5">
          <ListingTypeBadge type="primary" />
        </div>
        <div className="absolute top-2.5 right-2.5">
          <WishlistButton listingId={listing.id} listingType="primary" fromPrice={from} />
        </div>
      </div>

      <div className="p-4">
        <div className="font-semibold text-[var(--foreground)] mb-0.5">{listing.name}</div>
        <div className="text-xs text-[var(--muted-foreground)] mb-2.5">{listing.area}, {listing.city}, {listing.state}</div>

        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-semibold font-mono-data text-lg text-[var(--foreground)]" title={formatAmount(from, "NGN")}>from {formatCompactCurrency(from)}</span>
          {priceChangeSinceSaved !== undefined && priceChangeSinceSaved !== 0 && (
            <span className={`text-xs font-medium ${priceChangeSinceSaved < 0 ? "text-emerald-600" : "text-amber-600"}`}>
              {priceChangeSinceSaved < 0 ? "↓" : "↑"} {formatCompactCurrency(Math.abs(priceChangeSinceSaved))}
            </span>
          )}
        </div>
        <div className="text-xs text-[var(--muted-foreground)] mb-2.5" title="Price per sqm at the lowest available tier — the honest way to compare differently sized plots">
          {formatAmount(perSqm, "NGN")}/sqm
        </div>

        <SellerLine seller={listing.seller} className="text-xs text-[var(--muted-foreground)] block mb-2.5" />

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--muted-foreground)] pt-2.5 border-t border-[var(--border)]">
          <span>{sizeRange}</span>
          <span>·</span>
          <span>{listing.titleType}</span>
          <span>·</span>
          <span>{plotsRemaining} plots left</span>
        </div>
      </div>
    </Link>
  );
}
