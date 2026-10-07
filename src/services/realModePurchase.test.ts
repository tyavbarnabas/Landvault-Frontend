// Real-mode contract tests for the purchase flow and the two admin paths fixed
// in the integration audit, against a stubbed fetch. Shapes transcribed from
// the backend's MarketplaceController (listing + geojson), ReservationController
// and CheckoutController (commit 9cef857). The backend has no payment routes.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

type Call = { url: string; method: string; body: unknown };
let calls: Call[];
let store: Map<string, string>;

function respond(routes: Record<string, { status: number; body?: unknown }>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = url.replace("http://api.test", "");
    const method = (init.method ?? "GET").toUpperCase();
    calls.push({ url: path, method, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const hit = routes[`${method} ${path}`];
    if (!hit) return new Response(JSON.stringify({ code: "NOT_FOUND", message: "Not found" }), { status: 404 });
    return new Response(hit.body === undefined ? null : JSON.stringify(hit.body), { status: hit.status });
  }));
}

beforeEach(() => {
  calls = [];
  store = new Map([["auth_token", "access-1"]]);
  vi.stubEnv("VITE_API_BASE_URL", "http://api.test");
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const range = (n: number) => ({ min: n, max: n });
const LISTING = {
  id: "e1", name: "Palm Grove", area: null, city: "Lekki", state: "Lagos", description: null, amenities: null, imageUrl: null,
  titleType: "C of O", lastVerifiedDate: null, cornerPremiumPct: 10, intent: null, publishedDate: "2026-09-01",
  seller: { branchName: null, companyName: "Acme Land", office: null }, verified: true, fromPrice: 5_000_000, fromPriceCurrency: "NGN",
  plotsRemaining: 3, hasMap: true, verificationChecks: null,
  priceTiers: [
    { id: "t1", sizeSqm: 500, actualAreaSqm: null, label: null, price: 5_000_000, currency: "NGN", pricePerSqm: 10_000, availability: "available", plotsRemaining: 3,
      commitment: { landPrice: 5_000_000, currency: "NGN", oneOffFees: range(500_000), totalCommitment: range(5_500_000), totalCommitmentIfCorner: range(6_000_000), totalExcludesOtherCurrencyFees: false } },
    { id: "t2", sizeSqm: null, actualAreaSqm: null, label: "Unit", price: 9_000_000, currency: "NGN", pricePerSqm: null, availability: "available", plotsRemaining: 0, commitment: null },
  ],
  costDisclosure: {
    fees: [
      { label: "Survey", notes: null, variationBasis: null, isMandatory: true, dueTrigger: "on_allocation", amount: range(500_000), currency: "NGN" },
      { label: "Estate dues", notes: "Per year", variationBasis: null, isMandatory: true, dueTrigger: "annual", amount: range(100_000), currency: "NGN" },
      { label: "Fencing", notes: null, variationBasis: null, isMandatory: false, dueTrigger: "on_request", amount: range(300_000), currency: "NGN" },
    ],
    exitCosts: { revocation: { trigger: "default", noticeDays: null, onRevocationRefund: "refunded_less_fees" } },
  },
};

const plotFeature = (id: string, plotNumber: string, availability: string, isCorner = false) => ({
  type: "Feature", geometry: { type: "Polygon", coordinates: [] },
  properties: { kind: "plot", id, plotNumber, blockName: "Block A", availability, isCorner, priceTierId: "t1", nominalSizeSqm: 500, actualAreaSqm: 512 },
});
const MAP = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", geometry: { type: "Polygon", coordinates: [] }, properties: { kind: "estate" } },
    plotFeature("p1", "1", "AVAILABLE"), plotFeature("p2", "2", "UNAVAILABLE", true),
  ],
};

describe("marketplace listings", () => {
  it("reads the feed from /api/marketplace/estates and maps nulls safely", async () => {
    respond({ "GET /api/marketplace/estates?limit=10": { status: 200, body: { items: [LISTING], total: 1, cursor: null, hasMore: false } } });
    const { fetchListings } = await import("./marketplaceService");
    const page = await fetchListings({}, { limit: 10 });
    expect(calls[0].url.startsWith("/api/marketplace/estates")).toBe(true);
    const l = page.items[0];
    expect(l.name).toBe("Palm Grove");
    expect(l.area).toBe("");
    expect(l.amenities).toEqual([]);
    expect(l.paymentPlans).toEqual(["outright", "installment", "milestone"]);
    // A unit-type tier has no size on the backend.
    expect(l.priceTiers.find((t) => t.id === "t2")?.sizeSqm).toBe(0);
  });

  it("a listing that doesn't exist is undefined, not an error", async () => {
    respond({});
    const { fetchListingById } = await import("./marketplaceService");
    expect(await fetchListingById("nope")).toBeUndefined();
  });

  it("a server error is NOT treated as 'not found'", async () => {
    respond({ "GET /api/marketplace/estates/e1": { status: 500, body: { code: "INTERNAL", message: "boom" } } });
    const { fetchListingById } = await import("./marketplaceService");
    await expect(fetchListingById("e1")).rejects.toMatchObject({ status: 500 });
  });
});

