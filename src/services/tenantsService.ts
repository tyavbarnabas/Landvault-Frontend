// Backend integration seam for platform tenant management (Super Admin only).
// Covers the Super Admin backlog's Epic 1 — tenant lifecycle & onboarding,
// including the full company-onboarding wizard (SA-1.1) and its verification
// state machine / audit trail (SA-1.2). See INTEGRATION.md.
//
// Two deliberately separate axes, per the onboarding spec:
//   - `status`           — can this tenant's staff use the portal at all?
//   - `verificationState` — can this tenant publish to the marketplace or
//                           collect payments? (SA-1.2's actual gate)
// A tenant can be `active` + `under_review` at once (exploring the portal,
// setting up estates, while compliance review is still in progress) — that's
// intentional, not a bug: forcing full verification before any portal access
// kills onboarding completion.

import { apiClient } from "../lib/apiClient";
import type { Currency } from "../data/mockData";
import type { NigerianState } from "../data/nigerianStates";

export type TenantStatus = "active" | "suspended" | "offboarded";
export type TenantPlan = "starter" | "growth" | "enterprise";
export type VerificationState = "created" | "documents_submitted" | "under_review" | "verified" | "rejected" | "suspended";

export interface TenantEntitlements {
  marketplacePublishing: boolean;
  mlmModule: boolean;
  fxRails: boolean;
}

export interface TenantBranch {
  id: string;
  name: string;
  managerName: string;
  estateCount: number;
}

export interface Address {
  street: string;
  city: string;
  state: NigerianState;
}

export type CompanyType = "Limited Liability (Ltd)" | "PLC" | "Business Name/Enterprise" | "Incorporated Trustees";
export type GovIdType = "NIN" | "International Passport";

export interface CompanyIdentity {
  registeredName: string;
  tradingName?: string;
  rcNumber: string;
  companyType: CompanyType;
  dateOfIncorporation: string;
  registeredAddress: Address;
  operatingAddress: Address;
  statesOfOperation: NigerianState[];
}

export interface PrimaryContact {
  fullName: string;
  roleTitle: string;
  workEmail: string;
  phone: string;
  govIdType: GovIdType;
  govIdNumber: string;
}

export interface CompanyPresence {
  companyEmail: string;
  companyPhone: string;
  website?: string;
  socials: { instagram?: string; twitter?: string; facebook?: string; linkedin?: string };
}

// Land title documents (C of O, R of O, Governor's Consent, Gazette, survey
// plan) are intentionally NOT part of this type — title evidence is
// per-estate, not per-company, since a company can hold clean title on one
// estate and none on another. Collected/verified when an estate is created
// (no estate-creation flow exists in this repo yet).
export type DocumentType =
  | "cac_certificate" | "cac_status_report" | "tin" | "proof_of_address"
  | "scuml_certificate" | "state_regulator_permit" | "redan_certificate" | "other";
export type DocumentStatus = "pending" | "verified" | "rejected";

export interface TenantDocument {
  id: string;
  type: DocumentType;
  fileName: string;
  size: number;
  status: DocumentStatus;
  rejectionReason?: string;
  uploadedAt: string;
}

export interface StateRegulatorEntry {
  id: string;
  state: string;
  regulatorName: string;
  regNumber: string;
  documentId?: string;
}

export interface Regulatory {
  scumlNumber: string;
  // Includes LASRERA as a regular entry (state: "Lagos") when applicable —
  // no separate field, since the wizard just pre-fills one of these rather
  // than modeling LASRERA as structurally different from any other state
  // regulator.
  stateRegulators: StateRegulatorEntry[];
  redanNumber?: string;
  additionalPermits: { id: string; name: string; documentId?: string }[];
}

