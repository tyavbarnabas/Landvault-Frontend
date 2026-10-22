// Instalment plans (backend changesets 099–103): the live contract against a
// stubbed fetch, the demo mode's copy of the backend's rules, and the purchase
// page's reading of a plan — all without the frontend working out a figure.

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

// Lugbe Demo Gardens' live 12-month plan at its Standard 250 tier.
const TIER_PLAN = { planId: "pl1", name: "12-month plan", frequency: "monthly", deposit: 4_950_000, instalmentCount: 12, instalment: 962_500,
  lastInstalment: 962_500, planTotal: 16_500_000, premium: 1_500_000, ifAnInstalmentIsLate: [] };
const SCHEDULE = { planId: "pl1", planName: "12-month plan", frequency: "monthly" as const, planTotal: 16_500_000, premium: 1_500_000, deposit: 4_950_000,
  instalments: Array.from({ length: 12 }, (_, i) => ({ sequence: i + 1, dueDate: `2027-${String(i + 1).padStart(2, "0")}-22`, amount: 962_500 })) };

const SHOWN = {
  listingId: "greenfield-park", listingName: "Greenfield Park", plotId: "p1", plotLabel: "Block A, Plot 1", sizeSqm: 180, actualAreaSqm: 180, isCorner: false,
  basePrice: 4_500_000, titleType: "C of O", location: "Mowe", reservationId: "r1", tierId: "t1", intent: "development" as const,
  currency: "NGN" as const, amountDue: 4_500_000, totalPrice: 4_500_000,
  buyer: { email: "buyer@example.com", address: { line1: "3 Admiralty Way", line2: null, city: "Lekki", state: "Lagos", postalCode: null, country: "NG", countryName: "Nigeria", updatedAt: "2026-10-21T09:00:00Z" } },
};

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

  it("the portal reads and replaces an estate's plans; [] is outright only", async () => {
    const PLANS = { version: 2, plans: [{ id: "pl1", name: "12-month plan", depositPct: 30, depositAmount: null, instalmentCount: 12, frequency: "monthly", premiumPct: 10, quotes: [] }] };
    respond({ "GET /api/portal/estates/e1/payment-plans": { status: 200, body: PLANS }, "PUT /api/portal/estates/e1/payment-plans": { status: 200, body: { version: 3, plans: [] } } });
    const { fetchPaymentPlans, savePaymentPlans } = await import("./paymentPlansService");
    expect(await fetchPaymentPlans("e1")).toEqual(PLANS);
    await savePaymentPlans("e1", []);
    expect(calls[1]).toMatchObject({ method: "PUT", url: "/api/portal/estates/e1/payment-plans", body: { plans: [] } });
  });

  it("a listing carries each tier's plans, and offers instalments only where a tier has one", async () => {
    const tier = (id: string, plans: unknown[]) => ({ id, sizeSqm: 250, actualAreaSqm: 250, label: null, price: 15_000_000, currency: "NGN", pricePerSqm: null, availability: "available", plotsRemaining: 3, commitment: null, paymentPlans: plans });
    const listing = (id: string, plans: unknown[]) => ({ id, name: id, area: null, city: null, state: "Lagos", description: null, amenities: null, imageUrl: null, photos: null,
      titleType: null, lastVerifiedDate: null, priceTiers: [tier(`${id}-t`, plans)], cornerPremiumPct: null, intent: null, publishedDate: null,
      seller: { branchName: null, companyName: "Co", office: null }, verified: true, fromPrice: null, fromPriceCurrency: null, plotsRemaining: 3, hasMap: false, verificationChecks: null, costDisclosure: null });
    respond({ "GET /api/marketplace/estates?": { status: 200, body: { items: [listing("plans", [TIER_PLAN]), listing("outright", [])], total: 2, cursor: null, hasMore: false } } });
    const { fetchListings, offersInstalments } = await import("./marketplaceService");
    const all = await fetchListings();
    expect(all.items[0].priceTiers[0].paymentPlans).toEqual([TIER_PLAN]);
    expect(all.items.map((l) => [l.paymentPlans, offersInstalments(l)])).toEqual([[["outright", "installment"], true], [["outright"], false]]);
    // "Has instalments" is read off the tiers; the backend has no such filter.
    const filtered = await fetchListings({ paymentPlan: "installment" });
    expect(filtered.items.map((l) => l.id)).toEqual(["plans"]);
  });

  it("Pay charges what's due now; ?balance=true pays the plan off", async () => {
    const PAY = { id: "py1", transactionId: "x1", reference: "PAY-1", status: "initialized", amount: 10_587_500, currency: "NGN", authorizationUrl: "https://paystack/x", createdAt: "2026-12-01T00:00:00Z" };
    respond({ "POST /api/transactions/x1/payments": { status: 201, body: PAY }, "POST /api/transactions/x1/payments?balance=true": { status: 201, body: PAY } });
    const { startPayment } = await import("./paymentsService");
    await startPayment("x1");
    expect(await startPayment("x1", { balance: true })).toMatchObject({ amount: 10_587_500 });
    expect(calls.map((c) => c.url)).toEqual(["/api/transactions/x1/payments", "/api/transactions/x1/payments?balance=true"]);
  });

  it("a payment awaiting verification blocks the next one, with words for the buyer", async () => {
    respond({ "POST /api/transactions/x1/payments": { status: 409, body: { code: "INSTALMENT_AWAITING_VERIFICATION", message: "Waiting" } } });
    const { startPayment } = await import("./paymentsService");
    const { paymentErrorMessage } = await import("../components/purchases/PayButton");
    expect(paymentErrorMessage(await startPayment("x1").catch((e) => e))).toMatch(/waiting for the developer's finance team to verify it/);
  });
});

