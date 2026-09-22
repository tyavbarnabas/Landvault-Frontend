// ─── Dashboard vs. Portfolio: where does a new widget go? ────────────────────
//
// Ask whether the item has a verb attached.
//
//   "Installment 7 due in 5 days — Pay now"                -> dashboard
//   "Peaceland, Block C Plot 4, 250 sqm, ₦4.2M, 58% paid"  -> portfolio
//
// The second has no action. It is a fact about what the buyer owns.
//
//   Dashboard answers "what should I do?"  — time-sensitive, action-oriented.
//                                            Every item needs a decision,
//                                            needs money, or is new since the
//                                            last visit.
//   Portfolio answers "what do I have?"    — the complete record. Stable, not
//                                            urgent. Opened to look something
//                                            up, not because something
//                                            happened.
//
// When it isn't obvious, ask whether the thing changes with TIME or with WHAT
// YOU OWN. Due dates, newly issued documents, approval statuses and price
// drops change with time. Plot details, payment history, equity totals and
// deeds change only when you buy or pay.
//
// Corollary: an empty dashboard is the system working. Do not fill it with
// statistics to look busy — the emptiness is the signal.

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../contexts/AppContext";
import { formatAmount } from "../data/mockData";
import { useFetch } from "../lib/useFetch";
import { fetchOwnedPlots } from "../services/portfolioService";
import { fetchDocuments } from "../services/documentsService";
import { fetchAttentionItems } from "../services/attentionService";
import { DOCUMENT_TYPE_ICONS } from "../components/documents/DocumentCard";
import AttentionStrip from "../components/dashboard/AttentionStrip";
import { urgencyRank, groupPlotsByCurrency, isActivelyOwned } from "./portfolio/Portfolio";

// Per-viewer convenience only (never read back by anything but this screen),
// so localStorage is the right home for it and every access is guarded — a
// private window or blocked site data must not break the dashboard.
const LAST_VISIT_KEY = "landvault.dashboard.lastVisitAt";

function readLastVisit(): string | undefined {
  try {
    return localStorage.getItem(LAST_VISIT_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

// See Portfolio.tsx's PORTFOLIO_PAGE_SIZE note: the summary line needs a true
// total across every plot, which a real backend should compute server-side.
const PORTFOLIO_SCAN_LIMIT = 500;

export default function Dashboard() {
  const { user, wishlist } = useApp();

  // Captured once per mount, before the stamp is advanced, so refreshing
  // while sitting on the dashboard doesn't make "new since your last visit"
  // items disappear mid-read. The stamp moves on the way out instead.
  const [lastVisitAt] = useState(readLastVisit);
  useEffect(() => {
    return () => {
      try {
        localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString());
      } catch {
        // No baseline next time; the strip simply treats nothing as new.
      }
    };
  }, []);

  const attention = useFetch(() => fetchAttentionItems({ wishlist, documentsSince: lastVisitAt }), [wishlist, lastVisitAt]);

  const overview = useFetch(async () => {
    const [plotsPage, documentsPage] = await Promise.all([
      fetchOwnedPlots({ limit: PORTFOLIO_SCAN_LIMIT }),
      fetchDocuments({ limit: 3 }), // already newest-first
    ]);
    return { plots: plotsPage.items, documents: documentsPage.items };
  });

  const plots = overview.data?.plots ?? [];
  const documents = overview.data?.documents ?? [];
  const byCurrency = groupPlotsByCurrency(plots);
  const upcomingPayments = plots
    .filter(isActivelyOwned)
    .filter((p) => p.nextDueDate && p.nextDueAmount !== undefined)
    .sort((a, b) => urgencyRank(a) - urgencyRank(b))
    .slice(0, 3);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-[var(--foreground)]">
          Good {getGreeting()}, {user?.name.split(" ")[0]}.
        </h1>
        <p className="text-[var(--muted-foreground)] text-sm mt-1">
          {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      <AttentionStrip items={attention.data ?? []} loading={attention.loading} error={attention.error} />

      {/* One thin line, not a stat grid — the numbers themselves belong to
          the portfolio, which owns the record. Grouped per currency actually
          held; never summed across currencies. */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-y border-[var(--border)] py-3">
        {overview.loading ? (
          <span className="text-sm text-[var(--muted-foreground)]">Loading your portfolio…</span>
        ) : byCurrency.size === 0 ? (
          <>
            <span className="text-sm text-[var(--muted-foreground)]">You don't own any plots yet.</span>
            <Link to="/marketplace" className="text-xs font-semibold text-[var(--accent)] hover:underline">Browse the marketplace →</Link>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              {Array.from(byCurrency.entries()).map(([cur, g]) => (
                <span key={cur} className="text-sm text-[var(--foreground)]">
                  {g.count} plot{g.count === 1 ? "" : "s"} · <span className="font-mono-data">{formatAmount(g.totalPaid, cur)}</span> paid of <span className="font-mono-data">{formatAmount(g.totalValue, cur)}</span>
                </span>
              ))}
            </div>
            <Link to="/portfolio" className="text-xs font-semibold text-[var(--accent)] hover:underline">View your portfolio →</Link>
          </>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Upcoming payments — real plots with a real next due date, ordered
            by the same urgency rank Portfolio.tsx uses. */}
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
          <h3 className="font-semibold text-sm mb-4">Upcoming payments</h3>
          {overview.loading ? (
            <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>
          ) : upcomingPayments.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">No payments due right now.</p>
          ) : (
            <div className="space-y-3">
              {upcomingPayments.map((plot) => (
                <div key={plot.id} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{plot.estate} — {plot.plotLabel}</div>
                    <div className="text-xs text-[var(--muted-foreground)] font-mono-data">Due {plot.nextDueDate}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-mono-data font-semibold">{plot.nextDueAmount !== undefined ? formatAmount(plot.nextDueAmount, plot.currency) : "—"}</div>
                    <Link to={`/portfolio/${plot.id}`} className="text-xs text-[var(--accent)] hover:underline">Pay now</Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent documents */}
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Recent documents</h3>
            <Link to="/documents" className="text-xs text-[var(--accent)] hover:underline">Vault</Link>
          </div>
          {overview.loading ? (
            <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>
          ) : documents.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">No documents yet.</p>
          ) : (
            <div className="space-y-2">
              {documents.map((d) => (
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
