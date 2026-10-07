// Backend integration seam for the developer portal's disclosure declarations
// (PD-1 to PD-6): the fee schedule, refund terms and default terms behind
// `/api/portal/estates/{id}/fees`, `/refund-terms` and `/default-terms`.
// See INTEGRATION.md.
//
// Every type below is transcribed from the backend DTO of the same name —
// FeeScheduleDto, FeeDto, DeclareFeesRequest, RefundTermsDto,
// DeclareRefundTermsRequest, DefaultTermsDto, DeclareDefaultTermsRequest —
// not inferred from the buyer-facing shapes in costDisclosureService.ts, which
// are a DIFFERENT contract (PublicFeeDto carries a MoneyRange; FeeDto carries
// amount / amountMin / amountMax as separate nullable fields).
//
// THERE IS NO EDIT AND NO DELETE. Each declaration writes a new version and the
// previous one is retained, so a buyer's acknowledgement can name exactly what
// they were shown. Nothing here, and nothing that calls this, may offer a way
// to alter or remove a declaration that was made.
//
// THE PLATFORM DOES NOT REGULATE AMOUNTS. DeclareFeesRequest's own schema says
// "no cap, no warning, no threshold". The validation below mirrors the
// backend's structural rules only — fixed-or-range, a stated basis for a range,
// a label for `other`, no duplicates — so a developer sees a field message
// rather than a 400. It never judges a figure.

import { ESTATES, type Currency } from "../data/mockData";
import { apiClient, ApiError } from "../lib/apiClient";
import { isMock } from "../lib/backends";
import { mockCostDisclosureFixture, type FeeDueTrigger, type FeeType, type PublicFee } from "./costDisclosureService";

export type { FeeDueTrigger, FeeType };

// The backend's RefundAppliesTo @JsonValue strings. Deliberately no default
// anywhere in this file: the two readings produce materially different figures
// and both source letters were ambiguous about which they meant.
export type RefundAppliesTo = "amount_paid" | "total_price";

export const FEE_TYPES: readonly FeeType[] = [
  "application", "setting_out", "infrastructure", "construction_supervision", "facility_management", "survey", "legal", "other",
];

export const DUE_TRIGGERS: readonly FeeDueTrigger[] = [
  "at_application", "at_allocation", "on_construction_start", "on_milestone", "before_occupation", "annual",
];

export const FEE_CURRENCIES: readonly Currency[] = ["NGN", "USD", "GBP", "EUR"];

export const FEE_TYPE_LABELS: Record<FeeType, string> = {
  application: "Application",
  setting_out: "Setting out",
  infrastructure: "Infrastructure",
  construction_supervision: "Construction supervision",
  facility_management: "Facility management",
  survey: "Survey",
  legal: "Legal",
  other: "Other",
};

// ─── Read shapes ─────────────────────────────────────────────────────────────

// FeeDto. A fixed fee carries `amount`; a variable one carries `amountMin` /
// `amountMax` and a `variationBasis`. Never both — and never a midpoint.
export interface EstateFee {
  feeType: FeeType;
  label: string | null;
  amount: number | null;
  amountMin: number | null;
  amountMax: number | null;
  currency: Currency;
  isFixed: boolean;
  variationBasis: string | null;
  dueTrigger: FeeDueTrigger;
  refundable: boolean;
  // Unavoidable, not "stated as unconditional" — see FeeScheduleForm's copy.
  isMandatory: boolean;
  notes: string | null;
}

// FeeScheduleDto. `declaredAt: null` means nobody has said anything, which
// blocks publication. An empty `fees` list WITH a `declaredAt` is a positive
// declaration of no extra charges, which permits it. Silence is not a
// disclosure, and this type keeps the two apart.
export interface FeeSchedule {
  version: number;
  declaredAt: string | null;
  fees: EstateFee[];
}

// RefundTermsDto.
export interface RefundTerms {
  version: number;
  deductionPct: number;
  processingDays: number;
  appliesTo: RefundAppliesTo;
  nonRefundableFeeTypes: FeeType[];
  notes: string | null;
}

