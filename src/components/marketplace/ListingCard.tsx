// The single card component the unified feed renders for both listing
// types — PART 4 of the marketplace-unification spec. Primary listings
// reuse the existing EstateCard unchanged (it already renders everything a
// primary card needs); resale gets its own layout here, since the two
// genuinely differ in content, not just styling. Dispatched by
// `item.listingType`, so a caller never has to branch itself.

import { Link } from "react-router-dom";
import { formatAmount } from "../../data/mockData";
import { formatCompactCurrency } from "../../lib/formatCurrency";
import type { MarketplaceListing } from "../../services/marketplaceFeedService";
import type { ResaleListing } from "../../services/resaleService";
import EstateCard from "./EstateCard";
import ListingTypeBadge from "./ListingTypeBadge";
import WishlistButton from "./WishlistButton";

interface ListingCardProps {
  item: MarketplaceListing;
  // Only meaningful on the Wishlist page — see EstateCard's own note on this.
  priceChangeSinceSaved?: number;
}

export default function ListingCard({ item, priceChangeSinceSaved }: ListingCardProps) {
  if (item.listingType === "primary") {
    return <EstateCard listing={item.data} priceChangeSinceSaved={priceChangeSinceSaved} />;
  }
  return <ResaleListingCard listing={item.data} priceChangeSinceSaved={priceChangeSinceSaved} />;
}

function ResaleListingCard({ listing, priceChangeSinceSaved }: { listing: ResaleListing; priceChangeSinceSaved?: number }) {
  const perSqm = listing.asking / listing.sqm;

  return (
    <Link
      to={`/marketplace/resale/${listing.id}`}
      className="block bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden hover:border-[var(--accent)]/50 hover:shadow-sm transition-all"
    >
      <div className="relative aspect-[4/3] bg-[var(--muted)] flex items-center justify-center">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--muted-foreground)]/40">
          <path d="M9 3L3 5v16l6-2 6 2 6-2V5l-6 2-6-2Z" />
          <path d="M9 3v16M15 5v16" />
        </svg>
        <div className="absolute top-2.5 left-2.5">
          <ListingTypeBadge type="resale" />
        </div>
        <div className="absolute top-2.5 right-2.5">
          <WishlistButton listingId={listing.id} listingType="resale" fromPrice={listing.asking} />
        </div>
        {listing.isCorner && (
          <div className="absolute bottom-2.5 right-2.5 bg-[var(--accent)] text-white text-[11px] px-2 py-0.5 rounded-full">Corner ★</div>
        )}
      </div>

      <div className="p-4">
        <div className="font-semibold text-[var(--foreground)] mb-0.5">{listing.estateName} — {listing.plotLabel}</div>
        <div className="text-xs text-[var(--muted-foreground)] mb-2.5">{listing.location}, {listing.state}</div>

        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-semibold font-mono-data text-lg text-[var(--foreground)]" title={formatAmount(listing.asking, "NGN")}>{formatCompactCurrency(listing.asking)}</span>
          {priceChangeSinceSaved !== undefined && priceChangeSinceSaved !== 0 && (
            <span className={`text-xs font-medium ${priceChangeSinceSaved < 0 ? "text-emerald-600" : "text-amber-600"}`}>
              {priceChangeSinceSaved < 0 ? "↓" : "↑"} {formatCompactCurrency(Math.abs(priceChangeSinceSaved))}
            </span>
          )}
        </div>
        <div className="text-xs text-[var(--muted-foreground)] mb-2.5">{formatAmount(perSqm, "NGN")}/sqm</div>

        {/* Verified-owner reference only — a display name, not more. No
            purchase price, equity, or gain% ever surfaces here; that's the
            seller's own private financial position (see My listings). */}
        <span className="text-xs text-[var(--muted-foreground)] block mb-2.5">Listed by {listing.sellerName} · Verified owner</span>

        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--muted-foreground)] pt-2.5 border-t border-[var(--border)]">
          <span>{listing.sqm} sqm</span>
          <span>·</span>
          <span>{listing.titleType}</span>
          <span>·</span>
          <span>Listed {listing.daysListed} day{listing.daysListed !== 1 ? "s" : ""} ago</span>
        </div>
      </div>
    </Link>
  );
}
