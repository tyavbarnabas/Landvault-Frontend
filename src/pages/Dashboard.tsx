import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../contexts/AppContext";
import { formatAmount, type OwnedPlot, type Estate, type Document } from "../data/mockData";
import { fetchOwnedPlots } from "../services/portfolioService";
import { fetchEstates } from "../services/estatesService";
import { fetchDocuments } from "../services/documentsService";
import PlotStatusBadge from "../components/portfolio/PlotStatusBadge";
import { DOCUMENT_TYPE_ICONS } from "../components/documents/DocumentCard";
import { urgencyRank, groupPlotsByCurrency } from "./portfolio/Portfolio";

export default function Dashboard() {
  const { user, currency, wishlist } = useApp();
  const [ownedPlots, setOwnedPlots] = useState<OwnedPlot[]>([]);
  const [estates, setEstates] = useState<Estate[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchOwnedPlots(), fetchEstates(), fetchDocuments()]).then(([plots, ests, docs]) => {
      if (cancelled) return;
      setOwnedPlots(plots);
      setEstates(ests);
      setDocuments(docs);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="p-8 text-[var(--muted-foreground)] text-sm">Loading dashboard…</div>;

  const activePlots = ownedPlots.filter((p) => p.status === "installment_active" || p.status === "in_arrears").length;
  const byCurrency = groupPlotsByCurrency(ownedPlots);
  const totalAvailablePlots = estates.reduce((s, e) => s + e.availablePlots, 0);
  const upcomingPayments = ownedPlots
    .filter((p) => p.nextDueDate && p.nextDueAmount !== undefined)
    .sort((a, b) => urgencyRank(a) - urgencyRank(b))
    .slice(0, 3);
  const recentDocuments = [...documents].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 3);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-3xl text-[var(--foreground)]">
          Good {getGreeting()}, {user?.name.split(" ")[0]}.
        </h1>
        <p className="text-[var(--muted-foreground)] text-sm mt-1">
          {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* KYC Banner */}
      {user?.kycStatus === "approved" && (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
          <span className="text-sm text-emerald-800 font-medium">Identity verified — you can transact on all estates.</span>
        </div>
      )}

      {/* Stats — grouped per currency actually held, never summed across
          currencies (same rule/logic as Portfolio.tsx). Today's fixtures are
          all NGN, so this renders one group in practice. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {byCurrency.size === 0 && (
          <>
            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
              <div className="text-xs text-[var(--muted-foreground)] mb-1">Portfolio value</div>
              <div className="font-semibold text-xl font-mono-data text-[var(--foreground)]">{formatAmount(0, currency)}</div>
              <div className="text-xs text-[var(--muted-foreground)] mt-0.5">across all plots</div>
            </div>
            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
              <div className="text-xs text-[var(--muted-foreground)] mb-1">Total paid</div>
              <div className="font-semibold text-xl font-mono-data text-[var(--foreground)]">{formatAmount(0, currency)}</div>
              <div className="text-xs text-[var(--muted-foreground)] mt-0.5">—</div>
            </div>
          </>
        )}
        {Array.from(byCurrency.entries()).map(([cur, g]) => (
          <div key={cur} className="contents">
            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
              <div className="text-xs text-[var(--muted-foreground)] mb-1">Portfolio value{byCurrency.size > 1 ? ` (${cur})` : ""}</div>
              <div className="font-semibold text-xl font-mono-data text-[var(--foreground)]">{formatAmount(g.totalValue, cur)}</div>
              <div className="text-xs text-[var(--muted-foreground)] mt-0.5">across all plots</div>
            </div>
            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
              <div className="text-xs text-[var(--muted-foreground)] mb-1">Total paid{byCurrency.size > 1 ? ` (${cur})` : ""}</div>
              <div className="font-semibold text-xl font-mono-data text-[var(--foreground)]">{formatAmount(g.totalPaid, cur)}</div>
              <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{g.totalValue > 0 ? `${Math.round((g.totalPaid / g.totalValue) * 100)}% of total` : "—"}</div>
            </div>
          </div>
        ))}
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
          <div className="text-xs text-[var(--muted-foreground)] mb-1">Plots owned</div>
          <div className="font-semibold text-xl font-mono-data text-[var(--foreground)]">{ownedPlots.length}</div>
          <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{activePlots} with active plan</div>
        </div>
        <Link to="/wishlist" className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5 hover:border-[var(--accent)]/50 transition-colors">
          <div className="text-xs text-[var(--muted-foreground)] mb-1">Saved plots</div>
          <div className="font-semibold text-xl font-mono-data text-[var(--foreground)]">{wishlist.length}</div>
          <div className="text-xs text-[var(--accent)] mt-0.5">view wishlist</div>
        </Link>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Portfolio summary */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-[var(--foreground)]">My plots</h2>
            <Link to="/portfolio" className="text-xs text-[var(--accent)] font-medium hover:underline">View all</Link>
          </div>

          {ownedPlots.map((plot) => {
            const pct = plot.totalPrice > 0 ? Math.round((plot.paidAmount / plot.totalPrice) * 100) : 0;
            return (
              <Link
                key={plot.id}
                to={`/portfolio/${plot.id}`}
                className="block bg-[var(--card)] rounded-xl border border-[var(--border)] p-5 hover:border-[var(--accent)]/50 transition-colors"
              >
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <div className="font-medium text-sm text-[var(--foreground)]">{plot.estate}</div>
                    <div className="text-xs text-[var(--muted-foreground)]">{plot.plotLabel} · {plot.sqm} sqm · {plot.location}</div>
                  </div>
                  <PlotStatusBadge status={plot.status} />
                </div>
                <div className="mb-2">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-[var(--muted-foreground)]">Equity paid</span>
                    <span className="font-mono-data font-medium">{formatAmount(plot.paidAmount, plot.currency)} / {formatAmount(plot.totalPrice, plot.currency)} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 bg-[var(--muted)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--primary)] rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                {plot.nextDueDate && (
                  <div className="text-xs text-[var(--muted-foreground)] mt-2">
                    Next: <span className="font-mono-data font-medium text-[var(--foreground)]">{plot.nextDueAmount !== undefined ? formatAmount(plot.nextDueAmount, plot.currency) : "—"}</span> due {plot.nextDueDate}
                  </div>
                )}
              </Link>
            );
          })}

          {/* Upcoming payments — real plots with a real next due date,
              ordered by the same urgency rank Portfolio.tsx uses. */}
          <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
            <h3 className="font-semibold text-sm mb-4">Upcoming payments</h3>
            {upcomingPayments.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">No payments due right now.</p>
            ) : (
              <div className="space-y-3">
                {upcomingPayments.map((plot) => (
                  <div key={plot.id} className="flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium">{plot.estate} — {plot.plotLabel}</div>
                      <div className="text-xs text-[var(--muted-foreground)] font-mono-data">Due {plot.nextDueDate}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono-data font-semibold">{plot.nextDueAmount !== undefined ? formatAmount(plot.nextDueAmount, plot.currency) : "—"}</div>
                      <Link to={`/portfolio/${plot.id}`} className="text-xs text-[var(--accent)] hover:underline">Pay now</Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Discover */}
          <div className="bg-[var(--primary)] rounded-xl p-5 text-white">
            <h3 className="font-semibold mb-1">Browse estates</h3>
            <p className="text-white/70 text-xs leading-relaxed mb-4">{estates.length} estate{estates.length !== 1 ? "s" : ""} open. {totalAvailablePlots.toLocaleString()} plots available.</p>
            <Link to="/estates" className="inline-block text-xs font-medium bg-white/15 hover:bg-white/20 text-white px-4 py-2 rounded-md transition-colors">
              Explore plots →
            </Link>
          </div>

          {/* Recent documents */}
          <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Recent documents</h3>
              <Link to="/documents" className="text-xs text-[var(--accent)] hover:underline">Vault</Link>
            </div>
            {recentDocuments.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">No documents yet.</p>
            ) : (
              <div className="space-y-2">
                {recentDocuments.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 text-sm py-1.5">
                    <span className="text-base" aria-hidden="true">{DOCUMENT_TYPE_ICONS[d.type]}</span>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-xs font-medium text-[var(--foreground)]">{d.title}</div>
                      <div className="text-xs text-[var(--muted-foreground)] font-mono-data">{d.date}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Estates thumbnail */}
          <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
            <h3 className="font-semibold text-sm mb-3">Active estates</h3>
            <div className="space-y-3">
              {estates.map((e) => (
                <Link key={e.id} to={`/estates/${e.id}`} className="flex items-center gap-3 group">
                  <div className="w-10 h-10 rounded-lg overflow-hidden bg-[var(--muted)] shrink-0">
                    <img src={e.imageUrl} alt={e.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-[var(--foreground)] truncate group-hover:text-[var(--accent)] transition-colors">{e.name}</div>
                    <div className="text-xs text-[var(--muted-foreground)]">{e.availablePlots} plots from {formatAmount(e.priceFrom, currency)}</div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
