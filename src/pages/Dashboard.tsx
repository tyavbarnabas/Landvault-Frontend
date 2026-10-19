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
import { useApp } from "../contexts/AppContext";
import { formatAmount } from "../data/mockData";
import { useFetch } from "../lib/useFetch";
import { BACKEND_CONFIGURED, isLive, type ServiceKey } from "../lib/backends";
import { fetchPortfolioSummary, type PortfolioSummary } from "../services/portfolioService";
import { fetchDocuments } from "../services/documentsService";
import type { Document } from "../data/mockData";
import { fetchAttentionItems, fetchPurchaseAttention } from "../services/attentionService";
import { DOCUMENT_TYPE_LABELS, DocTypeChip, DocumentActions, plotLine } from "../components/documents/DocumentCard";
import { formatDay } from "../lib/formatDate";
import AttentionStrip from "../components/dashboard/AttentionStrip";
import Card from "../components/ui/Card";
import { LinkButton } from "../components/ui/Button";
import TextLink from "../components/ui/TextLink";
import { Loading } from "../components/ui/Page";
import { BriefcaseIcon, CalendarIcon, ChevronRightIcon, MessageIcon, ShieldCheckIcon } from "../components/icons";
import { Link } from "react-router-dom";

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
  // Until /api/me/attention exists, purchases still under way are the live
  // attention list (and join the demo one). Once it exists it covers them.
  const purchaseItems = show("checkout") && !isLive("attention");

  const attention = useFetch(async () => {
    const [general, purchases] = await Promise.all([
      showAttention ? fetchAttentionItems({ wishlist, documentsSince: lastVisitAt }) : Promise.resolve([]),
      purchaseItems ? fetchPurchaseAttention() : Promise.resolve([]),
    ]);
    // Paying for a held plot can't wait; everything else keeps its order.
    return [...purchases.filter((i) => i.severity === "urgent"), ...general, ...purchases.filter((i) => i.severity !== "urgent")];
  }, [wishlist, lastVisitAt, showAttention, purchaseItems]);

  const overview = useFetch(async () => {
    const [summary, documentsPage] = await Promise.all([
      showPortfolio ? fetchPortfolioSummary() : Promise.resolve(null),
      showDocuments ? fetchDocuments({ limit: 3 }) : Promise.resolve({ items: [] as Document[] }), // already newest-first
    ]);
    return { summary, documents: documentsPage.items };
  });

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-[var(--foreground)]">
            Good {getGreeting()}, {user?.name.split(" ")[0]}.
          </h1>
          <p className="text-[var(--muted-foreground)] text-sm mt-1">
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <LinkButton to="/marketplace" className="max-sm:hidden">Browse the marketplace</LinkButton>
      </div>

      {(showAttention || purchaseItems) && (
        <AttentionStrip items={attention.data ?? []} loading={attention.loading} error={!!attention.error} />
      )}

      <div className={`grid gap-6 items-start ${showDocuments ? "lg:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
        {showDocuments && (
          <div className="min-w-0 max-lg:order-2">
            <RecentDocuments documents={overview.data?.documents ?? []} loading={overview.loading} />
          </div>
        )}
        <div className="space-y-6">
          {showPortfolio && <PortfolioCard summary={overview.data?.summary ?? null} loading={overview.loading} />}
          <QuickActions />
        </div>
      </div>
    </div>
  );
}

// The record in one card: how many plots, and what's paid of what they're
// worth. The server's totals, per currency actually held; never summed
// across currencies. The portfolio page has the rest.
function PortfolioCard({ summary, loading }: { summary: PortfolioSummary | null; loading: boolean }) {
  const groups = summary?.byCurrency ?? [];
  const awaiting = summary?.awaitingVerification ?? 0;
  const owned = groups.reduce((n, g) => n + g.count, 0);
  return (
    <Card as="section" aria-labelledby="portfolio-heading">
      <div className="flex items-center justify-between mb-3">
        <h2 id="portfolio-heading" className="font-semibold text-[var(--foreground)]">Your portfolio</h2>
        <BriefcaseIcon size={18} className="text-[var(--muted-foreground)]" />
      </div>
      {loading ? <Loading /> : owned === 0 && awaiting === 0 ? (
        <>
          <p className="text-sm text-[var(--muted-foreground)] mb-3">You don't own any plots yet.</p>
          <TextLink to="/marketplace" className="text-sm font-medium">Browse the marketplace →</TextLink>
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-2 mb-3">
            <span className="font-display text-4xl text-[var(--foreground)]">{owned}</span>
            <span className="text-sm text-[var(--muted-foreground)]">plot{owned === 1 ? "" : "s"} owned</span>
          </div>
          <div className="space-y-4">
            {groups.map((g) => {
              const pct = g.totalValue > 0 ? Math.min(100, Math.round((g.totalPaid / g.totalValue) * 100)) : 0;
              return (
                <div key={g.currency}>
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between gap-3"><dt className="text-[var(--muted-foreground)]">Paid</dt><dd className="font-mono-data text-[var(--foreground)]">{formatAmount(g.totalPaid, g.currency)}</dd></div>
                    <div className="flex justify-between gap-3"><dt className="text-[var(--muted-foreground)]">Total value</dt><dd className="font-mono-data text-[var(--foreground)]">{formatAmount(g.totalValue, g.currency)}</dd></div>
                  </dl>
                  <div className="h-2 rounded-full bg-[var(--muted)] overflow-hidden mt-3" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Paid in ${g.currency}`}>
                    <div className="h-full bg-[var(--primary)]" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-[var(--muted-foreground)] mt-2">{pct === 100 ? "Fully paid" : `${pct}% paid`}{groups.length > 1 ? ` · ${g.currency}` : ""}</p>
                </div>
              );
            })}
          </div>
          {awaiting > 0 && <p className="text-sm text-[var(--muted-foreground)] mt-3">{awaiting} purchase{awaiting === 1 ? "" : "s"} awaiting verification</p>}
          <TextLink to="/portfolio" className="inline-block text-sm font-medium mt-3">View portfolio →</TextLink>
        </>
      )}
    </Card>
  );
}

