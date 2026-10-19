// The buyer's wishlist, from the Figma buyer-path proposal: a count, filters
// by listing type, and a Compare view beside the cards — from price, per sqm,
// sizes, title and availability side by side.
//
// Every listing is re-fetched live; nothing here is a stored copy.
// `priceAtSave` is used only for the "changed since you saved it" marker,
// never to render the price itself. Saved items are held in AppContext; the
// backend has no wishlist API yet (asked for), so they don't outlive the session.

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../../contexts/AppContext";
import type { ResaleListing } from "../../services/resaleService";
import {
  fetchWishlistListing, listingDisplayName, listingFromPrice, listingPlotsRemaining, listingPricePerSqm, listingRoute, listingSizeRange,
  type MarketplaceListing,
} from "../../services/marketplaceFeedService";
import { listingPlace, titleLabel } from "../../services/marketplaceService";
import { formatAmount } from "../../data/mockData";
import { formatCompactCurrency } from "../../lib/formatCurrency";
import ListingCard from "../../components/marketplace/ListingCard";
import ListingTypeBadge from "../../components/marketplace/ListingTypeBadge";
import EmptyState from "../../components/ui/EmptyState";
import Card from "../../components/ui/Card";
import Button, { LinkButton } from "../../components/ui/Button";
import FilterChips from "../../components/ui/FilterChips";
import { Loading } from "../../components/ui/Page";
import DisclosureTable, { TableRow } from "../../components/ui/DisclosureTable";
import { cx } from "../../components/ui/cx";

interface WishlistEntry {
  item: MarketplaceListing;
  priceChangeSinceSaved: number;
}

// A resale listing that's no longer purchasable (pending transfer, sold, or
// withdrawn) — still shown, per PART 7, rather than silently vanishing or
// rendering a broken card.
const UNAVAILABLE_COPY: Record<string, string> = {
  resale_pending: "Pending transfer to another buyer",
  sold: "Sold",
  withdrawn: "Withdrawn by the seller",
};

type View = "cards" | "compare";
type TypeFilter = "all" | "primary" | "resale";

