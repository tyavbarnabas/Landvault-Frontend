// The buyer's own purchases, newest first, from the Figma My purchases
// proposal: tabs (all / in progress / allocated / ended) over a table of plot,
// reference, date, amount and a short status badge, which becomes one card
// per purchase on a phone. The badge words come from lib/purchaseStatus.ts,
// the same place the purchase page's do.
//
// A purchase is only "yours" once verified; nothing here says otherwise.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatInCurrency } from "../../data/mockData";
import { purchaseBadge, purchaseGroup, type PurchaseGroup } from "../../lib/purchaseStatus";
import { formatDay } from "../../lib/formatDate";
import LoadError from "../LoadError";
import Button, { LinkButton } from "../ui/Button";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import TabBar from "../ui/Tabs";
import EmptyState from "../ui/EmptyState";
import { Loading } from "../ui/Page";
import { ChevronRightIcon } from "../icons";
import { fetchListingById } from "../../services/marketplaceService";
import { CANVAS_PLOT_FETCH_LIMIT, fetchPlotsForListing, plotLabel } from "../../services/marketplacePlotsService";
import { fetchMyPurchases, type Purchase } from "../../services/paymentsService";

type Tab = "all" | PurchaseGroup;
const TAB_LABEL: Record<Tab, string> = { all: "All", in_progress: "In progress", allocated: "Allocated", ended: "Ended" };
const EMPTY_TAB: Record<PurchaseGroup, string> = {
  in_progress: "Nothing is in progress: no payment, check or refund is waiting.",
  allocated: "No plot has been allocated to you yet.",
  ended: "No purchase has ended.",
};

interface Names {
  estates: Record<string, string>;
  // Per estate, plot id → "Block B, Plot 15".
  plots: Record<string, Record<string, string>>;
}

const ROW_GRID = "lg:grid lg:grid-cols-[2fr_1.1fr_0.9fr_1.1fr_1.6fr_16px] lg:items-center lg:gap-4";

