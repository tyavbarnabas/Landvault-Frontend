import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { formatAmount, type Currency, type OwnedPlot } from "../../data/mockData";
import { fetchOwnedPlots } from "../../services/portfolioService";
import PlotStatusBadge from "../../components/portfolio/PlotStatusBadge";
import ArrearsBanner from "../../components/portfolio/ArrearsBanner";

// Lower = more urgent. Arrears first, then anything due within a week, then
// ordinary in-progress plans, then anything already settled last. Exported so
// Dashboard.tsx's "Upcoming payments" orders by the same urgency, rather than
// a second, possibly-diverging copy of this logic.
export function urgencyRank(plot: OwnedPlot): number {
  if (plot.status === "in_arrears") return 0;
  if (plot.nextDueDate) {
    const daysUntilDue = Math.round((new Date(plot.nextDueDate).getTime() - Date.now()) / 86_400_000);
    if (daysUntilDue <= 7) return 1;
  }
  if (plot.status === "completed") return 3;
  return 2;
}

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

// Never sum across currencies — group totals per currency actually present on
// the buyer's plots. Exported so Dashboard.tsx's summary tiles use the exact
// same grouping instead of a second copy that could drift out of sync.
export interface CurrencyTotals {
  totalValue: number;
  totalPaid: number;
  count: number;
}

export function groupPlotsByCurrency(plots: OwnedPlot[]): Map<Currency, CurrencyTotals> {
  const byCurrency = new Map<Currency, CurrencyTotals>();
  for (const p of plots.filter(isActivelyOwned)) {
    const g = byCurrency.get(p.currency) ?? { totalValue: 0, totalPaid: 0, count: 0 };
    g.totalValue += p.totalPrice;
    g.totalPaid += p.paidAmount;
    g.count += 1;
    byCurrency.set(p.currency, g);
  }
  return byCurrency;
}

export default function Portfolio() {
  const [ownedPlots, setOwnedPlots] = useState<OwnedPlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = () => {
    setLoading(true);
    setLoadError(false);
    fetchOwnedPlots()
      .then((data) => setOwnedPlots(data))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

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
          <Link to="/resale/my-listings" className="shrink-0 px-4 py-2 border border-[var(--border)] rounded-md text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors whitespace-nowrap">
            My listings & offers
          </Link>
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

  // Today's fixtures are all NGN, so this renders one group in practice, but
  // it stays correct the moment that's no longer true.
  const byCurrency = groupPlotsByCurrency(ownedPlots);

  const sortedPlots = [...ownedPlots].sort((a, b) => urgencyRank(a) - urgencyRank(b));

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">My portfolio</h1>
          <p className="text-sm text-[var(--muted-foreground)]">All plots you own or hold under an active plan.</p>
        </div>
        {/* Selling workspace lives here, not in the marketplace browse
            surface — see PART 6 of the marketplace-unification spec. */}
        <Link to="/resale/my-listings" className="shrink-0 px-4 py-2 border border-[var(--border)] rounded-md text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors whitespace-nowrap">
          My listings & offers
        </Link>
      </div>

      {/* Summary — one card group per currency actually held */}
      <div className="space-y-3 mb-8">
        {Array.from(byCurrency.entries()).map(([cur, g]) => (
          <div key={cur} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {byCurrency.size > 1 && (
              <div className="col-span-2 lg:col-span-4 text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide -mb-1">{cur} plots</div>
            )}
            {[
              { label: "Total value", value: formatAmount(g.totalValue, cur) },
              { label: "Equity paid", value: formatAmount(g.totalPaid, cur) },
              { label: "Outstanding", value: formatAmount(g.totalValue - g.totalPaid, cur) },
              { label: "Plots", value: g.count.toString() },
            ].map((s) => (
              <div key={s.label} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                <div className="text-xs text-[var(--muted-foreground)] mb-1">{s.label}</div>
                <div className="font-semibold font-mono-data text-lg">{s.value}</div>
              </div>
            ))}
          </div>
        ))}
        {byCurrency.size > 1 && (
          <p className="text-xs text-[var(--muted-foreground)]">Each group above shows that currency's own total — figures are never converted or combined across currencies.</p>
        )}
      </div>

      {/* Plots list */}
      <div className="space-y-4">
        {sortedPlots.map((plot) => {
          const pct = plot.totalPrice > 0 ? Math.round((plot.paidAmount / plot.totalPrice) * 100) : 0;
          return (
            <div key={plot.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 hover:border-[var(--accent)]/50 hover:shadow-sm transition-all">
              <Link to={`/portfolio/${plot.id}`} className="block">
                <div className="grid md:grid-cols-3 gap-4">
                  {/* Info */}
                  <div className="md:col-span-2">
                    <div className="flex items-start gap-3 mb-2">
                      <div>
                        <div className="font-semibold text-[var(--foreground)]">{plot.estate}</div>
                        <div className="text-xs text-[var(--muted-foreground)]">{plot.plotLabel} · {plot.sqm} sqm · {plot.location}</div>
                      </div>
                      <span className="ml-auto shrink-0"><PlotStatusBadge status={plot.status} /></span>
                    </div>

                    <div className="flex flex-wrap gap-3 text-xs text-[var(--muted-foreground)] mb-3">
                      <span className="font-mono-data">Acquired {plot.acquiredDate}</span>
                      <span>·</span>
                      <span className="capitalize">{plot.plan}</span>
                      <span>·</span>
                      <span className="capitalize">{plot.intent}</span>
                    </div>

                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-[var(--muted-foreground)]" id={`equity-${plot.id}`}>Equity progress</span>
                      <span className="font-mono-data">{formatAmount(plot.paidAmount, plot.currency)} / {formatAmount(plot.totalPrice, plot.currency)}</span>
                    </div>
                    <div className="h-2 bg-[var(--muted)] rounded-full overflow-hidden" role="progressbar" aria-labelledby={`equity-${plot.id}`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full bg-[var(--primary)] rounded-full" style={{ width: `${pct}%` }} />
                    </div>
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
