// Instalment plans (backend changesets 099–103). The developer declares the
// TERMS of each plan in the portal; HomeTrue works out every figure. So
// nothing here (or in any screen) does money arithmetic live: the portal
// shows the PUT's `quotes`, the marketplace each tier's `paymentPlans`, and
// checkout the purchase's fixed `schedule`.
//
// Demo mode stands in for the backend, so it does the backend's arithmetic
// in one place below (mockQuote): the premium on the whole price, a
// percentage deposit a share of that total, the rest split evenly with the
// leftover kobo on the last instalment.

import { apiClient } from "../lib/apiClient";
import { isMock } from "../lib/backends";
import { ESTATES } from "../data/mockData";
import { tiersFromPlots, type PriceTier } from "./estatesService";

export type PlanFrequency = "monthly" | "quarterly";

// One rung of the estate's late-payment rule, priced on ONE instalment.
export interface LateStep {
  monthsLate: number;
  penaltyPct: number;
  amount: number;
}

// A plan as a tier offers it on the marketplace (MarketplacePaymentPlanDto).
export interface TierPlan {
  planId: string;
  name: string;
  frequency: PlanFrequency;
  deposit: number;
  instalmentCount: number;
  // Each instalment but the last; the last carries any leftover kobo.
  instalment: number;
  lastInstalment: number;
  planTotal: number;
  // How much more than paying in full.
  premium: number;
  ifAnInstalmentIsLate: LateStep[];
}

// The plan at one open tier's price, for a plot that isn't a corner plot.
export interface PlanQuote {
  tierId: string;
  tierLabel: string;
  currency: string;
  price: number;
  planTotal: number;
  premium: number;
  deposit: number;
  instalmentCount: number;
  instalment: number;
  lastInstalment: number;
}

// A declared plan, as the portal reads it back (PaymentPlansDto.Plan).
export interface DeclaredPlan {
  id: string;
  name: string;
  depositPct: number | null;
  depositAmount: number | null;
  instalmentCount: number;
  frequency: PlanFrequency;
  premiumPct: number;
  // A tier is left out when a fixed deposit leaves nothing to pay in
  // instalments there — say so, never hide it silently.
  quotes: PlanQuote[];
}

export interface PaymentPlans {
  // 0 when never declared (outright only).
  version: number;
  plans: DeclaredPlan[];
}

// What a PUT sends: exactly one deposit type per plan.
export interface PlanInput {
  name: string;
  depositPct?: number;
  depositAmount?: number;
  instalmentCount: number;
  frequency: PlanFrequency;
  premiumPct?: number;
}

export const PLAN_LIMITS = { maxPlans: 10, depositPct: [1, 99.99], instalmentCount: [1, 60], premiumPct: [0, 100] } as const;

export function frequencyWord(f: PlanFrequency): string {
  return f === "quarterly" ? "quarterly" : "monthly";
}

export async function fetchPaymentPlans(estateId: string): Promise<PaymentPlans> {
  if (!isMock("portalEstates")) return apiClient.get<PaymentPlans>(`/api/portal/estates/${estateId}/payment-plans`);
  return mockPlans(estateId);
}

// Replaces the whole set as a new version; [] means outright only.
export async function savePaymentPlans(estateId: string, plans: PlanInput[]): Promise<PaymentPlans> {
  if (!isMock("portalEstates")) return apiClient.put<PaymentPlans>(`/api/portal/estates/${estateId}/payment-plans`, { plans });
  const current = declared.get(estateId) ?? seed(estateId);
  const next = { version: current.version + 1, terms: plans.map((p, i) => ({ ...p, id: `plan-${estateId}-${current.version + 1}-${i}` })) };
  declared.set(estateId, next);
  return mockPlans(estateId);
}

// ─── Demo mode ──────────────────────────────────────────────────────────────

type Terms = PlanInput & { id: string };
const declared = new Map<string, { version: number; terms: Terms[] }>();

