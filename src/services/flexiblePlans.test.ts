// Flexible ("pay as you can") plans (backend changesets 110–115): the listing
// keeps them apart from instalment plans, read off `kind`, with every figure
// the backend's.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

let calls: string[];

function respond(routes: Record<string, unknown>) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const path = url.replace("http://api.test", "");
    calls.push(path);
    const body = routes[`GET ${path}`];
    if (body === undefined) return new Response(JSON.stringify({ code: "NOT_FOUND", message: "Not found" }), { status: 404 });
    return new Response(JSON.stringify(body), { status: 200 });
  }));
}

const INSTALMENT = { planId: "pl1", name: "12-month plan", kind: "installment", frequency: "monthly", deposit: 4_950_000, instalmentCount: 12, instalment: 962_500,
  lastInstalment: 962_500, planTotal: 16_500_000, premium: 1_500_000, ifAnInstalmentIsLate: [], flexible: null };
// Lugbe Demo Gardens' live "Pay as you can" plan at its Standard 250 tier.
const QUOTE = { price: 15_000_000, planTotal: 16_500_000, premium: 1_500_000, minimumToStart: 1_500_000, minimumContribution: 100_000,
  ifYouStopAfterPaying: [{ paid: 1_500_000, youGetBack: 1_200_000, developerKeeps: 300_000 }, { paid: 8_250_000, youGetBack: 6_600_000, developerKeeps: 1_650_000 }],
  ifSoldForMore: { developerSharePct: 60, buyerSharePct: 40, perMillionAbove: 400_000, example: { risePct: 20, soldFor: 18_000_000, difference: 3_000_000, youGet: 1_200_000 } },
  inactivityMonths: 6, noticeDays: 30, maxMonths: 24 };
const FLEXIBLE = { planId: "pl2", name: "Pay as you can", kind: "flexible", frequency: null, deposit: 1_500_000, instalmentCount: null, instalment: null,
  lastInstalment: null, planTotal: 16_500_000, premium: 1_500_000, ifAnInstalmentIsLate: [], flexible: QUOTE };

const tier = (plans: unknown[]) => ({ id: "t1", sizeSqm: 250, actualAreaSqm: 250, label: null, price: 15_000_000, currency: "NGN", pricePerSqm: null,
  availability: "available", plotsRemaining: 3, commitment: null, paymentPlans: plans });
const listing = (id: string, plans: unknown[]) => ({ id, name: id, area: null, city: null, state: "FCT", description: null, amenities: null, imageUrl: null, photos: null,
  titleType: null, lastVerifiedDate: null, priceTiers: [tier(plans)], cornerPremiumPct: null, intent: null, publishedDate: null,
  seller: { branchName: null, companyName: "Co", office: null }, verified: true, fromPrice: null, fromPriceCurrency: null, plotsRemaining: 3, hasMap: false,
  verificationChecks: null, costDisclosure: null });

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

describe("flexible plans on the listing", () => {
  it("keeps flexible plans out of the instalment list, with the backend's quote as it came", async () => {
    respond({ "GET /api/marketplace/estates?": { items: [listing("both", [INSTALMENT, FLEXIBLE]), listing("flexible-only", [FLEXIBLE])], total: 2, cursor: null, hasMore: false } });
    const { fetchListings, offersInstalments } = await import("./marketplaceService");
    const all = await fetchListings();
    const [both, flexOnly] = all.items;
    expect(both.priceTiers[0].paymentPlans?.map((p) => p.planId)).toEqual(["pl1"]);
    expect(both.priceTiers[0].flexiblePlans).toEqual([{ planId: "pl2", name: "Pay as you can", flexible: QUOTE }]);
    // A flexible plan isn't an instalment plan: an estate with only one offers no instalments.
    expect([offersInstalments(both), offersInstalments(flexOnly)]).toEqual([true, false]);
    expect(flexOnly.priceTiers[0].paymentPlans).toEqual([]);
  });

  it("drops a flexible plan that came without its figures", async () => {
    respond({ "GET /api/marketplace/estates?": { items: [listing("e", [{ ...FLEXIBLE, flexible: null }])], total: 1, cursor: null, hasMore: false } });
    const { fetchListings } = await import("./marketplaceService");
    const all = await fetchListings();
    expect(all.items[0].priceTiers[0].flexiblePlans).toEqual([]);
    expect(all.items[0].priceTiers[0].paymentPlans).toEqual([]);
  });
});

describe("planInSentence", () => {
  it("quotes a name that doesn't already end in “plan”", async () => {
    const { planInSentence } = await import("./paymentPlansService");
    expect(planInSentence("12-month plan")).toBe("the 12-month plan");
    expect(planInSentence("Pay as you can")).toBe("the “Pay as you can” plan");
  });
});

