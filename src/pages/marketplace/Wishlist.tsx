// The buyer's wishlist, from the Figma buyer-path proposal: a count, filters
// by listing type, and a Compare view beside the cards — from price, per sqm,
// sizes, title and availability side by side.
//
// The list itself is the buyer's account wishlist (AppContext, from
// /api/marketplace/wishlist), re-read when the page opens: names, today's
// prices, what's left and whether each is still listed all come from that one
// call. The cards' photos, sizes and titles come from each listing on the
// page shown, 12 at a time, which keeps a long wishlist within the
// marketplace's rate limit. `priceAtSave` is only ever the "since saved"
// marker, never the price.

import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApp } from "../../contexts/AppContext";
import { priceChangeSinceSaved, listingPlace, titleLabel, type WishlistItem } from "../../services/marketplaceService";
import {
  fetchWishlistListing, listingPricePerSqm, listingRoute, listingSizeRange, type MarketplaceListing,
} from "../../services/marketplaceFeedService";
import { wishlistErrorMessage } from "../../services/wishlistService";
import { formatInCurrency } from "../../data/mockData";
import { formatCompactCurrency } from "../../lib/formatCurrency";
import ListingCard from "../../components/marketplace/ListingCard";
import ListingTypeBadge from "../../components/marketplace/ListingTypeBadge";
import LoadError from "../../components/LoadError";
import EmptyState from "../../components/ui/EmptyState";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Button, { LinkButton } from "../../components/ui/Button";
import FilterChips from "../../components/ui/FilterChips";
import Pagination from "../../components/ui/Pagination";
import { ErrorText } from "../../components/ui/Field";
import { Loading } from "../../components/ui/Page";
import DisclosureTable, { TableRow } from "../../components/ui/DisclosureTable";
import { cx } from "../../components/ui/cx";

type View = "cards" | "compare";
type TypeFilter = "all" | "primary" | "resale";

const PAGE_SIZE = 12;
const key = (w: Pick<WishlistItem, "listingType" | "listingId">) => `${w.listingType}:${w.listingId}`;

