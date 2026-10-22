// The buyer's holdings, from the Figma portfolio proposal: one summary card
// per currency, a short callout for any plot in arrears (the full notice is
// on the plot page), and plots grouped by estate as compact tables that
// become one card per plot on a phone.

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { formatAmount, type Currency, type OwnedPlot } from "../../data/mockData";
import { fetchOwnedPlots, fetchPortfolioSummary, sizeText, urgencyRank, type PortfolioSummary } from "../../services/portfolioService";
import { isAvailable } from "../../lib/backends";
import { formatDay } from "../../lib/formatDate";
import { plotTitleStatus, titleState } from "../../lib/titleState";
import PlotStatusBadge from "../../components/portfolio/PlotStatusBadge";
import Page, { Loading } from "../../components/ui/Page";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import Button, { LinkButton } from "../../components/ui/Button";
import TextLink from "../../components/ui/TextLink";
import EmptyState from "../../components/ui/EmptyState";
import { AlertIcon, BuildingIcon, ChevronRightIcon } from "../../components/icons";

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
  const actions = (
    <div className="flex flex-wrap gap-2">
      {/* Selling workspace lives here, not in the marketplace browse
          surface — see PART 6 of the marketplace-unification spec. */}
      {resale && <LinkButton to="/resale/my-listings" variant="secondary">My listings & offers</LinkButton>}
      <LinkButton to="/marketplace">Buy another plot</LinkButton>
    </div>
  );

  if (loading) return <Page title="My portfolio"><Loading /></Page>;

  if (loadError) {
    return (
      <Page title="My portfolio">
        <Card className="text-center">
          <p className="text-sm text-[var(--foreground)] font-medium mb-2">Couldn't load your portfolio.</p>
          <Button variant="link" onClick={load}>Try again</Button>
        </Card>
      </Page>
    );
  }

  if (ownedPlots.length === 0) {
    return (
      <Page title="My portfolio" actions={actions}>
        <Card padding="sm">
          <EmptyState title="You don't own any plots yet." description="Browse the marketplace to find your first plot."
            action={<LinkButton to="/marketplace">Browse the marketplace</LinkButton>} />
        </Card>
      </Page>
    );
  }

  const byCurrency = summary?.byCurrency ?? [];
  const awaiting = summary?.awaitingVerification ?? 0;
  // Already sorted server-side (fetchOwnedPlots' sort: "urgency"), so
  // grouping keeps that order: an estate sits where its most urgent plot does.
  const groups = groupByEstate(ownedPlots);
  const inArrears = ownedPlots.filter((p) => p.status === "in_arrears" && p.arrears);

  return (
    <Page title="My portfolio" description="Every plot you own or are paying for, grouped by estate." actions={actions}>
      <div className="space-y-6">
        {byCurrency.map((g) => <SummaryCard key={g.currency} {...g} labelled={byCurrency.length > 1} />)}
        {byCurrency.length > 1 && (
          <p className="text-xs text-[var(--muted-foreground)] -mt-3">Each card shows that currency's own total — figures are never converted or combined across currencies.</p>
        )}
        {awaiting > 0 && (
          <p className="text-sm text-[var(--muted-foreground)] -mt-2" role="status">
            {awaiting} purchase{awaiting === 1 ? "" : "s"} awaiting verification. {awaiting === 1 ? "It joins" : "They join"} these totals once finance confirms the payment.
          </p>
        )}

        {inArrears.map((plot) => (
          <div key={plot.id} role="alert" className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-[var(--error-border)] bg-[var(--error-surface)] text-[var(--error-text)] px-4 py-3.5">
            <div className="flex gap-3 flex-1 min-w-0">
              <span className="w-9 h-9 shrink-0 rounded-lg bg-[var(--card)] flex items-center justify-center"><AlertIcon size={18} /></span>
              <div>
                <div className="text-sm font-semibold">{plot.plotLabel} at {plot.estate} is in arrears</div>
                <p className="text-sm">
                  {formatAmount(plot.arrears!.amountOwed, plot.currency)} has been overdue since {formatDay(plot.arrears!.overdueSinceDate)}.
                  {plot.arrears!.penaltyAmount ? ` A ${formatAmount(plot.arrears!.penaltyAmount, plot.currency)} penalty has been applied.` : ""}
                </p>
              </div>
            </div>
            <LinkButton to={`/portfolio/${plot.id}`} variant="secondary" className="shrink-0 bg-[var(--card)] max-sm:w-full">View options</LinkButton>
          </div>
        ))}

        <div className="flex items-center justify-between text-sm text-[var(--muted-foreground)]">
          <span className="font-medium">{groups.length} estate{groups.length === 1 ? "" : "s"} · {ownedPlots.length}{hasMore ? "+" : ""} plot{ownedPlots.length === 1 ? "" : "s"}</span>
          <span>Most urgent first</span>
        </div>

        {groups.map((g) => <EstateGroup key={g.estateId} plots={g.plots} />)}

        {hasMore && (
          <Button variant="secondary" size="lg" fullWidth onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        )}
      </div>
    </Page>
  );
}

