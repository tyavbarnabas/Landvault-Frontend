// Backend integration seam for cost disclosure. See INTEGRATION.md.
//
// THE RULE THIS FILE EXISTS TO PROTECT: display, never recompute.
//
// Every buyer-facing figure below — totalCommitment, refundAmount, totalLoss,
// each penalty step's amount — arrives already computed in naira from the
// backend. Nothing in the frontend applies a percentage, sums a schedule, or
// collapses a range to a midpoint. That arithmetic has one home and it is
// server-side; a second implementation here would drift, and the two would
// then disagree about what a buyer owes.
//
// These endpoints are PUBLIC — no token. Cost disclosure must be readable
// before anyone registers, so nothing here may be gated on an auth state.
//
// The mock figures are drawn from real Nigerian estate offer documents: the
// land price is what a buyer searches on, and the fees are what the offer
// letter adds afterwards. Greenfield Park is the worked example —
// ₦4,500,000 of land carrying ₦8,110,000 of declared fees.

import type { Currency } from "../data/mockData";
import { apiClient } from "../lib/apiClient";

// Low and high are EQUAL for a fixed amount, different for a genuine range.
// Consumers must never average the two — see MoneyRangeDisplay, which is the
// single place this type is rendered.
export interface MoneyRange {
  low: number;
  high: number;
  currency: Currency;
}

// Arrives snake_case from the backend and is kept that way — this is the
// backend's vocabulary, not a display string. Grouping/labelling happens at
// the render layer (see DUE_TRIGGER_LABELS in FeeBreakdown.tsx).
export type FeeDueTrigger =
  | "at_application"
  | "at_allocation"
  | "on_construction_start"
  | "milestone_based"
  | "annually"
  | "before_occupation";

// A milestone-based fee is not one payment. Both source letters break the
// infrastructure charge down identically, by construction stage, and that
// schedule is part of the disclosure — a buyer who reads one number has not
// been told when any of it falls due.
export interface FeeMilestone {
  label: string;
  pct: number;
}

export interface PublicFee {
  feeType: string;
  label: string;
  // `amount` carries its own currency (MoneyRange does), so there is no
  // second `currency` field that could disagree with it. A fixed fee is a
  // range whose low equals its high.
  //
  // NULL means the source document states the obligation but no figure —
  // the facility-management charge in both letters is exactly this. An
  // unstated amount is rendered as unstated; it is never guessed, and never
  // shown as zero.
  amount: MoneyRange | null;
  isFixed: boolean;
  // The developer's own stated reason a non-fixed fee may move. Rendered
  // beside the number, never hidden in a tooltip.
  variationBasis?: string;
  dueTrigger: FeeDueTrigger;
  // Present only for a milestone-based fee — the stages the document itself
  // names, with the document's own percentages. The frontend renders these
  // percentages as written and never converts one into a naira figure.
  milestones?: FeeMilestone[];
  refundable: boolean;
  isMandatory: boolean;
  notes?: string;
}

export interface TierCommitment {
  tierId: string;
  sizeSqm: number;
  landPrice: number;
  currency: Currency;
  oneOffFees: MoneyRange;
  totalCommitment: MoneyRange;
  // Null when this tier carries no corner premium — not zero, not the
  // non-corner total repeated.
  totalCommitmentIfCorner: MoneyRange | null;
  // Deliberately OUTSIDE totalCommitment. One year of a perpetual charge is
  // an arbitrary thing to add to a purchase price, and an avoidable charge
  // isn't a commitment at all.
  recurringFees: PublicFee[];
  optionalFees: PublicFee[];
  // True when at least one declared fee is in another currency and has been
  // left out of the total, because amounts in different currencies are never
  // summed. The excluded fees still appear in the breakdown.
  totalExcludesOtherCurrencyFees: boolean;
}