// PenaltyTierDto.
export interface PenaltyTier {
  monthsLate: number;
  penaltyPct: number;
}

// DefaultTermsDto.
export interface DefaultTerms {
  version: number;
  revocationTrigger: string;
  revocationNoticeDays: number | null;
  // What happens to money already paid. Required: "your allocation may be
  // revoked" without this is not a disclosure.
  onRevocationRefund: string;
  // Stored, NOT tracked — nothing watches the clock or warns as it approaches.
  developmentDeadlineMonths: number | null;
  // Disclosed, NOT enforced — there is no resale flow yet.
  transferRequiresConsent: boolean;
  penaltyTiers: PenaltyTier[];
  notes: string | null;
}

// ─── Write shapes ────────────────────────────────────────────────────────────

// DeclareFeesRequest.FeeDeclaration.
export interface FeeDeclaration {
  feeType: FeeType;
  label: string | null;
  amount: number | null;
  amountMin: number | null;
  amountMax: number | null;
  currency: Currency;
  isFixed: boolean;
  variationBasis: string | null;
  dueTrigger: FeeDueTrigger;
  refundable: boolean;
  isMandatory: boolean;
  notes: string | null;
}

// DeclareFeesRequest. An empty `fees` is a valid declaration of "none" — which
// is exactly why the form must never submit one on the developer's behalf.
export interface DeclareFeesRequest {
  fees: FeeDeclaration[];
}

export interface DeclareRefundTermsRequest {
  deductionPct: number;
  processingDays: number;
  appliesTo: RefundAppliesTo;
  nonRefundableFeeTypes: FeeType[];
  notes: string | null;
}

export interface DeclareDefaultTermsRequest {
  revocationTrigger: string;
  revocationNoticeDays: number | null;
  onRevocationRefund: string;
  developmentDeadlineMonths: number | null;
  transferRequiresConsent: boolean;
  penaltyTiers: PenaltyTier[];
  notes: string | null;
}

// ─── Validation — structure only, never amounts ──────────────────────────────

// Keyed by a field path ("fees.2.variationBasis", "appliesTo") so a form can
// put each message beside the input it is about.
export type FieldErrors = Record<string, string>;

const blank = (s: string | null | undefined) => !s || !s.trim();
const isNum = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n);

// Mirrors EstateDisclosureService.validateAndBuild plus the request's bean
// validation (@PositiveOrZero). Deliberately NO upper bound, NO comparison with
// the land price and NO warning on size: one real infrastructure fee is 156%
// of the land it sits on, and that is a fact to disclose, not police.
export function validateFeeDeclarations(fees: FeeDeclaration[]): FieldErrors {
  const errors: FieldErrors = {};
  const seen = new Set<string>();

  fees.forEach((fee, i) => {
    const at = (field: string) => `fees.${i}.${field}`;
    const label = blank(fee.label) ? null : fee.label!.trim();

    if (fee.feeType === "other" && label === null) {
      errors[at("label")] = "Name this charge. An unnamed fee is a number, not a disclosure.";
    }
    const key = `${fee.feeType}|${label ?? ""}`;
    if (seen.has(key)) errors[at("feeType")] = "This fee is already in the schedule. Give it a different label if it's a separate charge.";
    seen.add(key);

    if (fee.isFixed) {
      if (!isNum(fee.amount)) errors[at("amount")] = "Enter the amount.";
      else if (fee.amount < 0) errors[at("amount")] = "An amount can't be negative.";
    } else {
      if (!isNum(fee.amountMin)) errors[at("amountMin")] = "Enter the lowest amount.";
      else if (fee.amountMin < 0) errors[at("amountMin")] = "An amount can't be negative.";
      if (!isNum(fee.amountMax)) errors[at("amountMax")] = "Enter the highest amount.";
      else if (fee.amountMax < 0) errors[at("amountMax")] = "An amount can't be negative.";
      if (isNum(fee.amountMin) && isNum(fee.amountMax) && fee.amountMax < fee.amountMin) {
        errors[at("amountMax")] = "The highest amount is below the lowest.";
      }
      // The whole reason a range is permitted. A fee that varies for no
      // stated reason is just a number that can change later.
      if (blank(fee.variationBasis)) {
        errors[at("variationBasis")] = "Say why this fee may vary — for example, building-material prices. A range needs a stated reason.";
      }
    }
  });

  return errors;
}

