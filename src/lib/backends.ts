// Which services talk to the real backend, and which stay on mock data.
//
// One global flag (VITE_API_BASE_URL) used to decide this for the whole app:
// set it and EVERY service called the backend — including about fifteen that
// have no backend at all, which then failed. Unset, nothing real was tested.
// This registry lets each service be live or mocked on its own.
//
//   live        the backend serves it; called whenever VITE_API_BASE_URL is set
//   no_backend  nothing on the backend yet — stays on mock data, by design
//   misaligned  the backend has the feature, but this frontend doesn't match
//               it yet — stays on mock data until rewired
//
// With VITE_API_BASE_URL unset, EVERYTHING is mocked, exactly as before.
//
// Audited 2026-10-07 against the backend's controllers (commit 9cef857): every
// frontend call matched against every backend route. A service is `live` only
// when every call it makes exists there. See INTEGRATION_TESTING.md.
//
// GROUPS keep features that pass ids to each other on the same side. A real
// reservation can't hold a mock marketplace plot, so the purchase flow is live
// or mocked as a whole — never half and half (checked in backends.test.ts).


export type ServiceStatus = "live" | "no_backend" | "misaligned";

export interface ServiceEntry {
  label: string;
  status: ServiceStatus;
  // Path prefixes it calls, so a failed request can be named by service.
  paths: string[];
  // Why it is mocked — shown in the dev panel and the demo-data banner.
  reason?: string;
  group?: "purchase";
}

export const SERVICES = {
  // ── Live ──────────────────────────────────────────────────────────────────
  auth: { label: "Sign-in & account", status: "live", paths: ["/api/auth"] },
  kyc: { label: "KYC", status: "live", paths: ["/api/kyc", "/api/admin/kyc"] },
  tenants: { label: "Tenants (Super Admin)", status: "live", paths: ["/api/admin/tenants"] },
  listingConflicts: { label: "Listing conflicts", status: "live", paths: ["/api/admin/listing-conflicts"] },
  stateOverride: { label: "State overrides", status: "live", paths: ["/api/admin/estates"] },
  portalEstates: { label: "Portal estates & boundary changes", status: "live", paths: ["/api/portal/estates", "/api/admin/boundary-changes"] },
  portalInventory: { label: "Portal inventory (tiers, blocks, plots, import)", status: "live", paths: [] },
  estateDisclosure: { label: "Fees & terms declarations", status: "live", paths: [] },
  branches: { label: "Branches", status: "live", paths: ["/api/portal/branches"] },
  staff: { label: "Staff, roles & invitations", status: "live", paths: ["/api/portal/staff", "/api/portal/roles", "/api/auth/invitations"] },

  // ── The purchase flow: one group, live together ───────────────────────────
  marketplace: { label: "Marketplace listings", status: "live", group: "purchase", paths: ["/api/marketplace/estates"] },
  marketplacePlots: { label: "Marketplace plots (from the estate map)", status: "live", group: "purchase", paths: [] },
  costDisclosure: { label: "Public cost disclosure", status: "live", group: "purchase", paths: [] },
  reservation: { label: "Reservations", status: "live", group: "purchase", paths: ["/api/reservations"] },
  checkout: { label: "Checkout (transactions)", status: "live", group: "purchase", paths: ["/api/checkout/transactions"] },

  // ── The backend has it, the frontend doesn't match yet ────────────────────
  estates: {
    label: "Estates browse (/estates)", status: "misaligned", paths: ["/api/estates"],
    // Retired in live mode — /estates redirects to /marketplace (App.tsx).
    // Real plots have boundaries, not grid positions, and the backend has
    // decided not to add any. Only demo-only screens (syndicates, upgrades)
    // still read it.
    reason: "Retired with a backend: /estates redirects to /marketplace. The grid needs row/column positions real plots don't have, and the backend won't add them.",
  },

  // ── No backend yet ────────────────────────────────────────────────────────
  portfolio: { label: "Portfolio & payment schedules", status: "no_backend", paths: ["/api/portfolio"], reason: "Needs payments, which the backend doesn't have yet." },
  documents: { label: "Document vault", status: "no_backend", paths: ["/api/documents"], reason: "Receipts and allocation letters need payments first." },
  attention: { label: "Dashboard attention list", status: "no_backend", paths: ["/api/me/attention"], reason: "No /api/me/attention on the backend." },
  upgrades: { label: "Plot upgrades", status: "no_backend", paths: ["/api/upgrades"], reason: "Needs owned plots." },
  resale: { label: "Resale", status: "no_backend", paths: ["/api/resale"], reason: "Needs owned plots and title transfer." },
  inspections: { label: "Site inspections", status: "no_backend", paths: ["/api/inspections"], reason: "Not built on the backend yet." },
  enquiries: { label: "Enquiries", status: "no_backend", paths: ["/api/marketplace/enquiries"], reason: "Not built on the backend yet." },
  reviews: { label: "Estate reviews", status: "no_backend", paths: ["/api/reviews"], reason: "Not built on the backend yet." },
  syndicates: { label: "Syndicates", status: "no_backend", paths: ["/api/syndicates"], reason: "Not built on the backend yet." },
  disputes: { label: "Disputes", status: "no_backend", paths: ["/api/disputes"], reason: "Not built on the backend yet." },
  notifications: { label: "Notifications", status: "no_backend", paths: ["/api/notifications"], reason: "No notification events on the backend yet." },
  construction: { label: "Construction updates", status: "no_backend", paths: [], reason: "Not built on the backend yet." },
  platformMetrics: { label: "Super Admin dashboard metrics", status: "no_backend", paths: ["/api/admin/metrics"], reason: "No metrics endpoints on the backend yet." },
  agis: { label: "AGIS land-registry lookup", status: "no_backend", paths: [], reason: "An external government system; no integration exists." },
} satisfies Record<string, ServiceEntry>;

