// The wishlist against the backend's contract (/api/marketplace/wishlist),
// the demo store that stands in for it, and the "since saved" rule: compare
// only within one currency, never show priceAtSave as the price.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { WishlistItem } from "./marketplaceService";

type Call = { url: string; method: string };
let calls: Call[];

function respond(routes: Record<string, { status: number; body?: unknown }>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = url.replace("http://api.test", "");
    const method = (init.method ?? "GET").toUpperCase();
    calls.push({ url: path, method });
    const hit = routes[`${method} ${path}`];
    if (!hit) return new Response(JSON.stringify({ message: "No such route", code: "NOT_FOUND" }), { status: 404 });
    return new Response(hit.body === undefined ? null : JSON.stringify(hit.body), { status: hit.status });
  }));
}

const ESTATE = "5b0d6c1e-8f0a-4f3e-9a2b-1c2d3e4f5a6b";
const item = (over: Partial<WishlistItem> = {}): WishlistItem => ({
  listingType: "primary", listingId: ESTATE, name: "Lugbe Demo Gardens", savedAt: "2026-10-20T09:00:00Z",
  priceAtSave: 8_000_000, currency: "NGN", available: true, currentPrice: 7_000_000, currentCurrency: "NGN", plotsRemaining: 4, ...over,
});

describe("priceChangeSinceSaved", () => {
  it("is the move in one currency", async () => {
    const { priceChangeSinceSaved } = await import("./marketplaceService");
    expect(priceChangeSinceSaved(item())).toBe(-1_000_000);
  });
  it("shows nothing when the currencies differ or a price is missing", async () => {
    const { priceChangeSinceSaved } = await import("./marketplaceService");
    expect(priceChangeSinceSaved(item({ currentCurrency: "USD", currentPrice: 5_000 }))).toBeNull();
    expect(priceChangeSinceSaved(item({ priceAtSave: null, currency: null }))).toBeNull();
    expect(priceChangeSinceSaved(item({ available: false, currentPrice: null, currentCurrency: null, plotsRemaining: null }))).toBeNull();
  });
});

describe("live wishlist", () => {
  beforeEach(() => {
    calls = [];
    const store = new Map([["auth_token", "access-1"]]);
    vi.stubEnv("VITE_API_BASE_URL", "http://api.test");
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    vi.stubGlobal("window", { location: { pathname: "/wishlist", search: "", assign: vi.fn() } });
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reads, saves and removes through the account's wishlist", async () => {
    respond({
      "GET /api/marketplace/wishlist": { status: 200, body: [item()] },
      [`PUT /api/marketplace/wishlist/primary/${ESTATE}`]: { status: 201, body: item() },
      [`DELETE /api/marketplace/wishlist/primary/${ESTATE}`]: { status: 204 },
    });
    const { fetchWishlist, saveToWishlist, removeFromWishlist } = await import("./wishlistService");
    expect(await fetchWishlist()).toEqual([item()]);
    expect((await saveToWishlist("primary", ESTATE)).name).toBe("Lugbe Demo Gardens");
    await removeFromWishlist("primary", ESTATE);
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      "GET /api/marketplace/wishlist",
      `PUT /api/marketplace/wishlist/primary/${ESTATE}`,
      `DELETE /api/marketplace/wishlist/primary/${ESTATE}`,
    ]);
  });

  it("names the backend's refusals", async () => {
    respond({ [`PUT /api/marketplace/wishlist/primary/${ESTATE}`]: { status: 409, body: { message: "Full", code: "WISHLIST_FULL" } } });
    const { saveToWishlist, wishlistErrorMessage } = await import("./wishlistService");
    const err = await saveToWishlist("primary", ESTATE).catch((e) => e);
    expect(wishlistErrorMessage(err)).toMatch(/full \(200 saved\)/);
  });
});

describe("demo wishlist", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_API_BASE_URL", "");
    vi.resetModules();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("saves once, with today's price, and forgets on removal", async () => {
    const { ESTATES } = await import("../data/mockData");
    const { projectListing } = await import("./marketplaceService");
    const listed = ESTATES.find((e) => projectListing(e));
    expect(listed).toBeTruthy();
    const { fetchWishlist, saveToWishlist, removeFromWishlist } = await import("./wishlistService");
    const first = await saveToWishlist("primary", listed!.id);
    const again = await saveToWishlist("primary", listed!.id);
    expect(again.savedAt).toBe(first.savedAt);
    expect(first.available).toBe(true);
    expect(first.priceAtSave).toBe(first.currentPrice);
    expect((await fetchWishlist()).map((w) => w.listingId)).toEqual([listed!.id]);
    await removeFromWishlist("primary", listed!.id);
    expect(await fetchWishlist()).toEqual([]);
  });

  it("refuses a listing that isn't on the marketplace", async () => {
    const { saveToWishlist } = await import("./wishlistService");
    const err = await saveToWishlist("primary", "no-such-estate").catch((e) => e);
    expect(err.body.code).toBe("LISTING_NOT_FOUND");
  });
});
