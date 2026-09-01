// Mock data for the Super Admin dashboard's Zones 2–5. Explicitly illustrative
// — there's no checkout/payment backend, marketplace, billing engine, or
// integrations hub in this repo to source real numbers from yet. Every zone
// that reads this shows a "Preview data" badge (see Dashboard.tsx) so it's
// never mistaken for the real thing. Backend integration replaces this file's
// callers in platformMetricsService.ts, not this file directly.

import type { Tenant } from "../services/tenantsService";
import type { MetricTrend, PlatformHealthMetrics, MarketplacePulseMetrics, RevenueMetrics, SystemHealthMetrics } from "../services/platformMetricsService";

export type MetricsPeriod = "today" | "7d" | "30d";

const PERIOD_MULTIPLIER: Record<MetricsPeriod, number> = { today: 0.15, "7d": 1, "30d": 4.2 };

function trend(base: number, changePct: number, period: MetricsPeriod): MetricTrend {
  const value = Math.round(base * PERIOD_MULTIPLIER[period]);
  const previousValue = Math.round(value / (1 + changePct / 100));
  return { value, previousValue, changePct };
}

// Only the ratio here is partly real (derived from actual tenant data) — the
// rest of this zone is illustrative.
export function buildPlatformHealthMetrics(tenants: Tenant[], period: MetricsPeriod): PlatformHealthMetrics {
  const activeTenants = tenants.filter((t) => t.status === "active");
  const transacting = activeTenants.filter((t) => t.entitlements.marketplacePublishing).length;

  return {
    gmv: trend(412_000_000, 18, period),
    transactionsCompleted: trend(86, 9, period),
    activeTenantsTransacting: { transacting, totalActive: activeTenants.length },
    newBuyerSignups: trend(340, 12, period),
    kycApprovalRate: 91,
    liveListings: trend(1204, 3.6, period),
    plotsAllocated: trend(52, 14, period),
  };
}

export const MOCK_MARKETPLACE_PULSE: MarketplacePulseMetrics = {
  listingsPublishedToday: 6,
  listingsPublishedThisWeek: 42,
  viewToEnquiryRate: 3.2,
  enquiryToSaleRate: 8.7,
  wishlistAdds: 870,
  avgTimeToModerateHours: 4,
  listingsByState: [
    { state: "Lagos", count: 412 },
    { state: "Federal Capital Territory (Abuja)", count: 356 },
    { state: "Rivers", count: 118 },
    { state: "Oyo", count: 94 },
    { state: "Kano", count: 61 },
  ],
};

export const MOCK_REVENUE: RevenueMetrics = {
  feeRevenueByType: [
    { type: "primary_sale", amount: 6_100_000 },
    { type: "resale", amount: 1_450_000 },
    { type: "upgrade", amount: 850_000 },
  ],
  subscriptionRevenue: 1_200_000,
  mrr: 1_050_000,
  outstandingInvoices: 980_000,
  overdueInvoices: 620_000,
};

export const MOCK_SYSTEM_HEALTH: SystemHealthMetrics = {
  integrations: [
    { name: "Paystack", status: "healthy" },
    { name: "Flutterwave", status: "healthy" },
    { name: "Monnify", status: "healthy" },
    { name: "Opay", status: "healthy" },
    { name: "Titan cards", status: "healthy" },
    { name: "AGIS / state registries", status: "degraded" },
    { name: "SMS / Email / WhatsApp", status: "healthy" },
    { name: "Document storage", status: "healthy" },
  ],
  webhookSuccessRate: 99.2,
  qrVerificationLookups: 2140,
  qrVerificationAnomalies: 0,
  duplicateListingConflicts: 2,
};
