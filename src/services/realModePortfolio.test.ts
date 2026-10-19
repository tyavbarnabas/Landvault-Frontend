// Real-mode contract tests for the buyer's portfolio. Responses are
// transcribed from the backend's OwnedPlotDto, PortfolioSummaryDto and its
// OWNED_PLOT_NOT_FOUND / INVALID_PARAMETER errors. Only outright purchases
// exist there today, so live mode must never touch the installment,
// payment or restructure routes, and never create or change ownership.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

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

beforeEach(() => {
  calls = [];
  const store = new Map([["auth_token", "access-1"]]);
  vi.stubEnv("VITE_API_BASE_URL", "http://api.test");
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  vi.stubGlobal("window", { location: { pathname: "/portfolio", search: "", assign: vi.fn() } });
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const TXN = "7c1f5a52-2f0b-4b0e-9d1c-0d3f6c0f1a01";
const PLOT = "a3e0b0c4-6f43-4b8d-8a51-6a3a3e9b2c10";

// A paid purchase finance hasn't verified: its id is the transaction id.
const pendingDto = {
  id: TXN, transactionId: TXN, estateId: "e1", plotId: "p1", plotLabel: "Block A, Plot 12", estate: "Lugbe Demo Gardens",
  location: "Lugbe, Abuja, Federal Capital Territory (Abuja)", sqm: null, actualSqm: null, isCorner: false, cornerPremiumPct: null,
  basePrice: 7_000_000, titleType: "C of O", titleStatus: "pending", titleVerified: false, intent: "investment", plan: "outright",
  totalPrice: 7_000_000, paidAmount: 0, currency: "NGN", acquiredDate: null, status: "pending_verification",
  nextDueDate: null, nextDueAmount: null, installmentMonths: null, installmentsPaid: null, arrears: null, restructureStatus: null, supersedes: null,
  payments: [{ id: "LV-7RV4JCJQ", date: "2026-10-16", amount: 7_000_000, currency: "NGN", type: "outright", status: "pending_verification", receiptId: "LV-7RV4JCJQ", rejectionReason: null, verifiedAt: null }],
};

describe("portfolio against the real endpoints", () => {
  it("lists plots by urgency, passing only the parameters that are set, and turns nulls into 'not set'", async () => {
    respond({ "GET /api/portfolio/plots?sort=urgency&limit=50": { status: 200, body: { items: [pendingDto], total: 1, cursor: null, hasMore: false } } });
    const { fetchOwnedPlots } = await import("./portfolioService");

    const page = await fetchOwnedPlots({ sort: "urgency", limit: 50 });

    expect(calls).toEqual([{ url: "/api/portfolio/plots?sort=urgency&limit=50", method: "GET" }]);
    expect(page.cursor).toBeUndefined();
    const [plot] = page.items;
    expect(plot).toMatchObject({ id: TXN, transactionId: TXN, status: "pending_verification", paidAmount: 0, acquiredDate: null, sqm: null, titleStatus: "pending" });
    // Optional fields read as absent, so `!== undefined` checks don't take null for a value.
    expect(plot.nextDueAmount).toBeUndefined();
    expect(plot.cornerPremiumPct).toBeUndefined();
    expect(plot.actualSqm).toBeUndefined();
    expect(plot.payments[0].verifiedAt).toBeUndefined();
  });

  it("never asks for more than the backend's largest page", async () => {
    respond({ "GET /api/portfolio/plots?limit=100": { status: 200, body: { items: [], total: 0, cursor: null, hasMore: false } } });
    const { fetchOwnedPlots } = await import("./portfolioService");
    await fetchOwnedPlots({ limit: 500 });
    expect(calls[0].url).toBe("/api/portfolio/plots?limit=100");
  });

  it("opens a plot by its transaction id after finance has verified it", async () => {
    const verified = { ...pendingDto, id: PLOT, status: "completed", paidAmount: 7_000_000, acquiredDate: "2026-10-17",
      payments: [{ ...pendingDto.payments[0], status: "confirmed", verifiedAt: "2026-10-17T10:00:00Z" }] };
    respond({ [`GET /api/portfolio/plots/${TXN}`]: { status: 200, body: verified } });
    const { fetchOwnedPlotById } = await import("./portfolioService");

    expect(await fetchOwnedPlotById(TXN)).toMatchObject({ id: PLOT, transactionId: TXN, status: "completed", acquiredDate: "2026-10-17" });
  });

  it("treats another buyer's plot or a malformed id as not found, and anything else as a failure", async () => {
    respond({
      "GET /api/portfolio/plots/theirs": { status: 404, body: { message: "Not found", code: "OWNED_PLOT_NOT_FOUND" } },
      "GET /api/portfolio/plots/not-a-uuid": { status: 400, body: { message: "Bad id", code: "INVALID_PARAMETER" } },
      "GET /api/portfolio/plots/boom": { status: 500, body: { message: "Server error", code: "INTERNAL_ERROR" } },
    });
    const { fetchOwnedPlotById } = await import("./portfolioService");

    expect(await fetchOwnedPlotById("theirs")).toBeUndefined();
    expect(await fetchOwnedPlotById("not-a-uuid")).toBeUndefined();
    await expect(fetchOwnedPlotById("boom")).rejects.toThrow();
  });

  it("takes the totals from /summary", async () => {
    const summary = { byCurrency: [{ currency: "NGN", totalValue: 12_000_000, totalPaid: 12_000_000, count: 2 }], awaitingVerification: 1 };
    respond({ "GET /api/portfolio/summary": { status: 200, body: summary } });
    const { fetchPortfolioSummary } = await import("./portfolioService");

    expect(await fetchPortfolioSummary()).toEqual(summary);
  });

  it("never calls the installment, payment or restructure routes, and never writes ownership", async () => {
    respond({});
    const s = await import("./portfolioService");

    expect(s.installmentsAvailable()).toBe(false);
    expect(await s.fetchInstallmentSchedule(PLOT)).toBeUndefined();
    await expect(s.submitInstallmentPayment({ plotId: PLOT, amount: 1, currency: "NGN", method: "card" })).rejects.toThrow();
    await expect(s.verifyInstallmentPayment(PLOT, "pay-1")).rejects.toThrow();
    await expect(s.requestRestructure(PLOT, "please")).rejects.toThrow();
    await expect(s.updateOwnedPlotStatus(PLOT, "completed")).rejects.toThrow();
    await expect(s.addOwnedPlot({ ...pendingDto } as never)).rejects.toThrow();

    expect(calls).toEqual([]);
  });
});