// SENSITIVE: idNumber and bvn are NDPR-regulated personal data.
// TODO (backend): encrypt at rest, restrict reads to compliance staff, log
// every read against the director record (see SA-2.2's audit requirement),
// and define a retention policy — don't keep these longer than a documented
// compliance need requires.
export interface Director {
  id: string;
  fullName: string;
  role: string;
  nationality: string;
  idType: GovIdType;
  idNumber: string;
  bvn?: string;
  ownershipPct: number;
  isBeneficialOwner: boolean;
}

export type GatewayName = "Paystack" | "Flutterwave" | "Monnify" | "Opay" | "Titan";
export type GatewayStatus = "connected" | "pending";

export interface FinancialSettlement {
  bankName: string;
  accountNumber: string;
  accountName: string;
  settlementCurrency: Currency;
  gateways: Partial<Record<GatewayName, GatewayStatus>>;
}

export interface VerificationDecision {
  id: string;
  reviewerName: string;
  timestamp: string;
  decision: "approved" | "rejected" | "request_more_info";
  reason?: string;
  failedDocumentIds?: string[];
}

export interface Tenant {
  id: string;
  status: TenantStatus;
  plan: TenantPlan;
  entitlements: TenantEntitlements;
  branches: TenantBranch[];
  createdDate: string;

  // Populated together at Stage 1 (account creation) — a tenant never exists
  // without these.
  identity: CompanyIdentity;
  primaryContact: PrimaryContact;
  presence: CompanyPresence;

  // Populated together at Stage 2 (verification submission).
  documents: TenantDocument[];
  regulatory?: Regulatory;
  directors: Director[];
  directorsAttestation: boolean;
  financial?: FinancialSettlement;

  verificationState: VerificationState;
  verificationHistory: VerificationDecision[]; // append-only audit trail
}

export function tenantDisplayName(t: Tenant): string {
  return t.identity.tradingName || t.identity.registeredName;
}

export interface CreateTenantDraftInput {
  identity: CompanyIdentity;
  primaryContact: PrimaryContact;
  presence: CompanyPresence;
  plan: TenantPlan;
}

export interface SubmitVerificationInput {
  documents: TenantDocument[];
  regulatory: Regulatory;
  directors: Director[];
  directorsAttestation: boolean;
  financial: FinancialSettlement;
}

export interface RecordDecisionInput {
  reviewerName: string;
  decision: "approved" | "rejected" | "request_more_info";
  reason?: string;
  failedDocumentIds?: string[];
}

export interface SupportAccessGrant {
  id: string;
  tenantId: string;
  reason: string;
  requestedAt: string;
  expiresAt: string;
}

// A minimal, real SA-9.1-style platform audit log — appended to from inside
// the three functions below that already mutate tenant state, rather than a
// parallel logging system a caller has to remember to feed.
export type AuditAction = "tenant_verified" | "tenant_rejected" | "tenant_request_info" | "tenant_status_changed" | "support_access_used";

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: AuditAction;
  tenantId: string;
  tenantName: string;
  detail?: string;
  privileged?: boolean; // flags support-access entries for visual distinction
}

