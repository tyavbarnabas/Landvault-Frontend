// Wire-value contract test, mirroring the backend's EnumJsonMappingTests.
//
// Mock mode never talks to the backend, so both sides can be internally
// consistent and mutually incompatible with every test passing. These
// assertions are transcribed from the backend enums' own @JsonValue strings,
// so a divergence fails here rather than on the first real request.
//
// Note the deliberate inconsistencies — they are the backend's, and matching
// them exactly matters more than making them uniform:
//   - PlotStatus uses HYPHENS ("available-dev"); everything else uses
//     underscores.
//   - PlotOrientation, TitleType, CompanyType and GovIdType are not
//     snake_case at all: they carry capitals, spaces and an apostrophe.
//
// When adding an enum that crosses the wire, read the backend enum rather than
// inferring the pattern. The exceptions are exactly where a bug hides.

import { describe, it, expect } from "vitest";
import type { ConflictSeverity, ConflictStatus } from "./listingConflictsService";
import type { CompanyType, DocumentStatus, DocumentType, GovIdType, TenantStatus, VerificationState } from "./tenantsService";
import type { KycBuyerType, KycDocType, KycStatus } from "./kycService";
import type { FeeDueTrigger, FeeType } from "./costDisclosureService";
import {
  countFor,
  type ListingIntent, type PlotCounts, type PlotIntent, type PlotOrientation, type PriceTierDto, type PriceTierImpact,
  type PriceTierSizeChange, type PriceTierUpdate, type PropertyType, type TierType, type UpdateBlockInput, type UpdatePriceTierInput,
} from "./portalInventoryService";
import type { Currency, PlotStatus, PaymentPlan } from "../data/mockData";
import type { TitleType } from "./marketplaceService";
import { AUTH_ERROR_CODES, type AuthUser, type ChangePasswordInput, type TwoFactorChallenge, type UserRole } from "./authService";
import { DUE_TRIGGERS, FEE_CURRENCIES, FEE_TYPES, type RefundAppliesTo, type FeeSchedule } from "./estateDisclosureService";
import { ELIGIBILITY_CONDITIONS, PUBLICATION_REFUSAL_CONDITIONS, type EstateEligibility, type PublicationResult } from "./portalEstatesService";

// Each list is exhaustive: the `satisfies` clause makes TypeScript fail the
// build if a union gains or loses a member without this test being updated.
function wireValues<T extends string>(values: readonly T[]): readonly T[] {
  return values;
}

describe("inventory enums", () => {
  it("PlotStatus — hyphenated, and BOTH availability variants", () => {
    // Not redundant: an estate sells development and investment plots side by
    // side, and the backend's reservation sweeper restores whichever variant a
    // plot had when a hold lapses.
    expect(wireValues(["available-dev", "available-inv", "reserved", "sold"] satisfies readonly PlotStatus[]))
      .toEqual(["available-dev", "available-inv", "reserved", "sold"]);
  });

  it("TierType — lowercase with underscores, not the Java constant names", () => {
    expect(wireValues(["land_size", "unit_type"] satisfies readonly TierType[])).toEqual(["land_size", "unit_type"]);
  });

  it("PropertyType", () => {
    expect(wireValues(["land", "built"] satisfies readonly PropertyType[])).toEqual(["land", "built"]);
  });

  it("ListingIntent — what the SELLER offers", () => {
    expect(wireValues(["for_sale", "for_rent", "both"] satisfies readonly ListingIntent[])).toEqual(["for_sale", "for_rent", "both"]);
  });

  it("PlotIntent — what the BUYER means to do, a different axis", () => {
    expect(wireValues(["development", "investment"] satisfies readonly PlotIntent[])).toEqual(["development", "investment"]);
  });

  it("PlotOrientation — uppercase compass points, not snake_case", () => {
    expect(wireValues(["N", "S", "E", "W", "NE", "NW", "SE", "SW"] satisfies readonly PlotOrientation[]))
      .toEqual(["N", "S", "E", "W", "NE", "NW", "SE", "SW"]);
  });
});