export default function Wishlist() {
  const { wishlist, wishlistLoaded, reloadWishlist } = useApp();
  const [params, setParams] = useSearchParams();
  const [loadError, setLoadError] = useState<unknown>(null);
  const [refreshed, setRefreshed] = useState(false);
  // Each listing on the page shown, for its photo, sizes and title; null
  // when it couldn't be read, and the card then shows what the wishlist knows.
  const [details, setDetails] = useState<Map<string, MarketplaceListing | null>>(new Map());
  const [view, setView] = useState<View>("cards");
  const [type, setType] = useState<TypeFilter>("all");
  const [actionError, setActionError] = useState("");

  const load = () => {
    setLoadError(null);
    reloadWishlist().then(() => setRefreshed(true), (err) => { setLoadError(err); setRefreshed(true); });
  };
  // Fresh prices every time the page opens.
  useEffect(load, [reloadWishlist]);

  const listed = wishlist.filter((w) => w.available);
  const gone = wishlist.filter((w) => !w.available);
  const count = (t: TypeFilter) => listed.filter((w) => t === "all" || w.listingType === t).length;
  const filtered = listed.filter((w) => type === "all" || w.listingType === type);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Number(params.get("page")) || 1));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const missing = shown.filter((w) => !details.has(key(w)));
  const missingKey = missing.map(key).join(",");

  useEffect(() => {
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map((w) => fetchWishlistListing(w).catch(() => null).then((d) => [key(w), d] as const)))
      .then((pairs) => {
        if (cancelled) return;
        setDetails((prev) => { const next = new Map(prev); for (const [k, d] of pairs) next.set(k, d); return next; });
      });
    return () => { cancelled = true; };
  }, [missingKey]);

  const setPage = (p: number) => setParams((prev) => { const next = new URLSearchParams(prev); if (p > 1) next.set("page", String(p)); else next.delete("page"); return next; });
  const setTypeFilter = (t: TypeFilter) => { setType(t); setPage(1); };

  const loading = !wishlistLoaded || !refreshed || missing.length > 0;
  const saved = wishlist.length;

  if (loadError && saved === 0) return <LoadError error={loadError} what="your wishlist" onRetry={load} />;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">Wishlist</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            {!wishlistLoaded ? "Prices are live." : `${saved} saved · prices are live; a change since you saved one is marked.`}
          </p>
        </div>
        {listed.length > 0 && (
          <div role="group" aria-label="View" className="inline-flex rounded-full bg-[var(--muted)] p-[3px]">
            {(["cards", "compare"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
                className={cx("px-3.5 py-1.5 rounded-full text-sm transition-colors", view === v ? "bg-[var(--card)] font-semibold text-[var(--foreground)] shadow-sm" : "font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]")}>
                {v === "cards" ? "Cards" : "Compare"}
              </button>
            ))}
          </div>
        )}
      </header>

      {actionError && <ErrorText className="mb-4">{actionError}</ErrorText>}

      {loading && <Loading label="Loading your wishlist…" />}

      {!loading && saved === 0 && (
        <Card padding="sm">
          <EmptyState
            title="Your wishlist is empty"
            description="Save developer estates or resale plots from the marketplace to compare and come back to them later."
            action={<LinkButton to="/marketplace">Browse the marketplace</LinkButton>}
          />
        </Card>
      )}

      {!loading && listed.length > 0 && (
        <div className="space-y-4 mb-8">
          {count("primary") > 0 && count("resale") > 0 && (
            <FilterChips ariaLabel="Listing type" value={type} onChange={setTypeFilter}
              options={[{ id: "all", label: "All", count: count("all") }, { id: "primary", label: "Developer estates", count: count("primary") }, { id: "resale", label: "Resale", count: count("resale") }]} />
          )}
          {view === "cards" ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {shown.map((w) => {
                const detail = details.get(key(w));
                const change = priceChangeSinceSaved(w);
                return detail
                  ? <ListingCard key={key(w)} item={detail} priceChangeSinceSaved={change ?? undefined} priceChangeCurrency={w.currentCurrency ?? undefined} />
                  : <SummaryCard key={key(w)} saved={w} />;
              })}
            </div>
          ) : (
            <DisclosureTable columns={COLUMNS} grid={GRID} label="Saved listings compared">
              {shown.map((w) => <CompareRow key={key(w)} saved={w} detail={details.get(key(w)) ?? null} onError={setActionError} />)}
            </DisclosureTable>
          )}
          <Pagination page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} label="Wishlist pages" />
        </div>
      )}

      {!loading && gone.length > 0 && (
        <section aria-labelledby="gone-heading">
          <h2 id="gone-heading" className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)] mb-3">No longer available</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {gone.map((w) => (
              <div key={key(w)} className="bg-[var(--muted)] border border-[var(--border)] rounded-xl p-4">
                <ListingTypeBadge type={w.listingType} />
                <div className="font-semibold text-[var(--foreground)] mt-2 mb-0.5">{w.name}</div>
                {/* The backend never says why a listing left, so neither do we. */}
                <div className="text-xs text-[var(--muted-foreground)]">No longer on the marketplace.</div>
                <RemoveButton saved={w} onError={setActionError} className="mt-2" />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function RemoveButton({ saved, onError, className }: { saved: WishlistItem; onError: (message: string) => void; className?: string }) {
  const { toggleWishlistItem } = useApp();
  const remove = () => {
    onError("");
    toggleWishlistItem(saved.listingId, saved.listingType).catch((err) => onError(wishlistErrorMessage(err)));
  };
  return <Button variant="linkMuted" onClick={remove} className={className}>Remove</Button>;
}

// A saved listing whose own page couldn't be read just now: what the
// wishlist itself knows, so it doesn't vanish.
function SummaryCard({ saved }: { saved: WishlistItem }) {
  const change = priceChangeSinceSaved(saved);
  return (
    <Card className="space-y-2">
      <ListingTypeBadge type={saved.listingType} />
      <Link to={saved.listingType === "primary" ? `/marketplace/${saved.listingId}` : `/marketplace/resale/${saved.listingId}`} className="block font-semibold text-[var(--foreground)] hover:underline">
        {saved.name || "Saved listing"}
      </Link>
      {saved.currentPrice !== null && saved.currentCurrency && (
        <div className="text-sm">
          <span className="text-[var(--muted-foreground)]">From </span>
          <span className="font-mono-data font-medium text-[var(--foreground)]">{formatInCurrency(saved.currentPrice, saved.currentCurrency)}</span>
          {change ? <ChangeMarker change={change} currency={saved.currentCurrency} /> : null}
        </div>
      )}
      <Availability saved={saved} detail={null} />
    </Card>
  );
}

