// Real-mode contract tests for change-password and inventory editing.
//
// Every other service test runs in mock mode, which never talks to the
// backend — so a wrong path, a wrong status code or a 401 handled as an
// expired session would pass there and fail on the first real request. These
// run the real branch against a stubbed fetch, with responses transcribed from
// AuthController, PortalEstateController and InventoryExceptionHandler.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

type Call = { url: string; method: string; body: unknown; auth: string | null; contentType?: string };

let calls: Call[];
let store: Map<string, string>;
let assign: ReturnType<typeof vi.fn>;

function respond(routes: Record<string, { status: number; body?: unknown }>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = url.replace("http://api.test", "");
    const method = (init.method ?? "GET").toUpperCase();
    const headers = (init.headers ?? {}) as Record<string, string>;
    // A FormData body (a file upload) is kept as-is; anything else is JSON.
    const body = init.body instanceof FormData ? init.body : init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url: path, method, body, auth: headers.Authorization ?? null, ...(headers["Content-Type"] ? { contentType: headers["Content-Type"] } : {}) });
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
      body: { currentPassword: "temp-123", newPassword: "mine-now" }, auth: "Bearer access-1", contentType: "application/json",
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
    // Open: retiredAt null on the wire stays null.
    expect(tier.retiredAt).toBeNull();
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

describe("retired tiers against the real backend", () => {
  it("carries retiredAt through, and a retired tier is never offered to a new plot", async () => {
    respond({
      "GET /api/portal/estates/e1": { status: 200, body: {
        blocks: [], plotCounts: { total: 3, byStatus: { sold: 3 } },
        priceTiers: [
          { id: "open", estateId: "e1", tierType: "land_size", sizeSqm: 300, price: 1, currency: "NGN", label: null, retiredAt: null },
          { id: "old", estateId: "e1", tierType: "land_size", sizeSqm: 600, price: 2, currency: "NGN", label: null, retiredAt: "2026-10-03T10:00:00Z" },
        ],
      } },
      "GET /api/portal/estates/e1/price-tiers/open/impact": { status: 200, body: { tierId: "open", plots: { total: 0, byStatus: {} } } },
      "GET /api/portal/estates/e1/price-tiers/old/impact": { status: 200, body: { tierId: "old", plots: { total: 3, byStatus: { sold: 3 } } } },
    });
    const { fetchPriceTiers, openTiers } = await import("./portalInventoryService");

    const tiers = await fetchPriceTiers("e1", { tenantId: "x" });
    // Still listed, with its plots: retirement is not deletion.
    expect(tiers.find((t) => t.id === "old")).toMatchObject({ retiredAt: "2026-10-03T10:00:00Z", plotCount: 3 });
    expect(openTiers(tiers).map((t) => t.id)).toEqual(["open"]);
  });
});

// ─── Slice 3 and estate editing, against the real endpoints ──────────────────

describe("creating an estate sends the boundary as `footprint`", () => {
  it("never `boundary`, which the backend silently dropped", async () => {
    respond({ "POST /api/portal/estates": { status: 201, body: { id: "e9", tenantId: "t", branchId: "b", name: "N", slug: "n", hasFootprint: true } } });
    const { createPortalEstate } = await import("./portalEstatesService");
    const polygon = { type: "Polygon" as const, coordinates: [[[7.4, 9.1], [7.41, 9.1], [7.41, 9.11], [7.4, 9.1]]] as [number, number][][] };

    await createPortalEstate({
      name: "N", description: "", area: "", city: "", state: "Lagos", address: "", cornerPremiumPct: 0, amenities: [], branchId: "b", boundary: polygon,
    }, { tenantId: "t" });

    expect(calls[0].body).toMatchObject({ footprint: polygon });
    expect(calls[0].body).not.toHaveProperty("boundary");
  });
});

