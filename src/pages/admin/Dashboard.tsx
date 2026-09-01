// Super Admin platform overview — the operator console's landing page.
// Answers "what needs me right now?" before "what exists?".
//
// Zones 1 (needs attention) and 6 (recent activity) are backed by this
// repo's real tenant/audit data. Zones 2–5 are backed by explicitly
// illustrative mock data (src/data/mockPlatformMetrics.ts) — there's no
// checkout/payment backend, marketplace, billing engine, or integrations
// hub in this repo yet, so every one of those zones carries a "Preview
// data" badge and gets replaced by a real fetch the moment its epic ships
// (see the TODOs in platformMetricsService.ts and the note at the bottom
// of this file for what's still fully absent).
import { useState, useEffect } from "react";
import { useApp } from "../../contexts/AppContext";
import {
  fetchAttentionItems, fetchRecentActivity,
  fetchPlatformHealthMetrics, fetchMarketplacePulseMetrics, fetchRevenueMetrics, fetchSystemHealthMetrics,
  type AttentionItem, type PlatformHealthMetrics, type MarketplacePulseMetrics, type RevenueMetrics, type SystemHealthMetrics, type MetricsPeriod,
} from "../../services/platformMetricsService";
import type { AuditLogEntry } from "../../services/tenantsService";
import { formatAmount } from "../../data/mockData";
import AttentionPanel from "../../components/dashboard/AttentionPanel";
import ActivityStream from "../../components/dashboard/ActivityStream";
import ZoneSection, { PreviewDataBadge } from "../../components/dashboard/ZoneSection";
import MetricCard from "../../components/dashboard/MetricCard";
import PeriodSelector from "../../components/dashboard/PeriodSelector";
import IntegrationStatusList from "../../components/dashboard/IntegrationStatusList";

function compactCurrency(amount: number): string {
  if (amount >= 1_000_000_000) return `₦${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `₦${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `₦${(amount / 1_000).toFixed(0)}K`;
  return formatAmount(amount, "NGN");
}

// Generic async-zone state so each of the 6 zones can load/fail
// independently — a slow or broken one never blanks the rest of the page.
function useZone<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetcher()
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error };
}

