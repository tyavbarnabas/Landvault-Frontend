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
