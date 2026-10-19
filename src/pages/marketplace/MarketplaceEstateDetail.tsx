// One estate on the public marketplace — /marketplace/:estateId. Redesigned
// from the Figma "Estate detail — Proposed" frames (desktop and phone): the
// decision a buyer comes here to make sits in a sticky booking card beside the
// facts (and a sticky bar on a phone), trust facts are stated in their own
// panel, and every cost is in one breakdown. Everything shown is the API's;
// nothing is estimated.

import { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation, Link } from "react-router-dom";
import { isLive } from "../../lib/backends";
import { useApp } from "../../contexts/AppContext";
import { formatAmount } from "../../data/mockData";
import { formatDay } from "../../lib/formatDate";
import {
  fetchListingById, fetchSimilarListings, fromPrice, cheapestTier, pricePerSqm, type Listing, type PriceTier,
} from "../../services/marketplaceService";
import { fetchCostDisclosure, isGrandfathered, tierCommitmentForSize, type EstateCostDisclosure, type TierCommitment } from "../../services/costDisclosureService";
import WishlistButton from "../../components/marketplace/WishlistButton";
import EstateCard from "../../components/marketplace/EstateCard";
import EstateGallery from "../../components/marketplace/EstateGallery";
import EnquiryPanel from "../../components/marketplace/EnquiryPanel";
import { SellerOffice } from "../../components/marketplace/SellerLine";
import AvailabilityPill from "../../components/marketplace/AvailabilityPill";
import CostDisclosureSection from "../../components/cost/CostDisclosureSection";
import CommitmentBreakdown from "../../components/cost/CommitmentBreakdown";
import ExitCostsPanel from "../../components/cost/ExitCostsPanel";
import MoneyRangeDisplay from "../../components/cost/MoneyRangeDisplay";
import Badge from "../../components/ui/Badge";
import { CAPABILITIES } from "../../lib/capabilities";
import {
  AlertIcon, AmenityIcon, BuildingIcon, CheckIcon, ChevronRightIcon, FileTextIcon, GridIcon, InfoIcon, LockIcon, MapPinIcon,
  MessageIcon, RulerIcon, ShareIcon, WalletIcon,
} from "../../components/icons";

type Tone = "success" | "warning" | "error" | "neutral";

const CHIP: Record<Tone, string> = {
  success: "bg-[var(--success-surface)] text-[var(--success-text)]",
  warning: "bg-[var(--warning-surface)] text-[var(--warning-text)]",
  error: "bg-[var(--error-surface)] text-[var(--error-text)]",
  neutral: "bg-[var(--secondary)] text-[var(--secondary-foreground)]",
};

