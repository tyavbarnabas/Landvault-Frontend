// The buyer's address (backend changeset 097): the live contract against a
// stubbed fetch, the demo mode's copy of the backend's rules, and checkout's
// ADDRESS_REQUIRED gate.

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

const BUYER = { email: "ada@example.com", address: null };
const LAGOS = { line1: "3 Admiralty Way", line2: null, city: "Lekki", state: "Lagos", postalCode: null, country: "NG", countryName: "Nigeria", updatedAt: "2026-10-21T09:00:00Z" };

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

  it("204 means no address yet", async () => {
    respond({ "GET /api/me/address": { status: 204 } });
    const { fetchAddress } = await import("./addressService");
    expect(await fetchAddress(BUYER)).toBeNull();
  });

  it("saves the whole address, trimmed, with blank optional fields left out", async () => {
    respond({ "PUT /api/me/address": { status: 200, body: LAGOS } });
    const { saveAddress } = await import("./addressService");
    const saved = await saveAddress(BUYER, { line1: " 3 Admiralty Way ", line2: "  ", city: "Lekki", state: "Lagos State", postalCode: "", country: "ng" });
    expect(calls[0]).toMatchObject({ method: "PUT", url: "/api/me/address" });
    expect(calls[0].body).toEqual({ line1: "3 Admiralty Way", city: "Lekki", state: "Lagos State", country: "NG" });
    expect(saved.state).toBe("Lagos");
  });

  it("puts the backend's errors under the right fields", async () => {
    respond({ "PUT /api/me/address": { status: 400, body: { code: "UNKNOWN_STATE", message: "Unknown state", fieldErrors: { state: "Not a Nigerian state" } } } });
    const { saveAddress, addressErrors } = await import("./addressService");
    const err = await saveAddress(BUYER, { line1: "1 A St", city: "Ikeja", state: "Atlantis", country: "NG" }).catch((e) => e);
    expect(addressErrors(err)).toEqual({ fields: { state: "Not a Nigerian state" }, message: "" });
  });
});

describe("demo mode", () => {
  beforeEach(() => vi.stubEnv("VITE_API_BASE_URL", ""));

  it("accepts a state's aliases and returns its canonical name", async () => {
    const { saveAddress } = await import("./addressService");
    for (const [typed, canonical] of [["lagos", "Lagos"], ["Lagos State", "Lagos"], ["NG-LA", "Lagos"], ["FCT", "Federal Capital Territory (Abuja)"], ["Abuja", "Federal Capital Territory (Abuja)"]]) {
      const saved = await saveAddress(BUYER, { line1: "1 A St", city: "Ikeja", state: typed, country: "NG" });
      expect(saved.state).toBe(canonical);
    }
  });

  it("refuses an unknown Nigerian state, but takes any region abroad", async () => {
    const { saveAddress, addressErrors } = await import("./addressService");
    const err = await saveAddress(BUYER, { line1: "1 A St", city: "Ikeja", state: "Greater London", country: "NG" }).catch((e) => e);
    expect(err.body.code).toBe("UNKNOWN_STATE");
    expect(addressErrors(err).fields.state).toBeTruthy();
    const abroad = await saveAddress(BUYER, { line1: "14 Ashdown Road", city: "London", state: "Greater London", postalCode: "SE18 3LP", country: "GB" });
    expect(abroad).toMatchObject({ state: "Greater London", countryName: "United Kingdom", line2: null });
  });

  it("refuses an unknown country and missing fields, per field", async () => {
    const { saveAddress } = await import("./addressService");
    const country = await saveAddress(BUYER, { line1: "1 A St", city: "X", state: "Y", country: "ZZ" }).catch((e) => e);
    expect(country.body).toMatchObject({ code: "UNKNOWN_COUNTRY", fieldErrors: { country: expect.any(String) } });
    const missing = await saveAddress(BUYER, { line1: "", city: "", state: "Lagos", country: "NG" }).catch((e) => e);
    expect(missing.body.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(missing.body.fieldErrors).sort()).toEqual(["city", "line1"]);
  });

  it("checkout refuses a buyer with no address, then copies the address once saved", async () => {
    const { initiateTransaction } = await import("./marketplaceCheckoutService");
    const { saveAddress } = await import("./addressService");
    const input = {
      listingId: "e1", listingName: "Palm Grove", plotId: "p1", plotLabel: "Plot 1", sizeSqm: 500, actualAreaSqm: 500, isCorner: false,
      basePrice: 1, titleType: "C of O", location: "Lekki", reservationId: "r1", tierId: "t1", intent: "development" as const,
      plan: "outright" as const, currency: "NGN" as const, amountDue: 1, totalPrice: 1, buyer: { email: "new@example.com", address: null },
    };
    await expect(initiateTransaction(input)).rejects.toMatchObject({ status: 409, body: { code: "ADDRESS_REQUIRED" } });
    await saveAddress(input.buyer, { line1: "3 Admiralty Way", city: "Lekki", state: "lagos", country: "NG" });
    const txn = await initiateTransaction(input);
    expect(txn.buyerAddress).toEqual({ line1: "3 Admiralty Way", line2: null, city: "Lekki", state: "Lagos", postalCode: null, country: "NG" });
    expect(txn).not.toHaveProperty("buyer");
  });
});

describe("addressLines", () => {
  it("prints the address as the letter does, skipping blank lines", async () => {
    const { addressLines } = await import("./addressService");
    expect(addressLines({ line1: "3 Admiralty Way", line2: null, city: "Lekki", state: "Lagos", postalCode: null, country: "NG" }))
      .toEqual(["3 Admiralty Way", "Lekki, Lagos", "Nigeria"]);
  });
});
