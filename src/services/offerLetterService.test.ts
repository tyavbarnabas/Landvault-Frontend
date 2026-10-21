// The offer letter (backend changeset 098): the live contract against a
// stubbed fetch, and the demo mode's copy of the backend's rules — an offer
// issued as the purchase opens, payment refused until it's accepted.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

type Call = { url: string; method: string; body: unknown };
let calls: Call[];

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

const SHOWN = {
  listingId: "e1", listingName: "Palm Grove", plotId: "p1", plotLabel: "Block A, Plot 1", sizeSqm: 500, actualAreaSqm: 500, isCorner: false,
  basePrice: 1, titleType: "C of O", location: "Lekki", reservationId: "r1", tierId: "t1", intent: "development" as const,
  plan: "outright" as const, currency: "NGN" as const, amountDue: 1, totalPrice: 1,
  buyer: { email: "ada@example.com", address: { line1: "3 Admiralty Way", line2: null, city: "Lekki", state: "Lagos", postalCode: null, country: "NG", countryName: "Nigeria", updatedAt: "2026-10-21T09:00:00Z" } },
};
const OFFER = { id: "o1", number: "HT-OFR-2026-000123", issuedAt: "2026-10-21T10:00:00Z", acceptedAt: null };
const TXN = { id: "x1", reference: "LV-1", estateId: "e1", plotId: "p1", reservationId: "r1", basePrice: 5_000_000, cornerPremiumPct: null,
  totalPrice: 5_000_000, intent: "development", plan: "outright", status: "pending_payment", createdAt: "2026-10-21T10:00:00Z", buyerAddress: null, offer: OFFER };