describe("declaring flexible plans in the portal", () => {
  it("sends the flexible terms in the same set as the instalment plans", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push(`${init.method ?? "GET"} ${url.replace("http://api.test", "")} ${init.body ?? ""}`);
      return new Response(JSON.stringify({ version: 4, plans: [] }), { status: 200 });
    }));
    const { savePaymentPlans } = await import("./paymentPlansService");
    await savePaymentPlans("e1", [
      { name: "12-month plan", depositPct: 30, instalmentCount: 12, frequency: "monthly", premiumPct: 10 },
      { name: "Pay as you can", kind: "flexible", depositPct: 10, premiumPct: 10,
        flexible: { minimumContribution: 100_000, exit: { deductionPct: 20, appliesTo: "amount_paid" }, developerGainSharePct: 60, inactivityMonths: 6, noticeDays: 30, maxMonths: 24 } },
    ]);
    const [method, url, ...rest] = calls[0].split(" ");
    const body = rest.join(" ");
    expect([method, url]).toEqual(["PUT", "/api/portal/estates/e1/payment-plans"]);
    expect(JSON.parse(body).plans[1]).toEqual({ name: "Pay as you can", kind: "flexible", depositPct: 10, premiumPct: 10,
      flexible: { minimumContribution: 100_000, exit: { deductionPct: 20, appliesTo: "amount_paid" }, developerGainSharePct: 60, inactivityMonths: 6, noticeDays: 30, maxMonths: 24 } });
  });

  it("places the backend's field errors beside the right field", async () => {
    const { errorKey } = await import("../components/portal/PaymentPlansPanel");
    const drafts = [{ kind: "installment" as const }, { kind: "flexible" as const }];
    expect(errorKey("plans[1].flexible.developerGainSharePct", drafts)).toBe("1.developerGainSharePct");
    expect(errorKey("plans[1].flexible.exit.deductionPct", drafts)).toBe("1.deductionPct");
    expect(errorKey("plans[1].flexible.exit.appliesTo", drafts)).toBe("1.deductionPct");
    expect(errorKey("plans[1].depositPct", drafts)).toBe("1.depositPct");
    expect(errorKey("plans[0].depositAmount", drafts)).toBe("0.deposit");
    expect(errorKey("plans", drafts)).toBeNull();
  });

  it("demo mode works out the same figures the backend gives Lugbe's plan", async () => {
    const { mockFlexibleQuote } = await import("./paymentPlansService");
    const q = mockFlexibleQuote({ name: "Pay as you can", kind: "flexible", depositPct: 10, premiumPct: 10,
      flexible: { minimumContribution: 100_000, exit: { deductionPct: 20, appliesTo: "amount_paid" }, developerGainSharePct: 60, inactivityMonths: 6, noticeDays: 30, maxMonths: 24 } }, 15_000_000);
    expect(q).toEqual(QUOTE);
  });
});

// The purchase's fixed flexible terms, as Lugbe's plan opens them.
const TERMS = { planId: "pl2", planName: "Pay as you can", planTotal: 16_500_000, premium: 1_500_000, minimumToStart: 1_500_000, minimumContribution: 100_000,
  exitDeductionPct: 20, exitAppliesTo: "amount_paid" as const, developerGainSharePct: 60, inactivityMonths: 6, noticeDays: 30, maxMonths: 24, finishBy: "2028-10-28" };