export default function MarketplaceEstateDetail() {
  const { estateId } = useParams<{ estateId: string }>();
  const { isAuthenticated, currency } = useApp();
  const navigate = useNavigate();
  const location = useLocation();

  const [listing, setListing] = useState<Listing | undefined>();
  const [similar, setSimilar] = useState<Listing[]>([]);
  const [disclosure, setDisclosure] = useState<EstateCostDisclosure | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSizeSqm, setSelectedSizeSqm] = useState<number | null>(null);
  const [enquiryOpen, setEnquiryOpen] = useState(false);

  useEffect(() => {
    if (!estateId) return;
    setLoading(true);
    // Cost disclosure is fetched with the listing, not behind a click — it is
    // public and must be readable without an account (CD-11).
    Promise.all([fetchListingById(estateId), fetchSimilarListings(estateId), fetchCostDisclosure(estateId)]).then(([l, s, d]) => {
      setListing(l);
      setSimilar(s);
      setDisclosure(d);
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

  // The tier the booking card shows: the buyer's pick, else the cheapest one
  // still available, so a real price and total are visible on arrival.
  const available = listing.priceTiers.filter((t) => t.availability !== "sold_out");
  const shownTier: PriceTier | undefined = listing.priceTiers.find((t) => t.sizeSqm === selectedSizeSqm) ?? (available.length ? cheapestTier({ ...listing, priceTiers: available }) : undefined);
  const commitment: TierCommitment | null = shownTier ? tierCommitmentForSize(disclosure, shownTier.sizeSqm) : null;
  const plotsUrl = `/marketplace/${listing.id}/plots${shownTier ? `?size=${shownTier.sizeSqm}` : ""}`;
  const enquire = () => { if (requireAuth()) setEnquiryOpen(true); };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-5 pb-28 lg:pb-12">
      <Breadcrumb listing={listing} />
      <TitleRow listing={listing} />

      <div className="mt-6">
        <EstateGallery key={listing.id} photos={listing.photos} estateName={listing.name}>
          <WishlistButton listingId={listing.id} listingType="primary" fromPrice={fromPrice(listing)} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/90 backdrop-blur hover:bg-white shadow-sm" />
        </EstateGallery>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
        <div className="space-y-6 min-w-0">
          <KeyFacts listing={listing} currency={currency} />
          {/* On a phone the booking card follows the facts; the sticky bar keeps Reserve in reach. */}
          <div className="lg:hidden">
            <BookingCard listing={listing} shownTier={shownTier} commitment={commitment} currency={currency}
              onSelectSize={setSelectedSizeSqm} plotsUrl={plotsUrl} onEnquire={enquire} title="Choose your plot" />
          </div>
          <TitleVerification listing={listing} />
          <About listing={listing} />
          <Pricing listing={listing} currency={currency} shownSize={shownTier?.sizeSqm ?? null} onSelectSize={setSelectedSizeSqm} />
          <Costs disclosure={disclosure} commitment={commitment} />
          {disclosure?.exitCosts && !isGrandfathered(disclosure) && (
            <Section title="Refund & exit terms">
              <ExitCostsPanel exitCosts={disclosure.exitCosts} layout="rows" />
            </Section>
          )}
          <LocationCard listing={listing} />
          {/* Reviews / seller stats — capability-flagged, no fabricated data */}
          {CAPABILITIES.reputation && (
            <Section title="Reviews"><p className="text-sm text-[var(--muted-foreground)]">No reviews yet.</p></Section>
          )}
        </div>

        <aside className="hidden lg:block lg:sticky lg:top-6 space-y-4">
          <BookingCard listing={listing} shownTier={shownTier} commitment={commitment} currency={currency}
            onSelectSize={setSelectedSizeSqm} plotsUrl={plotsUrl} onEnquire={enquire} />
          <DeveloperCard listing={listing} />
        </aside>
      </div>

      {enquiryOpen && <EnquiryPanel listing={listing} onClose={() => setEnquiryOpen(false)} />}

      {similar.length > 0 && (
        <section className="mt-14">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="font-display text-2xl text-[var(--foreground)]">Similar estates nearby</h2>
            <Link to={`/marketplace?state=${encodeURIComponent(listing.state)}`} className="inline-flex items-center gap-1 text-sm font-medium text-[var(--accent)] hover:underline">
              See all in {listing.city} <ChevronRightIcon />
            </Link>
          </div>
          {/* TODO: PostGIS radius query against real coordinates, not a same-state text match. */}
          {/* A swipeable row on a phone, a grid from sm up. */}
          <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-2 lg:grid-cols-3 sm:gap-6 sm:overflow-visible">
            {similar.map((l) => (
              <div key={l.id} className="snap-start shrink-0 w-[78%] sm:w-auto"><EstateCard listing={l} /></div>
            ))}
          </div>
        </section>
      )}

      {isAuthenticated && !isLive("marketplace") && (
        <div className="mt-8 text-right">
          <Link to={`/estates/${listing.id}`} className="text-sm text-[var(--accent)] hover:underline">Explore this estate in detail →</Link>
        </div>
      )}

      {/* Phone: price and Reserve stay in reach while scrolling. */}
      <div className="lg:hidden fixed inset-x-0 bottom-0 z-30 bg-[var(--card)] border-t border-[var(--border)] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          {shownTier && <div className="font-mono-data font-medium text-[var(--foreground)]">{formatAmount(shownTier.price, currency)}</div>}
          {commitment && (
            <div className="text-xs text-[var(--muted-foreground)]">
              Total <MoneyRangeDisplay money={commitment.totalCommitment} currency={commitment.currency} compact /> incl. fees
            </div>
          )}
        </div>
        <Link to={plotsUrl} className="shrink-0 px-5 py-2.5 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-semibold hover:opacity-90">Reserve a plot</Link>
      </div>
    </div>
  );
}

// ─── Header ──────────────────────────────────────────────────────────────────

function Breadcrumb({ listing }: { listing: Listing }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] mb-4">
      <Link to="/marketplace" className="hover:text-[var(--foreground)]">Marketplace</Link>
      <ChevronRightIcon size={12} />
      <Link to={`/marketplace?state=${encodeURIComponent(listing.state)}`} className="hover:text-[var(--foreground)]">{listing.city}</Link>
      <ChevronRightIcon size={12} />
      <span className="font-medium text-[var(--foreground)] truncate" aria-current="page">{listing.name}</span>
    </nav>
  );
}