// Mirrors DeclareRefundTermsRequest's bean validation. `appliesTo` has no
// default and is checked here as a required choice, not a field with a value.
export function validateRefundTerms(input: Partial<DeclareRefundTermsRequest>): FieldErrors {
  const errors: FieldErrors = {};
  if (!isNum(input.deductionPct)) errors.deductionPct = "Enter the deduction percentage — 0 if nothing is deducted.";
  else if (input.deductionPct < 0 || input.deductionPct > 100) errors.deductionPct = "A percentage runs from 0 to 100.";
  if (!isNum(input.processingDays)) errors.processingDays = "Enter how many days a refund takes.";
  else if (input.processingDays < 0 || !Number.isInteger(input.processingDays)) errors.processingDays = "Enter a whole number of days.";
  if (input.appliesTo !== "amount_paid" && input.appliesTo !== "total_price") {
    errors.appliesTo = "Choose what the deduction is taken from. The two give different figures.";
  }
  return errors;
}

// Mirrors DeclareDefaultTermsRequest plus the service's duplicate-month check.
export function validateDefaultTerms(input: Partial<DeclareDefaultTermsRequest>): FieldErrors {
  const errors: FieldErrors = {};
  if (blank(input.revocationTrigger)) errors.revocationTrigger = "Say what triggers revocation.";
  if (blank(input.onRevocationRefund)) {
    errors.onRevocationRefund = "Say what happens to money already paid. Revocation without this is not a disclosure.";
  }
  if (input.revocationNoticeDays != null && (input.revocationNoticeDays < 0 || !Number.isInteger(input.revocationNoticeDays))) {
    errors.revocationNoticeDays = "Enter a whole number of days.";
  }
  if (input.developmentDeadlineMonths != null && (input.developmentDeadlineMonths <= 0 || !Number.isInteger(input.developmentDeadlineMonths))) {
    errors.developmentDeadlineMonths = "Enter a whole number of months, or leave it blank.";
  }
  if (typeof input.transferRequiresConsent !== "boolean") {
    errors.transferRequiresConsent = "Say whether a transfer needs your consent.";
  }
  const months = new Set<number>();
  (input.penaltyTiers ?? []).forEach((tier, i) => {
    if (!isNum(tier.monthsLate) || tier.monthsLate <= 0 || !Number.isInteger(tier.monthsLate)) {
      errors[`penaltyTiers.${i}.monthsLate`] = "Enter a whole number of months.";
    } else if (months.has(tier.monthsLate)) {
      errors[`penaltyTiers.${i}.monthsLate`] = "Two penalties for the same month.";
    } else {
      months.add(tier.monthsLate);
    }
    if (!isNum(tier.penaltyPct) || tier.penaltyPct < 0 || tier.penaltyPct > 100) {
      errors[`penaltyTiers.${i}.penaltyPct`] = "A percentage runs from 0 to 100.";
    }
  });
  return errors;
}

// ─── Form drafts → requests ──────────────────────────────────────────────────
//
// The forms hold strings and unanswered choices; these turn a draft into a
// request or a set of field errors. They live here, not in the components,
// because the rule they enforce is the one this slice exists for and it has to
// be testable without a browser:
//
//   AN UNTOUCHED FEE FORM IS NOT A DECLARATION OF NO FEES.
//
// The schedule starts "undecided". Only an explicit choice of "none" produces
// `{ fees: [] }`; "undecided" produces an error, and "fees" with no rows
// produces an error too rather than quietly becoming the empty declaration.
// Likewise every yes/no the backend requires starts unanswered (null), and
// `appliesTo` starts empty — nothing is defaulted on the developer's behalf.