describe("plot status against the real endpoint", () => {
  it("PUTs one plot's status and maps a 409 PLOT_NOT_EDITABLE to a form message", async () => {
    respond({ "PUT /api/portal/estates/e1/plots/p1/status": { status: 409, body: { code: "PLOT_NOT_EDITABLE", message: "A reserved plot can't be changed here." } } });
    const { changePlotStatus } = await import("./portalInventoryService");

    const err = await changePlotStatus("e1", "p1", { status: "withheld", reason: "Survey dispute" }, { tenantId: "x" }).catch((e) => e);

    expect(calls[0].body).toEqual({ status: "withheld", reason: "Survey dispute" });
    expect(err).toMatchObject({ code: "PLOT_NOT_EDITABLE", message: "A reserved plot can't be changed here." });
  });

  it("POSTs a bulk change with dryRun, and returns skip-and-report as-is", async () => {
    const reply = { status: "withheld", requested: 2, changed: ["p1"], dryRun: true,
      skipped: [{ plotId: "p2", plotNumber: "7", currentStatus: "reserved", code: "RESERVED", reason: "Reserved." }] };
    respond({ "POST /api/portal/estates/e1/plots/status": { status: 200, body: reply } });
    const { changePlotStatuses } = await import("./portalInventoryService");

    const result = await changePlotStatuses("e1", { plotIds: ["p1", "p2"], status: "withheld", dryRun: true }, { tenantId: "x" });

    expect(calls[0].body).toEqual({ plotIds: ["p1", "p2"], status: "withheld", dryRun: true });
    expect(result).toEqual(reply);
  });

  it("retire and reinstate are POSTs to their own routes", async () => {
    respond({
      "POST /api/portal/estates/e1/price-tiers/t1/retire": { status: 200, body: { id: "t1", retiredAt: "2026-10-04T00:00:00Z" } },
      "POST /api/portal/estates/e1/price-tiers/t1/reinstate": { status: 200, body: { id: "t1", retiredAt: null } },
    });
    const { setTierRetired } = await import("./portalInventoryService");

    expect((await setTierRetired("e1", "t1", true, { tenantId: "x" })).retiredAt).not.toBeNull();
    expect((await setTierRetired("e1", "t1", false, { tenantId: "x" })).retiredAt).toBeNull();
  });
});

describe("plot import against the real endpoint", () => {
  const REPORT = { featureCount: 1, importableCount: 0, canImport: false, imported: false, createdCount: 0, blocksToCreate: [],
    plotsPerTier: {}, errors: [{ feature: 1, plotNumber: "1", code: "UNKNOWN_TIER", message: "No such tier." }], warnings: [],
    plotOverlapsInEstate: null, note: null };

  it("uploads multipart — no JSON content type — with the options as form fields, not the query string", async () => {
    respond({ "POST /api/portal/estates/e1/plots/import/preview": { status: 200, body: REPORT } });
    const { previewPlotImport } = await import("./portalInventoryService");
    const file = new File(["{}"], "plots.geojson");

    await previewPlotImport("e1", file, { status: "available-inv", tierProperty: "size" }, { tenantId: "x" });

    const form = calls[0].body as FormData;
    expect(calls[0].url).toBe("/api/portal/estates/e1/plots/import/preview");
    expect(calls[0].contentType).toBeUndefined();
    expect(form.get("file")).toBeInstanceOf(File);
    expect(form.get("status")).toBe("available-inv");
    expect(form.get("tierProperty")).toBe("size");
    expect(form.get("plotNumberProperty")).toBe("plot_number");
  });

  it("a refused import (422) returns its report rather than throwing — the report is the answer", async () => {
    respond({ "POST /api/portal/estates/e1/plots/import": { status: 422, body: REPORT } });
    const { importPlots } = await import("./portalInventoryService");

    const report = await importPlots("e1", new File(["{}"], "plots.geojson"), { status: "available-dev" }, { tenantId: "x" });
    expect(report).toMatchObject({ imported: false, errors: [{ code: "UNKNOWN_TIER" }] });
  });

  it("the template comes back as text, ready to save as a file", async () => {
    respond({ "GET /api/portal/estates/e1/plots/import/template": { status: 200, body: { type: "FeatureCollection", features: [] } } });
    const { fetchPlotImportTemplate } = await import("./portalInventoryService");
    expect(JSON.parse(await fetchPlotImportTemplate("e1", { tenantId: "x" }))).toEqual({ type: "FeatureCollection", features: [] });
  });
});

