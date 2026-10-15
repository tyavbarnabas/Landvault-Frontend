// The buyer's own purchases, newest first, each saying where it stands in the
// same words as the purchase page (lib/purchaseStatus.ts) — including a
// refund under way. Used on the dashboard (first few) and /purchases (all).
//
// A purchase is only "yours" once verified; nothing here says otherwise.

import { useEffect, useState } from "react";
import { formatInCurrency } from "../../data/mockData";
import { describePurchase } from "../../lib/purchaseStatus";
import LoadError from "../LoadError";
import Button from "../ui/Button";
import TextLink from "../ui/TextLink";
import { ListCard } from "../ui/Card";
import { Loading } from "../ui/Page";
import { TONE_DOT } from "../ui/tones";
import { fetchListingById } from "../../services/marketplaceService";
import { fetchMyPurchases, type Purchase } from "../../services/paymentsService";

// `density`: full-size rows on /purchases, like the other list pages; compact
// inside the dashboard's panel.
export default function PurchaseList({ pageSize, showMore = "page", density = "regular" }: {
  pageSize: number; showMore?: "page" | "link"; density?: "regular" | "compact";
}) {
  const [items, setItems] = useState<Purchase[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [names, setNames] = useState<Record<string, string>>({});

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

  // Estate names for display — one lookup per estate, not per purchase.
  useEffect(() => {
    const missing = [...new Set(items.map((p) => p.estateId))].filter((id) => !(id in names));
    if (!missing.length) return;
    let cancelled = false;
    Promise.all(missing.map((id) => fetchListingById(id).then((l) => [id, l?.name ?? ""] as const).catch(() => [id, ""] as const)))
      .then((pairs) => { if (!cancelled) setNames((n) => ({ ...n, ...Object.fromEntries(pairs) })); });
    return () => { cancelled = true; };
  }, [items, names]);

  if (loading && items.length === 0) return <Loading label="Loading your purchases…" />;
  if (error && items.length === 0) return <LoadError error={error} what="your purchases" onRetry={() => void load()} />;
  if (items.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        You haven't bought a plot yet. <TextLink to="/marketplace">Browse the marketplace →</TextLink>
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {items.map((p) => {
          const state = describePurchase(p);
          return (
            <ListCard key={p.id} to={`/purchases/${p.id}`} density={density}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${TONE_DOT[state.tone]}`} aria-hidden="true" />
                  <span className="font-medium text-[var(--foreground)]">{names[p.estateId] || "Your purchase"}</span>
                  <span className="text-xs text-[var(--muted-foreground)] font-mono-data">{p.reference}</span>
                  <span className="ml-auto font-mono-data text-sm">{formatInCurrency(p.totalPrice, p.currency)}</span>
                </div>
                <div className="text-sm text-[var(--foreground)] mt-1">{state.title}</div>
                {state.refund && <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{state.refund}</div>}
                {state.canPay && <div className="text-xs text-[var(--accent)] font-semibold mt-1">{state.payLabel} →</div>}
            </ListCard>
          );
        })}
      </ul>
      {hasMore && (showMore === "link" ? (
        <TextLink to="/purchases" className="text-sm">See all {total} purchases →</TextLink>
      ) : (
        <Button variant="link" onClick={() => void load(cursor)} disabled={loading}>
          {loading ? "Loading…" : `Show more (${items.length} of ${total})`}
        </Button>
      ))}
      {error != null && items.length > 0 && <LoadError error={error} what="more purchases" onRetry={() => void load(cursor)} />}
    </div>
  );
}