function TitleRow({ listing }: { listing: Listing }) {
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: listing.name, url });
      else { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    } catch { /* closed the share sheet */ }
  };
  const seller = listing.seller.branchName ? `${listing.seller.companyName} · ${listing.seller.branchName}` : listing.seller.companyName;
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-display text-3xl sm:text-4xl leading-tight text-[var(--foreground)]">{listing.name}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--muted-foreground)]">
          <span className="inline-flex items-center gap-1.5"><MapPinIcon />{listing.area}, {listing.city}, {listing.state}</span>
          <span className="inline-flex items-center gap-1.5"><BuildingIcon />{seller}</span>
          <Badge label="✓ Verified developer" variant="success" />
        </div>
      </div>
      <button type="button" onClick={share} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md border border-[var(--border)] bg-[var(--card)] text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]">
        <ShareIcon />{copied ? "Link copied" : "Share"}
      </button>
    </div>
  );
}

// ─── Left column ─────────────────────────────────────────────────────────────

function Section({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--foreground)]">{title}</h2>
          {subtitle && <p className="text-sm text-[var(--muted-foreground)] mt-1">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function IconChip({ tone = "neutral", round, children }: { tone?: Tone; round?: boolean; children: React.ReactNode }) {
  return <span className={`shrink-0 flex items-center justify-center ${round ? "w-8 h-8 rounded-full" : "w-9 h-9 rounded-[10px]"} ${CHIP[tone]}`}>{children}</span>;
}

function sizeRange(listing: Listing): string {
  const sizes = listing.priceTiers.map((t) => t.sizeSqm);
  if (sizes.length === 0) return "—";
  const lo = Math.min(...sizes), hi = Math.max(...sizes);
  return lo === hi ? `${lo} sqm` : `${lo}–${hi} sqm`;
}

// The title fact, from what HomeTrue's review said — "declared, not
// confirmed" is a rejection, not a wait.
function titleFact(listing: Listing): { value: string; tone: Tone } {
  if (!listing.titleType) return { value: "Not recorded", tone: "warning" };
  switch (listing.titleStatus) {
    case "verified": return { value: "Verified", tone: "success" };
    case "rejected": return { value: "Not confirmed", tone: "error" };
    default: return { value: "Declared", tone: "warning" };
  }
}

function KeyFacts({ listing, currency }: { listing: Listing; currency: Parameters<typeof formatAmount>[1] }) {
  const left = listing.priceTiers.reduce((s, t) => s + t.plotsRemaining, 0);
  const title = titleFact(listing);
  const per = listing.priceTiers.length ? pricePerSqm(cheapestTier(listing)) : null;
  const facts: { icon: React.ReactNode; label: string; value: string; tone?: Tone }[] = [
    { icon: <RulerIcon size={18} />, label: "Plot sizes", value: sizeRange(listing) },
    { icon: <GridIcon size={18} />, label: "Plots available", value: `${left} left` },
    { icon: <FileTextIcon size={18} />, label: listing.titleType ? `Title (${listing.titleType})` : "Title", value: title.value, tone: title.tone === "success" ? "success" : title.tone },
    { icon: <WalletIcon size={18} />, label: "From, per sqm", value: per !== null ? formatAmount(per, currency) : "—" },
  ];
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 sm:p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-0 sm:divide-x sm:divide-[var(--border)]">
      {facts.map((f, i) => (
        <div key={f.label} className={`flex items-center gap-3 min-w-0 ${i > 0 ? "sm:pl-4" : ""}`}>
          <IconChip tone={f.tone && f.tone !== "neutral" && f.tone !== "success" ? f.tone : "neutral"}>{f.icon}</IconChip>
          <div className="min-w-0">
            <div className="text-xs text-[var(--muted-foreground)] truncate">{f.label}</div>
            <div className={`text-sm font-semibold truncate ${f.tone === "error" ? "text-[var(--error-text)]" : f.tone === "warning" ? "text-[var(--warning-text)]" : "text-[var(--foreground)]"}`}>{f.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TitleVerification({ listing }: { listing: Listing }) {
  const t = listing.titleType;
  const rows: { tone: Tone; head: string; body: string }[] = [
    { tone: "success", head: "Developer verified by HomeTrue", body: `${listing.seller.companyName} has completed HomeTrue's company verification.` },
  ];
  if (!t) rows.push({ tone: "warning", head: "No title recorded", body: "The developer hasn't declared the estate's land title yet." });
  else if (listing.titleStatus === "verified") rows.push({ tone: "success", head: `${t} verified by HomeTrue`, body: listing.titleVerifiedAt ? `HomeTrue checked the title documents on ${formatDay(listing.titleVerifiedAt)}.` : "HomeTrue checked the title documents." });
  else if (listing.titleStatus === "rejected") rows.push({ tone: "error", head: `${t} — not confirmed by HomeTrue`, body: "The developer declared this title, but HomeTrue reviewed the documents and couldn't confirm it. Ask the developer before you pay." });
  else rows.push({ tone: "warning", head: `${t} — declared by the developer`, body: "HomeTrue is checking the title documents. Until then, treat the title as the developer's claim." });
  rows.push(listing.lastVerifiedDate
    ? { tone: "success", head: "Land checked", body: `The land was last checked on ${formatDay(listing.lastVerifiedDate)}.` }
    : { tone: "warning", head: "No land check on record", body: "There's no official land check on file for this estate yet." });

  const worst = rows.some((r) => r.tone === "error") ? "error" : rows.some((r) => r.tone === "warning") ? "warning" : "success";
  const badge = worst === "error" ? { label: "Title not confirmed", variant: "error" as const } : worst === "warning" ? { label: "Checks outstanding", variant: "warning" as const } : { label: "All checks passed", variant: "success" as const };
  return (
    <Section title="Title & verification" action={<Badge {...badge} />}>
      <ul className="space-y-4">
        {rows.map((r) => (
          <li key={r.head} className="flex gap-3">
            <IconChip tone={r.tone} round>{r.tone === "success" ? <CheckIcon /> : <AlertIcon />}</IconChip>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[var(--foreground)]">{r.head}</div>
              <p className="text-sm text-[var(--muted-foreground)]">{r.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function About({ listing }: { listing: Listing }) {
  if (!listing.description && listing.amenities.length === 0) return null;
  return (
    <Section title="About this estate">
      {listing.description && <p className="text-[15px] leading-relaxed text-[var(--foreground)]">{listing.description}</p>}
      {listing.amenities.length > 0 && (
        <ul className="flex flex-wrap gap-2.5 mt-4">
          {listing.amenities.map((a) => (
            <li key={a} className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-[var(--muted)] text-sm text-[var(--foreground)]">
              <AmenityIcon amenity={a} />{a}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function Pricing({ listing, currency, shownSize, onSelectSize }: { listing: Listing; currency: Parameters<typeof formatAmount>[1]; shownSize: number | null; onSelectSize: (s: number) => void }) {
  if (listing.priceTiers.length === 0) {
    return <Section title="Plot sizes & pricing"><p className="text-sm text-[var(--muted-foreground)]">No price tiers published for this estate yet.</p></Section>;
  }
  return (
    <Section title="Plot sizes & pricing" subtitle="Your price is locked in when you reserve.">
      <div className="space-y-3" role="radiogroup" aria-label="Plot size">
        {listing.priceTiers.map((tier) => {
          const soldOut = tier.availability === "sold_out";
          const on = shownSize === tier.sizeSqm;
          return (
            <button
              key={tier.id} type="button" role="radio" aria-checked={on} disabled={soldOut} onClick={() => onSelectSize(tier.sizeSqm)}
              className={`w-full text-left flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border px-4 py-3.5 transition-colors ${on ? "border-[var(--primary)] bg-[var(--secondary)]" : "border-[var(--border)] hover:bg-[var(--muted)]"} ${soldOut ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <span className="flex-1 min-w-[140px]">
                <span className="block font-semibold text-[var(--foreground)]">{tier.sizeSqm} sqm</span>
                <span className="block text-xs text-[var(--muted-foreground)]">~{tier.actualAreaSqm} sqm surveyed</span>
              </span>
              <span className="text-right">
                <span className="block font-mono-data font-medium text-[var(--foreground)]">{formatAmount(tier.price, currency)}</span>
                <span className="block text-xs text-[var(--muted-foreground)]">{formatAmount(pricePerSqm(tier), currency)} / sqm</span>
              </span>
              <span className="flex flex-col items-end gap-1 w-24">
                <AvailabilityPill status={tier.availability} />
                {!soldOut && <span className="text-xs text-[var(--muted-foreground)]">{tier.plotsRemaining} left</span>}
              </span>
            </button>
          );
        })}
      </div>
      {listing.cornerPremiumPct > 0 && (
        <p className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] mt-3">
          <InfoIcon size={14} />Corner plots carry a {listing.cornerPremiumPct}% premium: dual road frontage and a larger effective frontage.
        </p>
      )}
    </Section>
  );
}

// Land, each fee and the total in one card. Absent entirely for an estate
// that has declared nothing — never rendered as zero.
function Costs({ disclosure, commitment }: { disclosure: EstateCostDisclosure | null; commitment: TierCommitment | null }) {
  if (!disclosure) return null;
  if (isGrandfathered(disclosure)) {
    return <Section title="What this actually costs"><CostDisclosureSection disclosure={disclosure} tier={commitment} /></Section>;
  }
  return (
    <Section title="What this actually costs" subtitle={commitment ? `For a ${commitment.sizeSqm} sqm plot, paid outright. Every fee is declared by the developer before you pay.` : "Every fee is declared by the developer before you pay."}>
      <CommitmentBreakdown disclosure={disclosure} commitment={commitment} />
    </Section>
  );
}

function LocationCard({ listing }: { listing: Listing }) {
  return (
    <section className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 flex items-center gap-4">
      <IconChip><MapPinIcon size={20} /></IconChip>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">{listing.area}, {listing.city}, {listing.state}</h2>
        {/* TODO: PostGIS-backed map of the estate's real boundary/coordinates. */}
        <p className="text-xs text-[var(--muted-foreground)]">Interactive estate map coming soon</p>
      </div>
    </section>
  );
}

// ─── Booking ─────────────────────────────────────────────────────────────────

function BookingCard({ listing, shownTier, commitment, currency, onSelectSize, plotsUrl, onEnquire, title }: {
  listing: Listing; shownTier: PriceTier | undefined; commitment: TierCommitment | null; currency: Parameters<typeof formatAmount>[1];
  onSelectSize: (s: number) => void; plotsUrl: string; onEnquire: () => void; title?: string;
}) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 shadow-[0_8px_24px_-4px_rgba(13,31,20,0.08)] space-y-5">
      {title && <h2 className="text-lg font-semibold text-[var(--foreground)] -mb-1">{title}</h2>}
      {shownTier ? (
        <div>
          <div className="text-xs text-[var(--muted-foreground)]">{shownTier.sizeSqm === cheapestTier(listing).sizeSqm ? "From" : "Price"}</div>
          <div className="font-mono-data font-medium text-[28px] leading-9 text-[var(--foreground)]">{formatAmount(shownTier.price, currency)}</div>
          <div className="text-sm text-[var(--muted-foreground)]">{shownTier.sizeSqm} sqm plot</div>
        </div>
      ) : (
        <p className="text-sm text-[var(--muted-foreground)]">No plots are available right now.</p>
      )}

      {listing.priceTiers.length > 1 && (
        <div>
          <div className="text-xs font-medium text-[var(--muted-foreground)] mb-2">Plot size</div>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Plot size">
            {listing.priceTiers.map((t) => {
              const on = shownTier?.sizeSqm === t.sizeSqm;
              const soldOut = t.availability === "sold_out";
              return (
                <button key={t.id} type="button" role="radio" aria-checked={on} disabled={soldOut} onClick={() => onSelectSize(t.sizeSqm)}
                  className={`text-left rounded-lg px-3 py-2.5 ${on ? "border-2 border-[var(--primary)] bg-[var(--secondary)]" : "border border-[var(--border)] hover:bg-[var(--muted)]"} ${soldOut ? "opacity-50 cursor-not-allowed" : ""}`}>
                  <span className="block text-sm font-semibold text-[var(--foreground)]">{t.sizeSqm} sqm</span>
                  <span className="block text-xs font-mono-data text-[var(--muted-foreground)]">{soldOut ? "Sold out" : formatAmount(t.price, currency)}</span>
                  {!soldOut && <span className="block text-xs text-[var(--muted-foreground)]">{t.plotsRemaining} left</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {commitment && (
        <div className="flex items-center justify-between gap-4 pt-4 border-t border-[var(--border)]">
          <div>
            <div className="text-sm font-semibold text-[var(--foreground)]">Total commitment</div>
            <div className="text-xs text-[var(--muted-foreground)]">Includes <MoneyRangeDisplay money={commitment.oneOffFees} currency={commitment.currency} /> in fees</div>
          </div>
          <MoneyRangeDisplay money={commitment.totalCommitment} currency={commitment.currency} className="font-mono-data font-medium text-[var(--foreground)]" />
        </div>
      )}

      {listing.paymentPlans.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
          <WalletIcon /><span className="mr-0.5">Payment plans:</span>
          {listing.paymentPlans.map((p) => (
            <span key={p} className="px-2 py-0.5 rounded-full bg-[var(--secondary)] text-[var(--secondary-foreground)] font-medium capitalize">{p}</span>
          ))}
        </div>
      )}

      {/* Reserve and Book inspection need a specific plot, so both route into
          plot selection; only Enquire (estate-level) acts from here. */}
      <div className="space-y-2.5">
        <Link to={plotsUrl} className="hidden lg:flex w-full items-center justify-center px-4 py-2.5 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-semibold hover:opacity-90">Reserve a plot</Link>
        <Link to={plotsUrl} className="flex w-full items-center justify-center px-4 py-2.5 rounded-md border border-[var(--border)] text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]">Book an inspection</Link>
        <button type="button" onClick={onEnquire} className="w-full inline-flex items-center justify-center gap-1.5 py-1 text-sm font-medium text-[var(--accent)] hover:underline">
          <MessageIcon />Ask the developer a question
        </button>
      </div>

      <ul className="space-y-3 pt-4 border-t border-[var(--border)]">
        {[
          [<LockIcon key="l" />, "Pay only through HomeTrue", "Never into a bank account named in a letter, message or flyer."],
          [<CheckIcon key="c" />, "No KYC to enquire or inspect", "You verify your identity when you reserve, before your plot hold starts."],
        ].map(([icon, head, body]) => (
          <li key={head as string} className="flex gap-2.5">
            <span className="text-[var(--success-text)] mt-0.5">{icon}</span>
            <div>
              <div className="text-xs font-medium text-[var(--foreground)]">{head}</div>
              <div className="text-xs text-[var(--muted-foreground)]">{body}</div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DeveloperCard({ listing }: { listing: Listing }) {
  const s = listing.seller;
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-center gap-3">
        <IconChip><BuildingIcon size={20} /></IconChip>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[var(--foreground)] truncate">{s.companyName}</div>
          <div className="text-xs text-[var(--muted-foreground)]">{s.branchName ? `Sold by the ${s.branchName} branch` : "Sold by the company"}</div>
        </div>
        <Badge label="✓ Verified" variant="success" />
      </div>
      <SellerOffice seller={s} />
    </div>
  );
}