function RecentDocuments({ documents, loading }: { documents: Document[]; loading: boolean }) {
  return (
    <Card as="section" aria-labelledby="documents-heading">
      <div className="flex items-center justify-between mb-1">
        <h2 id="documents-heading" className="font-semibold text-[var(--foreground)]">Recent documents</h2>
        <TextLink to="/documents" className="text-sm font-medium">Open vault →</TextLink>
      </div>
      {loading ? <div className="mt-3"><Loading /></div> : documents.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)] mt-3">No documents yet. Your receipts and letters appear here once a purchase is verified.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {documents.map((d) => {
            const plot = plotLine(d);
            return (
              <li key={d.id} className="flex items-center gap-3 py-3 last:pb-0">
                <DocTypeChip type={d.type} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-[var(--foreground)] truncate">{d.number ? `${DOCUMENT_TYPE_LABELS[d.type]} ${d.number}` : d.title}</div>
                  <div className="text-xs text-[var(--muted-foreground)] truncate">{[d.number ? plot : DOCUMENT_TYPE_LABELS[d.type], formatDay(d.date)].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="shrink-0 max-sm:hidden"><DocumentActions doc={d} /></div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// Things to do that the side navigation doesn't already offer as a page.
const QUICK_ACTIONS: [React.ReactNode, string, string, string][] = [
  [<CalendarIcon key="c" size={18} />, "Book a site inspection", "See the land before you buy", "/inspections/new"],
  [<ShieldCheckIcon key="s" size={18} />, "Verify a document", "Check a HomeTrue receipt or letter is genuine", "/verify"],
  [<MessageIcon key="m" size={18} />, "Get help", "Message HomeTrue support", "/support"],
];

function QuickActions() {
  return (
    <Card as="section" aria-labelledby="actions-heading">
      <h2 id="actions-heading" className="font-semibold text-[var(--foreground)] mb-1">Quick actions</h2>
      <ul className="divide-y divide-[var(--border)] max-lg:grid max-lg:grid-cols-3 max-lg:gap-2 max-lg:divide-y-0 max-lg:mt-3">
        {QUICK_ACTIONS.map(([icon, title, hint, to]) => (
          <li key={to}>
            <Link to={to} className="group flex items-center gap-3 py-3 last:pb-0 max-lg:flex-col max-lg:text-center max-lg:gap-1.5 max-lg:p-3 max-lg:rounded-lg max-lg:border max-lg:border-[var(--border)] max-lg:h-full">
              <span className="w-9 h-9 shrink-0 rounded-lg bg-[var(--secondary)] text-[var(--secondary-foreground)] flex items-center justify-center">{icon}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-[var(--foreground)] group-hover:underline">{title}</span>
                <span className="block text-xs text-[var(--muted-foreground)] max-lg:hidden">{hint}</span>
              </span>
              <ChevronRightIcon size={16} className="text-[var(--muted-foreground)] max-lg:hidden" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
