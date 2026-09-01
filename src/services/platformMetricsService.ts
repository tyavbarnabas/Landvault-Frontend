// Backend integration seam for the Super Admin platform overview dashboard.
// See INTEGRATION.md and src/lib/capabilities.ts.
//
// fetchAttentionItems() and fetchRecentActivity() are backed by real data
// (tenantsService.ts). fetchPlatformHealthMetrics/MarketplacePulseMetrics/
// RevenueMetrics/SystemHealthMetrics are backed by explicitly-illustrative
// mock data (src/data/mockPlatformMetrics.ts) at the user's request, so the
// dashboard's remaining zones have something real to look at before the
// actual backend exists — every zone that calls these renders a "Preview
// data" badge so the numbers are never mistaken for real ones.

import { fetchTenants, fetchAuditLog, type AuditLogEntry } from "./tenantsService";
import { CAPABILITIES } from "../lib/capabilities";
import { apiClient } from "../lib/apiClient";
import { buildPlatformHealthMetrics, MOCK_MARKETPLACE_PULSE, MOCK_REVENUE, MOCK_SYSTEM_HEALTH, type MetricsPeriod } from "../data/mockPlatformMetrics";

export type { MetricsPeriod };

export type AttentionSeverity = "amber" | "red";

export interface AttentionItem {
  id: string;
  label: string;
  count: number;
  severity: AttentionSeverity;
  href: string;
}

// Zone 1 — "needs attention". Today this can only ever surface one row
// (tenant verification); the other eight rows from the spec (moderation
// queue, reports, agent verification, disputes, payouts, webhooks,
// integrations, invoices) each need a capability flag flipped on and a real
// count wired in here before they can appear — never a hardcoded row.
export async function fetchAttentionItems(): Promise<AttentionItem[]> {
  const items: AttentionItem[] = [];

  if (CAPABILITIES.tenantLifecycle) {
    const tenants = await fetchTenants();
    const awaitingVerification = tenants.filter((t) => t.verificationState === "documents_submitted" || t.verificationState === "under_review");
    if (awaitingVerification.length > 0) {
      items.push({
        id: "tenants-awaiting-verification",
        label: `${awaitingVerification.length === 1 ? "Tenant" : "Tenants"} awaiting verification`,
        count: awaitingVerification.length,
        severity: "amber",
        href: "/admin/tenants?status=under_review",
      });
    }
  }

  return items;
}

// Zone 6 — "recent activity". A thin, typed wrapper over tenantsService's
// audit log so the dashboard doesn't reach into a lower-level service's
// internals directly.
export async function fetchRecentActivity(limit = 10): Promise<AuditLogEntry[]> {
  return fetchAuditLog(limit);
}

export function describeAuditEntry(entry: AuditLogEntry): string {
  switch (entry.action) {
    case "tenant_verified": return `verified ${entry.tenantName}`;
    case "tenant_rejected": return `rejected ${entry.tenantName}`;
    case "tenant_request_info": return `requested more information from ${entry.tenantName}`;
    case "tenant_status_changed": return `changed ${entry.tenantName}'s account status`;
    case "support_access_used": return `used support access on ${entry.tenantName}`;
  }
}

// ─── Zones 2–5 — mock-backed pending real integration ──────────────────────
// Each interface defines the shape a real endpoint should return once its
// epic lands. The fetch functions below currently only have a mock branch —
// TODO (backend): add the real `apiClient.get(...)` branch when each epic's
// API exists (see the comment on each function for the real endpoint path).

export interface MetricTrend {
  value: number;
  previousValue: number;
  changePct: number;
}

// See landvault-full-vision / the Developer Portal backlog's Epic 5 finance
// module for what a real version of this needs.
export interface PlatformHealthMetrics {
  gmv: MetricTrend;
  transactionsCompleted: MetricTrend;
  activeTenantsTransacting: { transacting: number; totalActive: number };
  newBuyerSignups: MetricTrend;
  kycApprovalRate: number;
  liveListings: MetricTrend;
  plotsAllocated: MetricTrend;
}

// TODO (backend): GET /api/admin/metrics/platform-health?period=
export async function fetchPlatformHealthMetrics(period: MetricsPeriod): Promise<PlatformHealthMetrics> {
  if (apiClient.isMockMode) return buildPlatformHealthMetrics(await fetchTenants(), period);
  return apiClient.get<PlatformHealthMetrics>(`/api/admin/metrics/platform-health?period=${period}`);
}

// See landvault-public-marketplace in project memory for what a real version
// of this needs.
export interface MarketplacePulseMetrics {
  listingsPublishedToday: number;
  listingsPublishedThisWeek: number;
  viewToEnquiryRate: number;
  enquiryToSaleRate: number;
  wishlistAdds: number;
  avgTimeToModerateHours: number;
  listingsByState: { state: string; count: number }[];
}

// TODO (backend): GET /api/admin/metrics/marketplace-pulse
export async function fetchMarketplacePulseMetrics(): Promise<MarketplacePulseMetrics> {
  if (apiClient.isMockMode) return MOCK_MARKETPLACE_PULSE;
  return apiClient.get<MarketplacePulseMetrics>("/api/admin/metrics/marketplace-pulse");
}

// See Super Admin backlog Epic 7 — Platform revenue, fees & billing.
export interface RevenueMetrics {
  feeRevenueByType: { type: "primary_sale" | "resale" | "upgrade"; amount: number }[];
  subscriptionRevenue: number;
  mrr: number;
  outstandingInvoices: number;
  overdueInvoices: number;
}

// TODO (backend): GET /api/admin/metrics/revenue
export async function fetchRevenueMetrics(): Promise<RevenueMetrics> {
  if (apiClient.isMockMode) return MOCK_REVENUE;
  return apiClient.get<RevenueMetrics>("/api/admin/metrics/revenue");
}

// See Super Admin backlog Epic 6 — Integrations hub.
export interface SystemHealthMetrics {
  integrations: { name: string; status: "healthy" | "degraded" | "down" }[];
  webhookSuccessRate: number;
  qrVerificationLookups: number;
  qrVerificationAnomalies: number;
  duplicateListingConflicts: number; // the core anti-fraud differentiator — surface prominently once real
}

// TODO (backend): GET /api/admin/metrics/system-health
export async function fetchSystemHealthMetrics(): Promise<SystemHealthMetrics> {
  if (apiClient.isMockMode) return MOCK_SYSTEM_HEALTH;
  return apiClient.get<SystemHealthMetrics>("/api/admin/metrics/system-health");
}
