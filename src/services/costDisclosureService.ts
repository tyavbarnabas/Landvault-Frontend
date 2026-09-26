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

// The backend's MoneyRangeDto exactly: min, max, and the backend's OWN
// determination of whether this is a range. It carries NO currency — currency
// lives on the parent DTO (a tier's `currency`, a fee's `currency`), so it can
// never disagree with its own amount.
//
// `isRange` is read, never recomputed by comparing min and max: the backend
// already made that call and the two must not be able to differ.
export interface MoneyRange {
  min: number;
  max: number;
  isRange: boolean;
}

// Arrives snake_case from the backend and is kept that way — this is the
// backend's vocabulary, not a display string. Grouping/labelling happens at
// the render layer (see DUE_TRIGGER_LABELS in FeeBreakdown.tsx).
// The backend's DueTrigger @JsonValue strings, exactly. Note "on_milestone"
// and "annual" — not "milestone_based"/"annually", which is what an earlier
// pass guessed.
export type FeeDueTrigger =
  | "at_application"
  | "at_allocation"
  | "on_construction_start"
  | "on_milestone"
  | "annual"
  | "before_occupation";

// The backend's FeeType @JsonValue strings.
export type FeeType =
  | "application"
  | "setting_out"
  | "infrastructure"
  | "construction_supervision"
  | "facility_management"
  | "survey"
  | "legal"
  | "other";

// A milestone-based fee is not one payment. Both source letters break the
// infrastructure charge down identically, by construction stage, and that
// schedule is part of the disclosure — a buyer who reads one number has not
// been told when any of it falls due.
export interface FeeMilestone {
  label: string;
  pct: number;
}

export interface PublicFee {
  // The backend's FeeType @JsonValue strings — lowercase with underscores.
  feeType: FeeType;
  label: string;
  // NULL means the source document states the obligation but no figure — the
  // facility-management charge in both source letters is exactly this. An
  // unstated amount renders as unstated; never guessed, never shown as zero.
  amount: MoneyRange | null;
  // On the fee, not on its amount — matching PublicFeeDto.
  currency: Currency;
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
  // Which tier these figures are computed against — they illustrate that tier,
  // not any particular buyer's position.
  basisTierId: string;
  basisTierLabel: string;
  basisLandPrice: number;
  currency: Currency;
  // Assumes payment in full: a buyer's maximum exposure, not a personal
  // figure. A refund against what was actually paid needs payment records.
  ifYouWithdraw: RefundOutcome;
  // In naira rather than percentages.
  ifYouFallBehind: PenaltyStep[];
  // Null when no revocation clause has been sourced for this estate. Absent
  // is honest; an invented clause is not.
  revocation: Revocation | null;
  // The backend's own "no free exit" determination — read, never re-derived
  // here. A client-side version would eventually disagree with it.
  bothPathsCarryACost: boolean;
}

// Matches CostDisclosureDto: fees and exitCosts, nothing else.
//
// `fees` may legitimately be EMPTY — that means the developer declared there
// are no charges beyond the land price, which is a statement, not a gap. An
// estate that declared nothing at all cannot be listed in the first place.
//
// `exitCosts: null` is how a GRANDFATHERED estate presents: one listed before
// the disclosure requirement existed. There is no status string for it — the
// null IS the signal. That is still not "an estate with no exit costs", and
// must never render as though it were.
//
// Tier commitments do NOT live here; they hang off the listing (see
// `tiers` on the estate's marketplace listing), which is why they are carried
// alongside rather than inside.
export interface EstateCostDisclosure {
  estateId: string;
  fees: PublicFee[];
  exitCosts: ExitCosts | null;
  // Not part of CostDisclosureDto — carried here because the frontend needs
  // per-tier commitments and the listing endpoint supplies them. Empty for a
  // grandfathered estate.
  tiers: TierCommitment[];
}

function fixed(amount: number): MoneyRange {
  return { min: amount, max: amount, isRange: false };
}

// Exported for tests: no fee in either source letter is a genuine range, so
// the range rendering path is exercised with an explicitly synthetic fee
// rather than by inventing one into a fixture that looks like a real listing.
export function range(min: number, max: number): MoneyRange {
  return { min, max, isRange: min !== max };
}