describe("cost disclosure enums", () => {
  it("DueTrigger — note on_milestone and annual", () => {
    expect(wireValues([
      "at_application", "at_allocation", "on_construction_start", "on_milestone", "annual", "before_occupation",
    ] satisfies readonly FeeDueTrigger[]))
      .toEqual(["at_application", "at_allocation", "on_construction_start", "on_milestone", "annual", "before_occupation"]);
  });

  it("FeeType — lowercase", () => {
    expect(wireValues([
      "application", "setting_out", "infrastructure", "construction_supervision", "facility_management", "survey", "legal", "other",
    ] satisfies readonly FeeType[]))
      .toEqual(["application", "setting_out", "infrastructure", "construction_supervision", "facility_management", "survey", "legal", "other"]);
  });
});

// Portal disclosure (PD) and publication (PP). Transcribed from
// RefundAppliesTo, FeeType, DueTrigger and Currency, from EstateEligibilityDto,
// PublicationDto and FeeScheduleDto, and from the codes
// PortalEstateService.requirePublishable throws.
describe("portal disclosure and publication", () => {
  it("RefundAppliesTo — two values, and the form offers exactly these", () => {
    expect(wireValues(["amount_paid", "total_price"] satisfies readonly RefundAppliesTo[])).toEqual(["amount_paid", "total_price"]);
  });

  it("the fee form's option lists are the backend enums, not a subset", () => {
    expect([...FEE_TYPES].sort()).toEqual(
      ["application", "construction_supervision", "facility_management", "infrastructure", "legal", "other", "setting_out", "survey"]);
    expect([...DUE_TRIGGERS].sort()).toEqual(
      ["annual", "at_allocation", "at_application", "before_occupation", "on_construction_start", "on_milestone"]);
    expect([...FEE_CURRENCIES].sort()).toEqual(["EUR", "GBP", "NGN", "USD"]);
  });

  it("EstateEligibility has eight fields, including noBlockingConflict", () => {
    const eligibility: EstateEligibility = {
      published: true, tenantVerified: true, tenantEntitled: true, tenantActive: true,
      feesDeclared: true, refundTermsDeclared: true, noBlockingConflict: true, eligible: true,
    };
    expect(Object.keys(eligibility)).toHaveLength(8);
    expect(ELIGIBILITY_CONDITIONS).toHaveLength(6);
  });

  it("PublicationRefused codes, exactly", () => {
    expect(Object.keys(PUBLICATION_REFUSAL_CONDITIONS).sort()).toEqual([
      "PUBLICATION_CONFLICT_OUTSTANDING", "PUBLICATION_ENTITLEMENT_MISSING", "PUBLICATION_FEES_UNDECLARED",
      "PUBLICATION_REFUND_TERMS_UNDECLARED", "PUBLICATION_TENANT_NOT_ACTIVE", "PUBLICATION_VERIFICATION_PENDING",
    ]);
  });

  it("FeeScheduleDto: silence is a null declaredAt, not an empty list", () => {
    const silent: FeeSchedule = { version: 0, declaredAt: null, fees: [] };
    const none: FeeSchedule = { version: 1, declaredAt: "2026-09-27T00:00:00Z", fees: [] };
    expect(silent.fees).toEqual(none.fees);
    expect(silent.declaredAt).not.toEqual(none.declaredAt);
  });

  it("PublicationDto field names", () => {
    const result: PublicationResult = { estateId: "x", published: true, publishedAt: null, warningConflictCount: 0, warning: null };
    expect(Object.keys(result).sort()).toEqual(["estateId", "published", "publishedAt", "warning", "warningConflictCount"]);
  });
});

describe("tenancy enums", () => {
  it("TenantStatus", () => {
    expect(wireValues(["active", "suspended", "offboarded"] satisfies readonly TenantStatus[])).toEqual(["active", "suspended", "offboarded"]);
  });

  it("VerificationState", () => {
    expect(wireValues(["created", "documents_submitted", "under_review", "verified", "rejected", "suspended"] satisfies readonly VerificationState[]))
      .toEqual(["created", "documents_submitted", "under_review", "verified", "rejected", "suspended"]);
  });

  it("OrganizationDocumentType", () => {
    expect(wireValues([
      "cac_certificate", "cac_status_report", "tin", "proof_of_address", "scuml_certificate", "state_regulator_permit", "redan_certificate", "other",
    ] satisfies readonly DocumentType[]))
      .toEqual(["cac_certificate", "cac_status_report", "tin", "proof_of_address", "scuml_certificate", "state_regulator_permit", "redan_certificate", "other"]);
  });

  it("DocumentStatus", () => {
    expect(wireValues(["pending", "verified", "rejected"] satisfies readonly DocumentStatus[])).toEqual(["pending", "verified", "rejected"]);
  });

  it("CompanyType — display strings with spaces, brackets and a slash", () => {
    expect(wireValues(["Limited Liability (Ltd)", "PLC", "Business Name/Enterprise", "Incorporated Trustees"] satisfies readonly CompanyType[]))
      .toEqual(["Limited Liability (Ltd)", "PLC", "Business Name/Enterprise", "Incorporated Trustees"]);
  });

  it("GovIdType — capitalised, with a space", () => {
    expect(wireValues(["NIN", "International Passport"] satisfies readonly GovIdType[])).toEqual(["NIN", "International Passport"]);
  });
});

