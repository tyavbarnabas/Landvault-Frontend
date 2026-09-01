// Zod schemas for the company (tenant) onboarding wizard, one per step,
// composed into a single schema for the Step 8 review/submit. Types are
// inferred from these schemas (z.infer) rather than hand-written twice.
//
// The bank-account-name-vs-company-name mismatch check is deliberately NOT
// part of financialSchema — the spec calls it "a warning, not a blocker", so
// it's computed separately in Step7Financial.tsx and shown as a banner,
// independent of whether the form is valid.

import { z } from "zod";
import { NIGERIAN_STATES } from "../../data/nigerianStates";
import { NIGERIAN_BANKS } from "../../data/nigerianBanks";

const nigerianState = z.enum(NIGERIAN_STATES);
const nigerianBank = z.enum(NIGERIAN_BANKS);

// File validation shared across every upload field in the wizard.
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_FILE_TYPES = ["application/pdf", "image/jpeg", "image/png"];

export function fileSchema(required: boolean) {
  const base = z
    .instanceof(File)
    .refine((f) => f.size <= MAX_FILE_SIZE, "File must be 10MB or smaller.")
    .refine((f) => ACCEPTED_FILE_TYPES.includes(f.type), "Only PDF, JPG, or PNG files are accepted.");
  return required ? base : base.nullable().optional();
}

// ─── Step 1 — Company identity ─────────────────────────────────────────────

export const COMPANY_TYPES = ["Limited Liability (Ltd)", "PLC", "Business Name/Enterprise", "Incorporated Trustees"] as const;

const addressSchema = z.object({
  street: z.string().min(1, "Street address is required."),
  city: z.string().min(1, "City is required."),
  state: nigerianState,
});

export const companyIdentitySchema = z.object({
  registeredName: z.string().min(2, "Registered company name is required."),
  tradingName: z.string().optional(),
  rcNumber: z
    .string()
    .min(1, "RC number is required.")
    .regex(/^(RC\s?)?\d{5,8}$/i, "Enter a valid CAC RC number, e.g. RC1234567."),
  companyType: z.enum(COMPANY_TYPES),
  dateOfIncorporation: z
    .string()
    .min(1, "Date of incorporation is required.")
    .refine((d) => new Date(d) <= new Date(), "Date of incorporation cannot be in the future."),
  registeredAddress: addressSchema,
  operatingAddress: addressSchema,
  sameAsRegisteredAddress: z.boolean(),
  statesOfOperation: z.array(nigerianState).min(1, "Select at least one state of operation."),
});
export type CompanyIdentityValues = z.infer<typeof companyIdentitySchema>;

// ─── Step 2 — Primary contact / first admin ────────────────────────────────

export const GOV_ID_TYPES = ["NIN", "International Passport"] as const;

export const primaryContactSchema = z.object({
  fullName: z.string().min(2, "Full name is required."),
  roleTitle: z.string().min(1, "Role / job title is required."),
  workEmail: z.string().email("Enter a valid work email."),
  phone: z.string().min(8, "Enter a valid phone number."),
  govIdType: z.enum(GOV_ID_TYPES),
  govIdNumber: z.string().min(4, "Government ID number is required."),
});
export type PrimaryContactValues = z.infer<typeof primaryContactSchema>;

// ─── Step 3 — Company contact & presence ───────────────────────────────────

export const companyPresenceSchema = z.object({
  companyEmail: z.string().email("Enter a valid company email."),
  companyPhone: z.string().min(8, "Enter a valid company phone number."),
  website: z.string().url("Enter a valid URL, e.g. https://example.com").optional().or(z.literal("")),
  socials: z.object({
    instagram: z.string().optional(),
    twitter: z.string().optional(),
    facebook: z.string().optional(),
    linkedin: z.string().optional(),
  }),
});
export type CompanyPresenceValues = z.infer<typeof companyPresenceSchema>;

// ─── Step 4 — Corporate documents ──────────────────────────────────────────
// NOTE: land title documents (C of O, R of O, Governor's Consent, Gazette,
// survey plan) are intentionally NOT collected here. Title evidence is
// per-estate, not per-company — a company can hold clean title on one
// estate and none on another — and gets captured when an estate is created
// (no estate-creation flow exists in this repo yet).

export const documentsSchema = z.object({
  cacCertificate: fileSchema(true),
  cacStatusReport: fileSchema(true),
  tinNumber: z.string().min(1, "TIN is required."),
  tinDocument: fileSchema(true),
  proofOfAddress: fileSchema(true),
});
export type DocumentsValues = z.infer<typeof documentsSchema>;