// ─── Fixtures ────────────────────────────────────────────────────────────────
//
// EVERY fee below corresponds to a clause in one of two real offer/allocation
// letters (Double King Estate and Top Rank Platinum City, August 2026). No
// invented fee types, and no invented amounts where the letters state one.
//
// That discipline is not decoration: a fixture that looks like a real listing
// is a screenshot waiting to happen, and an invented fee in a screenshot is
// indistinguishable from a real one.
//
// Wire values here are the BACKEND's: `feeType` from FeeType, `dueTrigger`
// from DueTrigger, amounts as MoneyRange {min, max, isRange} with currency on
// the parent. Mock and real modes therefore agree.
//
// The two totals — ₦10,010,000 and ₦12,610,000 — are checkable against paper,
// and the backend's integration tests assert exactly these figures.

const NGN: Currency = "NGN";

// Both letters break the infrastructure charge down identically, by stage.
const INFRASTRUCTURE_MILESTONES: FeeMilestone[] = [
  { label: "After DPC", pct: 20 },
  { label: "At lintel level", pct: 15 },
  { label: "After decking", pct: 20 },
  { label: "At upper floor lintel", pct: 20 },
  { label: "After roofing", pct: 25 },
];

// Quoted from both letters. Cement and other material prices genuinely move,
// so this is a real constraint rather than a device for moving the goalposts.
const INFRASTRUCTURE_VARIATION = "Subject to change due to fluctuations in the prices of building materials";

// ── Double King Estate — land ₦6,000,000, total commitment ₦10,010,000 ──────
const DOUBLE_KING_FEES: PublicFee[] = [
  { feeType: "application", label: "Application", amount: fixed(10_000), currency: NGN, isFixed: true, dueTrigger: "at_application", refundable: false, isMandatory: true, notes: "Offer letter clause 1. Non-refundable, payable to apply." },
  { feeType: "setting_out", label: "Setting out & excavation", amount: fixed(300_000), currency: NGN, isFixed: true, dueTrigger: "on_construction_start", refundable: false, isMandatory: true, notes: "Allocation letter clause 6." },
  {
    feeType: "infrastructure", label: "Infrastructure", amount: fixed(3_500_000), currency: NGN, isFixed: false,
    variationBasis: INFRASTRUCTURE_VARIATION, dueTrigger: "on_milestone", milestones: INFRASTRUCTURE_MILESTONES,
    refundable: false, isMandatory: true, notes: "Allocation letter clause 16.",
  },
  { feeType: "construction_supervision", label: "Construction supervision", amount: fixed(200_000), currency: NGN, isFixed: true, dueTrigger: "on_construction_start", refundable: false, isMandatory: true, notes: "Allocation letter clause 9." },
];

const DOUBLE_KING_RECURRING: PublicFee[] = [
  {
    feeType: "facility_management", label: "Facility management",
    // The letter states the obligation and the deadline but NO figure. An
    // amount is not invented to fill the gap.
    amount: null, currency: NGN, isFixed: false, dueTrigger: "annual", refundable: false, isMandatory: true,
    notes: "Allocation letter clause 15 — payable annually by 15 January. Clause 14 obliges the estate to perpetually appoint a facility manager, so this is an indefinite commitment to a manager the buyer does not choose.",
  },
];

// ── Top Rank Platinum City — land ₦4,500,000, total commitment ₦12,610,000 ──
const TOP_RANK_FEES: PublicFee[] = [
  { feeType: "application", label: "Application", amount: fixed(10_000), currency: NGN, isFixed: true, dueTrigger: "at_application", refundable: false, isMandatory: true, notes: "Offer letter clause 1. Non-refundable, payable to apply." },
  { feeType: "setting_out", label: "Setting out & excavation", amount: fixed(500_000), currency: NGN, isFixed: true, dueTrigger: "on_construction_start", refundable: false, isMandatory: true, notes: "Offer letter clause 3." },
  {
    feeType: "infrastructure", label: "Infrastructure", amount: fixed(7_000_000), currency: NGN, isFixed: false,
    variationBasis: INFRASTRUCTURE_VARIATION, dueTrigger: "on_milestone", milestones: INFRASTRUCTURE_MILESTONES,
    refundable: false, isMandatory: true, notes: "Offer letter clause 4.",
  },
  { feeType: "construction_supervision", label: "Construction supervision", amount: fixed(600_000), currency: NGN, isFixed: true, dueTrigger: "on_construction_start", refundable: false, isMandatory: true, notes: "Offer letter clause 6." },
];