export type FeeScheduleMode = "undecided" | "none" | "fees";

export interface FeeDraft {
  feeType: FeeType;
  label: string;
  pricing: "fixed" | "range" | "";
  amount: string;
  amountMin: string;
  amountMax: string;
  currency: Currency;
  variationBasis: string;
  dueTrigger: FeeDueTrigger | "";
  refundable: boolean | null;
  isMandatory: boolean | null;
  notes: string;
}

export function emptyFeeDraft(): FeeDraft {
  return {
    feeType: "infrastructure", label: "", pricing: "", amount: "", amountMin: "", amountMax: "",
    currency: "NGN", variationBasis: "", dueTrigger: "", refundable: null, isMandatory: null, notes: "",
  };
}

// Pre-fills a draft from a declared fee, for declaring the next version. The
// previous version is untouched either way.
export function feeDraftFrom(fee: EstateFee): FeeDraft {
  const str = (n: number | null) => (n === null ? "" : String(n));
  return {
    feeType: fee.feeType, label: fee.label ?? "", pricing: fee.isFixed ? "fixed" : "range",
    amount: str(fee.amount), amountMin: str(fee.amountMin), amountMax: str(fee.amountMax),
    currency: fee.currency, variationBasis: fee.variationBasis ?? "", dueTrigger: fee.dueTrigger,
    refundable: fee.refundable, isMandatory: fee.isMandatory, notes: fee.notes ?? "",
  };
}

const numOrNull = (s: string): number | null => (s.trim() === "" ? null : Number(s));
const textOrNull = (s: string): string | null => (s.trim() === "" ? null : s.trim());

export type BuildResult<T> = { request: T; errors?: undefined } | { request?: undefined; errors: FieldErrors };

export function buildFeesRequest(mode: FeeScheduleMode, drafts: FeeDraft[]): BuildResult<DeclareFeesRequest> {
  if (mode === "undecided") {
    return { errors: { mode: "Say whether this estate charges anything beyond the land price. Leaving this blank is not the same as declaring no fees." } };
  }
  if (mode === "none") return { request: { fees: [] } };
  if (drafts.length === 0) {
    return { errors: { mode: "Add at least one fee — or, if there are none, choose \"No charges beyond the land price\"." } };
  }

  const errors: FieldErrors = {};
  const fees: FeeDeclaration[] = drafts.map((d, i) => {
    const at = (field: string) => `fees.${i}.${field}`;
    if (d.pricing === "") errors[at("pricing")] = "Choose a fixed amount or a range.";
    if (d.dueTrigger === "") errors[at("dueTrigger")] = "Say when this fee falls due.";
    if (d.refundable === null) errors[at("refundable")] = "Say whether this fee is refundable.";
    if (d.isMandatory === null) errors[at("isMandatory")] = "Say whether a buyer can avoid this fee.";
    const isFixed = d.pricing !== "range";
    return {
      feeType: d.feeType,
      label: textOrNull(d.label),
      amount: isFixed ? numOrNull(d.amount) : null,
      amountMin: isFixed ? null : numOrNull(d.amountMin),
      amountMax: isFixed ? null : numOrNull(d.amountMax),
      currency: d.currency,
      isFixed,
      variationBasis: isFixed ? null : textOrNull(d.variationBasis),
      // Only a placeholder when unanswered — that case is already an error
      // above, so this value is never sent.
      dueTrigger: (d.dueTrigger || "at_application") as FeeDueTrigger,
      refundable: d.refundable === true,
      isMandatory: d.isMandatory === true,
      notes: textOrNull(d.notes),
    };
  });

  // Amount checks only apply once the fixed/range choice has been made.
  const structural = validateFeeDeclarations(fees);
  drafts.forEach((d, i) => {
    if (d.pricing === "") {
      for (const f of ["amount", "amountMin", "amountMax", "variationBasis"]) delete structural[`fees.${i}.${f}`];
    }
  });
  Object.assign(errors, structural);
  return Object.keys(errors).length > 0 ? { errors } : { request: { fees } };
}

