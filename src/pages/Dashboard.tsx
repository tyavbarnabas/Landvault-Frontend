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
import { BACKEND_CONFIGURED, isLive, type ServiceKey } from "../lib/backends";
import PurchaseList from "../components/purchases/PurchaseList";
import { fetchOwnedPlots, fetchPortfolioSummary, installmentsAvailable } from "../services/portfolioService";
import { fetchDocuments } from "../services/documentsService";
import { fetchAttentionItems } from "../services/attentionService";
import { DocTypeChip } from "../components/documents/DocumentCard";
import { formatDay } from "../lib/formatDate";
import AttentionStrip from "../components/dashboard/AttentionStrip";
import { urgencyRank, isActivelyOwned } from "./portfolio/Portfolio";

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

// Upcoming payments only need the most urgent few (sorted by the server).
const UPCOMING_SCAN_LIMIT = 20;

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

  // With a backend, a section shows only if ITS backend exists. Demo items
  // beside real purchases ("₦3.2M overdue", receipts for plots never bought)
  // would read as the buyer's own. Demo mode shows everything, as before.
  const show = (key: ServiceKey) => !BACKEND_CONFIGURED || isLive(key);
  const showAttention = show("attention");
  const showDocuments = show("documents");
  const showPortfolio = show("portfolio");
  // Installment plans have no backend yet: live, every plot is outright and
  // nothing is ever due.
  const showUpcoming = showPortfolio && installmentsAvailable();

  const attention = useFetch(
    () => (showAttention ? fetchAttentionItems({ wishlist, documentsSince: lastVisitAt }) : Promise.resolve([])),
    [wishlist, lastVisitAt, showAttention]);

  const overview = useFetch(async () => {
    const [summary, plotsPage, documentsPage] = await Promise.all([
      showPortfolio ? fetchPortfolioSummary() : Promise.resolve(null),
      showUpcoming ? fetchOwnedPlots({ sort: "urgency", limit: UPCOMING_SCAN_LIMIT }) : Promise.resolve({ items: [] }),
      showDocuments ? fetchDocuments({ limit: 3 }) : Promise.resolve({ items: [] }), // already newest-first
    ]);
    return { summary, plots: plotsPage.items, documents: documentsPage.items };
  });

  const plots = overview.data?.plots ?? [];
  const documents = overview.data?.documents ?? [];
  const byCurrency = overview.data?.summary?.byCurrency ?? [];
  const awaiting = overview.data?.summary?.awaitingVerification ?? 0;
  const upcomingPayments = plots
    .filter(isActivelyOwned)
    .filter((p) => p.nextDueDate && p.nextDueAmount !== undefined)
    .sort((a, b) => urgencyRank(a) - urgencyRank(b))
    .slice(0, 3);

  const live = isLive("checkout");
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

      {showAttention && <AttentionStrip items={attention.data ?? []} loading={attention.loading} error={attention.error} />}

      {/* One thin line, not a stat grid — the numbers themselves belong to
          the portfolio, which owns the record. The server's totals, grouped
          per currency actually held; never summed across currencies. */}
      {showPortfolio && (
        <div className="mb-8 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-y border-[var(--border)] py-3">
          {overview.loading ? (
            <span className="text-sm text-[var(--muted-foreground)]">Loading your portfolio…</span>
          ) : byCurrency.length === 0 && awaiting === 0 ? (
            <>
              <span className="text-sm text-[var(--muted-foreground)]">You don't own any plots yet.</span>
              <Link to="/marketplace" className="text-xs font-semibold text-[var(--accent)] hover:underline">Browse the marketplace →</Link>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {byCurrency.map((g) => (
                  <span key={g.currency} className="text-sm text-[var(--foreground)]">
                    {g.count} plot{g.count === 1 ? "" : "s"} · <span className="font-mono-data">{formatAmount(g.totalPaid, g.currency)}</span> paid of <span className="font-mono-data">{formatAmount(g.totalValue, g.currency)}</span>
                  </span>
                ))}
                {awaiting > 0 && (
                  <span className="text-sm text-[var(--muted-foreground)]">{awaiting} purchase{awaiting === 1 ? "" : "s"} awaiting verification</span>
                )}
              </div>
              <Link to="/portfolio" className="text-xs font-semibold text-[var(--accent)] hover:underline">View your portfolio →</Link>
            </>
          )}
        </div>
      )}

      {live && (
        // With a backend: the buyer's purchases too, including unpaid holds
        // the portfolio leaves out.
        <section className="mb-8" aria-labelledby="purchases-heading">
          <div className="flex items-center justify-between mb-3">
            <h2 id="purchases-heading" className="font-semibold text-sm">Your purchases</h2>
            <Link to="/purchases" className="text-xs text-[var(--accent)] hover:underline">All purchases</Link>
          </div>
          <PurchaseList pageSize={5} showMore="link" density="compact" />
        </section>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Upcoming payments — real plots with a real next due date, ordered
            by the same urgency rank Portfolio.tsx uses. Hidden live:
            installment plans have no backend yet. */}
        {showUpcoming && (
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
        )}

        {/* Recent documents — only when the vault has a backend (or in demo mode).
            Alone (live: no upcoming payments), it takes the full width, like
            Your purchases above. */}
        {showDocuments && (
        <div className={`bg-[var(--card)] rounded-xl border border-[var(--border)] p-5${showUpcoming ? "" : " lg:col-span-2"}`}>
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
                  <DocTypeChip type={d.type} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-xs font-medium text-[var(--foreground)]">{d.title}</div>
                    <div className="text-xs text-[var(--muted-foreground)]">{formatDay(d.date)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        )}
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
