// Real-mode contract tests for change-password and inventory editing.
//
// Every other service test runs in mock mode, which never talks to the
// backend — so a wrong path, a wrong status code or a 401 handled as an
// expired session would pass there and fail on the first real request. These
// run the real branch against a stubbed fetch, with responses transcribed from
// AuthController, PortalEstateController and InventoryExceptionHandler.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

type Call = { url: string; method: string; body: unknown; auth: string | null };

let calls: Call[];
let store: Map<string, string>;
let assign: ReturnType<typeof vi.fn>;

function respond(routes: Record<string, { status: number; body?: unknown }>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = url.replace("http://api.test", "");
    const method = (init.method ?? "GET").toUpperCase();
    const headers = (init.headers ?? {}) as Record<string, string>;
    calls.push({ url: path, method, body: init.body ? JSON.parse(String(init.body)) : undefined, auth: headers.Authorization ?? null });
    const hit = routes[`${method} ${path}`];
    if (!hit) return new Response(JSON.stringify({ message: "No such route", code: "NOT_FOUND" }), { status: 404 });
    return new Response(hit.body === undefined ? null : JSON.stringify(hit.body), { status: hit.status });
  }));
}

beforeEach(() => {
  calls = [];
  store = new Map([["auth_token", "access-1"]]);
  assign = vi.fn();
  vi.stubEnv("VITE_API_BASE_URL", "http://api.test");
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal("window", { location: { pathname: "/change-password", search: "", assign } });
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("change password against the real endpoint", () => {
  it("posts {currentPassword, newPassword} to /api/auth/change-password with the session token", async () => {
    respond({ "POST /api/auth/change-password": { status: 200, body: { message: "Your password has been changed." } } });
    const { changePassword } = await import("./authService");

    await changePassword({ currentPassword: "temp-123", newPassword: "mine-now" }, "admin@landvault.com");

    expect(calls).toEqual([{
      url: "/api/auth/change-password", method: "POST",
      body: { currentPassword: "temp-123", newPassword: "mine-now" }, auth: "Bearer access-1",
    }]);
    // No mailbox involved: neither reset endpoint is touched.
    expect(calls.some((c) => c.url.includes("forgot-password") || c.url.includes("reset-password"))).toBe(false);
  });

  it("a wrong current password (401) is an answer, not an expired session — no refresh, no sign-out", async () => {
    respond({ "POST /api/auth/change-password": { status: 401, body: { message: "Invalid email or password.", code: "INVALID_CREDENTIALS" } } });
    const { changePassword, errorCodeOf } = await import("./authService");

    const err = await changePassword({ currentPassword: "wrong", newPassword: "x" }, "a@b.c").catch((e) => e);

    expect(errorCodeOf(err)).toBe("INVALID_CREDENTIALS");
    expect(calls.map((c) => c.url)).toEqual(["/api/auth/change-password"]);
    expect(store.get("auth_token")).toBe("access-1");
    expect(assign).not.toHaveBeenCalled();
  });
});

describe("inventory reads use the endpoints that exist", () => {
  const TIER = { id: "t1", estateId: "e1", tierType: "land_size", sizeSqm: 450, price: 25_000_000, currency: "NGN", label: null };

  it("tiers and blocks come off the estate detail; plot counts off the tier's impact", async () => {
    respond({
      "GET /api/portal/estates/e1": { status: 200, body: {
        blocks: [{ id: "b1", estateId: "e1", name: "Block A", label: null }],
        priceTiers: [TIER],
        plotCounts: { total: 120, byStatus: { "available-dev": 112, reserved: 8 } },
      } },
      "GET /api/portal/estates/e1/price-tiers/t1/impact": { status: 200, body: { tierId: "t1", plots: { total: 120, byStatus: { "available-dev": 112, reserved: 8 } } } },
    });
    const { fetchBlocks, fetchPriceTiers, fetchPlotCounts } = await import("./portalInventoryService");
    const scope = { tenantId: "x" };

    const [tier] = await fetchPriceTiers("e1", scope);
    expect(tier).toMatchObject({ id: "t1", plotCount: 120, label: undefined });
    // Not on PriceTierDto, and not divided out here.
    expect(tier.pricePerSqm).toBeNull();
    expect(await fetchBlocks("e1", scope)).toEqual([{ id: "b1", estateId: "e1", name: "Block A", label: undefined }]);
    expect((await fetchPlotCounts("e1", scope)).total).toBe(120);

    // Never the list endpoints the backend doesn't have.
    expect(calls.some((c) => c.method === "GET" && /\/(blocks|price-tiers|plot-counts)$/.test(c.url))).toBe(false);
  });
});

describe("editing a price tier against the real endpoint", () => {
  const PATH = "PUT /api/portal/estates/e1/price-tiers/t1";

  it("sends a full round trip and passes sizeChange through untouched", async () => {
    const sizeChange = {
      previousSizeSqm: 450, newSizeSqm: 500, plotsUpdated: 104,
      keptPreviousSize: { total: 16, byStatus: { reserved: 8, sold: 8 } }, note: "Reserved and sold plots keep…",
    };
    respond({ [PATH]: { status: 200, body: { tier: { id: "t1" }, sizeChange } } });
    const { updatePriceTier } = await import("./portalInventoryService");

    const input = { price: 25_000_000, label: "", sizeSqm: 500, tierType: "land_size" as const, currency: "NGN" as const };
    const result = await updatePriceTier("e1", "t1", input, { tenantId: "x" });

    expect(calls[0].body).toEqual(input);
    expect(result.sizeChange).toEqual(sizeChange);
  });

  it.each([
    ["TIER_TYPE_IMMUTABLE", "tierType", "A tier's type cannot change. Create a new tier and move the plots to it."],
    ["TIER_CURRENCY_IMMUTABLE", "currency", "A tier's currency cannot change. Create a new tier in that currency and move the plots to it."],
  ])("maps a 400 %s onto the %s field with the server's reason", async (code, field, message) => {
    respond({ [PATH]: { status: 400, body: { message, code } } });
    const { updatePriceTier, InventoryEditError } = await import("./portalInventoryService");

    const err = await updatePriceTier("e1", "t1", { price: 1 }, { tenantId: "x" }).catch((e) => e);
    expect(err).toBeInstanceOf(InventoryEditError);
    expect(err).toMatchObject({ field, code, message });
  });

  it("maps a 409 onto the size field, never echoing a constraint name", async () => {
    respond({ [PATH]: { status: 409, body: { message: "That change conflicts with existing data (uq_price_tiers_estate_size).", code: "DUPLICATE_RECORD" } } });
    const { updatePriceTier } = await import("./portalInventoryService");

    const err = await updatePriceTier("e1", "t1", { sizeSqm: 600 }, { tenantId: "x" }).catch((e) => e);
    expect(err).toMatchObject({ field: "sizeSqm", code: "DUPLICATE_RECORD" });
    expect(err.message).not.toContain("uq_");
  });
});

describe("renaming a block against the real endpoint", () => {
  it("PUTs {name, label} and maps a 409 to a clean message on the name", async () => {
    respond({ "PUT /api/portal/estates/e1/blocks/b1": { status: 409, body: { message: "That change conflicts with existing data (uq_blocks_estate_name).", code: "DUPLICATE_RECORD" } } });
    const { updateBlock } = await import("./portalInventoryService");

    const err = await updateBlock("e1", "b1", { name: "Block B", label: "" }, { tenantId: "x" }).catch((e) => e);

    expect(calls[0]).toMatchObject({ method: "PUT", body: { name: "Block B", label: "" } });
    expect(err).toMatchObject({ field: "name", code: "DUPLICATE_RECORD" });
    expect(err.message).toBe('Another block on this estate is already called "Block B". Block names must be unique within an estate.');
  });
});
