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
  // "installment", or "flexible" (no fixed instalments: see FlexibleTierPlan).
  kind?: string;
}

// A flexible ("pay as you can") plan's figures at one tier's price
// (FlexiblePlanQuote), every one HomeTrue's. The gain-share figures are an
// example for a sale above the price, never a forecast.
export interface FlexiblePlanQuote {
  price: number;
  planTotal: number;
  premium: number;
  minimumToStart: number;
  // Null when any later amount will do.
  minimumContribution: number | null;
  // Two worked examples: after the minimum to start, and after half the total.
  ifYouStopAfterPaying: { paid: number; youGetBack: number; developerKeeps: number }[];
  ifSoldForMore: {
    developerSharePct: number;
    buyerSharePct: number;
    // What the buyer gets for every 1,000,000 the next sale is above the price.
    perMillionAbove: number;
    example: { risePct: number; soldFor: number; difference: number; youGet: number };
  };
  inactivityMonths: number;
  noticeDays: number;
  maxMonths: number | null;
}

// A flexible plan as a tier offers it: a minimum to start, then any amount at
// any time until the plan total is paid. No schedule, due dates or penalties.
export interface FlexibleTierPlan {
  planId: string;
  name: string;
  flexible: FlexiblePlanQuote;
}

// A flexible purchase's terms, copied from the agreed price when it opened and
// fixed (TransactionDto.flexible). No schedule, no due dates.
export interface PurchaseFlexible {
  planId: string;
  planName: string;
  planTotal: number;
  premium: number;
  minimumToStart: number;
  minimumContribution: number | null;
  exitDeductionPct: number;
  exitAppliesTo: ExitBasis;
  developerGainSharePct: number;
  inactivityMonths: number;
  noticeDays: number;
  maxMonths: number | null;
  finishBy: string | null;
}

// Where a running flexible plan stands today (transaction.flexibleStanding),
// worked out by the backend on every read. Nothing here is ever "due".
export interface FlexibleStanding {
  paid: number;
  remaining: number;
  // A payment Paystack confirmed that finance hasn't verified yet: the next
  // one is refused until then (INSTALMENT_AWAITING_VERIFICATION).
  awaitingFinance: number | null;
  lastPaymentOn: string | null;
  // From when the developer may give notice if nothing is paid.
  quietFrom: string | null;
  finishBy: string | null;
  // Why the developer may give notice now, or null.
  noticeReason: "inactivity" | "finish_by" | null;
  notice: { trigger: "inactivity" | "finish_by"; reason: string; givenAt: string; deadline: string; confirmableFrom: string } | null;
}

// A plan's name in a sentence: "the 12-month plan", but the "Pay as you can" plan.
export function planInSentence(name: string): string {
  return /\bplan$/i.test(name.trim()) ? `the ${name.trim()}` : `the “${name.trim()}” plan`;
}

// The plan at one open tier's price, for a plot that isn't a corner plot. On a
// flexible plan `deposit` is the minimum to start, the instalment fields are
// null and the figures are in `flexible`.
export interface PlanQuote {
  tierId: string;
  tierLabel: string;
  currency: string;
  price: number;
  planTotal: number;
  premium: number;
  deposit: number;
  instalmentCount: number | null;
  instalment: number | null;
  lastInstalment: number | null;
  flexible?: FlexiblePlanQuote | null;
}

// "amount_paid": that share of each payment; "total_price": a fixed sum, that
// share of the agreed price, kept from the first payments.
export type ExitBasis = "amount_paid" | "total_price";

// A flexible plan's declared terms, as the portal reads them back.
export interface FlexibleTerms {
  minimumContribution: number | null;
  exitDeductionPct: number;
  exitAppliesTo: ExitBasis;
  developerGainSharePct: number;
  inactivityMonths: number;
  noticeDays: number;
  maxMonths: number | null;
}

// A declared plan, as the portal reads it back (PaymentPlansDto.Plan).
export interface DeclaredPlan {
  id: string;
  name: string;
  depositPct: number | null;
  depositAmount: number | null;
  instalmentCount: number | null;
  frequency: PlanFrequency | null;
  premiumPct: number;
  // "installment" (when absent), or "flexible": then depositPct is the minimum
  // to start (a share of the price), instalmentCount and frequency are null,
  // and the terms are in `flexible`.
  kind?: string;
  flexible?: FlexibleTerms | null;
  // A tier is left out when a fixed deposit leaves nothing to pay in
  // instalments there — say so, never hide it silently.
  quotes: PlanQuote[];
}

export interface PaymentPlans {
  // 0 when never declared (outright only).
  version: number;
  plans: DeclaredPlan[];
}

// What a PUT sends for an instalment plan: exactly one deposit type.
export interface InstalmentPlanInput {
  name: string;
  kind?: "installment";
  depositPct?: number;
  depositAmount?: number;
  instalmentCount: number;
  frequency: PlanFrequency;
  premiumPct?: number;
}

// What a PUT sends for a flexible plan: the minimum to start as a share of the
// price; no fixed deposit, count or frequency.
export interface FlexiblePlanInput {
  name: string;
  kind: "flexible";
  depositPct: number;
  premiumPct?: number;
  flexible: {
    minimumContribution?: number;
    exit: { deductionPct: number; appliesTo: ExitBasis };
    developerGainSharePct: number;
    inactivityMonths: number;
    noticeDays: number;
    maxMonths?: number;
  };
}