export interface RefundDraft {
  deductionPct: string;
  processingDays: string;
  appliesTo: RefundAppliesTo | "";
  nonRefundableFeeTypes: FeeType[];
  notes: string;
}

export function refundDraftFrom(terms: RefundTerms | null): RefundDraft {
  if (!terms) return { deductionPct: "", processingDays: "", appliesTo: "", nonRefundableFeeTypes: [], notes: "" };
  return {
    deductionPct: String(terms.deductionPct), processingDays: String(terms.processingDays), appliesTo: terms.appliesTo,
    nonRefundableFeeTypes: [...terms.nonRefundableFeeTypes], notes: terms.notes ?? "",
  };
}

export function buildRefundRequest(draft: RefundDraft): BuildResult<DeclareRefundTermsRequest> {
  const partial: Partial<DeclareRefundTermsRequest> = {
    deductionPct: numOrNull(draft.deductionPct) ?? undefined,
    processingDays: numOrNull(draft.processingDays) ?? undefined,
    appliesTo: draft.appliesTo || undefined,
  };
  const errors = validateRefundTerms(partial);
  if (Object.keys(errors).length > 0) return { errors };
  return {
    request: {
      deductionPct: partial.deductionPct!, processingDays: partial.processingDays!, appliesTo: partial.appliesTo!,
      nonRefundableFeeTypes: draft.nonRefundableFeeTypes, notes: textOrNull(draft.notes),
    },
  };
}

export interface DefaultDraft {
  revocationTrigger: string;
  revocationNoticeDays: string;
  onRevocationRefund: string;
  developmentDeadlineMonths: string;
  transferRequiresConsent: boolean | null;
  penaltyTiers: { monthsLate: string; penaltyPct: string }[];
  notes: string;
}

export function defaultDraftFrom(terms: DefaultTerms | null): DefaultDraft {
  if (!terms) {
    return {
      revocationTrigger: "", revocationNoticeDays: "", onRevocationRefund: "", developmentDeadlineMonths: "",
      transferRequiresConsent: null, penaltyTiers: [], notes: "",
    };
  }
  const str = (n: number | null) => (n === null ? "" : String(n));
  return {
    revocationTrigger: terms.revocationTrigger, revocationNoticeDays: str(terms.revocationNoticeDays),
    onRevocationRefund: terms.onRevocationRefund, developmentDeadlineMonths: str(terms.developmentDeadlineMonths),
    transferRequiresConsent: terms.transferRequiresConsent,
    penaltyTiers: terms.penaltyTiers.map((t) => ({ monthsLate: String(t.monthsLate), penaltyPct: String(t.penaltyPct) })),
    notes: terms.notes ?? "",
  };
}

export function buildDefaultRequest(draft: DefaultDraft): BuildResult<DeclareDefaultTermsRequest> {
  const request = {
    revocationTrigger: draft.revocationTrigger.trim(),
    revocationNoticeDays: numOrNull(draft.revocationNoticeDays),
    onRevocationRefund: draft.onRevocationRefund.trim(),
    developmentDeadlineMonths: numOrNull(draft.developmentDeadlineMonths),
    transferRequiresConsent: draft.transferRequiresConsent,
    penaltyTiers: draft.penaltyTiers.map((t) => ({ monthsLate: Number(t.monthsLate.trim() || NaN), penaltyPct: Number(t.penaltyPct.trim() || NaN) })),
    notes: textOrNull(draft.notes),
  };
  const errors = validateDefaultTerms({ ...request, transferRequiresConsent: request.transferRequiresConsent ?? undefined });
  if (Object.keys(errors).length > 0) return { errors };
  return { request: { ...request, transferRequiresConsent: request.transferRequiresConsent! } };
}

