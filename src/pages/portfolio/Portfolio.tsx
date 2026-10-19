import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { formatAmount, type OwnedPlot } from "../../data/mockData";
import { fetchOwnedPlots, fetchPortfolioSummary, sizeText, urgencyRank, type PortfolioSummary } from "../../services/portfolioService";
import { isAvailable } from "../../lib/backends";
import PlotStatusBadge from "../../components/portfolio/PlotStatusBadge";
import ArrearsBanner from "../../components/portfolio/ArrearsBanner";
import { ListCard } from "../../components/ui/Card";

// Re-exported so Dashboard.tsx (and anything else ranking a buyer's plots by
// urgency) uses the exact same logic — it now actually lives in
// portfolioService.ts, so fetchOwnedPlots' own `sort: "urgency"` can apply it
// server-side, before pagination.
export { urgencyRank };

// A "transferred" (resold) or "superseded" (upgraded away) record is kept
// forever for its audit history, but it's no longer a plot the buyer
// currently holds — a real ledger stops counting it in current totals the
// moment it retires, even though the row itself never disappears. Exported
// so Dashboard.tsx's stats use the same rule as Portfolio.tsx's, rather than
// double-counting equity that has already moved into a replacement record
// (see upgradeService.ts's executeReallocation: the new OwnedPlot's
// paidAmount already includes the old plot's carried-forward equity).
export function isActivelyOwned(plot: OwnedPlot): boolean {
  return plot.status !== "transferred" && plot.status !== "superseded";
}

// Live there can be more plots than one page holds, so the totals come from
// the server (fetchPortfolioSummary), never from adding up the loaded rows.
const PORTFOLIO_PAGE_SIZE = 50;