const DEFAULT_ENTITLEMENTS: TenantEntitlements = { marketplacePublishing: false, mlmModule: false, fxRails: false };

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Estintin Group / Heritage / Double King / Premium is the worked example the
// tenant→branch→estate hierarchy was confirmed against — kept as seed data so
// the shape of a fully verified, live tenant is visible from day one.
// Citadel Homes and Northbridge Estates exercise the other branches of the
// state machine: a tenant mid-review (with a "request more information"
// decision already on its record), and a tenant that's verified but
// separately account-suspended — demonstrating the two axes really are
// independent.
const MOCK_TENANTS: Tenant[] = [
  {
    id: "estintin-group",
    status: "active",
    plan: "enterprise",
    entitlements: { marketplacePublishing: true, mlmModule: true, fxRails: true },
    branches: [
      { id: "heritage", name: "Heritage", managerName: "Tunde Bakare", estateCount: 2 },
      { id: "double-king", name: "Double King", managerName: "Amaka Chukwu", estateCount: 1 },
      { id: "premium", name: "Premium", managerName: "Segun Adeyemi", estateCount: 1 },
    ],
    createdDate: "2025-03-12",
    identity: {
      registeredName: "Estintin Group Limited",
      tradingName: "Estintin Group",
      rcNumber: "RC1234567",
      companyType: "Limited Liability (Ltd)",
      dateOfIncorporation: "2018-04-02",
      registeredAddress: { street: "14 Ademola Adetokunbo Crescent", city: "Abuja", state: "Federal Capital Territory (Abuja)" },
      operatingAddress: { street: "14 Ademola Adetokunbo Crescent", city: "Abuja", state: "Federal Capital Territory (Abuja)" },
      statesOfOperation: ["Federal Capital Territory (Abuja)", "Lagos"],
    },
    primaryContact: {
      fullName: "Ifeoma Balogun",
      roleTitle: "Executive Director",
      workEmail: "ifeoma@estintingroup.com",
      phone: "+234 8021234567",
      govIdType: "NIN",
      govIdNumber: "12345678901",
    },
    presence: {
      companyEmail: "info@estintingroup.com",
      companyPhone: "+234 9012345678",
      website: "https://estintingroup.com",
      socials: { instagram: "@estintingroup", linkedin: "estintin-group" },
    },
    documents: [
      { id: "doc-eg-1", type: "cac_certificate", fileName: "cac-certificate.pdf", size: 812_000, status: "verified", uploadedAt: "2025-03-10" },
      { id: "doc-eg-2", type: "cac_status_report", fileName: "cac-status-report.pdf", size: 640_000, status: "verified", uploadedAt: "2025-03-10" },
      { id: "doc-eg-3", type: "tin", fileName: "tin-certificate.pdf", size: 210_000, status: "verified", uploadedAt: "2025-03-10" },
      { id: "doc-eg-4", type: "proof_of_address", fileName: "utility-bill.pdf", size: 480_000, status: "verified", uploadedAt: "2025-03-10" },
      { id: "doc-eg-5", type: "scuml_certificate", fileName: "scuml-certificate.pdf", size: 390_000, status: "verified", uploadedAt: "2025-03-10" },
    ],
    regulatory: {
      scumlNumber: "SCUML-2019-004321",
      stateRegulators: [{ id: "reg-eg-1", state: "Lagos", regulatorName: "LASRERA", regNumber: "LAS-REG-88213", documentId: undefined }],
      redanNumber: "REDAN-NG-5521",
      additionalPermits: [],
    },
    directors: [
      { id: "dir-eg-1", fullName: "Ifeoma Balogun", role: "Executive Director", nationality: "Nigerian", idType: "NIN", idNumber: "12345678901", bvn: "22134455667", ownershipPct: 60, isBeneficialOwner: true },
      { id: "dir-eg-2", fullName: "Chukwuma Eze", role: "Non-Executive Director", nationality: "Nigerian", idType: "NIN", idNumber: "98765432109", bvn: "33245566778", ownershipPct: 40, isBeneficialOwner: true },
    ],
    directorsAttestation: true,
    financial: {
      bankName: "Zenith Bank",
      accountNumber: "1012345678",
      accountName: "Estintin Group Limited",
      settlementCurrency: "NGN",
      gateways: { Paystack: "connected", Flutterwave: "connected" },
    },
    verificationState: "verified",
    verificationHistory: [
      { id: "vd-eg-1", reviewerName: "Ada Nwosu", timestamp: "2025-03-14T10:32:00Z", decision: "approved", reason: "All documents verified; SCUML and LASRERA registrations confirmed directly with the registries." },
    ],
  },
  {
    id: "citadel-homes",
    status: "active",
    plan: "growth",
    entitlements: DEFAULT_ENTITLEMENTS,
    branches: [],
    createdDate: "2026-08-20",
    identity: {
      registeredName: "Citadel Homes Limited",
      rcNumber: "RC7788221",
      companyType: "Limited Liability (Ltd)",
      dateOfIncorporation: "2021-11-15",
      registeredAddress: { street: "22 Ahmadu Bello Way", city: "Kano", state: "Kano" },
      operatingAddress: { street: "22 Ahmadu Bello Way", city: "Kano", state: "Kano" },
      statesOfOperation: ["Kano"],
    },
    primaryContact: {
      fullName: "Grace Umeh",
      roleTitle: "Managing Director",
      workEmail: "grace@citadelhomes.ng",
      phone: "+234 8055556677",
      govIdType: "International Passport",
      govIdNumber: "A01234567",
    },
    presence: { companyEmail: "hello@citadelhomes.ng", companyPhone: "+234 8155556677", socials: {} },
    documents: [
      { id: "doc-ch-1", type: "cac_certificate", fileName: "cac-certificate.pdf", size: 700_000, status: "pending", uploadedAt: "2026-08-22" },
      { id: "doc-ch-2", type: "cac_status_report", fileName: "cac-status-report-v1.pdf", size: 55_000, status: "pending", uploadedAt: "2026-08-22" },
      { id: "doc-ch-3", type: "tin", fileName: "tin.pdf", size: 190_000, status: "pending", uploadedAt: "2026-08-22" },
      { id: "doc-ch-4", type: "proof_of_address", fileName: "tenancy-agreement.pdf", size: 420_000, status: "pending", uploadedAt: "2026-08-22" },
      { id: "doc-ch-5", type: "scuml_certificate", fileName: "scuml.pdf", size: 300_000, status: "pending", uploadedAt: "2026-08-22" },
    ],
    regulatory: { scumlNumber: "SCUML-2026-009981", stateRegulators: [], additionalPermits: [] },
    directors: [
      { id: "dir-ch-1", fullName: "Grace Umeh", role: "Managing Director", nationality: "Nigerian", idType: "International Passport", idNumber: "A01234567", ownershipPct: 100, isBeneficialOwner: true },
    ],
    directorsAttestation: true,
    financial: {
      bankName: "Guaranty Trust Bank (GTBank)",
      accountNumber: "0123456789",
      accountName: "Citadel Homes Ltd",
      settlementCurrency: "NGN",
      gateways: { Paystack: "pending" },
    },
    verificationState: "under_review",
    verificationHistory: [
      { id: "vd-ch-1", reviewerName: "Ada Nwosu", timestamp: "2026-08-23T09:10:00Z", decision: "request_more_info", reason: "The CAC Status Report scan is illegible in places — please re-upload a clearer copy showing current directors and shareholding." },
    ],
  },
  {
    id: "northbridge-estates",
    status: "suspended",
    plan: "starter",
    entitlements: { ...DEFAULT_ENTITLEMENTS, fxRails: false },
    branches: [{ id: "lagos-mainland", name: "Lagos Mainland", managerName: "Farida Sule", estateCount: 3 }],
    createdDate: "2025-11-02",
    identity: {
      registeredName: "Northbridge Estates Limited",
      rcNumber: "RC4455667",
      companyType: "Limited Liability (Ltd)",
      dateOfIncorporation: "2019-06-01",
      registeredAddress: { street: "5 Adeola Odeku Street", city: "Lagos", state: "Lagos" },
      operatingAddress: { street: "5 Adeola Odeku Street", city: "Lagos", state: "Lagos" },
      statesOfOperation: ["Lagos"],
    },
    primaryContact: {
      fullName: "Michael Ilesanmi",
      roleTitle: "Executive Director",
      workEmail: "michael@northbridge.ng",
      phone: "+234 8033334455",
      govIdType: "NIN",
      govIdNumber: "55566677788",
    },
    presence: { companyEmail: "contact@northbridge.ng", companyPhone: "+234 8133334455", website: "https://northbridge.ng", socials: {} },
    documents: [
      { id: "doc-nb-1", type: "cac_certificate", fileName: "cac-certificate.pdf", size: 600_000, status: "verified", uploadedAt: "2025-10-20" },
      { id: "doc-nb-2", type: "cac_status_report", fileName: "cac-status-report.pdf", size: 58_000, status: "verified", uploadedAt: "2025-10-20" },
      { id: "doc-nb-3", type: "tin", fileName: "tin.pdf", size: 175_000, status: "verified", uploadedAt: "2025-10-20" },
      { id: "doc-nb-4", type: "proof_of_address", fileName: "utility-bill.pdf", size: 410_000, status: "verified", uploadedAt: "2025-10-20" },
      { id: "doc-nb-5", type: "scuml_certificate", fileName: "scuml.pdf", size: 310_000, status: "verified", uploadedAt: "2025-10-20" },
    ],
    regulatory: { scumlNumber: "SCUML-2019-007744", stateRegulators: [{ id: "reg-nb-1", state: "Lagos", regulatorName: "LASRERA", regNumber: "LAS-REG-55019" }], additionalPermits: [] },
    directors: [
      { id: "dir-nb-1", fullName: "Michael Ilesanmi", role: "Executive Director", nationality: "Nigerian", idType: "NIN", idNumber: "55566677788", ownershipPct: 70, isBeneficialOwner: true },
      { id: "dir-nb-2", fullName: "Farida Sule", role: "Director", nationality: "Nigerian", idType: "NIN", idNumber: "44455566677", ownershipPct: 30, isBeneficialOwner: true },
    ],
    directorsAttestation: true,
    financial: {
      bankName: "Access Bank",
      accountNumber: "0034455667",
      accountName: "Northbridge Estates Limited",
      settlementCurrency: "NGN",
      gateways: { Paystack: "connected" },
    },
    // Verified on compliance grounds, but the account itself is suspended
    // (e.g. for non-payment) — proof the two axes really are independent.
    verificationState: "verified",
    verificationHistory: [
      { id: "vd-nb-1", reviewerName: "Ada Nwosu", timestamp: "2025-11-05T14:00:00Z", decision: "approved", reason: "Documents and SCUML/LASRERA registrations verified." },
    ],
  },
  // A small, single-branch, active-and-verified tenant — added specifically
  // so the public marketplace (marketplaceService.ts) has a genuine second
  // company. Neither Citadel Homes (not yet verified) nor Northbridge Estates
  // (verified but account-suspended) actually qualifies for a public listing.
  {
    id: "crestview-homes",
    status: "active",
    plan: "growth",
    entitlements: { marketplacePublishing: true, mlmModule: false, fxRails: false },
    branches: [{ id: "crestview-main", name: "Crestview Homes", managerName: "Yemi Adeyinka", estateCount: 1 }],
    createdDate: "2025-09-18",
    identity: {
      registeredName: "Crestview Homes Limited",
      tradingName: "Crestview Homes",
      rcNumber: "RC2233445",
      companyType: "Limited Liability (Ltd)",
      dateOfIncorporation: "2020-02-14",
      registeredAddress: { street: "18 Herbert Macaulay Way", city: "Yaba", state: "Lagos" },
      operatingAddress: { street: "18 Herbert Macaulay Way", city: "Yaba", state: "Lagos" },
      statesOfOperation: ["Lagos"],
    },
    primaryContact: {
      fullName: "Yemi Adeyinka",
      roleTitle: "Managing Director",
      workEmail: "yemi@crestviewhomes.ng",
      phone: "+234 8099887766",
      govIdType: "NIN",
      govIdNumber: "66677788899",
    },
    presence: { companyEmail: "hello@crestviewhomes.ng", companyPhone: "+234 8199887766", website: "https://crestviewhomes.ng", socials: {} },
    documents: [
      { id: "doc-cv-1", type: "cac_certificate", fileName: "cac-certificate.pdf", size: 590_000, status: "verified", uploadedAt: "2025-09-15" },
      { id: "doc-cv-2", type: "cac_status_report", fileName: "cac-status-report.pdf", size: 52_000, status: "verified", uploadedAt: "2025-09-15" },
      { id: "doc-cv-3", type: "tin", fileName: "tin.pdf", size: 160_000, status: "verified", uploadedAt: "2025-09-15" },
      { id: "doc-cv-4", type: "proof_of_address", fileName: "tenancy-agreement.pdf", size: 400_000, status: "verified", uploadedAt: "2025-09-15" },
      { id: "doc-cv-5", type: "scuml_certificate", fileName: "scuml.pdf", size: 280_000, status: "verified", uploadedAt: "2025-09-15" },
    ],
    regulatory: { scumlNumber: "SCUML-2025-002211", stateRegulators: [{ id: "reg-cv-1", state: "Lagos", regulatorName: "LASRERA", regNumber: "LAS-REG-91004" }], additionalPermits: [] },
    directors: [
      { id: "dir-cv-1", fullName: "Yemi Adeyinka", role: "Managing Director", nationality: "Nigerian", idType: "NIN", idNumber: "66677788899", ownershipPct: 100, isBeneficialOwner: true },
    ],
    directorsAttestation: true,
    financial: {
      bankName: "Sterling Bank",
      accountNumber: "0099887766",
      accountName: "Crestview Homes Limited",
      settlementCurrency: "NGN",
      gateways: { Paystack: "connected" },
    },
    verificationState: "verified",
    verificationHistory: [
      { id: "vd-cv-1", reviewerName: "Ada Nwosu", timestamp: "2025-09-20T11:00:00Z", decision: "approved", reason: "Documents and SCUML/LASRERA registrations verified." },
    ],
  },
];

