// Resale listing detail — the buyer-facing counterpart to
// MarketplaceEstateDetail.tsx, at a deliberately distinct route shape
// (/marketplace/resale/:id, two segments) so it can't collide with the
// primary detail route (/marketplace/:estateId, one segment). Public —
// browsing works anonymously, same as primary; only "Make an offer" gates on
// auth. Never shows a "Reserve" CTA — see PART 5 of the unification spec.
//
// Laid out from the Figma buyer-path proposal: the price in one currency (it
// used to mix the display currency with naira), the estate's photo and a link
// to the estate, the title with the estate's verified status, and an offer
// card beside the details.

import { useState, useEffect } from "react";
import { Link, useParams, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { formatAmount, formatInCurrency } from "../../data/mockData";
import { useApp } from "../../contexts/AppContext";
import { fetchListingById, type ResaleListing } from "../../services/resaleService";
import { fetchListingById as fetchEstateListing, fromPrice, listingPlace, titleLabel, type Listing } from "../../services/marketplaceService";
import { stashPendingIntent } from "../../lib/pendingIntent";
import { formatCompactCurrency } from "../../lib/formatCurrency";
import ListingTypeBadge from "../../components/marketplace/ListingTypeBadge";
import WishlistButton from "../../components/marketplace/WishlistButton";
import MakeOfferModal from "../../components/resale/MakeOfferModal";
import Card, { InfoBox } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import TextLink from "../../components/ui/TextLink";
import { Loading } from "../../components/ui/Page";
import { MapPinIcon, ShieldCheckIcon } from "../../components/icons";
import EstatePhoto from "../../components/marketplace/EstatePhoto";

const UNAVAILABLE_COPY: Record<string, string> = {
  resale_pending: "This plot's title is already transferring to another buyer.",
  sold: "This plot has already sold.",
  withdrawn: "The seller has withdrawn this listing.",
};

const HOW_IT_WORKS = [
  "Make an offer. The seller accepts, counters or declines.",
  "Your payment goes to HomeTrue and is held — never to the seller directly.",
  "The developer consents and the title formally transfers to you; then the seller is paid.",
];

export default function MarketplaceResaleDetail() {
  const { listingId } = useParams<{ listingId: string }>();
  const { isAuthenticated, currency } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const [listing, setListing] = useState<ResaleListing | null | undefined>(undefined);
  // The verified developer estate the plot sits in: its photo, title and link.
  const [estate, setEstate] = useState<Listing | null>(null);
  const [showOffer, setShowOffer] = useState(false);

  useEffect(() => {
    if (!listingId) return;
    setListing(undefined);
    setEstate(null);
    fetchListingById(listingId).then(async (l) => {
      setListing(l ?? null);
      if (l) setEstate((await fetchEstateListing(l.estateId).catch(() => undefined)) ?? null);
    });
  }, [listingId]);

  // Resume a "resale_offer" intent after auth (see pendingIntent.ts).
  useEffect(() => {
    if (searchParams.get("offer") === "1" && listing?.status === "active") setShowOffer(true);
  }, [searchParams, listing]);

  if (listing === undefined) return <div className="max-w-6xl mx-auto p-6"><Loading /></div>;
  if (!listing) return <div className="max-w-6xl mx-auto p-6 text-sm text-[var(--muted-foreground)]">Listing not found. <TextLink to="/marketplace?type=resale">Back to the marketplace</TextLink></div>;

  const requireAuth = () => {
    if (isAuthenticated) return true;
    stashPendingIntent({ action: "resale_offer", listingId: listing.id });
    navigate(`/register?returnUrl=${encodeURIComponent(location.pathname + location.search)}`);
    return false;
  };

  const isAvailable = listing.status === "active";
  // The plot's title is its estate's — only when the estate's is the same type.
  const titleStatus = estate && estate.titleType === listing.titleType ? estate.titleStatus : null;
  const priceCurrency = listing.currency;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <TextLink to="/marketplace?type=resale" muted className="inline-block text-sm mb-4">← Marketplace · Resale</TextLink>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_22rem] gap-8 items-start">
        <div className="space-y-6 min-w-0">
          <EstatePhoto className="aspect-[21/9] rounded-xl overflow-hidden bg-[var(--muted)] flex items-center justify-center">
            {estate?.imageUrl ? (
              <img src={estate.imageUrl} alt={`${listing.estateName} estate`} loading="lazy" className="w-full h-full object-cover" />
            ) : (
              <MapPinIcon size={40} className="text-[var(--muted-foreground)]/40" />
            )}
          </EstatePhoto>

          <div className="space-y-2">
            <ListingTypeBadge type="resale" />
            <h1 className="font-display text-3xl text-[var(--foreground)]">{listing.estateName} — {listing.plotLabel}</h1>
            <p className="text-sm text-[var(--muted-foreground)] flex items-center gap-1.5"><MapPinIcon size={14} />{listing.location} · in a verified developer estate</p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <InfoBox label="Size"><span className="text-sm font-medium">{listing.sqm} sqm</span></InfoBox>
            <InfoBox label="Plot type"><span className="text-sm font-medium">{listing.isCorner ? "Corner plot" : "Standard"}</span></InfoBox>
            <InfoBox label="Title"><span className="text-sm font-medium">{titleLabel(listing.titleType, titleStatus)}</span></InfoBox>
            <InfoBox label="Listed"><span className="text-sm font-medium">{listing.daysListed} day{listing.daysListed !== 1 ? "s" : ""} ago</span></InfoBox>
          </div>

          {estate && (
            <Link to={`/marketplace/${estate.id}`} className="flex items-center gap-4 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 hover:border-[var(--accent)]/50 transition-colors">
              <span className="w-20 h-14 shrink-0 rounded-lg overflow-hidden bg-[var(--muted)]">
                {estate.imageUrl && <img src={estate.imageUrl} alt="" loading="lazy" className="w-full h-full object-cover" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">In this estate</span>
                <span className="block font-semibold text-[var(--foreground)]">{[estate.name, estate.seller.branchName, estate.seller.companyName].filter(Boolean).join(" · ")}</span>
                <span className="block text-xs text-[var(--muted-foreground)]">
                  {[`Developer plots from ${formatCompactCurrency(fromPrice(estate))}`, titleLabel(estate.titleType, estate.titleStatus), listingPlace(estate)].join(" · ")}
                </span>
              </span>
              <span className="text-sm font-medium text-[var(--accent)] shrink-0 hidden sm:inline">View estate →</span>
            </Link>
          )}

          <section aria-labelledby="how-heading">
            <h2 id="how-heading" className="font-semibold text-[var(--foreground)] mb-3">How buying a resale plot works</h2>
            <ol className="space-y-2.5">
              {HOW_IT_WORKS.map((t, i) => (
                <li key={t} className="flex gap-3 text-sm text-[var(--foreground)]">
                  <span aria-hidden="true" className="w-6 h-6 shrink-0 rounded-full bg-[var(--secondary)] text-[var(--secondary-foreground)] flex items-center justify-center text-xs font-semibold">{i + 1}</span>
                  <span className="pt-0.5">{t}</span>
                </li>
              ))}
            </ol>
          </section>

          {/* PART 2: what's verified here, and what genuinely differs from a
              developer-estate listing — never implied to carry the same
              verification. */}
          <div className="rounded-lg bg-[var(--muted)] p-4 text-sm">
            <h2 className="font-semibold text-[var(--foreground)] mb-1">What's verified, and what's different</h2>
            <p className="text-[var(--muted-foreground)]">
              <strong className="text-[var(--foreground)] font-medium">Verified:</strong> the seller's identity, that the plot exists in {listing.estateName} (a verified developer estate), and that the developer must approve and carry out any transfer.{" "}
              <strong className="text-[var(--foreground)] font-medium">Different:</strong> this is one individual seller, at a price they've set themselves — not the developer's own inventory or pricing.
            </p>
          </div>
        </div>

        <Card as="section" aria-label="Make an offer" className="lg:sticky lg:top-6 space-y-4">
          <div>
            <div className="text-xs text-[var(--muted-foreground)]">Asking price</div>
            <div className="font-mono-data font-medium text-2xl text-[var(--foreground)]">{formatInCurrency(listing.asking, priceCurrency)}</div>
            <div className="text-xs text-[var(--muted-foreground)]">
              {formatInCurrency(Math.round(listing.asking / listing.sqm), priceCurrency)}/sqm
              {currency !== priceCurrency && <> · ≈ {formatAmount(listing.asking, currency)}</>}
            </div>
          </div>

          {!isAvailable && <Alert>{UNAVAILABLE_COPY[listing.status] ?? "This listing is no longer available."}</Alert>}

          <div className="space-y-2">
            <Button size="lg" fullWidth disabled={!isAvailable} onClick={() => { if (requireAuth()) setShowOffer(true); }}>Make an offer</Button>
            <WishlistButton listingId={listing.id} listingType="resale" label="Save to wishlist"
              className="w-full inline-flex items-center justify-center gap-2 rounded-md border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors" />
          </div>

          <p className="text-xs text-[var(--muted-foreground)]">
            {isAuthenticated ? "" : "You'll sign in first. "}If your offer is accepted, the money is held by HomeTrue until the title transfers — never sent directly to the seller.
          </p>

          {/* Verified-owner reference only — a display name, never the seller's
              purchase price, paid equity, or full legal identity. */}
          <div className="flex items-center gap-2 rounded-lg bg-[var(--secondary)] px-3 py-2.5 text-sm text-[var(--secondary-foreground)]">
            <ShieldCheckIcon size={16} />Listed by {listing.sellerName} · verified owner
          </div>
        </Card>
      </div>

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