// ─── Step 5 — Regulatory & compliance ───────────────────────────────────────

const stateRegulatorEntrySchema = z.object({
  id: z.string(),
  state: nigerianState,
  regulatorName: z.string().min(1, "Regulator name is required."),
  regNumber: z.string().min(1, "Registration number is required."),
  document: fileSchema(true),
});

export const regulatorySchema = z.object({
  scumlNumber: z.string().min(1, "SCUML registration number is required."),
  scumlCertificate: fileSchema(true),
  lasreraRegNumber: z.string().optional(),
  lasreraDocument: fileSchema(false),
  otherStateRegulators: z.array(stateRegulatorEntrySchema),
  redanNumber: z.string().optional(),
  additionalPermits: z.array(z.object({ id: z.string(), name: z.string().min(1), document: fileSchema(true) })),
});
export type RegulatoryValues = z.infer<typeof regulatorySchema>;

// ─── Step 6 — Directors & beneficial ownership ─────────────────────────────

export const BENEFICIAL_OWNER_THRESHOLD = 25;

// SENSITIVE: idNumber and bvn are NDPR-regulated personal data.
// TODO (backend): encrypt at rest, log every read against the director record
// (see SA-2.2 global user lookup's audit requirement), and define a retention
// policy — don't keep these longer than a documented compliance need.
export const directorSchema = z.object({
  id: z.string(),
  fullName: z.string().min(2, "Director name is required."),
  role: z.string().min(1, "Director's role is required."),
  nationality: z.string().min(1, "Nationality is required."),
  idType: z.enum(GOV_ID_TYPES),
  idNumber: z.string().min(4, "ID number is required."),
  bvn: z.string().optional(),
  ownershipPct: z.number({ error: "Enter a number." }).min(0, "Must be 0 or more.").max(100, "Cannot exceed 100%."),
});
export type DirectorValues = z.infer<typeof directorSchema>;

export const directorsStepSchema = z.object({
  directors: z.array(directorSchema).min(1, "Add at least one director."),
  attestation: z.boolean().refine((v) => v === true, "The submitting director must confirm they're authorised to register this company."),
});
export type DirectorsStepValues = z.infer<typeof directorsStepSchema>;

export function isBeneficialOwner(ownershipPct: number): boolean {
  return ownershipPct >= BENEFICIAL_OWNER_THRESHOLD;
}

// ─── Step 7 — Financial & settlement ───────────────────────────────────────

export const GATEWAY_NAMES = ["Paystack", "Flutterwave", "Monnify", "Opay", "Titan"] as const;
export type GatewayName = (typeof GATEWAY_NAMES)[number];

export const financialSchema = z.object({
  bankName: nigerianBank,
  accountNumber: z.string().regex(/^\d{10}$/, "Enter a valid 10-digit NUBAN account number."),
  accountName: z.string().min(2, "Account name is required."),
  settlementCurrency: z.enum(["NGN", "USD", "GBP", "EUR"]),
  // Keyed by string, not GATEWAY_NAMES, so an empty object ({}) — nothing
  // connected yet — is a valid default; the UI only ever writes GatewayName keys.
  gateways: z.record(z.string(), z.enum(["connected", "pending"])),
});
export type FinancialValues = z.infer<typeof financialSchema>;

// A soft, non-blocking compliance signal — never a schema failure.
export function accountNameLooksMismatched(companyName: string, accountName: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const a = normalize(companyName);
  const b = normalize(accountName);
  if (!a || !b) return false;
  return !a.includes(b) && !b.includes(a);
}

// ─── Step 8 — Review & submit ──────────────────────────────────────────────

export const reviewStepSchema = z.object({
  accuracyAttestation: z.boolean().refine((v) => v === true, "You must confirm the information provided is accurate."),
  termsAgreement: z.boolean().refine((v) => v === true, "You must agree to the platform terms."),
});
export type ReviewStepValues = z.infer<typeof reviewStepSchema>;

// ─── Composed master schema ─────────────────────────────────────────────────

export const tenantOnboardingSchema = z.object({
  ...companyIdentitySchema.shape,
  ...primaryContactSchema.shape,
  ...companyPresenceSchema.shape,
  ...documentsSchema.shape,
  ...regulatorySchema.shape,
  ...directorsStepSchema.shape,
  ...financialSchema.shape,
  ...reviewStepSchema.shape,
});
export type TenantOnboardingValues = z.infer<typeof tenantOnboardingSchema>;