// In-memory mock store so an onboarded/verified/suspended tenant reflects
// immediately across the directory and its own detail page for the rest of
// the session, even without a backend.
let mockTenants: Tenant[] = [...MOCK_TENANTS];
let mockSupportAccessGrants: SupportAccessGrant[] = [];
let mockAuditLog: AuditLogEntry[] = [];

function logAudit(entry: Omit<AuditLogEntry, "id" | "timestamp">) {
  mockAuditLog = [{ ...entry, id: newId("audit"), timestamp: new Date().toISOString() }, ...mockAuditLog];
}

export async function fetchTenants(): Promise<Tenant[]> {
  if (apiClient.isMockMode) return mockTenants;
  return apiClient.get<Tenant[]>("/api/admin/tenants");
}

// Mock-mode-only synchronous accessor — same convention as
// marketplacePlotsService.ts's setPlotStatusMock. Used by marketplaceService.ts's
// projectListing() to
// check the publication gate (tenant verificationState/entitlements/status)
// for every canonical estate at once without an async round trip per estate.
// A real backend's projection job would read this from wherever tenant
// verification state actually lives, same access a batched materialized-view
// job would have — never exposed to the client beyond the narrow Seller
// shape a published Listing carries. See landvault-catalogue-unification-plan
// in project memory.
export function fetchTenantByIdSync(id: string): Tenant | undefined {
  return mockTenants.find((t) => t.id === id);
}