// ─── Endpoints ───────────────────────────────────────────────────────────────

export async function fetchFeeSchedule(estateId: string): Promise<FeeSchedule> {
  if (!isMock("estateDisclosure")) return apiClient.get<FeeSchedule>(`/api/portal/estates/${estateId}/fees`);
  return currentFees(estateId);
}

export async function declareFees(estateId: string, request: DeclareFeesRequest): Promise<FeeSchedule> {
  if (!isMock("estateDisclosure")) return apiClient.put<FeeSchedule>(`/api/portal/estates/${estateId}/fees`, request);
  rejectIfInvalid(validateFeeDeclarations(request.fees));
  const next: FeeSchedule = {
    version: currentFees(estateId).version + 1,
    declaredAt: new Date().toISOString(),
    fees: request.fees.map((f) => ({ ...f, label: blank(f.label) ? null : f.label!.trim(), variationBasis: f.isFixed ? null : f.variationBasis!.trim() })),
  };
  history(mockFees, estateId).push(next);
  return next;
}

// 404 means nothing has been declared — returned as null, never as an empty
// policy with zeros in it.
export async function fetchRefundTerms(estateId: string): Promise<RefundTerms | null> {
  if (!isMock("estateDisclosure")) return nullOn404(() => apiClient.get<RefundTerms>(`/api/portal/estates/${estateId}/refund-terms`));
  return latest(mockRefund, estateId);
}

export async function declareRefundTerms(estateId: string, request: DeclareRefundTermsRequest): Promise<RefundTerms> {
  if (!isMock("estateDisclosure")) return apiClient.put<RefundTerms>(`/api/portal/estates/${estateId}/refund-terms`, request);
  rejectIfInvalid(validateRefundTerms(request));
  const next: RefundTerms = {
    ...request,
    version: (latest(mockRefund, estateId)?.version ?? 0) + 1,
    nonRefundableFeeTypes: [...new Set(request.nonRefundableFeeTypes)],
  };
  history(mockRefund, estateId).push(next);
  return next;
}

export async function fetchDefaultTerms(estateId: string): Promise<DefaultTerms | null> {
  if (!isMock("estateDisclosure")) return nullOn404(() => apiClient.get<DefaultTerms>(`/api/portal/estates/${estateId}/default-terms`));
  return latest(mockDefault, estateId);
}

export async function declareDefaultTerms(estateId: string, request: DeclareDefaultTermsRequest): Promise<DefaultTerms> {
  if (!isMock("estateDisclosure")) return apiClient.put<DefaultTerms>(`/api/portal/estates/${estateId}/default-terms`, request);
  rejectIfInvalid(validateDefaultTerms(request));
  const next: DefaultTerms = {
    ...request,
    version: (latest(mockDefault, estateId)?.version ?? 0) + 1,
    penaltyTiers: [...request.penaltyTiers].sort((a, b) => a.monthsLate - b.monthsLate),
  };
  history(mockDefault, estateId).push(next);
  return next;
}