const TOP_RANK_RECURRING: PublicFee[] = [
  {
    feeType: "facility_management", label: "Facility management",
    amount: null, currency: NGN, isFixed: false,
    variationBasis: "Subject to change by the appointed facility manager",
    dueTrigger: "annual", refundable: false, isMandatory: true,
    notes: "Allocation letter clause 11 — payable annually by 15 January, at a rate the facility manager may change.",
  },
];

const MOCK_DISCLOSURES: Record<string, EstateCostDisclosure> = {
  // ₦4,500,000 of land carrying ₦8,110,000 of fees — 180% above the
  // advertised price.
  "greenfield-park": {
    estateId: "greenfield-park",
    fees: TOP_RANK_FEES,
    tiers: [
      {
        tierId: "greenfield-180", sizeSqm: 180, landPrice: 4_500_000, currency: NGN,
        oneOffFees: fixed(8_110_000), totalCommitment: fixed(12_610_000), totalCommitmentIfCorner: null,
        recurringFees: TOP_RANK_RECURRING, optionalFees: [], totalExcludesOtherCurrencyFees: false,
      },
      {
        // The letter's fees are flat amounts, not proportional to plot size,
        // so a larger plot carries the same ₦8,110,000.
        tierId: "greenfield-300", sizeSqm: 300, landPrice: 7_200_000, currency: NGN,
        oneOffFees: fixed(8_110_000), totalCommitment: fixed(15_310_000), totalCommitmentIfCorner: fixed(16_030_000),
        recurringFees: TOP_RANK_RECURRING, optionalFees: [], totalExcludesOtherCurrencyFees: false,
      },
    ],
    exitCosts: {
      basisTierId: "greenfield-180",
      basisTierLabel: "180 sqm",
      basisLandPrice: 4_500_000,
      currency: NGN,
      // 20% on withdrawal and up to 20% for falling behind: there is no exit
      // from this estate that does not cost. Neither clause is hidden on its
      // own — the trap is only visible with both in one view.
      ifYouWithdraw: { deductionPct: 20, deduction: 900_000, nonRefundableFees: 10_000, refundAmount: 3_600_000, totalLoss: 910_000 },
      ifYouFallBehind: [
        { monthsLate: 3, penaltyPct: 5, amount: 225_000 },
        { monthsLate: 6, penaltyPct: 10, amount: 450_000 },
        { monthsLate: 12, penaltyPct: 20, amount: 900_000 },
      ],
      // No revocation clause has been sourced from these letters yet.
      revocation: null,
      bothPathsCarryACost: true,
    },
  },

  // ₦6,000,000 of land carrying ₦4,010,000 of fees — 67% above the advertised
  // price. The letter's ₦6,000,000 is already the price of a 250 sqm CORNER
  // plot, so no further corner premium is applied on top.
  "double-king-estate": {
    estateId: "double-king-estate",
    fees: DOUBLE_KING_FEES,
    tiers: [
      {
        tierId: "double-king-250", sizeSqm: 250, landPrice: 6_000_000, currency: NGN,
        oneOffFees: fixed(4_010_000), totalCommitment: fixed(10_010_000), totalCommitmentIfCorner: null,
        recurringFees: DOUBLE_KING_RECURRING, optionalFees: [], totalExcludesOtherCurrencyFees: false,
      },
    ],
    exitCosts: null,
  },

  // Listed before the platform required a declared fee schedule. Grandfathered
  // estates report `feesDeclared: true` server-side and carry no exit costs —
  // `exitCosts: null` with an empty fee list IS that state. It is NOT an
  // estate with no fees, and must never render as though it were.
  "crown-court": {
    estateId: "crown-court",
    fees: [],
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
  return disclosure?.tiers.find((t) => t.landPrice === landPrice) ?? null;
}

export function tierCommitmentForSize(disclosure: EstateCostDisclosure | null, sizeSqm: number): TierCommitment | null {
  return disclosure?.tiers.find((t) => t.sizeSqm === sizeSqm) ?? null;
}

// A listing that predates the disclosure requirement: it reports its fee
// schedule as declared server-side, but has no fees and no exit costs to show.
// There is no status string for this — the shape IS the signal — and it is a
// materially different thing from an estate that genuinely charges nothing,
// which would have declared an EMPTY fee list with exit costs present.
export function isGrandfathered(disclosure: EstateCostDisclosure | null): boolean {
  return !!disclosure && disclosure.fees.length === 0 && disclosure.tiers.length === 0 && disclosure.exitCosts === null;
}

// The backend's own flag, never a re-derivation from min/max.
export function isRange(money: MoneyRange): boolean {
  return money.isRange;
}
