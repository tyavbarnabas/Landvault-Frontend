import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { useApp } from "../../contexts/AppContext";
import { fetchListingById, fetchSimilarListings, fromPrice, type Listing } from "../../services/marketplaceService";
import ListingTypeBadge from "../../components/marketplace/ListingTypeBadge";
import SellerLine from "../../components/marketplace/SellerLine";
import PriceTierTable from "../../components/marketplace/PriceTierTable";
import WishlistButton from "../../components/marketplace/WishlistButton";
import EstateCard from "../../components/marketplace/EstateCard";
import EnquiryPanel from "../../components/marketplace/EnquiryPanel";
import { CAPABILITIES } from "../../lib/capabilities";

export default function MarketplaceEstateDetail() {
  const { estateId } = useParams<{ estateId: string }>();
  const { isAuthenticated, currency } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  const [listing, setListing] = useState<Listing | undefined>();
  const [similar, setSimilar] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSizeSqm, setSelectedSizeSqm] = useState<number | null>(null);
  const [enquiryOpen, setEnquiryOpen] = useState(false);

  useEffect(() => {
    if (!estateId) return;
    setLoading(true);
    Promise.all([fetchListingById(estateId), fetchSimilarListings(estateId)]).then(([l, s]) => {
      setListing(l);
      setSimilar(s);
      setSelectedSizeSqm(null);
      setLoading(false);
    });
  }, [estateId]);

  if (loading) return <div className="p-8 text-[var(--muted-foreground)] text-sm">Loading estate…</div>;
  if (!listing) return <div className="p-8 text-[var(--muted-foreground)] text-sm">Estate not found.</div>;

  const requireAuth = () => {
    if (isAuthenticated) return true;
    navigate(`/login?returnUrl=${encodeURIComponent(location.pathname)}`);
    return false;
  };

  const selectedTier = listing.priceTiers.find((t) => t.sizeSqm === selectedSizeSqm);

  return (
    <div className="max-w-5xl mx-auto p-6">
      {/* Gallery */}
      <div className="relative aspect-[21/9] bg-[var(--muted)] rounded-xl overflow-hidden mb-6">
        {listing.imageUrl ? (
          <img src={listing.imageUrl} alt={listing.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-[var(--muted-foreground)]/40">
              <path d="M9 3L3 5v16l6-2 6 2 6-2V5l-6 2-6-2Z" />
              <path d="M9 3v16M15 5v16" />
            </svg>
          </div>
        )}
        <div className="absolute top-4 right-4">
          <WishlistButton listingId={listing.id} listingType="primary" fromPrice={fromPrice(listing)} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/90 backdrop-blur hover:bg-white shadow-sm" />
        </div>
      </div>

      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="font-display text-3xl text-[var(--foreground)]">{listing.name}</h1>
            <ListingTypeBadge type="primary" />
          </div>
          <p className="text-sm text-[var(--muted-foreground)]">{listing.area}, {listing.city}, {listing.state}</p>
          <SellerLine seller={listing.seller} className="text-sm text-[var(--muted-foreground)] block mt-0.5" />
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-[var(--muted-foreground)]">{listing.titleType} · verified {listing.lastVerifiedDate}</div>
        </div>
      </div>

      <p className="text-sm text-[var(--foreground)] leading-relaxed my-4">{listing.description}</p>

      {listing.amenities.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
          {listing.amenities.map((a) => (
            <span key={a} className="text-xs px-2.5 py-1 rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]">{a}</span>
          ))}
        </div>
      )}

      {/* Price tier table — centerpiece */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Plot sizes & pricing</h2>
        <PriceTierTable tiers={listing.priceTiers} cornerPremiumPct={listing.cornerPremiumPct} currency={currency} selectedSizeSqm={selectedSizeSqm} onSelectSize={setSelectedSizeSqm} />
      </section>

      {/* Plot canvas — select a specific plot at this size tier */}
      {selectedTier && (
        <section className="mb-8">
          <div className="border border-[var(--border)] rounded-xl p-6 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <p className="text-sm font-medium text-[var(--foreground)] mb-1">See real plots at {selectedTier.sizeSqm} sqm</p>
              <p className="text-xs text-[var(--muted-foreground)]">Pick a specific plot on the map, see corner/standard pricing, and book an inspection or reserve.</p>
            </div>
            <Link
              to={`/marketplace/${listing.id}/plots?size=${selectedTier.sizeSqm}`}
              className="px-4 py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90 transition-opacity shrink-0"
            >
              Select a plot →
            </Link>
          </div>
        </section>
      )}

      {/* Payment plans */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Payment plans offered</h2>
        <div className="flex flex-wrap gap-2">
          {listing.paymentPlans.map((p) => (
            <span key={p} className="text-xs font-medium px-2.5 py-1 rounded-full bg-[var(--secondary)] text-[var(--secondary-foreground)] capitalize">{p}</span>
          ))}
        </div>
      </section>

      {/* Location map — placeholder */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Location</h2>
        {/* TODO: PostGIS-backed map of the estate's real boundary/coordinates. */}
        <div className="h-40 rounded-xl bg-[var(--muted)] flex items-center justify-center text-xs text-[var(--muted-foreground)]">
          Map coming soon — {listing.area}, {listing.city}, {listing.state}
        </div>
      </section>

      {/* Reviews / seller stats — capability-flagged, no fabricated data */}
      {CAPABILITIES.reputation && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Reviews</h2>
          <div className="text-sm text-[var(--muted-foreground)]">No reviews yet.</div>
        </section>
      )}

      {/* CTAs — Reserve and Book inspection need a specific plot, so both
          route into plot selection; only Enquire (estate-level, no plot
          chosen yet) can act directly from here. */}
      <div className="flex flex-wrap gap-3 mb-2">
        <button onClick={() => { if (requireAuth()) setEnquiryOpen(true); }} className="px-5 py-2.5 border border-[var(--border)] text-[var(--foreground)] rounded-md text-sm font-medium hover:bg-[var(--muted)]">
          Enquire
        </button>
        <Link to={`/marketplace/${listing.id}/plots`} className="px-5 py-2.5 border-2 border-[var(--primary)] text-[var(--primary)] rounded-md text-sm font-semibold hover:bg-[var(--secondary)]">
          📅 Book an inspection
        </Link>
        <Link to={`/marketplace/${listing.id}/plots`} className="px-5 py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90">
          Reserve a plot
        </Link>
      </div>
      <p className="text-xs text-[var(--muted-foreground)] mb-10">
        You'll be asked to sign in first — no KYC required to enquire, inspect, or browse. KYC only happens once you reserve, before your plot hold starts.
      </p>

      {enquiryOpen && <EnquiryPanel listing={listing} onClose={() => setEnquiryOpen(false)} />}

      {/* Similar estates */}
      {similar.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Similar estates nearby</h2>
          {/* TODO: PostGIS radius query against real coordinates, not a same-state text match. */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {similar.map((l) => <EstateCard key={l.id} listing={l} />)}
          </div>
        </section>
      )}

      <div className="flex items-center justify-between mt-8">
        <Link to="/marketplace" className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">← Back to marketplace</Link>
        {isAuthenticated && (
          <Link to={`/estates/${listing.id}`} className="text-sm text-[var(--accent)] hover:underline">Explore this estate in detail →</Link>
        )}
      </div>
    </div>
  );
}