export async function fetchTenantById(id: string): Promise<Tenant | undefined> {
  if (apiClient.isMockMode) return mockTenants.find((t) => t.id === id);
  try {
    return await apiClient.get<Tenant>(`/api/admin/tenants/${id}`);
  } catch {
    return undefined;
  }
}

// Stage 1 — creates the tenant account (identity + primary contact +
// presence). The tenant can immediately explore the portal and set up
// estates; it just can't publish to the marketplace or take payments until
// verified (enforced by checks against `verificationState`, not `status`).
export async function createTenantDraft(input: CreateTenantDraftInput): Promise<Tenant> {
  if (apiClient.isMockMode) {
    const tenant: Tenant = {
      id: newId("tenant"),
      status: "active",
      plan: input.plan,
      entitlements: DEFAULT_ENTITLEMENTS,
      branches: [],
      createdDate: new Date().toISOString().slice(0, 10),
      identity: input.identity,
      primaryContact: input.primaryContact,
      presence: input.presence,
      documents: [],
      directors: [],
      directorsAttestation: false,
      verificationState: "created",
      verificationHistory: [],
    };
    mockTenants = [tenant, ...mockTenants];
    return tenant;
  }
  return apiClient.post<Tenant>("/api/admin/tenants", input);
}

// Stage 2 — verification submission (documents, regulatory, directors,
// financial). Moves the tenant into the review queue.
export async function submitForVerification(tenantId: string, input: SubmitVerificationInput): Promise<Tenant | undefined> {
  if (apiClient.isMockMode) {
    mockTenants = mockTenants.map((t) =>
      t.id === tenantId
        ? {
            ...t,
            documents: input.documents,
            regulatory: input.regulatory,
            directors: input.directors,
            directorsAttestation: input.directorsAttestation,
            financial: input.financial,
            verificationState: "documents_submitted",
          }
        : t
    );
    return mockTenants.find((t) => t.id === tenantId);
  }
  return apiClient.post<Tenant>(`/api/admin/tenants/${tenantId}/submit-verification`, input);
}

