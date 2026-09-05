import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchUnifiedListings, type MarketplaceListing, type UnifiedListingFilters } from "../../services/marketplaceFeedService";
import { formatCompactCurrency } from "../../lib/formatCurrency";
import ListingCard from "../../components/marketplace/ListingCard";
import FilterBar from "../../components/marketplace/FilterBar";
import FilterChip from "../../components/marketplace/FilterChip";
import EmptyState from "../../components/marketplace/EmptyState";

function filtersFromParams(params: URLSearchParams): UnifiedListingFilters {
  const get = (k: string) => params.get(k) || undefined;
  const num = (k: string) => { const v = params.get(k); return v ? Number(v) : undefined; };
  const type = get("type");
  return {
    type: type === "primary" || type === "resale" ? type : undefined,
    query: get("q"),
    state: get("state") as UnifiedListingFilters["state"],
    minPrice: num("minPrice"),
    maxPrice: num("maxPrice"),
    minSize: num("minSize"),
    maxSize: num("maxSize"),
    titleType: get("titleType") as UnifiedListingFilters["titleType"],
    paymentPlan: get("paymentPlan") as UnifiedListingFilters["paymentPlan"],
    intent: get("intent") as UnifiedListingFilters["intent"],
    verifiedOnly: params.get("verified") === "1" ? true : undefined,
    sort: (get("sort") as UnifiedListingFilters["sort"]) ?? "newest",
  };
}

function paramsFromFilters(filters: UnifiedListingFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.query) params.set("q", filters.query);
  if (filters.state) params.set("state", filters.state);
  if (filters.minPrice !== undefined) params.set("minPrice", String(filters.minPrice));
  if (filters.maxPrice !== undefined) params.set("maxPrice", String(filters.maxPrice));
  if (filters.minSize !== undefined) params.set("minSize", String(filters.minSize));
  if (filters.maxSize !== undefined) params.set("maxSize", String(filters.maxSize));
  if (filters.titleType) params.set("titleType", filters.titleType);
  if (filters.paymentPlan) params.set("paymentPlan", filters.paymentPlan);
  if (filters.intent) params.set("intent", filters.intent);
  if (filters.verifiedOnly) params.set("verified", "1");
  if (filters.sort && filters.sort !== "newest") params.set("sort", filters.sort);
  return params;
}

export default function MarketplaceFeed() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams]);
  const showWelcome = searchParams.get("welcome") === "1";

  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetchUnifiedListings(filters)
      .then((data) => { if (!cancelled) setListings(data); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const updateFilters = (patch: Partial<UnifiedListingFilters>) => {
    setSearchParams(paramsFromFilters({ ...filters, ...patch }), { replace: true });
  };

  const clearAll = () => setSearchParams(new URLSearchParams(), { replace: true });

  const chips: { key: string; label: string; onRemove: () => void }[] = [];
  if (filters.type) chips.push({ key: "type", label: filters.type === "primary" ? "Developer estates" : "Resale", onRemove: () => updateFilters({ type: undefined }) });
  if (filters.query) chips.push({ key: "q", label: `"${filters.query}"`, onRemove: () => updateFilters({ query: undefined }) });
  if (filters.state) chips.push({ key: "state", label: filters.state, onRemove: () => updateFilters({ state: undefined }) });
  if (filters.titleType) chips.push({ key: "title", label: filters.titleType, onRemove: () => updateFilters({ titleType: undefined }) });
  if (filters.paymentPlan) chips.push({ key: "plan", label: filters.paymentPlan, onRemove: () => updateFilters({ paymentPlan: undefined }) });
  if (filters.intent) chips.push({ key: "intent", label: filters.intent, onRemove: () => updateFilters({ intent: undefined }) });
  if (filters.verifiedOnly) chips.push({ key: "verified", label: "Verified only", onRemove: () => updateFilters({ verifiedOnly: undefined }) });
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    chips.push({
      key: "price",
      label: `${filters.minPrice !== undefined ? formatCompactCurrency(filters.minPrice) : "₦0"} – ${filters.maxPrice !== undefined ? formatCompactCurrency(filters.maxPrice) : "∞"}`,
      onRemove: () => updateFilters({ minPrice: undefined, maxPrice: undefined }),
    });
  }
  if (filters.minSize !== undefined || filters.maxSize !== undefined) {
    chips.push({
      key: "size",
      label: `${filters.minSize ?? 0}–${filters.maxSize ?? "∞"} sqm`,
      onRemove: () => updateFilters({ minSize: undefined, maxSize: undefined }),
    });
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {showWelcome && !welcomeDismissed && (
        <div className="mb-6 flex items-center justify-between gap-4 bg-[var(--secondary)] border border-[var(--border)] rounded-xl px-4 py-3">
          <p className="text-sm text-[var(--secondary-foreground)]">
            Welcome to LandVault — browse verified developer estates and resale plots from every seller on the platform, all in one place.
          </p>
          <button onClick={() => setWelcomeDismissed(true)} className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] shrink-0">Dismiss</button>
        </div>
      )}

      <div className="mb-6">
        <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">Marketplace</h1>
        <p className="text-sm text-[var(--muted-foreground)]">Developer estates and resale plots from every seller on LandVault, across Nigeria — clearly labelled either way.</p>
      </div>

      <div className="mb-3">
        <FilterBar filters={filters} onChange={updateFilters} />
      </div>

      {filters.paymentPlan && filters.type !== "primary" && (
        <p className="text-xs text-[var(--muted-foreground)] mb-3">Payment plan filtering applies to developer estates only — a resale plot is a single negotiated price, so resale listings are excluded while this filter is active.</p>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {chips.map((c) => <FilterChip key={c.key} label={c.label} onRemove={c.onRemove} />)}
          <button onClick={clearAll} className="text-xs text-[var(--accent)] font-medium hover:underline px-1">Clear all</button>
        </div>
      )}

      {loading && <div className="text-sm text-[var(--muted-foreground)] py-8">Loading listings…</div>}

      {!loading && error && (
        <EmptyState title="Couldn't load the marketplace" description="Something went wrong loading listings. Try refreshing the page." />
      )}

      {!loading && !error && listings.length === 0 && (
        <EmptyState
          title="No listings match your filters"
          description="Try widening your price range, size range, or clearing a filter to see more results."
          action={<button onClick={clearAll} className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90">Clear filters</button>}
        />
      )}

      {!loading && !error && listings.length > 0 && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {listings.map((item) => <ListingCard key={`${item.listingType}:${item.data.id}`} item={item} />)}
        </div>
      )}
    </div>
  );
}