export default function Portfolio() {
  const [ownedPlots, setOwnedPlots] = useState<OwnedPlot[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary | null>(null);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = () => {
    setLoading(true);
    setLoadError(false);
    Promise.all([fetchOwnedPlots({ sort: "urgency", limit: PORTFOLIO_PAGE_SIZE }), fetchPortfolioSummary()])
      .then(([page, totals]) => { setOwnedPlots(page.items); setCursor(page.cursor); setHasMore(page.hasMore); setSummary(totals); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    const page = await fetchOwnedPlots({ sort: "urgency", cursor, limit: PORTFOLIO_PAGE_SIZE });
    setOwnedPlots((prev) => [...prev, ...page.items]);
    setCursor(page.cursor);
    setHasMore(page.hasMore);
    setLoadingMore(false);
  };

  // Resale has no backend yet: live, its link would open demo listings.
  const resale = isAvailable("resale");

  if (loading) return <div className="p-8 text-[var(--muted-foreground)] text-sm">Loading portfolio…</div>;

  if (loadError) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-[var(--foreground)] font-medium mb-2">Couldn't load your portfolio.</p>
        <button onClick={load} className="text-sm text-[var(--accent)] hover:underline">Try again</button>
      </div>
    );
  }

  if (ownedPlots.length === 0) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="mb-6 flex items-start justify-between gap-4">
          <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">My portfolio</h1>
          {resale && (
            <Link to="/resale/my-listings" className="shrink-0 px-4 py-2 border border-[var(--border)] rounded-md text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors whitespace-nowrap">
              My listings & offers
            </Link>
          )}
        </div>
        <div className="text-center py-16 border border-dashed border-[var(--border)] rounded-xl">
          <div className="text-3xl mb-3" aria-hidden="true">🏡</div>
          <p className="text-sm font-medium text-[var(--foreground)] mb-1">You don't own any plots yet.</p>
          <p className="text-sm text-[var(--muted-foreground)] mb-5">Browse the marketplace to find your first plot.</p>
          <Link to="/marketplace" className="inline-block px-5 py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
            Browse the marketplace
          </Link>
        </div>
      </div>
    );
  }

  const byCurrency = summary?.byCurrency ?? [];
  const awaiting = summary?.awaitingVerification ?? 0;

  // Already sorted server-side (fetchOwnedPlots' sort: "urgency") — no
  // client-side re-sort, so ordering stays correct across "Load more" pages.
  const sortedPlots = ownedPlots;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">My portfolio</h1>
          <p className="text-sm text-[var(--muted-foreground)]">All plots you own or hold under an active plan.</p>
        </div>
        {/* Selling workspace lives here, not in the marketplace browse
            surface — see PART 6 of the marketplace-unification spec. */}
        {resale && (
          <Link to="/resale/my-listings" className="shrink-0 px-4 py-2 border border-[var(--border)] rounded-md text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors whitespace-nowrap">
            My listings & offers
          </Link>
        )}
      </div>

      {/* Summary — one card group per currency actually held, from the server */}
      <div className="space-y-3 mb-8">
        {byCurrency.map((g) => (
          <div key={g.currency} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {byCurrency.length > 1 && (
              <div className="col-span-2 lg:col-span-4 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide -mb-1">{g.currency} plots</div>
            )}
            {[
              { label: "Total value", value: formatAmount(g.totalValue, g.currency) },
              { label: "Equity paid", value: formatAmount(g.totalPaid, g.currency) },
              { label: "Outstanding", value: formatAmount(g.totalValue - g.totalPaid, g.currency) },
              { label: "Plots", value: g.count.toString() },
            ].map((s) => (
              <div key={s.label} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                <div className="text-xs text-[var(--muted-foreground)] mb-1">{s.label}</div>
                <div className="font-semibold font-mono-data text-lg">{s.value}</div>
              </div>
            ))}
          </div>
        ))}
        {byCurrency.length > 1 && (
          <p className="text-xs text-[var(--muted-foreground)]">Each group above shows that currency's own total — figures are never converted or combined across currencies.</p>
        )}
        {awaiting > 0 && (
          <p className="text-sm text-[var(--muted-foreground)]" role="status">
            {awaiting} purchase{awaiting === 1 ? "" : "s"} awaiting verification. {awaiting === 1 ? "It joins" : "They join"} these totals once finance confirms the payment.
          </p>
        )}
      </div>

      {/* Plots list */}
      <ul className="space-y-3">
        {sortedPlots.map((plot) => {
          const pct = plot.totalPrice > 0 ? Math.round((plot.paidAmount / plot.totalPrice) * 100) : 0;
          return (
            // Not a `to` row: the arrears banner below has its own buttons,
            // which can't sit inside a link.
            <ListCard key={plot.id} className="hover:border-[var(--accent)]/50 transition-colors">
              <Link to={`/portfolio/${plot.id}`} className="block">
                <div className="grid md:grid-cols-3 gap-4">
                  {/* Info */}
                  <div className="md:col-span-2">
                    <div className="flex items-start gap-3 mb-2">
                      <div>
                        <div className="font-semibold text-[var(--foreground)]">{plot.estate}</div>
                        <div className="text-xs text-[var(--muted-foreground)]">{[plot.plotLabel, sizeText(plot), plot.location].filter(Boolean).join(" · ")}</div>
                      </div>
                      <span className="ml-auto shrink-0"><PlotStatusBadge status={plot.status} /></span>
                    </div>

                    <div className="flex flex-wrap gap-3 text-xs text-[var(--muted-foreground)] mb-3">
                      <span className="font-mono-data">{plot.acquiredDate ? `Acquired ${plot.acquiredDate}` : "Not acquired until finance verifies"}</span>
                      <span>·</span>
                      <span className="capitalize">{plot.plan}</span>
                      <span>·</span>
                      <span className="capitalize">{plot.intent}</span>
                    </div>

                    {plot.status === "pending_verification" ? (
                      // Equity is 0 until finance verifies: a bar at 0% would read as "nothing paid".
                      <p className="text-xs text-[var(--muted-foreground)]">
                        Payment received for <span className="font-mono-data">{formatAmount(plot.totalPrice, plot.currency)}</span>. Finance is checking it; your equity shows once they confirm.
                      </p>
                    ) : (
                      <>
                        <div className="mb-1.5 flex items-center justify-between text-xs">
                          <span className="text-[var(--muted-foreground)]" id={`equity-${plot.id}`}>Equity progress</span>
                          <span className="font-mono-data">{formatAmount(plot.paidAmount, plot.currency)} / {formatAmount(plot.totalPrice, plot.currency)}</span>
                        </div>
                        <div className="h-2 bg-[var(--muted)] rounded-full overflow-hidden" role="progressbar" aria-labelledby={`equity-${plot.id}`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                          <div className="h-full bg-[var(--primary)] rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 justify-center">
                    {plot.nextDueDate && plot.status !== "in_arrears" && (
                      <div className="bg-[var(--muted)] rounded-lg p-3">
                        <div className="text-xs text-[var(--muted-foreground)] mb-0.5">Next payment</div>
                        <div className="font-semibold font-mono-data text-sm">{plot.nextDueAmount !== undefined ? formatAmount(plot.nextDueAmount, plot.currency) : "—"}</div>
                        <div className="text-xs font-mono-data text-[var(--muted-foreground)]">{plot.nextDueDate}</div>
                      </div>
                    )}
                    <div className="text-xs text-[var(--accent)] font-medium text-right">View details →</div>
                  </div>
                </div>
              </Link>

              {plot.status === "in_arrears" && plot.arrears && (
                <div className="mt-4">
                  <ArrearsBanner arrears={plot.arrears} currency={plot.currency} restructureStatus={plot.restructureStatus} />
                </div>
              )}
            </ListCard>
          );
        })}
      </ul>

      {hasMore && (
        <button onClick={loadMore} disabled={loadingMore} className="mt-4 w-full py-2.5 border border-[var(--border)] rounded-md text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-60">
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