describe("cost disclosure comes from the listing", () => {
  it("selects recurring and optional fees and keeps the backend's totals", async () => {
    respond({ "GET /api/marketplace/estates/e1": { status: 200, body: LISTING } });
    const { fetchCostDisclosure } = await import("./costDisclosureService");
    const d = await fetchCostDisclosure("e1");
    expect(calls.map((c) => c.url)).toEqual(["/api/marketplace/estates/e1"]);
    expect(d?.tiers).toHaveLength(1);
    expect(d?.tiers[0].totalCommitment).toEqual(range(5_500_000));
    expect(d?.tiers[0].recurringFees.map((f) => f.label)).toEqual(["Estate dues"]);
    expect(d?.tiers[0].optionalFees.map((f) => f.label)).toEqual(["Fencing"]);
    expect(d?.exitCosts?.revocation).toEqual({ trigger: "default", noticeDays: null, paymentsAlreadyMade: "refunded_less_fees" });
  });
});

describe("plots come from the plot list, boundary or not", () => {
  const dto = (id: string, plotNumber: string, availability: string, hasBoundary: boolean, isCorner = false) => ({
    id, plotNumber, blockName: "Block A", availability, isCorner, priceTierId: "t1", nominalSizeSqm: 500, actualAreaSqm: hasBoundary ? 512 : null, hasBoundary,
  });

  it("lists every plot, including unsurveyed ones, following the cursor", async () => {
    respond({
      "GET /api/marketplace/estates/e1/plots?limit=500": { status: 200, body: { items: [dto("p1", "1", "AVAILABLE", true), dto("p2", "2", "UNAVAILABLE", true, true)], total: 3, cursor: "c2", hasMore: true } },
      "GET /api/marketplace/estates/e1/plots?limit=500&cursor=c2": { status: 200, body: { items: [dto("p3", "3", "AVAILABLE", false)], total: 3, cursor: null, hasMore: false } },
    });
    const { fetchPlotsForListing, plotLabel } = await import("./marketplacePlotsService");
    const page = await fetchPlotsForListing("e1");
    expect(page.items.map((p) => [p.id, p.publicAvailability, p.isCorner, p.hasBoundary])).toEqual([
      ["p1", "available", false, true], ["p2", "unavailable", true, true], ["p3", "available", false, false],
    ]);
    expect(page.items[0].tierId).toBe("t1");
    expect(plotLabel(page.items[0])).not.toMatch(/Block Block/);
  });

  it("finds one plot by id, and undefined for an unknown one", async () => {
    respond({ "GET /api/marketplace/estates/e1/plots?limit=500": { status: 200, body: { items: [dto("p3", "3", "AVAILABLE", false)], total: 1, cursor: null, hasMore: false } } });
    const { fetchPlotById } = await import("./marketplacePlotsService");
    expect((await fetchPlotById("e1", "p3"))?.hasBoundary).toBe(false);
    expect(await fetchPlotById("e1", "missing")).toBeUndefined();
  });
});

describe("listings never claim more than the backend says", () => {
  it("a missing title or land check stays missing — never a plausible default", async () => {
    respond({ "GET /api/marketplace/estates/e1": { status: 200, body: { ...LISTING, titleType: null, lastVerifiedDate: null } } });
    const { fetchListingById, titleLabel, landCheckLabel } = await import("./marketplaceService");
    const l = await fetchListingById("e1");
    expect(l?.titleType).toBeNull();
    expect(l?.lastVerifiedDate).toBeNull();
    expect(titleLabel(l?.titleType)).toBe("Title not recorded");
    expect(landCheckLabel(l?.lastVerifiedDate)).toBe("Land not checked yet");
    expect(landCheckLabel("2026-09-01")).toBe("Land checked 2026-09-01");
  });
});