function groupByEstate(plots: OwnedPlot[]): { estateId: string; plots: OwnedPlot[] }[] {
  const groups = new Map<string, OwnedPlot[]>();
  for (const p of plots) groups.set(p.estateId, [...(groups.get(p.estateId) ?? []), p]);
  return [...groups].map(([estateId, list]) => ({ estateId, plots: list }));
}

function pctPaid(paid: number, total: number): number {
  return total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;
}

function PaidBar({ pct, label }: { pct: number; label: string }) {
  return (
    <div className="h-1.5 rounded-full bg-[var(--muted)] overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={`h-full rounded-full ${pct >= 100 ? "bg-[var(--success)]" : "bg-[var(--primary)]"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

// The server's totals for one currency held.
function SummaryCard({ currency, totalValue, totalPaid, count, labelled }: { currency: Currency; totalValue: number; totalPaid: number; count: number; labelled: boolean }) {
  const pct = pctPaid(totalPaid, totalValue);
  const figures: [string, string, boolean][] = [
    ["Total value", formatAmount(totalValue, currency), true],
    ["Paid", formatAmount(totalPaid, currency), true],
    ["Outstanding", formatAmount(totalValue - totalPaid, currency), true],
    ["Plots", String(count), false],
  ];
  return (
    <Card as="section" aria-label={`${currency} plots`} className="sm:px-6">
      {labelled && <div className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-3">{currency} plots</div>}
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-y-4">
        {figures.map(([label, value, money], i) => (
          <div key={label} className={`min-w-0 ${i % 2 === 1 ? "pl-4 border-l border-[var(--border)]" : ""} ${i === 2 ? "sm:pl-4 sm:border-l sm:border-[var(--border)]" : ""} ${i > 0 ? "sm:pl-6" : ""}`}>
            <dt className="text-sm text-[var(--muted-foreground)]">{label}</dt>
            <dd className={money ? "font-mono-data font-medium text-lg sm:text-xl text-[var(--foreground)] truncate" : "font-display text-3xl text-[var(--foreground)]"}>{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-center gap-3 mt-4">
        <div className="flex-1"><PaidBar pct={pct} label={`Paid in ${currency}`} /></div>
        <span className="text-sm text-[var(--muted-foreground)] shrink-0">{pct >= 100 ? "Fully paid" : `${pct}% paid`}</span>
      </div>
    </Card>
  );
}

const ROW_GRID = "lg:grid lg:grid-cols-[1.35fr_0.6fr_1.2fr_2.1fr_0.95fr_1.2fr_16px] lg:items-center lg:gap-4";

function EstateGroup({ plots }: { plots: OwnedPlot[] }) {
  const first = plots[0];
  const title = titleState(first.titleType, plotTitleStatus(first));
  return (
    <Card as="section" padding="none" className="overflow-hidden" aria-label={first.estate}>
      <div className="flex items-center gap-3.5 px-4 sm:px-5 py-4">
        <span className="w-10 h-10 shrink-0 rounded-lg bg-[var(--secondary)] text-[var(--secondary-foreground)] flex items-center justify-center"><BuildingIcon size={20} /></span>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="font-semibold text-[var(--foreground)]">{first.estate}</h2>
            {title && <Badge label={title.badge} variant={title.tone} />}
          </div>
          <p className="text-sm text-[var(--muted-foreground)] truncate">{[first.location, `${plots.length} plot${plots.length === 1 ? "" : "s"}`].filter(Boolean).join(" · ")}</p>
        </div>
        <TextLink to={`/marketplace/${first.estateId}`} className="text-sm font-medium shrink-0 max-sm:hidden">View estate →</TextLink>
      </div>
      <div aria-hidden="true" className={`hidden ${ROW_GRID} bg-[var(--muted)] px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]`}>
        <span>Plot</span><span>Size</span><span>Plan</span><span>Paid</span><span>Status</span><span>Next payment</span><span />
      </div>
      <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)] lg:border-t-0">
        {plots.map((plot) => <PlotRow key={plot.id} plot={plot} />)}
      </ul>
    </Card>
  );
}

function planText(plot: OwnedPlot): string {
  const intent = plot.intent === "investment" ? "Investment" : "Development";
  if (plot.plan === "outright") return `Outright · ${intent}`;
  return `Instalment plan · ${intent}`;
}

// What's due next, worded and coloured by how pressing it is.
function NextPayment({ plot }: { plot: OwnedPlot }) {
  if (plot.status === "in_arrears" && plot.arrears) {
    return <div className="text-sm text-[var(--error-text)]"><div className="font-medium">{formatAmount(plot.arrears.amountOwed, plot.currency)} overdue</div><div className="text-xs">since {formatDay(plot.arrears.overdueSinceDate)}</div></div>;
  }
  if (plot.status === "pending_verification") return <span className="text-sm text-[var(--muted-foreground)]">Awaiting verification</span>;
  if (plot.nextDueDate && plot.nextDueAmount !== undefined) {
    const days = Math.round((new Date(plot.nextDueDate).getTime() - Date.now()) / 86_400_000);
    const tone = days < 0 ? "text-[var(--warning-text)]" : days <= 7 ? "text-[var(--warning-text)]" : "text-[var(--foreground)]";
    return (
      <div className={`text-sm ${tone}`}>
        <div className="font-mono-data">{formatAmount(plot.nextDueAmount, plot.currency)}</div>
        <div className={`text-xs ${days >= 0 && days > 7 ? "text-[var(--muted-foreground)]" : ""}`}>{days < 0 ? "was due" : "due"} {formatDay(plot.nextDueDate)}</div>
      </div>
    );
  }
  if (plot.status === "completed") return <span className="text-sm text-[var(--muted-foreground)]">Paid in full</span>;
  return <span className="text-sm text-[var(--muted-foreground)]">—</span>;
}

function PlotRow({ plot }: { plot: OwnedPlot }) {
  const pct = pctPaid(plot.paidAmount, plot.totalPrice);
  const pending = plot.status === "pending_verification";
  const size = sizeText(plot);
  return (
    <li>
      <Link to={`/portfolio/${plot.id}`} className={`group block px-4 sm:px-5 py-3.5 hover:bg-[var(--muted)]/50 transition-colors ${ROW_GRID}`}>
        {/* Plot (with the status beside it on a phone) */}
        <div className="flex items-start justify-between gap-3 min-w-0">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[var(--foreground)] group-hover:underline">{plot.plotLabel}</div>
            <div className="text-xs text-[var(--muted-foreground)]">
              <span className="lg:hidden">{[size, planText(plot)].filter(Boolean).join(" · ")} · </span>
              {plot.acquiredDate ? `Acquired ${formatDay(plot.acquiredDate)}` : "Not acquired until finance verifies"}
            </div>
          </div>
          <span className="lg:hidden shrink-0"><PlotStatusBadge status={plot.status} /></span>
        </div>
        <div className="hidden lg:block text-sm font-mono-data text-[var(--foreground)]">{size ?? "—"}</div>
        <div className="hidden lg:block text-sm text-[var(--foreground)]">{planText(plot)}</div>
        <div className="mt-2.5 lg:mt-0 min-w-0">
          {pending ? (
            // Equity is 0 until finance verifies: a bar at 0% would read as "nothing paid".
            plot.plan === "installment"
              ? <p className="text-xs text-[var(--muted-foreground)]">Deposit received; your equity shows once finance verifies it.</p>
              : <p className="text-xs text-[var(--muted-foreground)]">Payment of <span className="font-mono-data">{formatAmount(plot.totalPrice, plot.currency)}</span> received; your equity shows once finance confirms it.</p>
          ) : (
            <>
              <div className="mb-1.5 text-sm text-[var(--foreground)]">
                <span className="font-mono-data">{formatAmount(plot.paidAmount, plot.currency)}</span>
                <span className="text-xs text-[var(--muted-foreground)]"> of <span className="font-mono-data">{formatAmount(plot.totalPrice, plot.currency)}</span></span>
              </div>
              <PaidBar pct={pct} label={`${plot.plotLabel}: paid`} />
              {/* The backend's count of verified instalments. */}
              {plot.plan === "installment" && plot.installmentMonths !== undefined && plot.installmentsPaid !== undefined && (
                <div className="text-xs text-[var(--muted-foreground)] mt-1">{plot.installmentsPaid} of {plot.installmentMonths} instalments paid</div>
              )}
            </>
          )}
        </div>
        <div className="hidden lg:block"><PlotStatusBadge status={plot.status} /></div>
        <div className="mt-2 lg:mt-0"><NextPayment plot={plot} /></div>
        <ChevronRightIcon size={16} className="hidden lg:block text-[var(--muted-foreground)]" />
      </Link>
    </li>
  );
}