// Moves a submitted tenant into active review — called when a reviewer opens
// a "documents_submitted" tenant record, simulating "review has now started"
// since there's no separate review-queue-claim mechanism built yet.
export async function beginReview(tenantId: string): Promise<Tenant | undefined> {
  if (apiClient.isMockMode) {
    mockTenants = mockTenants.map((t) => (t.id === tenantId && t.verificationState === "documents_submitted" ? { ...t, verificationState: "under_review" } : t));
    return mockTenants.find((t) => t.id === tenantId);
  }
  return apiClient.post<Tenant>(`/api/admin/tenants/${tenantId}/begin-review`);
}

// Records a reviewer's decision — always appended, never overwritten, so the
// audit trail (SA-9.1-style) stays intact regardless of outcome.
export async function recordVerificationDecision(tenantId: string, input: RecordDecisionInput): Promise<Tenant | undefined> {
  if (apiClient.isMockMode) {
    const decision: VerificationDecision = {
      id: newId("vd"),
      reviewerName: input.reviewerName,
      timestamp: new Date().toISOString(),
      decision: input.decision,
      reason: input.reason,
      failedDocumentIds: input.failedDocumentIds,
    };
    mockTenants = mockTenants.map((t) => {
      if (t.id !== tenantId) return t;
      let verificationState = t.verificationState;
      let documents = t.documents;
      if (input.decision === "approved") {
        verificationState = "verified";
        documents = t.documents.map((d) => ({ ...d, status: "verified" as const }));
      } else if (input.decision === "rejected") {
        verificationState = "rejected";
        const failed = new Set(input.failedDocumentIds ?? []);
        documents = t.documents.map((d) => (failed.has(d.id) ? { ...d, status: "rejected" as const, rejectionReason: input.reason } : { ...d, status: "verified" as const }));
      }
      // "request_more_info" logs the decision but leaves state/documents as-is.
      return { ...t, verificationState, documents, verificationHistory: [...t.verificationHistory, decision] };
    });
    const updated = mockTenants.find((t) => t.id === tenantId);
    if (updated) {
      const action: AuditAction = input.decision === "approved" ? "tenant_verified" : input.decision === "rejected" ? "tenant_rejected" : "tenant_request_info";
      logAudit({ actor: input.reviewerName, action, tenantId, tenantName: tenantDisplayName(updated), detail: input.reason });
    }
    return updated;
  }
  return apiClient.post<Tenant>(`/api/admin/tenants/${tenantId}/verification-decision`, input);
}