export interface RefundOutcome {
  deductionPct: number;
  deduction: number;
  nonRefundableFees: number;
  refundAmount: number;
  totalLoss: number;
  // Optional: omitted when the source document states no processing period.
  processingDays?: number;
}

export interface PenaltyStep {
  monthsLate: number;
  penaltyPct: number;
  // Already computed against basisLandPrice. A percentage alone is abstract;
  // this is the figure a buyer reacts to.
  amount: number;
}

export interface Revocation {
  trigger: string;
  noticeDays: number;
  // What happens to money already paid — the part buyers never think to ask
  // about, and the reason this field exists separately at all.
  paymentsAlreadyMade: string;
}

export interface ExitCosts {
  basisLandPrice: number;
  currency: Currency;
  refundOutcome: RefundOutcome;
  penaltySteps: PenaltyStep[];
  // Null when no revocation clause has been sourced for this estate. Absent
  // is honest; an invented clause is not.
  revocation: Revocation | null;
}

// "declared" carries real figures. "exempt_grandfathered" is a listing that
// predates the disclosure requirement — it is NOT a listing with no fees, and
// must never render as though it were. An estate that has simply declared
// nothing is represented by a null disclosure, so there is no object for a
// component to accidentally render as zero.
export type DisclosureStatus = "declared" | "exempt_grandfathered";

export interface EstateCostDisclosure {
  estateId: string;
  status: DisclosureStatus;
  tiers: TierCommitment[];
  feeSchedule: PublicFee[];
  exitCosts: ExitCosts | null;
}

function fixed(amount: number, currency: Currency = "NGN"): MoneyRange {
  return { low: amount, high: amount, currency };
}