describe("editing an estate and adding a boundary against the real endpoints", () => {
  it("PUTs only the changed fields, then re-reads the detail", async () => {
    respond({
      "PUT /api/portal/estates/e1": { status: 200, body: { id: "e1" } },
      "GET /api/portal/estates/e1": { status: 200, body: { id: "e1", tenantId: "t", branchId: "b", name: "Renamed", slug: "renamed",
        state: "Lagos", intent: "investment", plotCounts: null, priceTiers: [], amenities: [], eligibility: null, hasFootprint: false } },
    });
    const { updatePortalEstate } = await import("./portalEstatesService");

    const estate = await updatePortalEstate("e1", { name: "Renamed", intent: "investment" }, { tenantId: "t" });

    expect(calls[0]).toMatchObject({ method: "PUT", body: { name: "Renamed", intent: "investment" } });
    expect(estate).toMatchObject({ name: "Renamed", intent: "investment" });
  });

  it.each([
    [409, { code: "DUPLICATE_RECORD", message: "x" }, "name"],
    [400, { code: "UNKNOWN_STATE", message: "Unknown state 'Atlantis'." }, "state"],
  ])("a %i %o lands on the %s field", async (status, body, field) => {
    respond({ "PUT /api/portal/estates/e1": { status: status as number, body } });
    const { updatePortalEstate } = await import("./portalEstatesService");
    await expect(updatePortalEstate("e1", { name: "X" }, { tenantId: "t" })).rejects.toMatchObject({ field });
  });

  it("POSTs { footprint } to add a boundary and surfaces BOUNDARY_ALREADY_SET", async () => {
    respond({ "POST /api/portal/estates/e1/boundary": { status: 409, body: { code: "BOUNDARY_ALREADY_SET", message: "This estate already has a boundary." } } });
    const { addEstateBoundary } = await import("./portalEstatesService");
    const polygon = { type: "Polygon" as const, coordinates: [[[7.4, 9.1], [7.41, 9.1], [7.41, 9.11], [7.4, 9.1]]] as [number, number][][] };

    const err = await addEstateBoundary("e1", polygon, { tenantId: "t" }).catch((e) => e);

    expect(calls[0].body).toEqual({ footprint: polygon });
    expect(err).toMatchObject({ code: "BOUNDARY_ALREADY_SET", message: "This estate already has a boundary." });
  });
});

// ─── IE-9..IE-11 and SB-1, against the real endpoints ────────────────────────

