// Gates which dashboard zones (and eventually other UI) can render. Flip a
// flag to true only once its epic has real, non-fabricated data behind it —
// never to unblock a placeholder. See landvault-repo-implementation-notes in
// project memory for what's actually live in this repo at any given time.

export interface Capabilities {
  tenantLifecycle: boolean;
  activityLog: boolean;
  marketplace: boolean;
  revenue: boolean;
  disputes: boolean;
  integrations: boolean;
  reputation: boolean;
  payouts: boolean;
}

export const CAPABILITIES: Capabilities = {
  tenantLifecycle: true, // Zone 1 "needs attention" — tenant verification queue
  activityLog: true, // Zone 6 "recent activity" — tenantsService's audit log
  // Zones 2–5 below are mock-backed (src/data/mockPlatformMetrics.ts) at the
  // user's explicit request, ahead of the real backend — every zone reading
  // them shows a "Preview data" badge so the numbers are never mistaken for
  // real ones. Flip a flag to a *real* fetcher (drop the mock branch in
  // platformMetricsService.ts) once its actual epic ships.
  marketplace: true, // Zones 2 (platform health) + 3 (marketplace pulse)
  revenue: true, // Zone 4 "platform revenue"
  integrations: true, // Zone 5 "system & trust health"
  // These would only power extra Zone 1 attention rows, each linking to a
  // page that doesn't exist yet (disputes/agent-verification/settlements) —
  // left off to avoid the same dead-link problem already avoided in the nav.
  disputes: false,
  reputation: false,
  payouts: false,
};