describe("reservations", () => {
  const DTO = { id: "r1", estateId: "e1", plotId: "p1", priceTierId: "t1", status: "active", expiresAt: "2026-10-07T12:15:00Z", secondsRemaining: 900 };

  it("reserves with { plotId } only", async () => {
    respond({ "POST /api/reservations": { status: 201, body: DTO } });
    const { startReservation } = await import("./reservationService");
    const r = await startReservation("e1", "p1");
    expect(calls[0].body).toEqual({ plotId: "p1" });
    expect(r).toMatchObject({ id: "r1", listingId: "e1", plotId: "p1", tierId: "t1", status: "active" });
  });

  it("releases with DELETE and lists mine", async () => {
    respond({ "DELETE /api/reservations/r1": { status: 204 }, "GET /api/reservations/mine": { status: 200, body: [DTO] } });
    const { releaseReservation, fetchMyReservations } = await import("./reservationService");
    await releaseReservation("r1");
    expect(calls[0]).toMatchObject({ method: "DELETE", url: "/api/reservations/r1" });
    expect((await fetchMyReservations()).map((r) => r.id)).toEqual(["r1"]);
  });

  it("a plot already taken surfaces the backend's message", async () => {
    respond({ "POST /api/reservations": { status: 409, body: { code: "PLOT_NOT_AVAILABLE", message: "Plot is no longer available" } } });
    const { startReservation } = await import("./reservationService");
    await expect(startReservation("e1", "p1")).rejects.toMatchObject({ status: 409, message: "Plot is no longer available" });
  });
});

describe("checkout", () => {
  const SHOWN = {
    listingId: "e1", listingName: "Palm Grove", plotId: "p1", plotLabel: "Block A, Plot 1", sizeSqm: 500, actualAreaSqm: 512,
    isCorner: false, cornerPremiumPct: 10, basePrice: 1, titleType: "C of O" as never, location: "Lekki", reservationId: "r1",
    tierId: "t1", intent: "development" as const, currency: "NGN" as never, amountDue: 1, totalPrice: 1,
  };
  const TXN = { id: "x1", reference: "LV-1", estateId: "e1", plotId: "p1", reservationId: "r1", basePrice: 5_000_000, cornerPremiumPct: null,
    totalPrice: 5_000_000, intent: "development", plan: "outright", status: "pending_payment", createdAt: "2026-10-07T12:00:00Z" };

  it("sends only the reservation, intent and plan; prices come from the backend", async () => {
    respond({ "POST /api/checkout/transactions": { status: 201, body: TXN } });
    const { initiateTransaction } = await import("./marketplaceCheckoutService");
    const t = await initiateTransaction({ ...SHOWN, plan: "outright", installmentMonths: undefined });
    expect(calls[0].body).toEqual({ reservationId: "r1", intent: "development", plan: "outright" });
    expect(t).toMatchObject({ id: "x1", reference: "LV-1", totalPrice: 5_000_000, status: "pending_payment" });
  });

  it("sends installment months for installment plans only", async () => {
    respond({ "POST /api/checkout/transactions": { status: 201, body: { ...TXN, plan: "installment" } } });
    const { initiateTransaction } = await import("./marketplaceCheckoutService");
    await initiateTransaction({ ...SHOWN, plan: "installment", installmentMonths: 12 });
    expect(calls[0].body).toEqual({ reservationId: "r1", intent: "development", plan: "installment", installmentMonths: 12 });
  });

  it("says payments aren't available rather than simulating them", async () => {
    respond({});
    const { initiatePayment, confirmPayment, paymentsAvailable } = await import("./marketplaceCheckoutService");
    const { PaymentsUnavailableError } = await import("./paymentsUnavailable");
    expect(paymentsAvailable()).toBe(false);
    await expect(initiatePayment("x1", "card" as never)).rejects.toBeInstanceOf(PaymentsUnavailableError);
    await expect(confirmPayment("x1")).rejects.toBeInstanceOf(PaymentsUnavailableError);
    expect(calls).toEqual([]);
  });
});

describe("admin paths fixed in the audit", () => {
  it("a conflict decision posts { status, reason } to /status", async () => {
    respond({ "POST /api/admin/listing-conflicts/c1/status": { status: 200, body: { id: "c1", status: "dismissed" } } });
    const { reviewConflict } = await import("./listingConflictsService");
    await reviewConflict("c1", "dismissed" as never, "admin", "Same company");
    expect(calls[0].body).toEqual({ status: "dismissed", reason: "Same company" });
  });

  it("submitting a tenant for verification calls submit-documents", async () => {
    respond({ "POST /api/admin/tenants/t1/submit-documents": { status: 200, body: { id: "t1" } } });
    const { submitForVerification } = await import("./tenantsService");
    await submitForVerification("t1", {} as never);
    expect(calls[0]).toMatchObject({ method: "POST", url: "/api/admin/tenants/t1/submit-documents" });
  });
});