describe("plot edits against the real endpoints", () => {
  const polygon = { type: "Polygon" as const, coordinates: [[[7.4, 9.1], [7.41, 9.1], [7.41, 9.11], [7.4, 9.1]]] as [number, number][][] };

  it("PUTs { footprint } to correct a boundary; PLOT_OUTSIDE_ESTATE lands on the footprint field", async () => {
    respond({ "PUT /api/portal/estates/e1/plots/p1/boundary": { status: 400, body: { code: "PLOT_OUTSIDE_ESTATE", message: "Falls outside the estate." } } });
    const { correctPlotBoundary } = await import("./portalInventoryService");

    const err = await correctPlotBoundary("e1", "p1", polygon, { tenantId: "x" }).catch((e) => e);
    expect(calls[0].body).toEqual({ footprint: polygon });
    expect(err).toMatchObject({ field: "footprint", code: "PLOT_OUTSIDE_ESTATE", message: "Falls outside the estate." });
  });

  it.each(["TIER_CURRENCY_MISMATCH", "TIER_RETIRED", "PROPERTY_TYPE_MISMATCH"])("a %s tier move lands on the tier field", async (code) => {
    respond({ "PUT /api/portal/estates/e1/plots/p1/tier": { status: 400, body: { code, message: "no" } } });
    const { movePlotToTier } = await import("./portalInventoryService");

    const err = await movePlotToTier("e1", "p1", { tierId: "t2" }, { tenantId: "x" }).catch((e) => e);
    expect(calls[0].body).toEqual({ tierId: "t2" });
    expect(err).toMatchObject({ field: "tierId", code });
  });

  it("withdraws with DELETE, and PLOT_HAS_HISTORY comes back with the server's reason", async () => {
    respond({ "DELETE /api/portal/estates/e1/plots/p1": { status: 409, body: { code: "PLOT_HAS_HISTORY", message: "Plot 4 has history. Withhold it instead." } } });
    const { withdrawPlot } = await import("./portalInventoryService");

    const err = await withdrawPlot("e1", "p1", { tenantId: "x" }).catch((e) => e);
    expect(calls[0].method).toBe("DELETE");
    expect(err).toMatchObject({ code: "PLOT_HAS_HISTORY", message: "Plot 4 has history. Withhold it instead." });
  });

  it("a successful withdrawal is a 204 with no body", async () => {
    respond({ "DELETE /api/portal/estates/e1/plots/p1": { status: 204 } });
    const { withdrawPlot } = await import("./portalInventoryService");
    await expect(withdrawPlot("e1", "p1", { tenantId: "x" })).resolves.toBeUndefined();
  });
});

describe("the state override against the real endpoints", () => {
  it("POSTs { reason } and DELETEs to clear", async () => {
    const recorded = { estateId: "e1", state: "Nasarawa", stateCode: "NG-NA", overriddenAt: "2026-10-04T10:00:00Z", overriddenBy: "u1", reason: "Title checked." };
    respond({
      "POST /api/admin/estates/e1/state-override": { status: 200, body: recorded },
      "DELETE /api/admin/estates/e1/state-override": { status: 200, body: { ...recorded, overriddenAt: null, overriddenBy: null, reason: null } },
    });
    const { setStateOverride, clearStateOverride } = await import("./estateStateOverrideService");

    expect(await setStateOverride("e1", " Title checked. ")).toEqual(recorded);
    expect(calls[0].body).toEqual({ reason: "Title checked." });
    expect((await clearStateOverride("e1")).overriddenAt).toBeNull();
    expect(calls[1].method).toBe("DELETE");
  });

  it("a 404 says the id is wrong, in words support can act on", async () => {
    respond({});
    const { setStateOverride } = await import("./estateStateOverrideService");
    await expect(setStateOverride("nope", "r")).rejects.toMatchObject({ code: "ESTATE_NOT_FOUND" });
  });
});

describe("the state check's refusal reaches the developer", () => {
  it("BOUNDARY_OUTSIDE_STATE on add-boundary keeps its code and the state it names", async () => {
    respond({ "POST /api/portal/estates/e1/boundary": { status: 400, body: { code: "BOUNDARY_OUTSIDE_STATE", message: "This boundary sits in Benue, not Federal Capital Territory (Abuja)." } } });
    const { addEstateBoundary } = await import("./portalEstatesService");
    const polygon = { type: "Polygon" as const, coordinates: [[[9.1, 7.4], [9.11, 7.4], [9.11, 7.41], [9.1, 7.4]]] as [number, number][][] };

    const err = await addEstateBoundary("e1", polygon, { tenantId: "t" }).catch((e) => e);
    expect(err).toMatchObject({ code: "BOUNDARY_OUTSIDE_STATE" });
    expect(err.message).toContain("Benue");
  });
});