export default function Wishlist() {
  const { wishlist } = useApp();
  const [entries, setEntries] = useState<WishlistEntry[]>([]);
  const [unavailable, setUnavailable] = useState<ResaleListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("cards");
  const [type, setType] = useState<TypeFilter>("all");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(
      wishlist.map(async (saved) => {
        const item = await fetchWishlistListing(saved).catch(() => null);
        if (!item) return null;
        if (item.listingType === "resale" && item.data.status !== "active") return { kind: "unavailable" as const, listing: item.data };
        return { kind: "entry" as const, item, priceChangeSinceSaved: listingFromPrice(item) - saved.priceAtSave };
      }),
    ).then((results) => {
      if (cancelled) return;
      setEntries(results.flatMap((r) => (r?.kind === "entry" ? [{ item: r.item, priceChangeSinceSaved: r.priceChangeSinceSaved }] : [])));
      setUnavailable(results.flatMap((r) => (r?.kind === "unavailable" ? [r.listing] : [])));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [wishlist]);

  const count = (t: TypeFilter) => entries.filter((e) => t === "all" || e.item.listingType === t).length;
  const shown = entries.filter((e) => type === "all" || e.item.listingType === type);
  const saved = entries.length + unavailable.length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">Wishlist</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            {loading ? "Prices are live." : `${saved} saved · prices are live; a change since you saved one is marked.`}
          </p>
        </div>
        {entries.length > 0 && (
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

      {!loading && entries.length > 0 && (
        <div className="space-y-4 mb-8">
          {count("primary") > 0 && count("resale") > 0 && (
            <FilterChips ariaLabel="Listing type" value={type} onChange={setType}
              options={[{ id: "all", label: "All", count: count("all") }, { id: "primary", label: "Developer estates", count: count("primary") }, { id: "resale", label: "Resale", count: count("resale") }]} />
          )}
          {view === "cards" ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {shown.map(({ item, priceChangeSinceSaved }) => (
                <ListingCard key={`${item.listingType}:${item.data.id}`} item={item} priceChangeSinceSaved={priceChangeSinceSaved} />
              ))}
            </div>
          ) : (
            <DisclosureTable columns={COLUMNS} grid={GRID} label="Saved listings compared">
              {shown.map((e) => <CompareRow key={`${e.item.listingType}:${e.item.data.id}`} entry={e} />)}
            </DisclosureTable>
          )}
        </div>
      )}

      {!loading && unavailable.length > 0 && (
        <section aria-labelledby="gone-heading">
          <h2 id="gone-heading" className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)] mb-3">No longer available</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {unavailable.map((listing) => (
              <div key={listing.id} className="bg-[var(--muted)] border border-[var(--border)] rounded-xl p-4">
                <ListingTypeBadge type="resale" />
                <div className="font-semibold text-[var(--foreground)] mt-2 mb-0.5">{listing.estateName} — {listing.plotLabel}</div>
                <div className="text-xs text-[var(--muted-foreground)]">{listing.location}, {listing.state}</div>
                <div className="text-xs font-medium text-[var(--warning-text)] mt-2">{UNAVAILABLE_COPY[listing.status] ?? "No longer available"}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

const COLUMNS = ["Listing", "From", "Per sqm", "Sizes", "Title", "Availability"];
const GRID = "lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.2fr)_9rem]";

function CompareRow({ entry: { item, priceChangeSinceSaved } }: { entry: WishlistEntry }) {
  const { toggleWishlistItem } = useApp();
  const [min, max] = listingSizeRange(item);
  const primary = item.listingType === "primary";
  const sub = primary
    ? [listingPlace(item.data), item.data.seller.companyName].filter(Boolean).join(" · ")
    : `${item.data.location} · listed by ${item.data.sellerName}`;
  const title = primary ? titleLabel(item.data.titleType, item.data.titleStatus) : titleLabel(item.data.titleType, item.data.estateTitleStatus);
  const verified = primary ? item.data.titleStatus === "verified" : item.data.estateTitleStatus === "verified";
  const availability = primary ? `${listingPlotsRemaining(item)} plots left` : `Listed ${item.data.daysListed} day${item.data.daysListed === 1 ? "" : "s"} ago`;
  const cells = [
    <>
      <Link to={listingRoute(item)} className="font-semibold text-[var(--foreground)] hover:underline">{primary ? listingDisplayName(item) : `${item.data.estateName} — ${item.data.plotLabel}`}</Link>
      <div className="text-xs text-[var(--muted-foreground)]">{sub}</div>
      <div className="mt-1"><ListingTypeBadge type={item.listingType} /></div>
    </>,
    <>
      <span className="lg:hidden text-xs text-[var(--muted-foreground)]">From </span>
      <span className="font-mono-data font-medium text-[var(--foreground)]" title={formatAmount(listingFromPrice(item), "NGN")}>{formatCompactCurrency(listingFromPrice(item))}</span>
      {priceChangeSinceSaved !== 0 && (
        <div className={cx("text-xs font-medium", priceChangeSinceSaved < 0 ? "text-[var(--success-text)]" : "text-[var(--warning-text)]")}>
          {priceChangeSinceSaved < 0 ? "↓" : "↑"} {formatCompactCurrency(Math.abs(priceChangeSinceSaved))} since saved
        </div>
      )}
    </>,
    <span className="text-sm"><span className="lg:hidden text-xs text-[var(--muted-foreground)]">Per sqm </span><span className="font-mono-data text-[var(--foreground)]">{formatAmount(Math.round(listingPricePerSqm(item)), "NGN")}</span></span>,
    <span className="text-sm text-[var(--foreground)]">{min === max ? `${min} sqm` : `${min}–${max} sqm`}</span>,
    <span className={cx("text-sm", verified ? "text-[var(--success-text)]" : "text-[var(--muted-foreground)]")}>{title}</span>,
    <span className="text-sm text-[var(--muted-foreground)]">{availability}</span>,
  ];
  return (
    <TableRow grid={GRID} cells={cells} action={
      <div className="flex lg:flex-col lg:items-end gap-x-4 gap-y-1">
        <Link to={primary ? `/marketplace/${item.data.id}/plots` : listingRoute(item)} className="text-sm font-medium text-[var(--accent)] hover:underline whitespace-nowrap">
          {primary ? "Choose a plot →" : "View listing →"}
        </Link>
        <Button variant="linkMuted" onClick={() => toggleWishlistItem(item.data.id, listingFromPrice(item), item.listingType)}>Remove</Button>
      </div>
    } />
  );
}