beforeEach(() => {
  calls = [];
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("live", () => {
  beforeEach(() => {
    const store = new Map([["auth_token", "access-1"]]);
    vi.stubEnv("VITE_API_BASE_URL", "http://api.test");
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
  });

  it("the opened purchase carries its offer", async () => {
    respond({ "POST /api/checkout/transactions": { status: 201, body: TXN } });
    const { initiateTransaction } = await import("./marketplaceCheckoutService");
    expect((await initiateTransaction(SHOWN)).offer).toEqual(OFFER);
  });

  it("an estate whose letter isn't approved refuses with LETTER_NOT_APPROVED", async () => {
    respond({ "POST /api/checkout/transactions": { status: 409, body: { code: "LETTER_NOT_APPROVED", message: "Not approved" } } });
    const { initiateTransaction } = await import("./marketplaceCheckoutService");
    await expect(initiateTransaction(SHOWN)).rejects.toMatchObject({ status: 409, body: { code: "LETTER_NOT_APPROVED" } });
  });

  it("accepting posts to the offer's accept route, with no body", async () => {
    respond({ "POST /api/documents/offer-letters/o1/accept": { status: 200, body: { id: "o1", type: "offer_letter", status: "accepted", acceptedAt: "2026-10-21T10:02:00Z" } } });
    const { acceptOffer } = await import("./offerLetterService");
    const doc = await acceptOffer("o1");
    expect(calls[0]).toMatchObject({ method: "POST", url: "/api/documents/offer-letters/o1/accept", body: undefined });
    expect(doc).toMatchObject({ status: "accepted", acceptedAt: "2026-10-21T10:02:00Z" });
  });

  it("a purchase no longer waiting for payment refuses with OFFER_NOT_OPEN", async () => {
    respond({ "POST /api/documents/offer-letters/o1/accept": { status: 409, body: { code: "OFFER_NOT_OPEN", message: "Not open" } } });
    const { acceptOffer, offerErrorCode } = await import("./offerLetterService");
    expect(offerErrorCode(await acceptOffer("o1").catch((e) => e))).toBe("OFFER_NOT_OPEN");
  });

  it("paying before accepting refuses with OFFER_NOT_ACCEPTED", async () => {
    respond({ "POST /api/transactions/x1/payments": { status: 409, body: { code: "OFFER_NOT_ACCEPTED", message: "Accept the offer" } } });
    const { startPayment } = await import("./paymentsService");
    const { paymentErrorMessage } = await import("../components/purchases/PayButton");
    const err = await startPayment("x1").catch((e) => e);
    expect(err.body.code).toBe("OFFER_NOT_ACCEPTED");
    expect(paymentErrorMessage(err)).toMatch(/Accept the offer letter/);
  });

  it("downloads the offer's PDF with the bearer token, named by its number", async () => {
    respond({ "GET /api/documents/offer-letters/o1/pdf": { status: 200, body: "pdf" } });
    const { fetchOfferFile } = await import("./offerLetterService");
    const file = await fetchOfferFile(OFFER, "pdf");
    expect(calls[0].url).toBe("/api/documents/offer-letters/o1/pdf");
    expect(file.name).toBe("HomeTrue-HT-OFR-2026-000123.pdf");
  });
});

describe("demo mode", () => {
  beforeEach(() => vi.stubEnv("VITE_API_BASE_URL", ""));

  it("issues an offer as the purchase opens, refuses payment until it's accepted, then pays", async () => {
    const { initiateTransaction, initiatePayment } = await import("./marketplaceCheckoutService");
    const { startPayment } = await import("./paymentsService");
    const { acceptOffer } = await import("./offerLetterService");
    const { fetchDocuments } = await import("./documentsService");

    const txn = await initiateTransaction(SHOWN);
    expect(txn.offer).toMatchObject({ number: expect.stringMatching(/^HT-OFR-\d{4}-\d{6}$/), acceptedAt: null });
    const listed = (await fetchDocuments()).items.find((d) => d.id === txn.offer!.id);
    expect(listed).toMatchObject({ type: "offer_letter", status: "issued", transactionId: txn.id });

    await expect(startPayment(txn.id)).rejects.toMatchObject({ body: { code: "OFFER_NOT_ACCEPTED" } });
    await expect(initiatePayment(txn.id, "paystack")).rejects.toMatchObject({ body: { code: "OFFER_NOT_ACCEPTED" } });

    const accepted = await acceptOffer(txn.offer!.id);
    expect(accepted).toMatchObject({ status: "accepted", acceptedAt: expect.any(String) });
    // Safe to retry: the same acceptance comes back.
    expect((await acceptOffer(txn.offer!.id)).acceptedAt).toBe(accepted.acceptedAt);
    expect((await fetchDocuments()).items.find((d) => d.id === txn.offer!.id)?.status).toBe("accepted");
    await expect(startPayment(txn.id)).resolves.toMatchObject({ status: "initialized" });
  });

  it("an offer can't be accepted once the purchase isn't waiting for payment", async () => {
    const { initiateTransaction, mockTransactionStore } = await import("./marketplaceCheckoutService");
    const { acceptOffer } = await import("./offerLetterService");
    const txn = await initiateTransaction(SHOWN);
    mockTransactionStore().get(txn.id)!.status = "abandoned";
    await expect(acceptOffer(txn.offer!.id)).rejects.toMatchObject({ status: 409, body: { code: "OFFER_NOT_OPEN" } });
  });

  it("an offer already accepted comes back as it is, even once the purchase has moved on", async () => {
    const { initiateTransaction, mockTransactionStore } = await import("./marketplaceCheckoutService");
    const { acceptOffer } = await import("./offerLetterService");
    const txn = await initiateTransaction(SHOWN);
    const first = await acceptOffer(txn.offer!.id);
    mockTransactionStore().get(txn.id)!.status = "awaiting_finance";
    expect((await acceptOffer(txn.offer!.id)).acceptedAt).toBe(first.acceptedAt);
  });

  it("the verify page sees an offer letter and its status", async () => {
    const { initiateTransaction } = await import("./marketplaceCheckoutService");
    const { acceptOffer } = await import("./offerLetterService");
    const { fetchDocuments, verifyDocument } = await import("./documentsService");
    const txn = await initiateTransaction(SHOWN);
    const code = (await fetchDocuments()).items.find((d) => d.id === txn.offer!.id)!.qrCode;
    expect(await verifyDocument(code)).toMatchObject({ documentType: "offer_letter", status: "issued" });
    await acceptOffer(txn.offer!.id);
    expect((await verifyDocument(code)).status).toBe("accepted");
  });
});

describe("offerState", () => {
  it("an abandoned or rejected purchase's offer has lapsed, accepted or not", async () => {
    const { offerState } = await import("./offerLetterService");
    expect(offerState({ acceptedAt: null }, "pending_payment")).toBe("waiting");
    expect(offerState({ acceptedAt: "2026-10-21T10:02:00Z" }, "awaiting_finance")).toBe("accepted");
    expect(offerState({ acceptedAt: "2026-10-21T10:02:00Z" }, "abandoned")).toBe("lapsed");
    expect(offerState({ acceptedAt: null }, "rejected")).toBe("lapsed");
  });
});