export type ServiceKey = keyof typeof SERVICES;

// True when a backend URL is configured at all. Read from the environment
// directly, not from apiClient — apiClient imports this module to name the
// service behind a failed request, and a cycle would crash at startup.
export const BACKEND_CONFIGURED = !!(import.meta.env.VITE_API_BASE_URL as string | undefined);

const entry = (key: ServiceKey): ServiceEntry => SERVICES[key];

export function isLive(key: ServiceKey): boolean {
  return BACKEND_CONFIGURED && entry(key).status === "live";
}

// ─── Mock calls are announced ────────────────────────────────────────────────
//
// With a backend configured, a mocked service says so when it serves data, so
// a passing screen is never mistaken for a working integration: once in the
// console per service, and to any listener (the demo-data banner).

type MockListener = (key: ServiceKey) => void;
const mockListeners = new Set<MockListener>();
const announced = new Set<ServiceKey>();

export function onMockServed(listener: MockListener): () => void {
  mockListeners.add(listener);
  return () => { mockListeners.delete(listener); };
}

// Which mocked services served data on which page — so the demo-data banner
// names exactly what THIS page used, with no hand-kept list to drift. Keyed
// by pathname at call time: a page's own effects run before its layout's, so
// "since the last navigation" would miss them.
const servedByPath = new Map<string, Set<ServiceKey>>();
// Served once for the whole app (the notification bell), not per page.
const GLOBAL_SERVICES: ServiceKey[] = ["notifications"];
const servedGlobally = new Set<ServiceKey>();

export function mockServedOn(pathname: string): ServiceKey[] {
  return [...new Set([...(servedByPath.get(pathname) ?? []), ...servedGlobally])];
}

/** The check every service makes before choosing mock data over the API. */
export function isMock(key: ServiceKey): boolean {
  if (isLive(key)) return false;
  if (BACKEND_CONFIGURED) {
    if (GLOBAL_SERVICES.includes(key)) servedGlobally.add(key);
    else if (typeof window !== "undefined") {
      const path = window.location.pathname;
      if (!servedByPath.has(path)) servedByPath.set(path, new Set());
      servedByPath.get(path)!.add(key);
    }
    if (!announced.has(key) && import.meta.env.DEV) {
      announced.add(key);
      const e = entry(key);
      console.info(`[mock] ${e.label} is serving DEMO data — ${e.status === "misaligned" ? "frontend not aligned with the backend yet" : "no backend yet"}. ${e.reason ?? ""}`);
    }
    for (const listener of mockListeners) listener(key);
  }
  return true;
}

/** Which service a request path belongs to — for naming failures. */
export function serviceForPath(path: string): ServiceKey | null {
  let best: { key: ServiceKey; length: number } | null = null;
  for (const [key, e] of Object.entries(SERVICES) as [ServiceKey, ServiceEntry][]) {
    for (const prefix of e.paths) {
      if (path.startsWith(prefix) && (!best || prefix.length > best.length)) best = { key, length: prefix.length };
    }
  }
  // Inventory, disclosure and plot routes sit under /api/portal/estates/{id}/…
  if (best?.key === "portalEstates") {
    if (/\/(price-tiers|blocks|plots)(\/|$|\?)/.test(path)) return "portalInventory";
    if (/\/(fees|refund-terms|default-terms)(\/|$|\?)/.test(path)) return "estateDisclosure";
  }
  return best?.key ?? null;
}

export function serviceLabel(key: ServiceKey | null): string {
  return key ? entry(key).label : "unknown service";
}

// ─── Origin ──────────────────────────────────────────────────────────────────
//
// The backend's CORS_ALLOWED_ORIGINS defaults to http://localhost:8443. From
// any other origin EVERY request fails at the first step as "Failed to fetch"
// — Spring rejects it before the backend can return a readable code.
export const BACKEND_ALLOWED_ORIGINS = ((import.meta.env.VITE_BACKEND_ALLOWED_ORIGINS as string | undefined) || "http://localhost:8443")
  .split(",").map((o) => o.trim()).filter(Boolean);

export function originLooksAllowed(origin: string): boolean {
  return BACKEND_ALLOWED_ORIGINS.includes(origin);
}

/** Dev only: what's live, what's mocked, and whether the origin will work. */
export function logBackendSummary(): void {
  if (!import.meta.env.DEV || typeof window === "undefined") return;
  if (!BACKEND_CONFIGURED) {
    console.info("[backend] VITE_API_BASE_URL is not set — full mock mode: every service serves demo data.");
    return;
  }
  const rows = Object.fromEntries((Object.entries(SERVICES) as [ServiceKey, ServiceEntry][]).map(([key, e]) => [
    key, { mode: isLive(key) ? "LIVE" : "mock", status: e.status, group: e.group ?? "", reason: e.reason ?? "" },
  ]));
  console.info(`[backend] ${import.meta.env.VITE_API_BASE_URL} — per-service mode:`);
  console.table(rows);
  const origin = window.location.origin;
  if (!originLooksAllowed(origin)) {
    console.warn(
      `[backend] This page's origin is ${origin}, but the backend allows ${BACKEND_ALLOWED_ORIGINS.join(", ")} (its CORS_ALLOWED_ORIGINS). ` +
      "Every request will fail as 'Failed to fetch'. Run the dev server on port 8443, or add this origin to the backend's CORS_ALLOWED_ORIGINS " +
      "and to VITE_BACKEND_ALLOWED_ORIGINS here.");
  }
}

export function serviceReason(key: ServiceKey): string | undefined {
  return entry(key).reason;
}