// Demo estates that say they offer instalments get one 12-month plan, on the
// terms the live Lugbe estate declared (30% deposit, 10% premium).
function seed(estateId: string): { version: number; terms: Terms[] } {
  const estate = ESTATES.find((e) => e.id === estateId);
  const offers = !!estate?.paymentPlans.includes("installment");
  const s = offers
    ? { version: 1, terms: [{ id: `plan-${estateId}-12m`, name: "12-month plan", depositPct: 30, instalmentCount: 12, frequency: "monthly" as const, premiumPct: 10 }] }
    : { version: 0, terms: [] };
  declared.set(estateId, s);
  return s;
}

function terms(estateId: string): Terms[] {
  return (declared.get(estateId) ?? seed(estateId)).terms;
}

const kobo = (n: number) => Math.round(n * 100) / 100;

// The backend's arithmetic, for demo mode only. Null when a fixed deposit
// leaves nothing to pay in instalments.
export function mockQuote(t: PlanInput, price: number): Omit<PlanQuote, "tierId" | "tierLabel" | "currency"> | null {
  const premium = kobo((price * (t.premiumPct ?? 0)) / 100);
  const planTotal = kobo(price + premium);
  const deposit = t.depositAmount !== undefined ? t.depositAmount : kobo((planTotal * (t.depositPct ?? 0)) / 100);
  const rest = kobo(planTotal - deposit);
  if (rest <= 0) return null;
  const instalment = Math.floor((rest / t.instalmentCount) * 100) / 100;
  const lastInstalment = kobo(rest - instalment * (t.instalmentCount - 1));
  return { price, planTotal, premium, deposit, instalmentCount: t.instalmentCount, instalment, lastInstalment };
}

function tierLabel(tier: Pick<PriceTier, "sizeSqm">): string {
  return `${tier.sizeSqm} sqm`;
}

function mockPlans(estateId: string): PaymentPlans {
  const estate = ESTATES.find((e) => e.id === estateId);
  const state = declared.get(estateId) ?? seed(estateId);
  const tiers = estate ? tiersFromPlots(estate) : [];
  return {
    version: state.version,
    plans: state.terms.map((t) => ({
      id: t.id, name: t.name, depositPct: t.depositPct ?? null, depositAmount: t.depositAmount ?? null,
      instalmentCount: t.instalmentCount, frequency: t.frequency, premiumPct: t.premiumPct ?? 0,
      quotes: tiers.flatMap((tier) => {
        const q = mockQuote(t, tier.price);
        return q ? [{ ...q, tierId: tier.id, tierLabel: tierLabel(tier), currency: tier.currency ?? "NGN" }] : [];
      }),
    })),
  };
}

// A demo tier's plans, as the marketplace listing carries them.
export function mockTierPlans(estateId: string, price: number): TierPlan[] {
  return terms(estateId).flatMap((t) => {
    const q = mockQuote(t, price);
    return q ? [{ planId: t.id, name: t.name, frequency: t.frequency, deposit: q.deposit, instalmentCount: q.instalmentCount,
      instalment: q.instalment, lastInstalment: q.lastInstalment, planTotal: q.planTotal, premium: q.premium, ifAnInstalmentIsLate: [] }] : [];
  });
}

// The purchase's fixed schedule, as the backend works it out from the agreed
// price when the purchase opens (demo mode only). Null for a plan the estate
// doesn't offer now (409 PLAN_NOT_OFFERED).
export function mockSchedule(estateId: string, planId: string, agreedPrice: number, from = new Date()): {
  planId: string; planName: string; frequency: PlanFrequency; planTotal: number; premium: number; deposit: number;
  instalments: { sequence: number; dueDate: string; amount: number }[];
} | null {
  const t = terms(estateId).find((p) => p.id === planId);
  const q = t ? mockQuote(t, agreedPrice) : null;
  if (!t || !q) return null;
  const step = t.frequency === "quarterly" ? 3 : 1;
  const instalments = Array.from({ length: q.instalmentCount }, (_, i) => {
    const d = new Date(from);
    d.setMonth(d.getMonth() + step * (i + 1));
    return { sequence: i + 1, dueDate: d.toISOString().slice(0, 10), amount: i === q.instalmentCount - 1 ? q.lastInstalment : q.instalment };
  });
  return { planId: t.id, planName: t.name, frequency: t.frequency, planTotal: q.planTotal, premium: q.premium, deposit: q.deposit, instalments };
}
