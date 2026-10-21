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

  it("the title filter keeps only verified titles, even if the backend returns declared ones", async () => {
    const declared = { ...LISTING, id: "e1", titleStatus: "pending", titleVerifiedAt: null };
    const verified = { ...LISTING, id: "e2", name: "Crown Court", titleStatus: "verified", titleVerifiedAt: "2026-08-01T00:00:00Z" };
    respond({ "GET /api/marketplace/estates?titleType=C+of+O&limit=10": { status: 200, body: { items: [declared, verified], total: 2, cursor: null, hasMore: false } } });
    const { fetchListings } = await import("./marketplaceService");
    const page = await fetchListings({ titleType: "C of O" }, { limit: 10 });
    expect(page.items.map((l) => l.id)).toEqual(["e2"]);
    expect(page.total).toBe(1);
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

  it("names an unlabelled fee by its type (the backend sends label: null)", async () => {
    const fees = (LISTING as { costDisclosure: { fees: Record<string, unknown>[] } }).costDisclosure.fees;
    const types = ["survey", "facility_management", "other"];
    const unlabelled = { ...LISTING, costDisclosure: { ...LISTING.costDisclosure, fees: fees.map((f, i) => ({ ...f, feeType: types[i], label: null })) } };
    respond({ "GET /api/marketplace/estates/e1": { status: 200, body: unlabelled } });
    const { fetchCostDisclosure } = await import("./costDisclosureService");
    const d = await fetchCostDisclosure("e1");
    expect(d?.fees.map((f) => f.label)).toEqual(["Survey", "Facility management", "Other"]);
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

  it("reads a title with no known status as declared, never verified", async () => {
    respond({ "GET /api/marketplace/estates/e1": { status: 200, body: { ...LISTING, titleType: "C of O", titleStatus: "approved", titleVerifiedAt: "2026-10-01T00:00:00Z" } } });
    const { fetchListingById, titleLabel } = await import("./marketplaceService");
    const l = await fetchListingById("e1");
    expect(l).toMatchObject({ titleStatus: "pending", titleVerifiedAt: null });
    expect(titleLabel(l?.titleType, l?.titleStatus)).toBe("C of O (declared)");
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
    buyer: { email: "buyer@example.com", address: null },
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

  it("never sends the address; the purchase carries the backend's copy", async () => {
    const ADDRESS = { line1: "3 Admiralty Way", line2: null, city: "Lekki", state: "Lagos", postalCode: null, country: "NG" };
    respond({ "POST /api/checkout/transactions": { status: 201, body: { ...TXN, buyerAddress: ADDRESS } } });
    const { initiateTransaction } = await import("./marketplaceCheckoutService");
    const t = await initiateTransaction({ ...SHOWN, plan: "outright", installmentMonths: undefined });
    expect(calls[0].body).not.toHaveProperty("buyer");
    expect(t.buyerAddress).toEqual(ADDRESS);
  });

  it("a buyer with no address gets 409 ADDRESS_REQUIRED", async () => {
    respond({ "POST /api/checkout/transactions": { status: 409, body: { code: "ADDRESS_REQUIRED", message: "Add your address" } } });
    const { initiateTransaction } = await import("./marketplaceCheckoutService");
    await expect(initiateTransaction({ ...SHOWN, plan: "outright", installmentMonths: undefined })).rejects.toMatchObject({ status: 409, body: { code: "ADDRESS_REQUIRED" } });
  });

  it("sends installment months for installment plans only", async () => {
    respond({ "POST /api/checkout/transactions": { status: 201, body: { ...TXN, plan: "installment" } } });
    const { initiateTransaction } = await import("./marketplaceCheckoutService");
    await initiateTransaction({ ...SHOWN, plan: "installment", installmentMonths: 12 });
    expect(calls[0].body).toEqual({ reservationId: "r1", intent: "development", plan: "installment", installmentMonths: 12 });
  });

  it("the demo payment simulation is never used against the backend", async () => {
    respond({});
    const { initiatePayment, confirmPayment } = await import("./marketplaceCheckoutService");
    await expect(initiatePayment("x1", "card" as never)).rejects.toThrow(/Demo mode only/);
    await expect(confirmPayment("x1")).rejects.toThrow(/Demo mode only/);
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

describe("paying (Paystack, through the backend)", () => {
  const PAYMENT = { id: "pay1", transactionId: "x1", reference: "PAY-1", status: "initialized", amount: 15000000, currency: "NGN",
    authorizationUrl: "https://checkout.paystack.com/abc", createdAt: "2026-10-09T10:00:00Z", gatewayResponse: null, channel: null, paidAt: null, underReview: false };
  const SUMMARY = { reference: "PAY-1", status: "succeeded", amountPaid: 15000000, paidAt: "2026-10-09T10:05:00Z", underReview: false, reviewKind: null, refundStatus: null };
  const PURCHASE = { id: "x1", reference: "LV-1", estateId: "e1", plotId: "p1", reservationId: "r1", basePrice: 15000000, cornerPremiumPct: null,
    totalPrice: 15000000, currency: "NGN", intent: "development", plan: "outright", installmentMonths: null, status: "awaiting_finance", createdAt: "2026-10-09T10:00:00Z", payment: SUMMARY };

  it("starts a payment with POST /api/transactions/{id}/payments and no body", async () => {
    respond({ "POST /api/transactions/x1/payments": { status: 201, body: PAYMENT } });
    const { startPayment } = await import("./paymentsService");
    expect((await startPayment("x1")).authorizationUrl).toBe("https://checkout.paystack.com/abc");
    expect(calls[0]).toMatchObject({ method: "POST", url: "/api/transactions/x1/payments", body: undefined });
  });

  it("a link handed back within 30 minutes (200) is used the same way", async () => {
    respond({ "POST /api/transactions/x1/payments": { status: 200, body: PAYMENT } });
    const { startPayment } = await import("./paymentsService");
    expect((await startPayment("x1")).reference).toBe("PAY-1");
  });

  it("verifies with POST /api/payments/{reference}/verify", async () => {
    respond({ "POST /api/payments/PAY-1/verify": { status: 200, body: { ...PAYMENT, status: "failed", gatewayResponse: "Insufficient Funds" } } });
    const { verifyPayment } = await import("./paymentsService");
    expect(await verifyPayment("PAY-1")).toMatchObject({ status: "failed", gatewayResponse: "Insufficient Funds" });
  });

  it("an unknown payment is a 404 PAYMENT_NOT_FOUND the return page can tell apart", async () => {
    respond({ "POST /api/payments/NOPE/verify": { status: 404, body: { message: "Payment not found.", code: "PAYMENT_NOT_FOUND" } } });
    const { verifyPayment } = await import("./paymentsService");
    await expect(verifyPayment("NOPE")).rejects.toMatchObject({ status: 404, body: { code: "PAYMENT_NOT_FOUND" } });
  });

  it("reads a purchase with its payment summary, and the buyer's purchases paged", async () => {
    respond({
      "GET /api/checkout/transactions/x1": { status: 200, body: PURCHASE },
      "GET /api/checkout/transactions/mine?limit=10": { status: 200, body: { items: [PURCHASE], total: 11, cursor: "1", hasMore: true } },
    });
    const { fetchPurchase, fetchMyPurchases } = await import("./paymentsService");
    expect((await fetchPurchase("x1"))?.payment).toEqual(SUMMARY);
    expect(await fetchMyPurchases({ limit: 10 })).toMatchObject({ total: 11, cursor: "1", hasMore: true });
  });

  it("a purchase that isn't there is null", async () => {
    respond({});
    const { fetchPurchase } = await import("./paymentsService");
    expect(await fetchPurchase("missing")).toBeNull();
  });
});

describe("buyer refunds", () => {
  const REFUND = { status: "needs-attention", amount: 15000000, currency: "NGN", needsAccount: true, accountBankName: null, accountLast4: null, expectedAt: null, refundedAt: null };

  it("reads the refund; 404 REFUND_NOT_FOUND means 'being arranged' (null)", async () => {
    respond({
      "GET /api/payments/PAY-1/refund": { status: 200, body: REFUND },
      "GET /api/payments/PAY-2/refund": { status: 404, body: { message: "No refund.", code: "REFUND_NOT_FOUND" } },
    });
    const { fetchRefund } = await import("./paymentsService");
    expect(await fetchRefund("PAY-1")).toEqual(REFUND);
    expect(await fetchRefund("PAY-2")).toBeNull();
  });

  it("a payment that isn't the buyer's is an error, not 'being arranged'", async () => {
    respond({ "GET /api/payments/PAY-X/refund": { status: 404, body: { message: "Payment not found.", code: "PAYMENT_NOT_FOUND" } } });
    const { fetchRefund } = await import("./paymentsService");
    await expect(fetchRefund("PAY-X")).rejects.toMatchObject({ status: 404 });
  });

  it("lists banks once, and sends { bankCode, accountNumber } — no name", async () => {
    respond({
      "GET /api/payments/banks": { status: 200, body: [{ code: "058", name: "Guaranty Trust Bank" }] },
      "POST /api/payments/PAY-1/refund-account": { status: 200, body: { ...REFUND, accountBankName: "Guaranty Trust Bank", accountLast4: "7890" } },
    });
    const { fetchBanks, submitRefundAccount } = await import("./paymentsService");
    await fetchBanks();
    expect((await fetchBanks())[0].name).toBe("Guaranty Trust Bank");
    expect(calls.filter((c) => c.url === "/api/payments/banks")).toHaveLength(1);
    const r = await submitRefundAccount("PAY-1", { bankCode: "058", accountNumber: "0123457890" });
    expect(calls.at(-1)?.body).toEqual({ bankCode: "058", accountNumber: "0123457890" });
    expect(r).toMatchObject({ accountBankName: "Guaranty Trust Bank", accountLast4: "7890" });
  });

  it("each refusal lands on the field it's about", async () => {
    const { refundAccountErrors } = await import("../components/purchases/RefundPanel");
    const { ApiError } = await import("../lib/apiClient");
    const err = (code: string, extra: object = {}) => new ApiError(400, code === "VALIDATION_ERROR" ? "" : "msg", { code, ...extra } as never);
    expect(refundAccountErrors(err("ACCOUNT_NOT_RESOLVED")).accountNumber).toMatch(/couldn't find this account/);
    expect(refundAccountErrors(err("UNKNOWN_BANK")).bankCode).toBeTruthy();
    expect(refundAccountErrors(err("REFUND_NOT_AWAITING_ACCOUNT")).form).toMatch(/already been sent/);
    expect(refundAccountErrors(err("VALIDATION_ERROR", { fieldErrors: { accountNumber: "must be a 10-digit account number" } })))
      .toEqual({ bankCode: undefined, accountNumber: "must be a 10-digit account number", form: undefined });
  });
});

describe("developer finance", () => {
  const ITEM = { transactionId: "x1", transactionReference: "LV-1", estateId: "e1", estateName: "Lugbe", plotId: "p1", plotLabel: "Block A, Plot 1",
    buyerEmail: "b@x.com", expectedAmount: 15000000, currency: "NGN", awaitingSince: "2026-10-09T10:00:00Z",
    payment: { reference: "PAY-1", amountPaid: 15000000, currency: "NGN", channel: "bank_transfer", paidAt: "2026-10-09T09:59:00Z", last4: "7890", gatewayResponse: "Successful" },
    amountsMatch: true };

  it("reads the queue, verifies with no body, rejects with { reason }", async () => {
    respond({
      "GET /api/portal/finance/transactions": { status: 200, body: [ITEM] },
      "POST /api/portal/finance/transactions/x1/verify": { status: 200, body: { transactionId: "x1", status: "verified" } },
      "POST /api/portal/finance/transactions/x2/reject": { status: 200, body: { transactionId: "x2", status: "rejected" } },
    });
    const { fetchFinanceQueue, verifyPurchase, rejectPurchase } = await import("./financeService");
    expect(await fetchFinanceQueue()).toEqual([ITEM]);
    expect(await verifyPurchase("x1")).toEqual({ transactionId: "x1", status: "verified" });
    expect(calls[1].body).toBeUndefined();
    await rejectPurchase("x2", "Paid from a third party's account");
    expect(calls[2].body).toEqual({ reason: "Paid from a third party's account" });
  });

  it("late payments: allocate with no body, refund with { reason }", async () => {
    respond({
      "GET /api/portal/finance/late-payments": { status: 200, body: [] },
      "POST /api/portal/finance/late-payments/x3/allocate": { status: 200, body: { transactionId: "x3", status: "verified" } },
      "POST /api/portal/finance/late-payments/x4/refund": { status: 200, body: { transactionId: "x4", status: "refund_due" } },
    });
    const { fetchLatePayments, allocateLatePayment, refundLatePayment } = await import("./financeService");
    expect(await fetchLatePayments()).toEqual([]);
    expect((await allocateLatePayment("x3")).status).toBe("verified");
    expect((await refundLatePayment("x4", "Plot sold to another buyer")).status).toBe("refund_due");
    expect(calls[2].body).toEqual({ reason: "Plot sold to another buyer" });
  });

  it("payouts are read from /api/portal/payouts", async () => {
    respond({ "GET /api/portal/payouts": { status: 200, body: [] } });
    const { fetchCompanyPayouts } = await import("./financeService");
    expect(await fetchCompanyPayouts()).toEqual([]);
    expect(calls[0].url).toBe("/api/portal/payouts");
  });

  it("never calls a bank account a card", async () => {
    const { paidWithLabel } = await import("./financeService");
    expect(paidWithLabel("card", "4081")).toBe("card ending 4081");
    expect(paidWithLabel("bank_transfer", "7890")).toBe("account ending 7890");
    expect(paidWithLabel("ussd", null)).toBe("ussd");
    expect(paidWithLabel(null, null)).toBeNull();
  });

  it("every refusal says nothing was changed", async () => {
    const { financeErrorMessage } = await import("../pages/portal/finance/PortalFinance");
    const { ApiError } = await import("../lib/apiClient");
    for (const code of ["TRANSACTION_NOT_AWAITING_FINANCE", "PAYMENT_NOT_CONFIRMED", "PLOT_NOT_RESERVED", "PLOT_NO_LONGER_AVAILABLE"]) {
      expect(financeErrorMessage(new ApiError(409, "x", { code } as never))).toMatch(/Nothing was changed/);
    }
    expect(financeErrorMessage(new ApiError(403, "x", { code: "OWN_PURCHASE" } as never))).toMatch(/your own purchase/);
  });
});

describe("the company's payout account", () => {
  const ACC = { id: "sa1", bankCode: "058", bankName: "Guaranty Trust Bank", accountNumber: "0123451234", accountName: "ESTINTIN GROUP LIMITED",
    currency: "NGN", status: "pending", submittedAt: "2026-10-09T10:00:00Z", decidedAt: null, decisionNote: null };

  it("reads { approved, pending, history }, lists banks, submits { bankCode, accountNumber } only, withdraws with no body", async () => {
    respond({
      "GET /api/portal/settlement/account": { status: 200, body: { approved: null, pending: ACC, history: [ACC] } },
      "GET /api/portal/settlement/banks": { status: 200, body: [{ code: "058", name: "Guaranty Trust Bank" }] },
      "POST /api/portal/settlement/account": { status: 201, body: ACC },
      "POST /api/portal/settlement/account/sa1/withdraw": { status: 200, body: { ...ACC, status: "withdrawn" } },
    });
    const s = await import("./settlementService");
    expect((await s.fetchCompanySettlement()).pending?.accountName).toBe("ESTINTIN GROUP LIMITED");
    expect(await s.fetchSettlementBanks()).toHaveLength(1);
    await s.submitSettlementAccount({ bankCode: "058", accountNumber: "0123451234" });
    expect(calls[2].body).toEqual({ bankCode: "058", accountNumber: "0123451234" });
    expect((await s.withdrawSettlementAccount("sa1")).status).toBe("withdrawn");
    expect(calls[3].body).toBeUndefined();
  });

  it("refusals land on the right field — shared ones and the account's own", async () => {
    const { payoutAccountErrors } = await import("../pages/portal/finance/PayoutAccount");
    const { ApiError } = await import("../lib/apiClient");
    const e = (status: number, code: string) => new ApiError(status, "backend says", { code } as never);
    expect(payoutAccountErrors(e(400, "ACCOUNT_NOT_RESOLVED")).accountNumber).toMatch(/couldn't find/);
    expect(payoutAccountErrors(e(400, "SETTLEMENT_ACCOUNT_UNCHANGED")).form).toBe("That's already your approved payout account.");
    expect(payoutAccountErrors(e(409, "SETTLEMENT_ACCOUNT_PENDING")).form).toMatch(/Withdraw it first/);
    expect(payoutAccountErrors(e(403, "SETTLEMENT_REQUIRES_COMPANY_WIDE_SCOPE")).form).toMatch(/company-wide/);
  });
});

describe("Super Admin payout-account review", () => {
  const ACC = { id: "sa1", bankCode: "058", bankName: "GTB", accountNumber: "0123451234", accountName: "CHIDI OKEKE", currency: "NGN",
    status: "pending", submittedAt: "2026-10-09T10:00:00Z", decidedAt: null, decisionNote: null };
  const REVIEW = { tenantId: "t1", registeredName: "Estintin Group Limited", tradingName: null, account: ACC, nameMatchesCompany: false,
    onboardingBankName: null, onboardingAccountNumber: null, onboardingAccountName: null, matchesOnboardingAccount: null, currentApproved: null };

  it("lists by ?status=, approves with no body, rejects with { reason }", async () => {
    respond({
      "GET /api/admin/settlement-accounts?status=pending": { status: 200, body: [REVIEW] },
      "GET /api/admin/settlement-accounts?status=all": { status: 200, body: [REVIEW] },
      "POST /api/admin/settlement-accounts/sa1/approve": { status: 200, body: { ...REVIEW, account: { ...ACC, status: "approved" } } },
      "POST /api/admin/settlement-accounts/sa2/reject": { status: 200, body: { ...REVIEW, account: { ...ACC, id: "sa2", status: "rejected" } } },
    });
    const s = await import("./settlementService");
    expect(await s.fetchSettlementReviews()).toEqual([REVIEW]);
    await s.fetchSettlementReviews("all");
    expect((await s.approveSettlementAccount("sa1")).account.status).toBe("approved");
    expect(calls[2].body).toBeUndefined();
    await s.rejectSettlementAccount("sa2", "Account is in a person's name");
    expect(calls[3].body).toEqual({ reason: "Account is in a person's name" });
  });

  it("refusals say what happened", async () => {
    const { reviewErrorMessage } = await import("../pages/admin/payments/PayoutAccounts");
    const { ApiError } = await import("../lib/apiClient");
    expect(reviewErrorMessage(new ApiError(409, "x", { code: "SETTLEMENT_ACCOUNT_NOT_PENDING" } as never))).toMatch(/already been decided/);
    expect(reviewErrorMessage(new ApiError(503, "x", { code: "PAYMENT_PROVIDER_UNAVAILABLE" } as never))).toMatch(/Nothing was changed/);
  });
});

describe("Super Admin payouts", () => {
  const PAYOUT = { id: "po1", transactionId: "x1", tenantId: "t1", amount: 7500000, currency: "NGN", partNumber: 1, partCount: 2, status: "awaiting_otp",
    reference: "PO-1", gatewayMessage: null, bankName: "GTB", accountLast4: "1234", createdAt: "2026-10-09T10:00:00Z", transferredAt: null, reviewReason: null };

  it("ready list, history by ?status=, send { transactionId }, otp { otp }, resend and cancel with no body", async () => {
    respond({
      "GET /api/admin/payouts/ready": { status: 200, body: [] },
      "GET /api/admin/payouts?status=awaiting_otp": { status: 200, body: [PAYOUT] },
      "POST /api/admin/payouts": { status: 200, body: PAYOUT },
      "POST /api/admin/payouts/po1/otp": { status: 200, body: { ...PAYOUT, status: "pending" } },
      "POST /api/admin/payouts/po1/resend-otp": { status: 200, body: PAYOUT },
      "POST /api/admin/payouts/po1/cancel": { status: 200, body: { ...PAYOUT, status: "cancelled" } },
    });
    const s = await import("./adminPayoutsService");
    expect(await s.fetchReadyPayouts()).toEqual([]);
    expect(await s.fetchPayoutHistory("awaiting_otp")).toHaveLength(1);
    expect((await s.sendPayout("x1")).status).toBe("awaiting_otp");
    expect(calls[2].body).toEqual({ transactionId: "x1" });
    expect((await s.submitPayoutOtp("po1", "123456")).status).toBe("pending");
    expect(calls[3].body).toEqual({ otp: "123456" });
    await s.resendPayoutOtp("po1");
    expect((await s.cancelPayout("po1")).status).toBe("cancelled");
    expect([calls[4].body, calls[5].body]).toEqual([undefined, undefined]);
  });

  it("says what happened — two-factor, a refused code, an unknown outcome", async () => {
    const { payoutProblem, sentMessage } = await import("../pages/admin/payments/Payouts");
    const { ApiError } = await import("../lib/apiClient");
    const e = (status: number, code: string, message = "x") => new ApiError(status, message, { code } as never);
    expect(payoutProblem(e(403, "TWO_FACTOR_REQUIRED"))).toEqual({ message: "Turn on two-factor authentication to send payouts.", needsTwoFactor: true });
    expect(payoutProblem(e(400, "OTP_REJECTED", "Invalid OTP")).message).toBe("Invalid OTP");
    expect(payoutProblem(e(503, "PAYOUT_OUTCOME_UNKNOWN")).message).toMatch(/safe to press Pay out again/);
    expect(payoutProblem(e(502, "PAYMENT_PROVIDER_REFUSED", "Your balance is not enough")).message).toMatch(/“Your balance is not enough”/);
    expect(sentMessage({ ...PAYOUT, status: "success" } as never)).toBe("Paid — ₦7,500,000 (part 1 of 2) has been transferred.");
    expect(sentMessage({ ...PAYOUT, status: "pending" } as never)).toMatch(/is with the bank/);
  });
});

describe("Super Admin refunds", () => {
  const REFUND = { id: "rf1", paymentId: "pm1", paymentReference: "PAY-1", transactionId: "x1", buyerName: "Ada", buyerEmail: "a@x.com", amount: 15000000,
    currency: "NGN", status: "needs-attention", gatewayMessage: null, reason: "Refund due", createdAt: "2026-10-09T10:00:00Z", expectedAt: null, refundedAt: null,
    account: null, accountNameMatchesBuyer: null };

  it("due list, all by ?status= (hyphenated), start with { paymentReference }, send-to-account with no body", async () => {
    respond({
      "GET /api/admin/refunds/due": { status: 200, body: [] },
      "GET /api/admin/refunds?status=needs-attention": { status: 200, body: [REFUND] },
      "POST /api/admin/refunds": { status: 200, body: REFUND },
      "POST /api/admin/refunds/rf1/send-to-account": { status: 200, body: { ...REFUND, status: "processing" } },
    });
    const s = await import("./adminPayoutsService");
    expect(await s.fetchRefundsDue()).toEqual([]);
    expect(await s.fetchRefunds("needs-attention")).toHaveLength(1);
    await s.startRefund("PAY-1");
    expect(calls[2].body).toEqual({ paymentReference: "PAY-1" });
    expect((await s.sendRefundToAccount("rf1")).status).toBe("processing");
    expect(calls[3].body).toBeUndefined();
  });

  it("says what happened", async () => {
    const { refundProblem, refundStartedMessage } = await import("../pages/admin/payments/Refunds");
    const { ApiError } = await import("../lib/apiClient");
    const e = (status: number, code: string) => new ApiError(status, "x", { code } as never);
    expect(refundProblem(e(403, "TWO_FACTOR_REQUIRED")).needsTwoFactor).toBe(true);
    expect(refundProblem(e(503, "REFUND_OUTCOME_UNKNOWN")).message).toMatch(/kept as sending/);
    expect(refundProblem(e(409, "REFUND_ACCOUNT_MISSING")).message).toMatch(/hasn't given an account/);
    expect(refundStartedMessage(REFUND as never)).toMatch(/asked for an account/);
  });
});

describe("the dashboard's live attention list: purchases still under way", () => {
  const purchase = (id: string, status: string, payment: Record<string, unknown> | null = null) => ({
    id, reference: `LV-${id}`, estateId: "e1", plotId: "p1", reservationId: "r1", basePrice: 5_000_000, cornerPremiumPct: null,
    totalPrice: 5_000_000, currency: "NGN", intent: "development", plan: "outright", installmentMonths: null, status,
    createdAt: "2026-10-19T09:00:00Z", payment,
  });
  const plotDto = { id: "p1", plotNumber: "7", blockName: "Block A", availability: "UNAVAILABLE", isCorner: false, priceTierId: "t1", nominalSizeSqm: 500, actualAreaSqm: 500, hasBoundary: true };

  it("lists paying, verifying and refunds by plot; leaves finished and ended purchases out", async () => {
    respond({
      "GET /api/checkout/transactions/mine?limit=50": { status: 200, body: { items: [
        purchase("a", "pending_payment"),
        purchase("b", "awaiting_finance"),
        purchase("c", "verified"),
        purchase("d", "abandoned"),
        purchase("e", "rejected", { status: "succeeded", amountPaid: 5_000_000, refundStatus: "processing", underReview: false, reviewKind: null }),
      ], total: 5, cursor: null, hasMore: false } },
      "GET /api/marketplace/estates/e1": { status: 200, body: LISTING },
      "GET /api/marketplace/estates/e1/plots?limit=500": { status: 200, body: { items: [plotDto], total: 1, cursor: null, hasMore: false } },
    });
    const { fetchPurchaseAttention } = await import("./attentionService");
    const items = await fetchPurchaseAttention();
    expect(items.map((i) => [i.id, i.stage, i.severity, i.targetRoute])).toEqual([
      ["purchase:a", "pay", "urgent", "/purchases/a"],
      ["purchase:b", "verifying", "normal", "/purchases/b"],
      ["purchase:e", "refund", "normal", "/purchases/e"],
    ]);
    expect(items[0].title).toBe("Palm Grove — Block A, Plot 7");
    expect(items[0].actionLabel).toBe("Pay now");
    expect(items[2].detail).toBe("Your refund is on its way.");
  });

  it("says nothing when no purchase is open, and names the estate alone if the plot can't be found", async () => {
    respond({
      "GET /api/checkout/transactions/mine?limit=50": { status: 200, body: { items: [purchase("b", "payment_received")], total: 1, cursor: null, hasMore: false } },
      "GET /api/marketplace/estates/e1": { status: 200, body: LISTING },
    });
    const { fetchPurchaseAttention } = await import("./attentionService");
    expect((await fetchPurchaseAttention()).map((i) => i.title)).toEqual(["Palm Grove"]);
  });
});