async function nullOn404<T>(load: () => Promise<T>): Promise<T | null> {
  try {
    return await load();
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

// ─── Buyer's-eye view of a declaration (PD-7) ────────────────────────────────

// Reshapes the developer's own declaration into the buyer-facing PublicFee so
// FeeBreakdown can render it. This is re-labelling, not arithmetic: a fixed
// fee's single figure, or a range's own two ends, with `isRange` taken from the
// developer's own fixed/variable choice. No sum, no midpoint.
export function toPublicFee(fee: EstateFee): PublicFee {
  const amount = fee.isFixed
    ? (fee.amount === null ? null : { min: fee.amount, max: fee.amount, isRange: false })
    : (fee.amountMin === null || fee.amountMax === null ? null : { min: fee.amountMin, max: fee.amountMax, isRange: fee.amountMin !== fee.amountMax });
  return {
    feeType: fee.feeType,
    label: fee.label ?? FEE_TYPE_LABELS[fee.feeType],
    amount,
    currency: fee.currency,
    isFixed: fee.isFixed,
    variationBasis: fee.variationBasis ?? undefined,
    dueTrigger: fee.dueTrigger,
    refundable: fee.refundable,
    isMandatory: fee.isMandatory,
    notes: fee.notes ?? undefined,
  };
}

// ─── Mock store ──────────────────────────────────────────────────────────────
//
// Versioned exactly as the backend is: every declaration appends, nothing is
// replaced, and "current" is the last entry.

const mockFees = new Map<string, FeeSchedule[]>();
const mockRefund = new Map<string, RefundTerms[]>();
const mockDefault = new Map<string, DefaultTerms[]>();

function history<T>(store: Map<string, T[]>, estateId: string): T[] {
  let list = store.get(estateId);
  if (!list) { list = []; store.set(estateId, list); }
  return list;
}

function latest<T>(store: Map<string, T[]>, estateId: string): T | null {
  const list = store.get(estateId);
  return list && list.length > 0 ? list[list.length - 1] : null;
}

// Version 0 with no `declaredAt` is the backend's "nothing said" answer — the
// same shape FeeScheduleDto returns for an estate that has never declared.
function currentFees(estateId: string): FeeSchedule {
  return latest(mockFees, estateId) ?? { version: 0, declaredAt: null, fees: [] };
}

function rejectIfInvalid(errors: FieldErrors): void {
  const messages = Object.values(errors);
  if (messages.length > 0) {
    throw new ApiError(400, messages[0], { message: messages[0], code: "INVALID_REQUEST" });
  }
}

// True when the mock store holds a declaration — read by portalEstatesService
// when it stands in for the backend's eligibility view.
export function mockHasDeclaredFees(estateId: string): boolean {
  return currentFees(estateId).declaredAt !== null;
}

export function mockHasDeclaredRefundTerms(estateId: string): boolean {
  return latest(mockRefund, estateId) !== null;
}

// The two seeded estates whose buyer-facing fixtures carry a real fee schedule
// get the same schedule here as version 1, so the portal and the marketplace
// describe one estate the same way. Converted field for field — including the
// facility-management charge whose letters state no figure, which stays
// amount-less rather than acquiring an invented one.
//
// Refund and default terms are NOT seeded: the fixtures don't say whether the
// deduction applies to the amount paid or the total price, and choosing one
// here would be exactly the guess `appliesTo` exists to prevent.
function seedFromBuyerFixtures(): void {
  for (const estateId of ["greenfield-park", "double-king-estate"]) {
    const disclosure = mockCostDisclosureFixture(estateId);
    const estate = ESTATES.find((e) => e.id === estateId);
    if (!disclosure || !estate || disclosure.fees.length === 0) continue;
    const recurring = disclosure.tiers[0]?.recurringFees ?? [];
    const fees = [...disclosure.fees, ...recurring.filter((r) => !disclosure.fees.some((f) => f.feeType === r.feeType))];
    mockFees.set(estateId, [{
      version: 1,
      // The schedule was in place when the estate was listed; the fixtures
      // carry no separate declaration date, so the listing date stands in.
      declaredAt: new Date(estate.publishedDate).toISOString(),
      fees: fees.map(fromPublicFee),
    }]);
  }
}

function fromPublicFee(fee: PublicFee): EstateFee {
  return {
    feeType: fee.feeType,
    label: fee.label,
    amount: fee.isFixed && fee.amount ? fee.amount.min : null,
    amountMin: !fee.isFixed && fee.amount ? fee.amount.min : null,
    amountMax: !fee.isFixed && fee.amount ? fee.amount.max : null,
    currency: fee.currency,
    isFixed: fee.isFixed,
    variationBasis: fee.variationBasis ?? null,
    dueTrigger: fee.dueTrigger,
    refundable: fee.refundable,
    isMandatory: fee.isMandatory,
    notes: fee.notes ?? null,
  };
}

if (isMock("estateDisclosure")) seedFromBuyerFixtures();