function ChangeMarker({ change, currency }: { change: number; currency: "NGN" | "USD" }) {
  return (
    <div className={cx("text-xs font-medium", change < 0 ? "text-[var(--success-text)]" : "text-[var(--warning-text)]")}>
      {change < 0 ? "↓" : "↑"} {formatCompactCurrency(Math.abs(change), currency)} since saved
    </div>
  );
}

// From the wishlist's own count: 0 is an estate still listed but sold out.
function Availability({ saved, detail }: { saved: WishlistItem; detail: MarketplaceListing | null }) {
  if (saved.listingType === "resale") {
    return detail?.listingType === "resale"
      ? <span className="text-sm text-[var(--muted-foreground)]">Listed {detail.data.daysListed} day{detail.data.daysListed === 1 ? "" : "s"} ago</span>
      : null;
  }
  if (saved.plotsRemaining === null) return null;
  if (saved.plotsRemaining === 0) return <Badge label="Sold out" variant="neutral" />;
  return <span className="text-sm text-[var(--muted-foreground)]">{saved.plotsRemaining} plot{saved.plotsRemaining === 1 ? "" : "s"} left</span>;
}

const COLUMNS = ["Listing", "From", "Per sqm", "Sizes", "Title", "Availability"];
const GRID = "lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_9rem]";
const NONE = <span className="text-sm text-[var(--muted-foreground)]">—</span>;

function CompareRow({ saved, detail, onError }: { saved: WishlistItem; detail: MarketplaceListing | null; onError: (message: string) => void }) {
  const primary = saved.listingType === "primary";
  const change = priceChangeSinceSaved(saved);
  const route = detail ? listingRoute(detail) : primary ? `/marketplace/${saved.listingId}` : `/marketplace/resale/${saved.listingId}`;
  const sub = !detail ? null : detail.listingType === "primary"
    ? [listingPlace(detail.data), detail.data.seller.companyName].filter(Boolean).join(" · ")
    : `${detail.data.location} · listed by ${detail.data.sellerName}`;
  const title = !detail ? null : detail.listingType === "primary"
    ? { label: titleLabel(detail.data.titleType, detail.data.titleStatus), verified: detail.data.titleStatus === "verified" }
    : { label: titleLabel(detail.data.titleType, detail.data.estateTitleStatus), verified: detail.data.estateTitleStatus === "verified" };
  const size = detail ? listingSizeRange(detail) : null;
  // Per sqm in the listing's own currency, which is the from-price's.
  const currency = saved.currentCurrency ?? "NGN";
  const cells = [
    <>
      <Link to={route} className="font-semibold text-[var(--foreground)] hover:underline">{saved.name || "Saved listing"}</Link>
      {sub && <div className="text-xs text-[var(--muted-foreground)]">{sub}</div>}
      <div className="mt-1"><ListingTypeBadge type={saved.listingType} /></div>
    </>,
    saved.currentPrice === null ? NONE : (
      <>
        <span className="lg:hidden text-xs text-[var(--muted-foreground)]">From </span>
        <span className="font-mono-data font-medium text-[var(--foreground)]" title={formatInCurrency(saved.currentPrice, currency)}>{formatCompactCurrency(saved.currentPrice, currency)}</span>
        {change ? <ChangeMarker change={change} currency={currency} /> : null}
      </>
    ),
    !detail ? NONE : <span className="text-sm"><span className="lg:hidden text-xs text-[var(--muted-foreground)]">Per sqm </span><span className="font-mono-data text-[var(--foreground)]">{formatInCurrency(Math.round(listingPricePerSqm(detail)), currency)}</span></span>,
    !size ? NONE : <span className="text-sm text-[var(--foreground)]">{size[0] === size[1] ? `${size[0]} sqm` : `${size[0]}–${size[1]} sqm`}</span>,
    !title ? NONE : <span className={cx("text-sm", title.verified ? "text-[var(--success-text)]" : "text-[var(--muted-foreground)]")}>{title.label}</span>,
    <Availability saved={saved} detail={detail} />,
  ];
  return (
    <TableRow grid={GRID} cells={cells} action={
      <div className="flex lg:flex-col lg:items-end gap-x-4 gap-y-1">
        <Link to={primary ? `/marketplace/${saved.listingId}/plots` : route} className="text-sm font-medium text-[var(--accent)] hover:underline whitespace-nowrap">
          {primary ? "Choose a plot →" : "View listing →"}
        </Link>
        <RemoveButton saved={saved} onError={onError} />
      </div>
    } />
  );
}