// Re-upload for a single rejected document (spec: "allow re-upload of only
// the specific documents that failed" — not the whole document set).
export async function resubmitDocument(tenantId: string, documentId: string, file: { fileName: string; size: number }): Promise<Tenant | undefined> {
  if (apiClient.isMockMode) {
    mockTenants = mockTenants.map((t) =>
      t.id === tenantId
        ? { ...t, documents: t.documents.map((d) => (d.id === documentId ? { ...d, fileName: file.fileName, size: file.size, status: "pending" as const, rejectionReason: undefined, uploadedAt: new Date().toISOString() } : d)) }
        : t
    );
    return mockTenants.find((t) => t.id === tenantId);
  }
  return apiClient.post<Tenant>(`/api/admin/tenants/${tenantId}/documents/${documentId}/resubmit`, file);
}

// SA-1.3 — plan and per-feature entitlements, enforced server-side once real.
export async function updateTenantPlan(id: string, plan: TenantPlan, entitlements: TenantEntitlements): Promise<Tenant | undefined> {
  if (apiClient.isMockMode) {
    mockTenants = mockTenants.map((t) => (t.id === id ? { ...t, plan, entitlements } : t));
    return mockTenants.find((t) => t.id === id);
  }
  return apiClient.put<Tenant>(`/api/admin/tenants/${id}/plan`, { plan, entitlements });
}