describe("failures say what failed", () => {
  it("no response at all is a transport error naming the service", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const { fetchListings } = await import("./marketplaceService");
    const { ApiTransportError } = await import("../lib/apiClient");
    const err = await fetchListings().catch((e) => e);
    expect(err).toBeInstanceOf(ApiTransportError);
    expect(err.request).toMatchObject({ method: "GET", path: "/api/marketplace/estates", service: "Marketplace listings" });
  });
});

describe("KYC", () => {
  it("submits file metadata, not File objects (no object storage on the backend)", async () => {
    respond({ "POST /api/kyc": { status: 200, body: { buyerType: "local", status: "pending", documents: [] } } });
    const { submitKyc } = await import("./kycService");
    const file = new File(["x".repeat(42)], "nin-slip.pdf");
    await submitKyc({} as never, { ninNumber: "12345678901", ninFile: file });
    expect(calls[0].body).toEqual({ ninNumber: "12345678901", ninFile: { fileName: "nin-slip.pdf", fileSize: 42, storageKey: null } });
  });
});

describe("admin lists, as the backend returns them", () => {
  it("the conflict list never sends unset filters", async () => {
    respond({ "GET /api/admin/listing-conflicts?": { status: 200, body: { items: [], total: 0, cursor: null, hasMore: false } } });
    const { fetchConflicts } = await import("./listingConflictsService");
    await fetchConflicts({ status: undefined } as never);
    expect(calls[0].url).toBe("/api/admin/listing-conflicts?");
  });

  it("the conflict list sends status filters as repeated params", async () => {
    respond({ "GET /api/admin/listing-conflicts?status=open&status=investigating": { status: 200, body: { items: [], total: 0, cursor: null, hasMore: false } } });
    const { fetchConflicts } = await import("./listingConflictsService");
    await fetchConflicts({ status: ["open", "investigating"] } as never);
    expect(calls).toHaveLength(1);
  });

  it("the tenant directory reads TenantSummaryDto rows as they are", async () => {
    const row = { id: "t1", displayName: "Acme", primaryContactName: null, primaryContactEmail: "a@acme.com", plan: "starter",
      verificationState: "verified", status: "active", statesOfOperation: ["Lagos"], branchCount: 2, createdDate: "2026-09-01" };
    respond({ "GET /api/admin/tenants?": { status: 200, body: { items: [row], total: 1, cursor: null, hasMore: false } } });
    const { fetchTenants } = await import("./tenantsService");
    expect((await fetchTenants()).items[0]).toEqual(row);
  });
});

describe("the plot picker pages one tier at a time", () => {
  const row = (id: string, tier: string) => ({ id, plotNumber: id, blockName: "A", availability: "AVAILABLE", isCorner: false, priceTierId: tier, nominalSizeSqm: 250, actualAreaSqm: 250, hasBoundary: true });

  it("asks for one tier's available plots, 20 at a time, and passes the cursor on", async () => {
    respond({
      "GET /api/marketplace/estates/e1/plots?priceTierId=t1&limit=20&available=true": { status: 200, body: { items: [row("p1", "t1")], total: 39, cursor: "1", hasMore: true } },
      "GET /api/marketplace/estates/e1/plots?priceTierId=t1&limit=20&available=true&cursor=1": { status: 200, body: { items: [row("p21", "t1")], total: 39, cursor: null, hasMore: false } },
    });
    const { fetchTierPlots } = await import("./marketplacePlotsService");
    const first = await fetchTierPlots("e1", "t1", { availableOnly: true, limit: 20 });
    expect(first).toMatchObject({ total: 39, cursor: "1", hasMore: true });
    const second = await fetchTierPlots("e1", "t1", { availableOnly: true, limit: 20, cursor: first.cursor });
    expect(second.items.map((p) => p.id)).toEqual(["p21"]);
    expect(second.cursor).toBeUndefined();
  });

  it("never shows another tier's plots, even from a backend that ignores the filter", async () => {
    respond({ "GET /api/marketplace/estates/e1/plots?priceTierId=t1&limit=20": { status: 200, body: { items: [row("p1", "t1"), row("p9", "t2")], total: 2, cursor: null, hasMore: false } } });
    const { fetchTierPlots } = await import("./marketplacePlotsService");
    expect((await fetchTierPlots("e1", "t1")).items.map((p) => p.id)).toEqual(["p1"]);
  });
});