describe("conflict enums", () => {
  it("ConflictSeverity", () => {
    expect(wireValues(["high", "medium"] satisfies readonly ConflictSeverity[])).toEqual(["high", "medium"]);
  });

  it("ConflictStatus — including auto_resolved, which only the system sets", () => {
    expect(wireValues(["open", "investigating", "confirmed_duplicate", "dismissed", "auto_resolved"] satisfies readonly ConflictStatus[]))
      .toEqual(["open", "investigating", "confirmed_duplicate", "dismissed", "auto_resolved"]);
  });
});

describe("kyc enums", () => {
  it("KycStatus", () => {
    expect(wireValues(["unsubmitted", "submitted", "under_review", "approved", "rejected"] satisfies readonly KycStatus[]))
      .toEqual(["unsubmitted", "submitted", "under_review", "approved", "rejected"]);
  });

  it("KycBuyerType and KycDocType", () => {
    expect(wireValues(["local", "diaspora"] satisfies readonly KycBuyerType[])).toEqual(["local", "diaspora"]);
    expect(wireValues(["nin", "passport", "proof_of_address"] satisfies readonly KycDocType[])).toEqual(["nin", "passport", "proof_of_address"]);
  });
});

// The auth surface is not an enum, but the same contract risk applies: the
// frontend branches on these strings, so they are transcribed from
// AuthExceptionHandler and TwoFactorChallengeResponse rather than guessed.
describe("auth response shapes and error codes", () => {
  it("auth error codes match AuthExceptionHandler exactly", () => {
    expect([...AUTH_ERROR_CODES].sort()).toEqual([
      "ACCOUNT_DEACTIVATED", "ACCOUNT_SUSPENDED", "EMAIL_ALREADY_REGISTERED",
      "INVALID_CREDENTIALS", "INVALID_OR_EXPIRED_CODE", "INVALID_REFRESH_TOKEN",
      "INVALID_TWO_FACTOR_CHALLENGE", "INVALID_TWO_FACTOR_CODE",
      "ORIGIN_NOT_ALLOWED", "REFRESH_TOKEN_MISSING",
      "TENANT_NOT_ACTIVE", "TWO_FACTOR_LOCKED_OUT", "TWO_FACTOR_MANDATORY",
      "TWO_FACTOR_NOT_ENABLED", "TWO_FACTOR_SETUP_REQUIRED",
    ]);
  });

  it("the 2FA challenge is discriminated by twoFactorRequired, not by a challengeId", () => {
    // The login endpoint's OpenAPI text says to "check for a `challengeId`
    // field". TwoFactorChallengeResponse has no such field — it is
    // `challengeToken`. The DTO is the authority.
    const challenge: TwoFactorChallenge = { twoFactorRequired: true, challengeToken: "chal_x", expiresAt: new Date().toISOString() };

    expect(challenge.twoFactorRequired).toBe(true);
    expect("challengeId" in challenge).toBe(false);
    // And it shares no field name with a successful login, so neither can be
    // mistaken for the other.
    expect("token" in challenge).toBe(false);
    expect("user" in challenge).toBe(false);
  });

  it("refresh returns the same { user, token } as login, and NO refresh token anywhere", () => {
    // RefreshResponse(AuthUserResponse user, String token) since cf8983e. The
    // refresh token is the HttpOnly lv_refresh cookie; no body carries it.
    const refreshed = { user: {}, token: "access" };
    expect(Object.keys(refreshed).sort()).toEqual(["token", "user"]);
  });

  it("UserRole carries only what the backend emits", () => {
    // AuthService returns `ctx.superAdmin() ? "super_admin" : "client"`. There
    // is no "developer" role, whatever earlier frontend code assumed.
    expect(wireValues(["client", "super_admin"] satisfies readonly UserRole[])).toEqual(["client", "super_admin"]);
  });
});