describe("finance and payouts", () => {
  it("each queue row says what the payment is for, and never 'sell' for a deposit", async () => {
    const { paymentForLabel, verifyLabel } = await import("../pages/portal/finance/PortalFinance");
    const base = { transactionId: "x1", transactionReference: "LV-1", estateId: "e1", estateName: "Lugbe", plotId: "p1", plotLabel: "Block A, Plot 13",
      buyerEmail: null, expectedAmount: 1, currency: "NGN", awaitingSince: "2026-10-22T10:00:00Z", payment: null, amountsMatch: true, letterApproved: true };
    const deposit = { ...base, paymentFor: "deposit" as const, planName: "12-month plan" };
    const third = { ...base, paymentFor: "instalment" as const, planName: "12-month plan", instalmentSequence: 3, instalmentCount: 12, dueDate: "2027-01-22" };
    const last = { ...third, instalmentSequence: 12 };
    const balance = { ...base, paymentFor: "balance" as const, planName: "12-month plan", instalmentCount: 12 };
    expect(paymentForLabel(deposit)).toBe("Deposit — 12-month plan");
    expect(paymentForLabel(third)).toBe("Instalment 3 of 12 (due 22 Jan 2027) — 12-month plan");
    expect(paymentForLabel(balance)).toBe("Balance paid off — 12-month plan");
    expect(verifyLabel(deposit)).toBe("Verify deposit — hold plot on plan");
    expect(verifyLabel(third)).toBe("Verify instalment");
    expect(verifyLabel(last)).toBe("Verify — sell plot & issue allocation letter");
    expect(verifyLabel(balance)).toBe("Verify — sell plot & issue allocation letter");
    expect(verifyLabel(base)).toBe("Verify and sell");
  });

  it("a plan sale's payouts are grouped and named by tranche", async () => {
    const { saleGroups, trancheText } = await import("./financeService");
    const p = (id: string, tranche: "share" | "release", sharePaymentId: string | null, trancheLabel: string) => ({ id, transactionId: "x1", tenantId: "t", companyName: "Co",
      amount: 100, currency: "NGN", partNumber: 1, partCount: 1, status: "success" as const, reference: id, gatewayMessage: null, bankName: null, accountLast4: null,
      createdAt: `2026-10-2${id}T00:00:00Z`, transferredAt: null, reviewReason: null, tranche, sharePaymentId, trancheLabel });
    const groups = saleGroups([p("1", "share", "pay-a", "Developer's share of the deposit"), p("2", "share", "pay-b", "Developer's share of instalment 1"), p("3", "release", null, "Escrow release at plan completion")]);
    expect(groups.map((g) => g.label)).toEqual(["Escrow release at plan completion", "Developer's share of instalment 1", "Developer's share of the deposit"]);
    expect(trancheText({ tranche: "sale" })).toBe("Full sale price");
  });
});

