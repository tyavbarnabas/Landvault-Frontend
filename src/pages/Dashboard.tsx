import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../contexts/AppContext";
import { formatAmount, type OwnedPlot, type Estate } from "../data/mockData";
import { fetchOwnedPlots } from "../services/portfolioService";
import { fetchEstates } from "../services/estatesService";
import PlotStatusBadge from "../components/portfolio/PlotStatusBadge";

export default function Dashboard() {
  const { user, currency } = useApp();
  const [ownedPlots, setOwnedPlots] = useState<OwnedPlot[]>([]);
  const [estates, setEstates] = useState<Estate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchOwnedPlots(), fetchEstates()]).then(([plots, ests]) => {
      if (cancelled) return;
      setOwnedPlots(plots);
      setEstates(ests);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="p-8 text-[var(--muted-foreground)] text-sm">Loading dashboard…</div>;

  const totalPortfolioValue = ownedPlots.reduce((s, p) => s + p.totalPrice, 0);
  const totalPaid = ownedPlots.reduce((s, p) => s + p.paidAmount, 0);
  const activePlots = ownedPlots.filter((p) => p.status === "installment_active" || p.status === "in_arrears").length;

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

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Portfolio value", value: formatAmount(totalPortfolioValue, currency), sub: "across all plots" },
          { label: "Total paid", value: formatAmount(totalPaid, currency), sub: `${Math.round((totalPaid / totalPortfolioValue) * 100)}% of total` },
          { label: "Plots owned", value: ownedPlots.length.toString(), sub: `${activePlots} with active plan` },
          { label: "Saved plots", value: "2", sub: "view wishlist" },
        ].map((s) => (
          <div key={s.label} className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
            <div className="text-xs text-[var(--muted-foreground)] mb-1">{s.label}</div>
            <div className="font-semibold text-xl font-mono-data text-[var(--foreground)]">{s.value}</div>
            <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Portfolio summary */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-[var(--foreground)]">My plots</h2>
            <Link to="/portfolio" className="text-xs text-[var(--accent)] font-medium hover:underline">View all</Link>
          </div>

          {ownedPlots.map((plot) => {
            const pct = Math.round((plot.paidAmount / plot.totalPrice) * 100);
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
                    <span className="font-mono-data font-medium">{formatAmount(plot.paidAmount, currency)} / {formatAmount(plot.totalPrice, currency)} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 bg-[var(--muted)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--primary)] rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                {plot.nextDueDate && (
                  <div className="text-xs text-[var(--muted-foreground)] mt-2">
                    Next: <span className="font-mono-data font-medium text-[var(--foreground)]">{formatAmount(plot.nextDueAmount!, currency)}</span> due {plot.nextDueDate}
                  </div>
                )}
              </Link>
            );
          })}

          {/* Upcoming payments */}
          <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
            <h3 className="font-semibold text-sm mb-4">Upcoming payments</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <div>
                  <div className="font-medium">Peaceland — Installment 7</div>
                  <div className="text-xs text-[var(--muted-foreground)] font-mono-data">Due 15 Sep 2026</div>
                </div>
                <div className="text-right">
                  <div className="font-mono-data font-semibold">{formatAmount(3_200_000, currency)}</div>
                  <Link to="/portfolio/op-001" className="text-xs text-[var(--accent)] hover:underline">Pay now</Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Discover */}
          <div className="bg-[var(--primary)] rounded-xl p-5 text-white">
            <h3 className="font-semibold mb-1">Browse estates</h3>
            <p className="text-white/70 text-xs leading-relaxed mb-4">3 estates open. 438 plots available.</p>
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
            <div className="space-y-2">
              {[
                { title: "Payment Receipt — Installment 6", date: "15 Aug 2026", icon: "🧾" },
                { title: "Allocation Letter — Peaceland", date: "16 Aug 2024", icon: "📄" },
                { title: "Deed of Assignment — Golden Acres", date: "3 Jul 2023", icon: "📜" },
              ].map((d) => (
                <div key={d.title} className="flex items-center gap-3 text-sm py-1.5">
                  <span className="text-base">{d.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-xs font-medium text-[var(--foreground)]">{d.title}</div>
                    <div className="text-xs text-[var(--muted-foreground)] font-mono-data">{d.date}</div>
                  </div>
                </div>
              ))}
            </div>
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
