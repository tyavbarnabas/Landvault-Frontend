import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { formatAmount, type OwnedPlot } from "../../data/mockData";
import { fetchOwnedPlots } from "../../services/portfolioService";
import { useApp } from "../../contexts/AppContext";

export default function Portfolio() {
  const { currency } = useApp();
  const [ownedPlots, setOwnedPlots] = useState<OwnedPlot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchOwnedPlots().then((data) => { if (!cancelled) { setOwnedPlots(data); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="p-8 text-[var(--muted-foreground)] text-sm">Loading portfolio…</div>;

  const totalValue = ownedPlots.reduce((s, p) => s + p.totalPrice, 0);
  const totalPaid = ownedPlots.reduce((s, p) => s + p.paidAmount, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">My portfolio</h1>
        <p className="text-sm text-[var(--muted-foreground)]">All plots you own or hold under an active plan.</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total value", value: formatAmount(totalValue, currency) },
          { label: "Equity paid", value: formatAmount(totalPaid, currency) },
          { label: "Outstanding", value: formatAmount(totalValue - totalPaid, currency) },
          { label: "Plots", value: ownedPlots.length.toString() },
        ].map((s) => (
          <div key={s.label} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
            <div className="text-xs text-[var(--muted-foreground)] mb-1">{s.label}</div>
            <div className="font-semibold font-mono-data text-lg">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Plots list */}
      <div className="space-y-4">
        {ownedPlots.map((plot) => {
          const pct = Math.round((plot.paidAmount / plot.totalPrice) * 100);
          return (
            <Link
              key={plot.id}
              to={`/portfolio/${plot.id}`}
              className="block bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 hover:border-[var(--accent)]/50 hover:shadow-sm transition-all"
            >
              <div className="grid md:grid-cols-3 gap-4">
                {/* Info */}
                <div className="md:col-span-2">
                  <div className="flex items-start gap-3 mb-2">
                    <div>
                      <div className="font-semibold text-[var(--foreground)]">{plot.estate}</div>
                      <div className="text-xs text-[var(--muted-foreground)]">{plot.plotLabel} · {plot.sqm} sqm · {plot.location}</div>
                    </div>
                    <span className={`ml-auto text-xs font-medium px-2.5 py-1 rounded-full border ${plot.status === "completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
                      {plot.status === "completed" ? "Paid off" : "Active plan"}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-3 text-xs text-[var(--muted-foreground)] mb-3">
                    <span className="font-mono-data">Acquired {plot.acquiredDate}</span>
                    <span>·</span>
                    <span className="capitalize">{plot.plan}</span>
                    <span>·</span>
                    <span className="capitalize">{plot.intent}</span>
                  </div>

                  <div className="mb-1.5 flex items-center justify-between text-xs">
                    <span className="text-[var(--muted-foreground)]">Equity progress</span>
                    <span className="font-mono-data">{formatAmount(plot.paidAmount, currency)} / {formatAmount(plot.totalPrice, currency)}</span>
                  </div>
                  <div className="h-2 bg-[var(--muted)] rounded-full overflow-hidden">
                    <div className="h-full bg-[var(--primary)] rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 justify-center">
                  {plot.nextDueDate && (
                    <div className="bg-[var(--muted)] rounded-lg p-3">
                      <div className="text-xs text-[var(--muted-foreground)] mb-0.5">Next payment</div>
                      <div className="font-semibold font-mono-data text-sm">{formatAmount(plot.nextDueAmount!, currency)}</div>
                      <div className="text-xs font-mono-data text-[var(--muted-foreground)]">{plot.nextDueDate}</div>
                    </div>
                  )}
                  <div className="text-xs text-[var(--accent)] font-medium text-right">View details →</div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