export default function PurchaseList({ pageSize }: { pageSize: number }) {
  const [items, setItems] = useState<Purchase[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [names, setNames] = useState<Names>({ estates: {}, plots: {} });
  const [tab, setTab] = useState<Tab>("all");

  const load = async (from?: string) => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchMyPurchases({ limit: pageSize, cursor: from });
      setItems((prev) => (from ? [...prev, ...page.items] : page.items));
      setCursor(page.cursor);
      setHasMore(page.hasMore);
      setTotal(page.total);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [pageSize]);

  // Estate names and plot labels for display — one lookup per estate, not per
  // purchase. One that fails leaves the row with what it has.
  useEffect(() => {
    const missing = [...new Set(items.map((p) => p.estateId))].filter((id) => !(id in names.estates));
    if (!missing.length) return;
    let cancelled = false;
    Promise.all(missing.map(async (id) => {
      const [listing, plots] = await Promise.all([
        fetchListingById(id).catch(() => undefined),
        fetchPlotsForListing(id, { limit: CANVAS_PLOT_FETCH_LIMIT }).then((page) => page.items).catch(() => []),
      ]);
      return [id, listing?.name ?? "", Object.fromEntries(plots.map((pl) => [pl.id, plotLabel(pl)]))] as const;
    })).then((rows) => {
      if (cancelled) return;
      setNames((n) => ({
        estates: { ...n.estates, ...Object.fromEntries(rows.map(([id, name]) => [id, name])) },
        plots: { ...n.plots, ...Object.fromEntries(rows.map(([id, , plots]) => [id, plots])) },
      }));
    });
    return () => { cancelled = true; };
  }, [items, names.estates]);

  if (loading && items.length === 0) return <Loading label="Loading your purchases…" />;
  if (error && items.length === 0) return <LoadError error={error} what="your purchases" onRetry={() => void load()} />;
  if (items.length === 0) {
    return (
      <Card padding="sm">
        <EmptyState title="You haven't bought a plot yet." description="Plots you reserve or pay for appear here, with where each one stands."
          action={<LinkButton to="/marketplace">Browse the marketplace</LinkButton>} />
      </Card>
    );
  }

  // Counts only once everything is loaded: a count of one page would lie.
  const complete = !hasMore;
  const count = (t: Tab) => (t === "all" ? total : items.filter((p) => purchaseGroup(p) === t).length);
  const tabs = (Object.keys(TAB_LABEL) as Tab[]).map((id) => ({ id, label: complete || id === "all" ? `${TAB_LABEL[id]} ${count(id)}` : TAB_LABEL[id] }));
  const shown = tab === "all" ? items : items.filter((p) => purchaseGroup(p) === tab);

  return (
    <div className="space-y-4">
      <TabBar tabs={tabs} active={tab} onActivate={setTab} ariaLabel="Filter purchases" divider />
      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {shown.length === 0 ? (
          <Card><p className="text-sm text-[var(--muted-foreground)]">{EMPTY_TAB[tab as PurchaseGroup]}{hasMore ? " Load more to check older purchases." : ""}</p></Card>
        ) : (
          <Card padding="none" className="overflow-hidden">
            <div aria-hidden="true" className={`hidden ${ROW_GRID} bg-[var(--muted)] px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]`}>
              <span>Plot</span><span>Reference</span><span>Date</span><span>Amount</span><span>Status</span><span />
            </div>
            <ul className="divide-y divide-[var(--border)]">
              {shown.map((p) => <PurchaseRow key={p.id} purchase={p} estate={names.estates[p.estateId]} plot={names.plots[p.estateId]?.[p.plotId]} />)}
            </ul>
          </Card>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--muted-foreground)]">
        <span>{hasMore ? `Showing ${items.length} of ${total} purchases` : `Showing all ${total} purchase${total === 1 ? "" : "s"}`}</span>
        {hasMore && (
          <Button variant="link" onClick={() => void load(cursor)} disabled={loading}>{loading ? "Loading…" : "Load more"}</Button>
        )}
      </div>
      {error != null && items.length > 0 && <LoadError error={error} what="more purchases" onRetry={() => void load(cursor)} />}
    </div>
  );
}

function PurchaseRow({ purchase: p, estate, plot }: { purchase: Purchase; estate?: string; plot?: string }) {
  const badge = purchaseBadge(p);
  const title = plot ?? estate ?? "Your purchase";
  const sub = plot ? estate : undefined;
  return (
    <li>
      <Link to={`/purchases/${p.id}`} className={`group block px-4 sm:px-5 py-3.5 hover:bg-[var(--muted)]/50 transition-colors ${ROW_GRID}`}>
        <div className="flex items-start justify-between gap-3 min-w-0">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[var(--foreground)] group-hover:underline truncate">{title}</div>
            <div className="text-xs text-[var(--muted-foreground)] truncate">
              {sub}<span className="lg:hidden">{sub ? " · " : ""}{formatDay(p.createdAt)}</span>
            </div>
          </div>
          <span className="lg:hidden shrink-0"><Badge label={badge.label} variant={badge.tone} /></span>
        </div>
        <div className="flex items-center justify-between gap-3 mt-2 lg:mt-0 lg:contents">
          <span className="text-xs font-mono-data text-[var(--muted-foreground)]">{p.reference}</span>
          <span className="hidden lg:block text-sm text-[var(--foreground)]">{formatDay(p.createdAt)}</span>
          <span className="text-sm font-mono-data text-[var(--foreground)]">{formatInCurrency(p.totalPrice, p.currency)}</span>
        </div>
        <div className="hidden lg:block min-w-0">
          <Badge label={badge.label} variant={badge.tone} />
          {badge.note && <div className="text-xs text-[var(--muted-foreground)] mt-1">{badge.note}</div>}
        </div>
        {badge.note && <div className="lg:hidden text-xs text-[var(--muted-foreground)] mt-1">{badge.note}</div>}
        <ChevronRightIcon size={16} className="hidden lg:block text-[var(--muted-foreground)]" />
      </Link>
    </li>
  );
}