describe("demo mode", () => {
  beforeEach(() => vi.stubEnv("VITE_API_BASE_URL", ""));

  it("a demo estate's tiers carry plans worked out the backend's way", async () => {
    const { fetchListingById } = await import("./marketplaceService");
    const l = (await fetchListingById("greenfield-park"))!;
    const t = l.priceTiers[0];
    // 30% of (price + 10%), then 12 equal instalments.
    expect(t.paymentPlans?.[0]).toMatchObject({ name: "12-month plan", deposit: t.price * 1.1 * 0.3, planTotal: t.price * 1.1, instalmentCount: 12 });
    expect(l.paymentPlans).toContain("installment");
  });

  it("a plan the estate doesn't offer is 409 PLAN_NOT_OFFERED", async () => {
    const { initiateTransaction } = await import("./marketplaceCheckoutService");
    await expect(initiateTransaction({ ...SHOWN, plan: "installment", planId: "no-such-plan" })).rejects.toMatchObject({ status: 409, body: { code: "PLAN_NOT_OFFERED" } });
  });

  it("deposit → held on the plan → an instalment → the balance → paid in full", async () => {
    const { initiateTransaction } = await import("./marketplaceCheckoutService");
    const { startPayment, verifyPayment, fetchPurchase } = await import("./paymentsService");
    const { acceptOffer } = await import("./offerLetterService");
    const { fetchFinanceQueue, verifyPurchase } = await import("./financeService");
    const { fetchListingById } = await import("./marketplaceService");
    const plan = (await fetchListingById("greenfield-park"))!.priceTiers[0].paymentPlans![0];

    const txn = await initiateTransaction({ ...SHOWN, plan: "installment", planId: plan.planId });
    expect(txn.schedule).toMatchObject({ planName: "12-month plan", deposit: plan.deposit, planTotal: plan.planTotal });
    expect(txn.schedule!.instalments).toHaveLength(12);
    await acceptOffer(txn.offer!.id);

    const pay = async (balance = false) => {
      const p = await startPayment(txn.id, { balance });
      await verifyPayment(p.reference);
      return p;
    };
    expect((await pay()).amount).toBe(plan.deposit);
    expect((await fetchPurchase(txn.id))!.status).toBe("awaiting_finance");
    const queued = (await fetchFinanceQueue()).find((q) => q.transactionId === txn.id)!;
    expect(queued).toMatchObject({ paymentFor: "deposit", expectedAmount: plan.deposit, planName: "12-month plan" });
    expect(await verifyPurchase(txn.id)).toMatchObject({ status: "on_plan", allocationLetterNumber: expect.stringMatching(/^HT-PAL-/) });

    expect((await pay()).amount).toBe(txn.schedule!.instalments[0].amount);
    // One at a time: the next waits for finance.
    await expect(startPayment(txn.id)).rejects.toMatchObject({ body: { code: "INSTALMENT_AWAITING_VERIFICATION" } });
    expect((await fetchFinanceQueue()).find((q) => q.transactionId === txn.id)).toMatchObject({ paymentFor: "instalment", instalmentSequence: 1, instalmentCount: 12 });
    expect(await verifyPurchase(txn.id)).toMatchObject({ status: "on_plan" });

    const rest = txn.schedule!.instalments.slice(1).reduce((n, i) => n + i.amount, 0);
    expect((await pay(true)).amount).toBeCloseTo(rest, 2);
    expect(await verifyPurchase(txn.id)).toMatchObject({ status: "verified", allocationLetterNumber: expect.stringMatching(/^HT-ALC-/) });
    expect((await fetchPurchase(txn.id))!.status).toBe("verified");
    await expect(startPayment(txn.id)).rejects.toMatchObject({ body: { code: "TRANSACTION_NOT_PAYABLE" } });
  });

  it("paying off an outright purchase is 409 NOTHING_TO_PAY_OFF", async () => {
    const { initiateTransaction } = await import("./marketplaceCheckoutService");
    const { startPayment } = await import("./paymentsService");
    const txn = await initiateTransaction({ ...SHOWN, plan: "outright" });
    await expect(startPayment(txn.id, { balance: true })).rejects.toMatchObject({ body: { code: "NOTHING_TO_PAY_OFF" } });
  });
});

