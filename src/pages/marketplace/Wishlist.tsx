import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../../contexts/AppContext";
import { fetchListingById as fetchPrimaryListingById, fromPrice } from "../../services/marketplaceService";
import { fetchListingById as fetchResaleListingById, type ResaleListing } from "../../services/resaleService";
import type { MarketplaceListing } from "../../services/marketplaceFeedService";
import ListingCard from "../../components/marketplace/ListingCard";
import ListingTypeBadge from "../../components/marketplace/ListingTypeBadge";
import EmptyState from "../../components/marketplace/EmptyState";

interface WishlistEntry {
  item: MarketplaceListing;
  priceChangeSinceSaved: number;
}

// A resale listing that's no longer purchasable (pending transfer, sold, or
// withdrawn) — still shown, per PART 7, rather than silently vanishing or
// rendering a broken card.
interface UnavailableEntry {
  listing: ResaleListing;
}

const UNAVAILABLE_COPY: Record<string, string> = {
  resale_pending: "Pending transfer to another buyer",
  sold: "Sold",
  withdrawn: "Withdrawn by the seller",
};

export default function Wishlist() {
  const { wishlist } = useApp();
  const [entries, setEntries] = useState<WishlistEntry[]>([]);
  const [unavailable, setUnavailable] = useState<UnavailableEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all(
      wishlist.map(async (saved) => {
        if (saved.listingType === "resale") {
          const listing = await fetchResaleListingById(saved.listingId);
          if (!listing) return null;
          if (listing.status !== "active") return { kind: "unavailable" as const, listing };
          return { kind: "entry" as const, item: { listingType: "resale" as const, data: listing }, priceChangeSinceSaved: listing.asking - saved.priceAtSave };
        }
        // Always re-fetched live — nothing here is a stored copy of the
        // listing. priceAtSave is only ever used for the delta below, never
        // to render "the price" itself.
        const listing = await fetchPrimaryListingById(saved.listingId);
        if (!listing) return null;
        return { kind: "entry" as const, item: { listingType: "primary" as const, data: listing }, priceChangeSinceSaved: fromPrice(listing) - saved.priceAtSave };
      })
    ).then((results) => {
      if (cancelled) return;
      setEntries(results.filter((r): r is { kind: "entry"; item: MarketplaceListing; priceChangeSinceSaved: number } => r?.kind === "entry"));
      setUnavailable(results.filter((r): r is { kind: "unavailable"; listing: ResaleListing } => r?.kind === "unavailable"));
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [wishlist]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">Wishlist</h1>
        <p className="text-sm text-[var(--muted-foreground)]">Prices update live — you'll see a price-change indicator if one has moved since you saved it.</p>
      </div>

      {loading && <div className="text-sm text-[var(--muted-foreground)] py-8">Loading your wishlist…</div>}

      {!loading && entries.length === 0 && unavailable.length === 0 && (
        <EmptyState
          title="Your wishlist is empty"
          description="Save developer estates or resale plots from the marketplace to compare and come back to them later."
          action={<Link to="/marketplace" className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90 inline-block">Browse the marketplace</Link>}
        />
      )}

      {!loading && entries.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
          {entries.map(({ item, priceChangeSinceSaved }) => (
            <ListingCard key={`${item.listingType}:${item.data.id}`} item={item} priceChangeSinceSaved={priceChangeSinceSaved} />
          ))}
        </div>
      )}

      {!loading && unavailable.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">No longer available</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {unavailable.map(({ listing }) => (
              <div key={listing.id} className="bg-[var(--muted)] border border-[var(--border)] rounded-xl p-4 opacity-75">
                <ListingTypeBadge type="resale" />
                <div className="font-semibold text-[var(--foreground)] mt-2 mb-0.5">{listing.estateName} — {listing.plotLabel}</div>
                <div className="text-xs text-[var(--muted-foreground)]">{listing.location}, {listing.state}</div>
                <div className="text-xs font-medium text-amber-700 mt-2">{UNAVAILABLE_COPY[listing.status] ?? "No longer available"}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