// Exported for tests: no fee in either source letter is a genuine range, so
// the range rendering path is exercised with an explicitly synthetic fee
// rather than by inventing one into a fixture that looks like a real listing.
export function range(low: number, high: number, currency: Currency = "NGN"): MoneyRange {
  return { low, high, currency };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────
//
// EVERY fee below corresponds to a clause in one of two real offer/allocation
// letters (Double King Estate and Top Rank Platinum City, August 2026). No
// invented fee types, and no invented amounts where the letters state one.
//
// That discipline is not decoration: a fixture that looks like a real listing
// is a screenshot waiting to happen, and an invented fee in a screenshot is
// indistinguishable from a real one. The fabricated construction milestones
// and the fabricated AGIS encroachment claims were both removed from this
// repo for the same reason.
//
// The two totals — ₦10,010,000 and ₦12,610,000 — are checkable against paper,
// and the backend's integration tests assert exactly these figures. If either
// layer's commitment maths is wrong, the numbers stop matching immediately
// rather than at integration.
//
// Deliberately NOT represented here, because neither letter contains them:
// a survey/documentation fee, a legal/deed fee, a power-connection fee, an
// optional perimeter-wall fee, and any fee charged in a currency other than
// naira. The range and cross-currency code paths are exercised in
// costDisclosureService.test.ts with obviously synthetic fees instead.

// Both letters break the infrastructure charge down identically, by stage.
const INFRASTRUCTURE_MILESTONES: FeeMilestone[] = [
  { label: "After DPC", pct: 20 },
  { label: "At lintel level", pct: 15 },
  { label: "After decking", pct: 20 },
  { label: "At upper floor lintel", pct: 20 },
  { label: "After roofing", pct: 25 },
];

// Quoted from both letters. Cement and other material prices genuinely move,
// so this is a real constraint rather than a device for moving the goalposts
// — which is why it is disclosed as the developer's own stated reason.
const INFRASTRUCTURE_VARIATION = "Subject to change due to fluctuations in the prices of building materials";

// ── Double King Estate — land ₦6,000,000, total commitment ₦10,010,000 ──────
const DOUBLE_KING_FEES: PublicFee[] = [
  { feeType: "APPLICATION", label: "Application", amount: fixed(10_000), isFixed: true, dueTrigger: "at_application", refundable: false, isMandatory: true, notes: "Offer letter clause 1. Non-refundable, payable to apply." },
  { feeType: "SETTING_OUT", label: "Setting out & excavation", amount: fixed(300_000), isFixed: true, dueTrigger: "on_construction_start", refundable: false, isMandatory: true, notes: "Allocation letter clause 6." },
  {
    feeType: "INFRASTRUCTURE", label: "Infrastructure", amount: fixed(3_500_000), isFixed: false,
    variationBasis: INFRASTRUCTURE_VARIATION, dueTrigger: "milestone_based", milestones: INFRASTRUCTURE_MILESTONES,
    refundable: false, isMandatory: true, notes: "Allocation letter clause 16.",
  },
  { feeType: "CONSTRUCTION_SUPERVISION", label: "Construction supervision", amount: fixed(200_000), isFixed: true, dueTrigger: "on_construction_start", refundable: false, isMandatory: true, notes: "Allocation letter clause 9." },
];

const DOUBLE_KING_RECURRING: PublicFee[] = [
  {
    feeType: "FACILITY_MANAGEMENT", label: "Facility management",
    // The letter states the obligation and the deadline but NO figure. An
    // amount is not invented to fill the gap.
    amount: null, isFixed: false, dueTrigger: "annually", refundable: false, isMandatory: true,
    notes: "Allocation letter clause 15 — payable annually by 15 January. Clause 14 obliges the estate to perpetually appoint a facility manager, so this is an indefinite commitment to a manager the buyer does not choose.",
  },
];

// ── Top Rank Platinum City — land ₦4,500,000, total commitment ₦12,610,000 ──
const TOP_RANK_FEES: PublicFee[] = [
  { feeType: "APPLICATION", label: "Application", amount: fixed(10_000), isFixed: true, dueTrigger: "at_application", refundable: false, isMandatory: true, notes: "Offer letter clause 1. Non-refundable, payable to apply." },
  { feeType: "SETTING_OUT", label: "Setting out & excavation", amount: fixed(500_000), isFixed: true, dueTrigger: "on_construction_start", refundable: false, isMandatory: true, notes: "Offer letter clause 3." },
  {
    feeType: "INFRASTRUCTURE", label: "Infrastructure", amount: fixed(7_000_000), isFixed: false,
    variationBasis: INFRASTRUCTURE_VARIATION, dueTrigger: "milestone_based", milestones: INFRASTRUCTURE_MILESTONES,
    refundable: false, isMandatory: true, notes: "Offer letter clause 4.",
  },
  { feeType: "CONSTRUCTION_SUPERVISION", label: "Construction supervision", amount: fixed(600_000), isFixed: true, dueTrigger: "on_construction_start", refundable: false, isMandatory: true, notes: "Offer letter clause 6." },
];

const TOP_RANK_RECURRING: PublicFee[] = [
  {
    feeType: "FACILITY_MANAGEMENT", label: "Facility management",
    amount: null, isFixed: false,
    variationBasis: "Subject to change by the appointed facility manager",
    dueTrigger: "annually", refundable: false, isMandatory: true,
    notes: "Allocation letter clause 11 — payable annually by 15 January, at a rate the facility manager may change.",
  },
];

const MOCK_DISCLOSURES: Record<string, EstateCostDisclosure> = {
  // ₦4,500,000 of land carrying ₦8,110,000 of fees — 180% above the
  // advertised price.
  "greenfield-park": {
    estateId: "greenfield-park",
    status: "declared",
    feeSchedule: TOP_RANK_FEES,
    tiers: [
      {
        tierId: "greenfield-180", sizeSqm: 180, landPrice: 4_500_000, currency: "NGN",
        oneOffFees: fixed(8_110_000), totalCommitment: fixed(12_610_000), totalCommitmentIfCorner: null,
        recurringFees: TOP_RANK_RECURRING, optionalFees: [], totalExcludesOtherCurrencyFees: false,
      },
      {
        // The letter's fees are flat amounts, not proportional to plot size,
        // so a larger plot carries the same ₦8,110,000.
        tierId: "greenfield-300", sizeSqm: 300, landPrice: 7_200_000, currency: "NGN",
        oneOffFees: fixed(8_110_000), totalCommitment: fixed(15_310_000), totalCommitmentIfCorner: fixed(16_030_000),
        recurringFees: TOP_RANK_RECURRING, optionalFees: [], totalExcludesOtherCurrencyFees: false,
      },
    ],
    exitCosts: {
      basisLandPrice: 4_500_000,
      currency: "NGN",
      // 20% on withdrawal and up to 20% for falling behind: there is no exit
      // from this estate that does not cost. Neither clause is hidden on its
      // own — the trap is only visible with both in one view.
      refundOutcome: { deductionPct: 20, deduction: 900_000, nonRefundableFees: 10_000, refundAmount: 3_600_000, totalLoss: 910_000 },
      penaltySteps: [
        { monthsLate: 3, penaltyPct: 5, amount: 225_000 },
        { monthsLate: 6, penaltyPct: 10, amount: 450_000 },
        { monthsLate: 12, penaltyPct: 20, amount: 900_000 },
      ],
      // No revocation clause has been sourced from these letters yet, so none
      // is shown. See the note in CostDisclosureSection.
      revocation: null,
    },
  },

  // ₦6,000,000 of land carrying ₦4,010,000 of fees — 67% above the
  // advertised price. The letter's ₦6,000,000 is already the price of a
  // 250 sqm CORNER plot, so no further corner premium is applied on top.
  "double-king-estate": {
    estateId: "double-king-estate",
    status: "declared",
    feeSchedule: DOUBLE_KING_FEES,
    tiers: [
      {
        tierId: "double-king-250", sizeSqm: 250, landPrice: 6_000_000, currency: "NGN",
        oneOffFees: fixed(4_010_000), totalCommitment: fixed(10_010_000), totalCommitmentIfCorner: null,
        recurringFees: DOUBLE_KING_RECURRING, optionalFees: [], totalExcludesOtherCurrencyFees: false,
      },
    ],
    exitCosts: null,
  },

  // Listed before the platform required a declared fee schedule. This is NOT
  // an estate with no fees — its terms simply were never filed here, which is
  // a materially different thing to tell a buyer.
  "crown-court": {
    estateId: "crown-court",
    status: "exempt_grandfathered",
    feeSchedule: [],
    tiers: [],
    exitCosts: null,
  },
};

// Null means this estate has declared nothing. Callers render NOTHING for a
// null — never a zero, never an estimate.
export async function fetchCostDisclosure(estateId: string): Promise<EstateCostDisclosure | null> {
  if (apiClient.isMockMode) return MOCK_DISCLOSURES[estateId] ?? null;
  try {
    return await apiClient.get<EstateCostDisclosure>(`/api/public/estates/${estateId}/cost-disclosure`);
  } catch {
    return null;
  }
}

// Selection, not arithmetic: finds the commitment the backend already
// computed for a tier at this exact land price. Returns null rather than the
// nearest match — a total shown against the wrong tier is worse than no total.
export function tierCommitmentForLandPrice(disclosure: EstateCostDisclosure | null, landPrice: number): TierCommitment | null {
  if (!disclosure || disclosure.status !== "declared") return null;
  return disclosure.tiers.find((t) => t.landPrice === landPrice) ?? null;
}

export function tierCommitmentForSize(disclosure: EstateCostDisclosure | null, sizeSqm: number): TierCommitment | null {
  if (!disclosure || disclosure.status !== "declared") return null;
  return disclosure.tiers.find((t) => t.sizeSqm === sizeSqm) ?? null;
}

export function isRange(money: MoneyRange): boolean {
  return money.low !== money.high;
}
