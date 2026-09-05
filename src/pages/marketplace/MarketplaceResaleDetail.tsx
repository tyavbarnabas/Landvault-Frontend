// Resale listing detail — the buyer-facing counterpart to
// MarketplaceEstateDetail.tsx, at a deliberately distinct route shape
// (/marketplace/resale/:id, two segments) so it can't collide with the
// primary detail route (/marketplace/:estateId, one segment). Public —
// browsing works anonymously, same as primary; only "Make an offer" gates on
// auth. Never shows a "Reserve" CTA — see PART 5 of the unification spec.

import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation, useSearchParams, Link } from "react-router-dom";
import { formatAmount } from "../../data/mockData";
import { useApp } from "../../contexts/AppContext";
import { fetchListingById, type ResaleListing } from "../../services/resaleService";
import { stashPendingIntent } from "../../lib/pendingIntent";
import ListingTypeBadge from "../../components/marketplace/ListingTypeBadge";
import WishlistButton from "../../components/marketplace/WishlistButton";
import MakeOfferModal from "../../components/resale/MakeOfferModal";

const UNAVAILABLE_COPY: Record<string, string> = {
  resale_pending: "This plot's title is already transferring to another buyer.",
  sold: "This plot has already sold.",
  withdrawn: "The seller has withdrawn this listing.",
};

export default function MarketplaceResaleDetail() {
  const { listingId } = useParams<{ listingId: string }>();
  const { isAuthenticated, currency } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [listing, setListing] = useState<ResaleListing | null | undefined>(undefined);
  const [showOffer, setShowOffer] = useState(false);

  useEffect(() => {
    if (!listingId) return;
    setListing(undefined);
    fetchListingById(listingId).then((l) => setListing(l ?? null));
  }, [listingId]);

  // Resume a "resale_offer" intent after auth (see pendingIntent.ts).
  useEffect(() => {
    if (searchParams.get("offer") === "1" && listing?.status === "active") setShowOffer(true);
  }, [searchParams, listing]);

  if (listing === undefined) return <div className="p-8 text-[var(--muted-foreground)] text-sm">Loading…</div>;
  if (!listing) return <div className="p-8 text-[var(--muted-foreground)] text-sm">Listing not found. <Link to="/marketplace?type=resale" className="text-[var(--accent)] hover:underline">Back to the marketplace</Link></div>;

  const requireAuth = () => {
    if (isAuthenticated) return true;
    stashPendingIntent({ action: "resale_offer", listingId: listing.id });
    navigate(`/register?returnUrl=${encodeURIComponent(location.pathname + location.search)}`);
    return false;
  };

  const isAvailable = listing.status === "active";

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="relative aspect-[21/9] bg-[var(--muted)] rounded-xl overflow-hidden mb-6 flex items-center justify-center">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--muted-foreground)]/40">
          <path d="M9 3L3 5v16l6-2 6 2 6-2V5l-6 2-6-2Z" />
          <path d="M9 3v16M15 5v16" />
        </svg>
        <div className="absolute top-4 right-4">
          <WishlistButton listingId={listing.id} listingType="resale" fromPrice={listing.asking} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/90 backdrop-blur hover:bg-white shadow-sm" />
        </div>
      </div>

      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="font-display text-3xl text-[var(--foreground)]">{listing.estateName} — {listing.plotLabel}</h1>
          </div>
          <ListingTypeBadge type="resale" />
          <p className="text-sm text-[var(--muted-foreground)] mt-2">{listing.location}, {listing.state}</p>
        </div>
        <div className="text-right shrink-0">
          <div className="font-display text-2xl text-[var(--foreground)]">{formatAmount(listing.asking, currency)}</div>
          <div className="text-xs text-[var(--muted-foreground)]">{formatAmount(listing.asking / listing.sqm, "NGN")}/sqm</div>
        </div>
      </div>

      {!isAvailable && (
        <div className="my-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
          {UNAVAILABLE_COPY[listing.status] ?? "This listing is no longer available."}
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4 my-6">
        <div className="bg-[var(--muted)] rounded-lg p-3">
          <div className="text-xs text-[var(--muted-foreground)] mb-0.5">Size</div>
          <div className="text-sm font-medium">{listing.sqm} sqm</div>
        </div>
        <div className="bg-[var(--muted)] rounded-lg p-3">
          <div className="text-xs text-[var(--muted-foreground)] mb-0.5">Type</div>
          <div className="text-sm font-medium">{listing.isCorner ? "Corner piece ★" : "Standard"}</div>
        </div>
        <div className="bg-[var(--muted)] rounded-lg p-3">
          <div className="text-xs text-[var(--muted-foreground)] mb-0.5">Title type</div>
          <div className="text-sm font-medium">{listing.titleType}</div>
        </div>
        <div className="bg-[var(--muted)] rounded-lg p-3">
          <div className="text-xs text-[var(--muted-foreground)] mb-0.5">Listed</div>
          <div className="text-sm font-medium">{listing.daysListed} day{listing.daysListed !== 1 ? "s" : ""} ago</div>
        </div>
      </div>

      {/* Verified-owner reference only — a display name, never the seller's
          purchase price, paid equity, or full legal identity. */}
      <div className="mb-6 p-3 bg-[var(--secondary)] rounded-lg text-sm text-[var(--secondary-foreground)]">
        Listed by <strong>{listing.sellerName}</strong> · Verified owner
      </div>

      {/* PART 2: what's verified here, and what genuinely differs from a
          developer-estate listing — never implied to carry the same
          verification. */}
      <section className="mb-8 p-4 border border-blue-200 bg-blue-50 rounded-xl text-sm text-blue-900">
        <h2 className="font-semibold mb-2">About resale listings</h2>
        <p className="mb-2"><strong>What's verified:</strong> the seller's identity, the plot's existence within {listing.estateName} (a verified developer estate), and the developer's required involvement in approving and executing any transfer.</p>
        <p><strong>What's different from a developer listing:</strong> this is one individual seller, at a price they've negotiated themselves — not the developer's own inventory or pricing. Ownership only moves once the developer consents and title formally transfers; see how that works when you make an offer.</p>
      </section>

      <div className="flex flex-wrap gap-3 mb-10">
        <button
          onClick={() => { if (requireAuth()) setShowOffer(true); }}
          disabled={!isAvailable}
          className="px-5 py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Make an offer
        </button>
      </div>
      <p className="text-xs text-[var(--muted-foreground)] -mt-8 mb-10">
        You'll be asked to sign in first. If accepted, your payment is held until title formally transfers — never sent directly to the seller.
      </p>

      <Link to="/marketplace?type=resale" className="inline-block text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">← Back to the marketplace</Link>

      {showOffer && (
        <MakeOfferModal
          listing={listing}
          currency={currency}
          onClose={() => {
            setShowOffer(false);
            if (searchParams.get("offer")) { searchParams.delete("offer"); setSearchParams(searchParams, { replace: true }); }
          }}
        />
      )}
    </div>
  );
}