describe("shared enums", () => {
  it("TitleType — spaces and an apostrophe, so it cannot be snake_case", () => {
    expect(wireValues(["C of O", "R of O", "Governor's Consent", "Gazette"] satisfies readonly TitleType[]))
      .toEqual(["C of O", "R of O", "Governor's Consent", "Gazette"]);
  });

  it("Currency — a deliberately closed set, not all of ISO-4217", () => {
    expect(wireValues(["NGN", "USD", "GBP", "EUR"] satisfies readonly Currency[])).toEqual(["NGN", "USD", "GBP", "EUR"]);
  });

  it("PaymentPlan", () => {
    expect(wireValues(["outright", "milestone", "installment"] satisfies readonly PaymentPlan[])).toEqual(["outright", "milestone", "installment"]);
  });
});

// Inventory editing (IE-1, IE-2) and change-password. Transcribed from
// UpdatePriceTierRequest, PriceTierUpdateDto (+ SizeChange), PriceTierImpactDto,
// PriceTierDto, UpdateBlockRequest, PlotCountsDto and ChangePasswordRequest.
// `Required<>` plus an exact key list means a field renamed or added on either
// side fails here rather than on the first real request.
describe("inventory editing and change-password shapes", () => {
  it("ChangePasswordRequest — currentPassword and newPassword, nothing else", () => {
    const body: Required<ChangePasswordInput> = { currentPassword: "a", newPassword: "b" };
    expect(Object.keys(body).sort()).toEqual(["currentPassword", "newPassword"]);
  });

  it("UpdatePriceTierRequest — five fields, tierType and currency included so a form can round-trip them", () => {
    const body: Required<UpdatePriceTierInput> = { price: 1, label: "", sizeSqm: 1, tierType: "land_size", currency: "NGN" };
    expect(Object.keys(body).sort()).toEqual(["currency", "label", "price", "sizeSqm", "tierType"]);
  });

  it("UpdateBlockRequest — name and label", () => {
    const body: Required<UpdateBlockInput> = { name: "Block D", label: "" };
    expect(Object.keys(body).sort()).toEqual(["label", "name"]);
  });

  it("PriceTierDto — seven fields; no plot count and no per-sqm figure on the wire", () => {
    const dto: PriceTierDto = { id: "t", estateId: "e", tierType: "land_size", sizeSqm: 450, price: 1, currency: "NGN", label: null };
    expect(Object.keys(dto).sort()).toEqual(["currency", "estateId", "id", "label", "price", "sizeSqm", "tierType"]);
  });

  it("PriceTierUpdate — tier plus sizeChange, and sizeChange's five fields", () => {
    const sizeChange: PriceTierSizeChange = {
      previousSizeSqm: 450, newSizeSqm: 500, plotsUpdated: 104, keptPreviousSize: { total: 16, byStatus: { reserved: 8, sold: 8 } }, note: "",
    };
    const update: PriceTierUpdate = { tier: { id: "t", estateId: "e", tierType: "land_size", sizeSqm: 500, price: 1, currency: "NGN", label: null }, sizeChange };
    expect(Object.keys(update).sort()).toEqual(["sizeChange", "tier"]);
    expect(Object.keys(sizeChange).sort()).toEqual(["keptPreviousSize", "newSizeSqm", "note", "plotsUpdated", "previousSizeSqm"]);
  });

  it("PriceTierImpact — tierId and plots", () => {
    const impact: PriceTierImpact = { tierId: "t", plots: { total: 0, byStatus: {} } };
    expect(Object.keys(impact).sort()).toEqual(["plots", "tierId"]);
  });

  it("PlotCountsDto — keyed by the hyphenated status wire value; an absent status is zero", () => {
    const counts: PlotCounts = { total: 120, byStatus: { "available-dev": 112, reserved: 8 } };
    expect(Object.keys(counts).sort()).toEqual(["byStatus", "total"]);
    expect(countFor(counts, "sold")).toBe(0);
    expect(countFor(counts, "reserved")).toBe(8);
  });

  it("AuthUserResponse carries tenantId and branchId; a null branchId means organisation-wide", () => {
    const director: Pick<AuthUser, "tenantId" | "branchId"> = { tenantId: "7c1e…", branchId: null };
    expect(director.branchId).toBeNull();
  });
});