export default function AdminDashboard() {
  const { user } = useApp();
  const [period, setPeriod] = useState<MetricsPeriod>("7d");

  const attention = useZone<AttentionItem[]>(fetchAttentionItems);
  const activity = useZone<AuditLogEntry[]>(() => fetchRecentActivity(10));
  const health = useZone<PlatformHealthMetrics>(() => fetchPlatformHealthMetrics(period), [period]);
  const pulse = useZone<MarketplacePulseMetrics>(fetchMarketplacePulseMetrics);
  const revenue = useZone<RevenueMetrics>(fetchRevenueMetrics);
  const system = useZone<SystemHealthMetrics>(fetchSystemHealthMetrics);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-[var(--foreground)]">Platform overview</h1>
        <p className="text-[var(--muted-foreground)] text-sm mt-1">Signed in as {user?.name} · Super Admin</p>
      </div>

      <AttentionPanel items={attention.data ?? []} loading={attention.loading} error={attention.error} />

      <ZoneSection capability="activityLog" title="Recent activity">
        <ActivityStream entries={activity.data ?? []} loading={activity.loading} error={activity.error} />
      </ZoneSection>

      <ZoneSection capability="marketplace" title="Platform health" badge={<PreviewDataBadge />} action={<PeriodSelector value={period} onChange={setPeriod} />}>
        {health.loading && <div className="text-sm text-[var(--muted-foreground)]">Loading…</div>}
        {!health.loading && health.error && <div className="text-sm text-[var(--muted-foreground)]">Couldn't load platform health right now.</div>}
        {!health.loading && !health.error && health.data && (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <MetricCard label="GMV this period" value={compactCurrency(health.data.gmv.value)} trendPct={health.data.gmv.changePct} />
            <MetricCard label="Transactions" value={health.data.transactionsCompleted.value.toLocaleString()} trendPct={health.data.transactionsCompleted.changePct} />
            <MetricCard
              label="Tenants transacting"
              value={`${health.data.activeTenantsTransacting.transacting} / ${health.data.activeTenantsTransacting.totalActive}`}
              sub="of active tenants"
            />
            <MetricCard label="New buyer signups" value={health.data.newBuyerSignups.value.toLocaleString()} trendPct={health.data.newBuyerSignups.changePct} />
            <MetricCard label="KYC approval rate" value={`${health.data.kycApprovalRate}%`} />
            <MetricCard label="Live listings" value={health.data.liveListings.value.toLocaleString()} trendPct={health.data.liveListings.changePct} />
          </div>
        )}
      </ZoneSection>

      <ZoneSection capability="marketplace" title="Marketplace pulse" badge={<PreviewDataBadge />}>
        {pulse.loading && <div className="text-sm text-[var(--muted-foreground)]">Loading…</div>}
        {!pulse.loading && pulse.error && <div className="text-sm text-[var(--muted-foreground)]">Couldn't load marketplace pulse right now.</div>}
        {!pulse.loading && !pulse.error && pulse.data && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <MetricCard label="Published this week" value={pulse.data.listingsPublishedThisWeek.toString()} sub={`${pulse.data.listingsPublishedToday} today`} />
            <MetricCard label="View → enquiry" value={`${pulse.data.viewToEnquiryRate}%`} />
            <MetricCard label="Wishlist adds" value={pulse.data.wishlistAdds.toLocaleString()} />
            <MetricCard label="Avg. moderation time" value={`${pulse.data.avgTimeToModerateHours}h`} />
          </div>
        )}
        {!pulse.loading && !pulse.error && pulse.data && (
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
            <div className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-wider mb-2">Listings by state</div>
            <div className="space-y-1.5">
              {pulse.data.listingsByState.map((row) => {
                const max = pulse.data!.listingsByState[0].count;
                return (
                  <div key={row.state} className="flex items-center gap-2 text-xs">
                    <span className="w-40 shrink-0 text-[var(--foreground)] truncate">{row.state}</span>
                    <div className="flex-1 h-1.5 bg-[var(--muted)] rounded-full overflow-hidden">
                      <div className="h-full bg-[var(--primary)] rounded-full" style={{ width: `${(row.count / max) * 100}%` }} />
                    </div>
                    <span className="w-10 text-right font-mono-data text-[var(--muted-foreground)]">{row.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </ZoneSection>

      <ZoneSection capability="revenue" title="Platform revenue" badge={<PreviewDataBadge />}>
        {revenue.loading && <div className="text-sm text-[var(--muted-foreground)]">Loading…</div>}
        {!revenue.loading && revenue.error && <div className="text-sm text-[var(--muted-foreground)]">Couldn't load revenue right now.</div>}
        {!revenue.loading && !revenue.error && revenue.data && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard
              label="Fee revenue this period"
              value={compactCurrency(revenue.data.feeRevenueByType.reduce((s, f) => s + f.amount, 0))}
              sub={revenue.data.feeRevenueByType.map((f) => `${f.type.replace("_", " ")}: ${compactCurrency(f.amount)}`).join(" · ")}
            />
            <MetricCard label="MRR" value={compactCurrency(revenue.data.mrr)} />
            <MetricCard label="Outstanding invoices" value={compactCurrency(revenue.data.outstandingInvoices)} />
            <MetricCard label="Overdue invoices" value={compactCurrency(revenue.data.overdueInvoices)} sub={revenue.data.overdueInvoices > 0 ? "Needs follow-up" : undefined} />
          </div>
        )}
      </ZoneSection>

      <ZoneSection capability="integrations" title="System & trust health" badge={<PreviewDataBadge />}>
        {system.loading && <div className="text-sm text-[var(--muted-foreground)]">Loading…</div>}
        {!system.loading && system.error && <div className="text-sm text-[var(--muted-foreground)]">Couldn't load system health right now.</div>}
        {!system.loading && !system.error && system.data && (
          <div className="space-y-4">
            <IntegrationStatusList integrations={system.data.integrations} />
            <div className="grid grid-cols-3 gap-3">
              <MetricCard label="Webhook success rate" value={`${system.data.webhookSuccessRate}%`} />
              <MetricCard label="QR verification lookups" value={system.data.qrVerificationLookups.toLocaleString()} sub={system.data.qrVerificationAnomalies > 0 ? `${system.data.qrVerificationAnomalies} anomalies` : "No anomalies"} />
              <MetricCard
                label="Overlapping listings detected"
                value={system.data.duplicateListingConflicts.toString()}
                sub={system.data.duplicateListingConflicts > 0 ? "The core anti-fraud differentiator — review these" : "None detected"}
              />
            </div>
          </div>
        )}
      </ZoneSection>

      {/*
        Still fully absent, not stubbed — no capability flag covers these
        yet because nothing in this repo could honestly back them even as
        a mock: extra "needs attention" rows for disputes, agent
        verification, and failed payouts (each would link to a page that
        doesn't exist). Add the page first, then the row.
      */}
    </div>
  );
}