describe("planProgress", () => {
  const owned = (patch: object) => ({ id: "op1", payments: [], installmentsPaid: 1, nextDueDate: "2027-02-22", nextDueAmount: 962_500, ...patch }) as never;

  it("rows: deposit and instalments verified, the next one, and the rest to come", async () => {
    const { scheduleRows } = await import("../lib/planProgress");
    const rows = scheduleRows(SCHEDULE, owned({}), "on_plan");
    expect(rows.slice(0, 4).map((r) => [r.label, r.state])).toEqual([["Deposit", "verified"], ["Instalment 1 of 12", "verified"], ["Instalment 2 of 12", "next"], ["Instalment 3 of 12", "upcoming"]]);
  });

  it("a payment awaiting finance shows as received, not paid; a pay-off covers every row left", async () => {
    const { scheduleRows, awaitingVerification } = await import("../lib/planProgress");
    const waiting = owned({ payments: [{ id: "a", date: "2027-01-20", amount: 962_500, currency: "NGN", type: "instalment", status: "pending_verification", receiptId: null }] });
    expect(awaitingVerification(waiting)).toBe(true);
    expect(scheduleRows(SCHEDULE, waiting, "on_plan")[2].state).toBe("awaiting");
    const payOff = owned({ payments: [{ id: "b", date: "2027-01-20", amount: 1, currency: "NGN", type: "balance", status: "pending_verification", receiptId: null }] });
    expect(scheduleRows(SCHEDULE, payOff, "on_plan").slice(2).every((r) => r.state === "awaiting")).toBe(true);
    expect(scheduleRows(SCHEDULE, null, "verified").every((r) => r.state === "verified")).toBe(true);
  });

  it("the next instalment is the portfolio's, matched against the schedule", async () => {
    const { nextInstalment } = await import("../lib/planProgress");
    expect(nextInstalment(SCHEDULE, owned({}), "on_plan")).toEqual({ sequence: 2, count: 12, amount: 962_500, dueDate: "2027-02-22" });
    expect(nextInstalment(SCHEDULE, owned({}), "verified")).toBeNull();
  });

  it("the history names each payment for what it paid", async () => {
    const { paymentHistory } = await import("../lib/planProgress");
    const p = (id: string, date: string, type: string) => ({ id, date, amount: 1, currency: "NGN", type, status: "confirmed", receiptId: null });
    const rows = paymentHistory(owned({ payments: [p("c", "2027-02-01", "balance"), p("a", "2026-10-22", "deposit"), p("b", "2026-11-20", "instalment")] }), SCHEDULE);
    expect(rows.map((r) => r.label)).toEqual(["Deposit", "Instalment 1 of 12", "Balance paid off"]);
  });

  it("money keeps its kobo", async () => {
    const { formatMoney } = await import("../lib/formatCurrency");
    expect(formatMoney(1_796_666.66)).toBe("₦1,796,666.66");
    expect(formatMoney(962_500)).toBe("₦962,500");
  });
});
