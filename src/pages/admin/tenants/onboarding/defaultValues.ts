import type { TenantOnboardingValues } from "../../../../lib/onboarding/schema";

function newLocalId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// A function, not a constant, so every wizard instance (and every "Add
// director" click) gets its own fresh ids rather than sharing references.
export function getOnboardingDefaultValues(): TenantOnboardingValues {
  return {
    registeredName: "",
    tradingName: "",
    rcNumber: "",
    companyType: "Limited Liability (Ltd)",
    dateOfIncorporation: "",
    registeredAddress: { street: "", city: "", state: "Lagos" },
    operatingAddress: { street: "", city: "", state: "Lagos" },
    sameAsRegisteredAddress: true,
    statesOfOperation: [],

    fullName: "",
    roleTitle: "",
    workEmail: "",
    phone: "+234",
    govIdType: "NIN",
    govIdNumber: "",

    companyEmail: "",
    companyPhone: "+234",
    website: "",
    socials: { instagram: "", twitter: "", facebook: "", linkedin: "" },

    cacCertificate: null,
    cacStatusReport: null,
    tinNumber: "",
    tinDocument: null,
    proofOfAddress: null,

    scumlNumber: "",
    scumlCertificate: null,
    lasreraRegNumber: "",
    lasreraDocument: null,
    otherStateRegulators: [],
    redanNumber: "",
    additionalPermits: [],

    directors: [
      { id: newLocalId("director"), fullName: "", role: "", nationality: "Nigerian", idType: "NIN", idNumber: "", bvn: "", ownershipPct: 0 },
    ],
    attestation: false,

    bankName: "Access Bank",
    accountNumber: "",
    accountName: "",
    settlementCurrency: "NGN",
    gateways: {},

    accuracyAttestation: false,
    termsAgreement: false,
  };
}

export function newDirector() {
  return { id: newLocalId("director"), fullName: "", role: "", nationality: "Nigerian", idType: "NIN" as const, idNumber: "", bvn: "", ownershipPct: 0 };
}

export function newStateRegulatorEntry() {
  return { id: newLocalId("regulator"), state: "Lagos" as const, regulatorName: "", regNumber: "", document: null };
}

export function newPermit() {
  return { id: newLocalId("permit"), name: "", document: null };
}

// Field-name groups per step, used with react-hook-form's `trigger()` to
// validate only the current step before advancing.
export const STEP_FIELDS: (keyof TenantOnboardingValues | `${string}.${string}`)[][] = [
  ["registeredName", "tradingName", "rcNumber", "companyType", "dateOfIncorporation", "registeredAddress", "operatingAddress", "statesOfOperation"],
  ["fullName", "roleTitle", "workEmail", "phone", "govIdType", "govIdNumber"],
  ["companyEmail", "companyPhone", "website", "socials"],
  ["cacCertificate", "cacStatusReport", "tinNumber", "tinDocument", "proofOfAddress"],
  ["scumlNumber", "scumlCertificate", "lasreraRegNumber", "lasreraDocument", "otherStateRegulators", "redanNumber", "additionalPermits"],
  ["directors", "attestation"],
  ["bankName", "accountNumber", "accountName", "settlementCurrency", "gateways"],
  ["accuracyAttestation", "termsAgreement"],
];

export const STEP_LABELS = [
  "Company identity",
  "Primary contact",
  "Company contact & presence",
  "Corporate documents",
  "Regulatory & compliance",
  "Directors & ownership",
  "Financial & settlement",
  "Review & submit",
];