export type PlanInput = InstalmentPlanInput | FlexiblePlanInput;

export const isFlexibleInput = (p: PlanInput): p is FlexiblePlanInput => p.kind === "flexible";
export const isFlexiblePlan = (p: Pick<DeclaredPlan, "kind">): boolean => p.kind === "flexible";

export const PLAN_LIMITS = { maxPlans: 10, depositPct: [1, 99.99], instalmentCount: [1, 60], premiumPct: [0, 100] } as const;
// The backend's limits on a flexible plan's terms, checked here first.
export const FLEXIBLE_LIMITS = { minimumToStartPct: [10, 99.99], exitPct: [0, 100], gainSharePct: [0, 100], inactivityMonths: [6, 60], noticeDays: [30, 365], maxMonths: [12, 240] } as const;

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
const instalmentTerms = (ts: Terms[]) => ts.filter((t): t is InstalmentPlanInput & { id: string } => !isFlexibleInput(t));
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
type InstalmentFigures = { price: number; planTotal: number; premium: number; deposit: number; instalmentCount: number; instalment: number; lastInstalment: number };

export function mockQuote(t: InstalmentPlanInput, price: number): InstalmentFigures | null {
  const premium = kobo((price * (t.premiumPct ?? 0)) / 100);
  const planTotal = kobo(price + premium);
  const deposit = t.depositAmount !== undefined ? t.depositAmount : kobo((planTotal * (t.depositPct ?? 0)) / 100);
  const rest = kobo(planTotal - deposit);
  if (rest <= 0) return null;
  const instalment = Math.floor((rest / t.instalmentCount) * 100) / 100;
  const lastInstalment = kobo(rest - instalment * (t.instalmentCount - 1));
  return { price, planTotal, premium, deposit, instalmentCount: t.instalmentCount, instalment, lastInstalment };
}

// The backend's flexible quote, for demo mode only: the minimum to start a
// share of the price, the premium on the price, what leaving returns after the
// minimum and after half the total, and the gain share on a sale 20% above.
export function mockFlexibleQuote(t: FlexiblePlanInput, price: number): FlexiblePlanQuote {
  const premium = kobo((price * (t.premiumPct ?? 0)) / 100);
  const planTotal = kobo(price + premium);
  const minimumToStart = kobo((price * t.depositPct) / 100);
  const d = t.flexible.exit.deductionPct / 100;
  const leave = (paid: number) => {
    const keeps = t.flexible.exit.appliesTo === "amount_paid" ? Math.floor(paid * d * 100) / 100 : Math.min(paid, kobo(price * d));
    return { paid, youGetBack: kobo(paid - keeps), developerKeeps: keeps };
  };
  const buyerSharePct = kobo(100 - t.flexible.developerGainSharePct);
  const difference = kobo(price * 0.2);
  return {
    price, planTotal, premium, minimumToStart, minimumContribution: t.flexible.minimumContribution ?? null,
    ifYouStopAfterPaying: [leave(minimumToStart), leave(kobo(planTotal / 2))],
    ifSoldForMore: { developerSharePct: t.flexible.developerGainSharePct, buyerSharePct, perMillionAbove: Math.floor(1_000_000 * buyerSharePct) / 100,
      example: { risePct: 20, soldFor: kobo(price + difference), difference, youGet: Math.floor(difference * buyerSharePct) / 100 } },
    inactivityMonths: t.flexible.inactivityMonths, noticeDays: t.flexible.noticeDays, maxMonths: t.flexible.maxMonths ?? null,
  };
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
    plans: state.terms.map((t): DeclaredPlan => isFlexibleInput(t) ? {
      id: t.id, name: t.name, kind: "flexible", depositPct: t.depositPct, depositAmount: null,
      instalmentCount: null, frequency: null, premiumPct: t.premiumPct ?? 0,
      flexible: { minimumContribution: t.flexible.minimumContribution ?? null, exitDeductionPct: t.flexible.exit.deductionPct, exitAppliesTo: t.flexible.exit.appliesTo,
        developerGainSharePct: t.flexible.developerGainSharePct, inactivityMonths: t.flexible.inactivityMonths, noticeDays: t.flexible.noticeDays, maxMonths: t.flexible.maxMonths ?? null },
      quotes: tiers.map((tier) => {
        const f = mockFlexibleQuote(t, tier.price);
        return { tierId: tier.id, tierLabel: tierLabel(tier), currency: tier.currency ?? "NGN", price: f.price, planTotal: f.planTotal, premium: f.premium,
          deposit: f.minimumToStart, instalmentCount: null, instalment: null, lastInstalment: null, flexible: f };
      }),
    } : {
      id: t.id, name: t.name, kind: "installment", depositPct: t.depositPct ?? null, depositAmount: t.depositAmount ?? null,
      instalmentCount: t.instalmentCount, frequency: t.frequency, premiumPct: t.premiumPct ?? 0, flexible: null,
      quotes: tiers.flatMap((tier) => {
        const q = mockQuote(t, tier.price);
        return q ? [{ ...q, tierId: tier.id, tierLabel: tierLabel(tier), currency: tier.currency ?? "NGN", flexible: null }] : [];
      }),
    }),
  };
}

// A demo tier's plans, as the marketplace listing carries them.
export function mockTierPlans(estateId: string, price: number): TierPlan[] {
  return instalmentTerms(terms(estateId)).flatMap((t) => {
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
  const t = instalmentTerms(terms(estateId)).find((p) => p.id === planId);
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