describe("buying on a flexible plan", () => {
  it("opens the purchase naming the flexible plan, and takes the minimum to start as what's first due", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push(`${init.method ?? "GET"} ${url.replace("http://api.test", "")} ${init.body ?? ""}`);
      return new Response(JSON.stringify({ id: "x1", reference: "LV-1", estateId: "e1", plotId: "p1", reservationId: "r1", basePrice: 15_000_000, cornerPremiumPct: null,
        totalPrice: 15_000_000, intent: "development", plan: "flexible", status: "pending_payment", createdAt: "2026-10-28T12:00:00Z", buyerAddress: null,
        offer: null, schedule: null, flexible: TERMS }), { status: 201 });
    }));
    const { initiateTransaction } = await import("./marketplaceCheckoutService");
    const txn = await initiateTransaction({ listingId: "e1", listingName: "Lugbe", plotId: "p1", plotLabel: "Block B, Plot 10", sizeSqm: 250, actualAreaSqm: 250, isCorner: false,
      basePrice: 15_000_000, titleType: "", location: "", reservationId: "r1", tierId: "t1", intent: "development", plan: "flexible", planId: "pl2",
      currency: "NGN", amountDue: 1_500_000, totalPrice: 15_000_000, buyer: { email: "b@example.com" } });
    const body = JSON.parse(calls[0].split(" ").slice(2).join(" "));
    expect(body).toEqual({ reservationId: "r1", intent: "development", plan: "flexible", planId: "pl2" });
    expect([txn.flexible, txn.schedule, txn.amountDue]).toEqual([TERMS, null, 1_500_000]);
  });

  it("pays the amount the buyer chose — the one figure ever sent", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push(`${init.method ?? "GET"} ${url.replace("http://api.test", "")}`);
      return new Response(JSON.stringify({ reference: "PAY-1", authorizationUrl: "https://checkout.paystack.com/x", amount: 5_000_000 }), { status: 201 });
    }));
    const { startPayment } = await import("./paymentsService");
    await startPayment("x1", { amount: 5_000_000 });
    await startPayment("x1", { amount: 1_500_000.5 });
    expect(calls).toEqual(["POST /api/transactions/x1/payments?amount=5000000", "POST /api/transactions/x1/payments?amount=1500000.5"]);
  });

  it("words a flexible purchase as held on the plan — never allocated before the plan total is verified", async () => {
    const { describePurchase, purchaseTimeline, purchaseBadge } = await import("../lib/purchaseStatus");
    const p = (status: string) => ({ id: "x1", reference: "LV-1", estateId: "e1", plotId: "p1", reservationId: "r1", basePrice: 15_000_000, cornerPremiumPct: null,
      totalPrice: 15_000_000, currency: "NGN", intent: "development", plan: "flexible", installmentMonths: null, status, createdAt: "2026-10-28T12:00:00Z",
      buyerAddress: null, offer: null, schedule: null, flexible: TERMS, payment: null }) as unknown as Parameters<typeof describePurchase>[0];
    expect(describePurchase(p("pending_payment")).payLabel).toBe("Make your first payment");
    expect(describePurchase(p("awaiting_finance")).body).toMatch(/held for you on the plan/);
    expect(describePurchase(p("on_plan")).title).toBe("Held for you on the “Pay as you can” plan");
    expect(purchaseBadge(p("awaiting_finance")).label).toBe("First payment being verified");
    expect(purchaseTimeline(p("on_plan")).map((s) => [s.label, s.state])).toEqual([
      ["Reserved", "done"], ["First payment made", "done"], ["First payment verified — held for you on the plan", "done"], ["Paid in full — the plot is yours", "current"]]);
    for (const status of ["pending_payment", "awaiting_finance", "on_plan"]) expect(describePurchase(p(status)).owned).toBe(false);
  });
});

describe("paying again on a flexible plan", () => {
  it("lists each payment as a payment — no instalment numbers without a schedule", async () => {
    const { paymentHistory } = await import("../lib/planProgress");
    const owned = { payments: [
      { id: "a", date: "2026-10-28", amount: 2_000_000, currency: "NGN", type: "contribution", status: "confirmed", receiptId: "r1" },
      { id: "b", date: "2026-11-02", amount: 500_000, currency: "NGN", type: "contribution", status: "pending_verification", receiptId: null },
    ] } as unknown as Parameters<typeof paymentHistory>[0];
    expect(paymentHistory(owned, null).map((r) => [r.label, r.amount, r.verified])).toEqual([["Payment", 2_000_000, true], ["Payment", 500_000, false]]);
  });

  it("pays what's left with ?balance=true, never a figure from the page", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push(`${init.method ?? "GET"} ${url.replace("http://api.test", "")}`);
      return new Response(JSON.stringify({ reference: "PAY-2", authorizationUrl: "https://checkout.paystack.com/y", amount: 14_500_000 }), { status: 201 });
    }));
    const { startPayment } = await import("./paymentsService");
    await startPayment("x1", { balance: true });
    expect(calls).toEqual(["POST /api/transactions/x1/payments?balance=true"]);
  });
});

describe("the developer's side of a flexible plan", () => {
  it("a contribution sells the plot only when it leaves nothing to pay", async () => {
    const { verifySells } = await import("./financeService");
    const row = (remainingAfter: number | null) => ({ paymentFor: "contribution" as const, remainingAfter }) as Parameters<typeof verifySells>[0];
    expect([verifySells(row(14_000_000)), verifySells(row(0)), verifySells(row(null))]).toEqual([false, true, false]);
  });

  it("reads the Flexible plans list", async () => {
    respond({ "GET /api/portal/finance/flexible-plans": [] });
    const { fetchFlexiblePlans } = await import("./planService");
    expect(await fetchFlexiblePlans()).toEqual([]);
    expect(calls).toEqual(["/api/portal/finance/flexible-plans"]);
  });
});