// SA-1.4 — suspend blocks tenant staff access and hides public listings
// without touching their data; reactivate reverses it. Independent of
// verificationState (see Northbridge Estates in seed data).
export async function setTenantStatus(id: string, status: TenantStatus, actor: string): Promise<Tenant | undefined> {
  if (apiClient.isMockMode) {
    mockTenants = mockTenants.map((t) => (t.id === id ? { ...t, status } : t));
    const updated = mockTenants.find((t) => t.id === id);
    if (updated) logAudit({ actor, action: "tenant_status_changed", tenantId: id, tenantName: tenantDisplayName(updated), detail: `Status changed to ${status}` });
    return updated;
  }
  return apiClient.post<Tenant>(`/api/admin/tenants/${id}/status`, { status });
}

// SA-1.6 — time-boxed, reason-required support access. This only records the
// grant; it never performs financial or document-signing actions, and a real
// backend would use this to scope a short-lived, fully-logged session.
export async function requestSupportAccess(tenantId: string, reason: string, actor: string): Promise<SupportAccessGrant> {
  if (apiClient.isMockMode) {
    const requestedAt = new Date();
    const grant: SupportAccessGrant = {
      id: newId("support"),
      tenantId,
      reason,
      requestedAt: requestedAt.toISOString(),
      expiresAt: new Date(requestedAt.getTime() + 30 * 60 * 1000).toISOString(),
    };
    mockSupportAccessGrants = [grant, ...mockSupportAccessGrants];
    const tenant = mockTenants.find((t) => t.id === tenantId);
    logAudit({ actor, action: "support_access_used", tenantId, tenantName: tenant ? tenantDisplayName(tenant) : tenantId, detail: reason, privileged: true });
    return grant;
  }
  return apiClient.post<SupportAccessGrant>(`/api/admin/tenants/${tenantId}/support-access`, { reason });
}

export async function fetchAuditLog(limit?: number): Promise<AuditLogEntry[]> {
  if (apiClient.isMockMode) return limit ? mockAuditLog.slice(0, limit) : mockAuditLog;
  return apiClient.get<AuditLogEntry[]>(`/api/admin/audit-log${limit ? `?limit=${limit}` : ""}`);
}

export async function fetchSupportAccessGrants(tenantId: string): Promise<SupportAccessGrant[]> {
  if (apiClient.isMockMode) return mockSupportAccessGrants.filter((g) => g.tenantId === tenantId);
  return apiClient.get<SupportAccessGrant[]>(`/api/admin/tenants/${tenantId}/support-access`);
}
