// Penalty waivers (backend changeset 109): the form's own check, the buyer's
// "waived by the developer" line, and the live contract against a stubbed
// fetch. The server decides every amount; nothing is added back or worked out.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkWaiver, waivedLine } from "./planService";

const money = (n: number) => `₦${n.toLocaleString("en-NG")}`;

describe("checkWaiver", () => {
  it("accepts up to what's outstanding, written the ways people type money", () => {
    expect(checkWaiver("28125", "In hospital", 28_125)).toEqual({ amount: 28_125, errors: null });
    expect(checkWaiver("₦28,125.00", "In hospital", 28_125)).toEqual({ amount: 28_125, errors: null });
    expect(checkWaiver(" 20,000 ", "In hospital", 28_125)).toEqual({ amount: 20_000, errors: null });
    expect(checkWaiver("0.01", "In hospital", 28_125).amount).toBe(0.01);
  });

  it("refuses more than outstanding, zero, more than 2 decimals and words", () => {
    expect(checkWaiver("28125.01", "x", 28_125).errors?.amount).toMatch(/more than is still owed/);
    expect(checkWaiver("0", "x", 28_125).errors?.amount).toMatch(/above zero/);
    expect(checkWaiver("100.555", "x", 28_125).errors?.amount).toMatch(/Enter an amount/);
    expect(checkWaiver("all of it", "x", 28_125).errors?.amount).toMatch(/Enter an amount/);
    expect(checkWaiver("", "x", 28_125).errors?.amount).toMatch(/Enter an amount/);
  });

  it("needs a reason, at most 500 characters — the buyer is emailed it", () => {
    expect(checkWaiver("100", "   ", 28_125).errors?.reason).toMatch(/emailed/);
    expect(checkWaiver("100", "a".repeat(501), 28_125).errors?.reason).toMatch(/500/);
    expect(checkWaiver("100", "a".repeat(500), 28_125).errors).toBeNull();
  });
});

describe("waivedLine", () => {
  const penalty = { monthsLate: 1, penaltyPct: 5, amount: 28_125 };

  it("says what was waived under a penalty that's still partly owed", () => {
    expect(waivedLine(penalty, 20_000, money)).toBe("₦20,000 waived by the developer");
  });

  it("names the penalty when all of it was waived, never a ₦0 penalty", () => {
    expect(waivedLine(null, 48_125, money)).toBe("Late-payment penalty of ₦48,125 waived by the developer");
    expect(waivedLine({ ...penalty, amount: 0 }, 48_125, money)).toBe("Late-payment penalty of ₦48,125 waived by the developer");
  });

  it("shows nothing when nothing was waived", () => {
    expect(waivedLine(penalty, null, money)).toBeNull();
    expect(waivedLine(penalty, undefined, money)).toBeNull();
    expect(waivedLine(penalty, 0, money)).toBeNull();
  });
});

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

const WAIVERS = {
  transactionId: "x1", transactionReference: "LV-1", planStatus: "on_plan", currency: "NGN",
  penalties: [{ instalmentSequence: 2, dueDate: "2026-12-22", instalmentStatus: "in_arrears", reached: 48_125, waived: 20_000, outstanding: 28_125 }],
  waivers: [{ id: "w1", instalmentSequence: 2, scheduleVersion: 1, amount: 20_000, reason: "The buyer was in hospital in September.", waivedAt: "2026-10-24T10:12:00Z", waivedBy: "u-9" }],
};

describe("live", () => {
  beforeEach(() => {
    calls = [];
    vi.resetModules();
    const store = new Map([["auth_token", "access-1"]]);
    vi.stubEnv("VITE_API_BASE_URL", "http://api.test");
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reads the plan's penalties and waives one with the reason trimmed", async () => {
    respond({
      "GET /api/portal/plans/x1/penalty-waivers": { status: 200, body: WAIVERS },
      "POST /api/portal/plans/x1/penalty-waivers": { status: 200, body: { ...WAIVERS, penalties: [] } },
    });
    const { fetchPenaltyWaivers, waivePenalty } = await import("./planService");
    const w = await fetchPenaltyWaivers("x1");
    expect(w.penalties[0].outstanding).toBe(28_125);
    const after = await waivePenalty("x1", { instalmentSequence: 2, amount: 28_125, reason: "  In hospital  " });
    expect(calls[1]).toMatchObject({ method: "POST", body: { instalmentSequence: 2, amount: 28_125, reason: "In hospital" } });
    expect(after.penalties).toEqual([]);
  });

  it("a refusal keeps its code and the backend's message", async () => {
    respond({ "POST /api/portal/plans/x1/penalty-waivers": { status: 400, body: { code: "WAIVER_TOO_LARGE", message: "At most ₦28,125.00 of this penalty is left to waive." } } });
    const { waivePenalty, planErrorCode, planErrorMessage } = await import("./planService");
    const err = await waivePenalty("x1", { instalmentSequence: 2, amount: 30_000, reason: "x" }).catch((e) => e);
    expect(planErrorCode(err)).toBe("WAIVER_TOO_LARGE");
    expect(planErrorMessage(err)).toBe("At most ₦28,125.00 of this penalty is left to waive.");
  });
});

describe("demo", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("needs the live service — there's no mock data for waivers", async () => {
    vi.stubEnv("VITE_API_BASE_URL", "");
    vi.resetModules();
    const { fetchPenaltyWaivers, planErrorCode } = await import("./planService");
    expect(planErrorCode(await fetchPenaltyWaivers("x1").catch((e) => e))).toBe("NOT_IN_DEMO");
  });
});

describe("the buyer's schedule", () => {
  it("carries what was waived beside the net penalty, never adding it back", async () => {
    const { scheduleRows } = await import("../lib/planProgress");
    const SCHEDULE = { planId: "p", planName: "12-month plan", frequency: "monthly" as const, planTotal: 16_500_000, premium: 1_500_000, deposit: 4_950_000,
      instalments: [1, 2].map((n) => ({ sequence: n, dueDate: `2026-1${n}-22`, amount: 962_500 })) };
    const standing = {
      status: "in_arrears" as const, arrears: null, revocation: null, restructureStatus: null,
      instalments: [
        { sequence: 1, dueDate: "2026-11-22", amount: 962_500, status: "in_arrears" as const, daysLate: 40, penalty: { monthsLate: 1, penaltyPct: 5, amount: 28_125 }, penaltyWaived: 20_000 },
        { sequence: 2, dueDate: "2026-12-22", amount: 962_500, status: "upcoming" as const, daysLate: 0, penalty: null, penaltyWaived: null },
      ],
    };
    const rows = scheduleRows(SCHEDULE, null, "on_plan", standing);
    expect(rows.slice(1).map((r) => [r.penalty?.amount ?? null, r.penaltyWaived])).toEqual([[28_125, 20_000], [null, null]]);
  });
});
