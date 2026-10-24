// Instalment plans, phases 4–5: the live contract against a stubbed fetch
// (withdrawal, restructuring, revocation, running plans) and how the purchase
// page reads a plan's standing — never adding or working out a figure.

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

beforeEach(() => {
  calls = [];
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const QUOTE = { transactionId: "x1", status: "on_plan", withdrawnAt: null, terms: { deductionPct: 15, appliesTo: "amount_paid", penaltiesRefundable: false },
  paid: 6_875_000, refund: 5_843_750, developerKeeps: 1_031_250, currency: "NGN", payments: [] };

describe("live", () => {
  beforeEach(() => {
    const store = new Map([["auth_token", "access-1"]]);
    vi.stubEnv("VITE_API_BASE_URL", "http://api.test");
    vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
  });

  it("withdrawing names the quote's refund; a moved quote is refused and nothing happens", async () => {
    respond({
      "GET /api/transactions/x1/withdrawal": { status: 200, body: QUOTE },
      "POST /api/transactions/x1/withdrawal": { status: 409, body: { code: "WITHDRAWAL_QUOTE_CHANGED", message: "Changed" } },
    });
    const { fetchWithdrawal, withdraw, planErrorCode, planErrorMessage } = await import("./planService");
    const q = await fetchWithdrawal("x1");
    const err = await withdraw("x1", q.refund, "  Moving abroad  ").catch((e) => e);
    expect(calls[1]).toMatchObject({ method: "POST", body: { refund: 5_843_750, reason: "Moving abroad" } });
    expect(planErrorCode(err)).toBe("WITHDRAWAL_QUOTE_CHANGED");
    expect(planErrorMessage(err)).toMatch(/here are today's/);
  });

  it("accepting and declining always send the id of the proposal on screen", async () => {
    const R = { transactionId: "x1", transactionReference: "LV-1", planStatus: "on_plan", open: null, history: [] };
    respond({ "POST /api/transactions/x1/restructure/accept": { status: 200, body: R }, "POST /api/transactions/x1/restructure/decline": { status: 200, body: R },
      "POST /api/transactions/x1/restructure": { status: 200, body: R } });
    const { acceptRestructure, declineRestructure, askRestructure } = await import("./planService");
    await askRestructure("x1", " Lost my job ", 18);
    await acceptRestructure("x1", "rs-7");
    await declineRestructure("x1", "rs-7");
    expect(calls.map((c) => c.body)).toEqual([{ reason: "Lost my job", preferredInstalments: 18 }, { restructureId: "rs-7" }, { restructureId: "rs-7" }]);
  });

  it("the developer previews terms (nothing written) and then proposes the same body", async () => {
    const terms = { instalmentCount: 18, frequency: "monthly" as const, firstDueDate: "2027-02-22" };
    respond({ "POST /api/portal/plans/x1/restructure/preview": { status: 200, body: { balance: 10_587_500, instalments: [] } },
      "POST /api/portal/plans/x1/restructure/propose": { status: 409, body: { code: "LETTER_NOT_APPROVED", message: "No" } } });
    const { previewRestructure, proposeRestructure, planErrorMessage } = await import("./planService");
    expect((await previewRestructure("x1", terms)).balance).toBe(10_587_500);
    const err = await proposeRestructure("x1", terms).catch((e) => e);
    expect(calls.map((c) => c.body)).toEqual([terms, terms]);
    expect(planErrorMessage(err)).toMatch(/Re-approve the estate's allocation letter/);
  });

  it("revocation: notice with a reason, cancel, confirm; a narrowed director is told to switch view", async () => {
    respond({
      "POST /api/portal/plans/x1/revocation": { status: 200, body: {} },
      "POST /api/portal/plans/x1/revocation/cancel": { status: 200, body: {} },
      "POST /api/portal/plans/x1/revocation/confirm": { status: 409, body: { code: "REVOCATION_NOT_DUE", message: "Not before 22 May 2027." } },
      "GET /api/portal/plans/x2/revocation": { status: 403, body: { code: "REVOCATION_REQUIRES_COMPANY_WIDE_SCOPE", message: "No" } },
    });
    const { giveNotice, cancelNotice, confirmRevocation, fetchRevocation, planErrorMessage } = await import("./planService");
    await giveNotice("x1", " Unpaid since December ");
    await cancelNotice("x1");
    // The backend's own message says when it would be due.
    expect(planErrorMessage(await confirmRevocation("x1").catch((e) => e))).toBe("Not before 22 May 2027.");
    expect(planErrorMessage(await fetchRevocation("x2").catch((e) => e))).toBe("Switch to the company-wide view to revoke.");
    expect(calls.slice(0, 2).map((c) => c.body)).toEqual([{ reason: "Unpaid since December" }, {}]);
  });

  it("running plans filter by standing; 'late' is overdue and in arrears", async () => {
    respond({ "GET /api/portal/finance/plans?status=late": { status: 200, body: [] }, "GET /api/portal/finance/restructures": { status: 200, body: [] } });
    const { fetchRunningPlans, fetchRestructureQueue } = await import("./planService");
    await fetchRunningPlans("late");
    await fetchRestructureQueue();
    expect(calls.map((c) => c.url)).toEqual(["/api/portal/finance/plans?status=late", "/api/portal/finance/restructures"]);
  });

  it("default terms send revocation as numbers, with penaltiesRefundable", async () => {
    respond({ "PUT /api/portal/estates/e1/default-terms": { status: 200, body: {} } });
    const { declareDefaultTerms } = await import("./estateDisclosureService");
    const req = { revocationAfterMonths: 3, revocationNoticeDays: 30, penaltiesRefundable: false, developmentDeadlineMonths: null, transferRequiresConsent: true,
      penaltyTiers: [{ monthsLate: 1, penaltyPct: 5 }], notes: null };
    await declareDefaultTerms("e1", req);
    expect(calls[0].body).toEqual(req);
    expect(calls[0].body).not.toHaveProperty("revocationTrigger");
  });
});

describe("demo mode", () => {
  beforeEach(() => vi.stubEnv("VITE_API_BASE_URL", ""));

  it("has no phase 4–5 data: lists are empty and actions say they need the live service", async () => {
    const { fetchRunningPlans, fetchRestructureQueue, fetchWithdrawal, planErrorCode } = await import("./planService");
    expect(await fetchRunningPlans()).toEqual([]);
    expect(await fetchRestructureQueue()).toEqual([]);
    expect(planErrorCode(await fetchWithdrawal("x").catch((e) => e))).toBe("NOT_IN_DEMO");
  });
});

describe("reading a plan's standing", () => {
  const SCHEDULE = { planId: "p", planName: "12-month plan", frequency: "monthly" as const, planTotal: 16_500_000, premium: 1_500_000, deposit: 4_950_000,
    instalments: [1, 2, 3].map((n) => ({ sequence: n, dueDate: `2026-1${n}-22`, amount: 962_500 })) };
  const standing = {
    status: "in_arrears" as const, arrears: null, revocation: null, restructureStatus: null,
    instalments: [
      { sequence: 1, dueDate: "2026-11-22", amount: 962_500, status: "paid" as const, daysLate: 0, penalty: null },
      { sequence: 2, dueDate: "2026-12-22", amount: 962_500, status: "in_arrears" as const, daysLate: 40, penalty: { monthsLate: 1, penaltyPct: 5, amount: 48_125 } },
      { sequence: 3, dueDate: "2027-01-22", amount: 962_500, status: "awaiting_verification" as const, daysLate: 0, penalty: null },
    ],
  };

  it("the schedule takes each instalment's status, days late and penalty as given; awaiting verification is never late", async () => {
    const { scheduleRows } = await import("../lib/planProgress");
    const rows = scheduleRows(SCHEDULE, null, "on_plan", standing);
    expect(rows.slice(1).map((r) => [r.state, r.daysLate, r.penalty?.amount ?? null])).toEqual([["verified", 0, null], ["in_arrears", 40, 48_125], ["awaiting", 0, null]]);
    // The penalty stays its own figure: the instalment's amount is unchanged.
    expect(rows[2].amount).toBe(962_500);
  });

  it("a penalty carried over by a restructure is not a 0% penalty", async () => {
    const { isCarriedPenalty } = await import("./planService");
    expect(isCarriedPenalty({ monthsLate: 0, penaltyPct: 0, amount: 48_125 })).toBe(true);
    expect(isCarriedPenalty({ monthsLate: 1, penaltyPct: 5, amount: 48_125 })).toBe(false);
  });

  it("a withdrawn or revoked plan is over, never 'yours', and its refunds come back in parts", async () => {
    const { describePurchase, purchaseBadge } = await import("../lib/purchaseStatus");
    const p = (status: "withdrawn" | "revoked") => ({ id: "x", reference: "LV-1", estateId: "e", plotId: "p", reservationId: "r", basePrice: 1, cornerPremiumPct: null,
      totalPrice: 1, currency: "NGN", intent: "development" as const, plan: "installment" as const, installmentMonths: 12, status, createdAt: "2026-10-22T10:00:00Z",
      payment: null, buyerAddress: null, offer: null, schedule: SCHEDULE });
    expect(describePurchase(p("withdrawn"))).toMatchObject({ owned: false, canPay: false, title: "You withdrew from this plan" });
    expect(describePurchase(p("revoked")).body).toMatch(/exactly what withdrawing returns/);
    expect(purchaseBadge(p("revoked")).label).toBe("Plan revoked");
  });
});
