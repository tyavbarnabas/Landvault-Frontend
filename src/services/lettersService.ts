// The developer's allocation-letter setup, and its approval per estate.
//
// HomeTrue draws every allocation letter itself, the moment finance verifies
// a sale, from four things the developer sets up here:
//   letterheads  /api/portal/letterheads — the company's, and each branch's:
//                signatory (name, title, signature), logo and seal. A branch
//                inherits the company's until it sets its own, and a branch's
//                signer is one unit (never the company's signature under
//                another name).
//   templates    /api/portal/letter-templates — the opening, closing, sign-off
//                and standard conditions, with HomeTrue's fill-in fields.
//   conditions   /api/portal/estates/{id}/letter-terms — the estate's own
//                clauses. HomeTrue adds its own from the cost disclosure.
//   approval     /api/portal/estates/{id}/letter-approval — the director
//                previews the real letter and approves the versions shown.
// HomeTrue reviews every saved template and every version of the conditions
// (admin.documents.review) before a letter may use it.
//
// Reads need portal.documents.view; changes portal.documents.manage AND a
// company-wide view (DOCUMENTS_REQUIRE_COMPANY_WIDE_SCOPE otherwise).

import { apiClient, ApiError } from "../lib/apiClient";
import { isMock } from "../lib/backends";
import { uploadFile, type UploadableType, type UploadTicket } from "../lib/uploadFile";
import { findMockEstateForAdmin, type PortalScope } from "./portalEstatesService";
import { fetchBranches } from "./branchesService";
import { fetchTenantByIdSync, tenantDisplayName } from "./tenantsService";

// ─── Types (the backend's DTOs) ──────────────────────────────────────────────

export type ImageKind = "logo" | "signature" | "seal";
export type LetterheadMissing = "signatory_name" | "signatory_title" | "signature";
export type ReviewStatus = "pending" | "approved" | "rejected";
// In a versions list an older undecided one is "superseded".
export type VersionReviewStatus = ReviewStatus | "superseded";

export interface LetterheadImage {
  kind: ImageKind;
  fileId: string;
  fileName: string;
  fileType: string;
  sizeBytes: number;
  source: "company" | "branch";
}

// What a letter issued under this letterhead would print today.
export interface PrintedLetterhead {
  companyName: string | null;
  rcNumber: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  signatoryName: string | null;
  signatoryTitle: string | null;
  signatorySource: "company" | "branch" | null;
  logo: LetterheadImage | null;
  signature: LetterheadImage | null;
  seal: LetterheadImage | null;
}

// The top-level fields are what this letterhead sets ITSELF.
export interface Letterhead {
  scope: "company" | "branch";
  branchId: string | null;
  branchName: string | null;
  version: number; // 0 = nothing set
  updatedAt: string | null;
  signatoryName: string | null;
  signatoryTitle: string | null;
  logo: LetterheadImage | null;
  signature: LetterheadImage | null;
  seal: LetterheadImage | null;
  printed: PrintedLetterhead;
  missing: LetterheadMissing[];
}

export interface LetterheadOverview {
  company: Letterhead;
  branches: Letterhead[];
}

export interface LetterTemplateVersion {
  version: number;
  opening: string;
  closing: string | null;
  signOff: string;
  standardClauses: string[];
  savedAt: string;
  reviewStatus: VersionReviewStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
}

export interface LetterTemplate {
  source: "company" | "branch";
  branchId: string | null;
  branchName: string | null;
  current: LetterTemplateVersion | null;
  approved: LetterTemplateVersion | null;
  inUse: "branch" | "company" | "default";
}

export interface LetterTemplatesOverview {
  company: LetterTemplate;
  branches: LetterTemplate[];
  fields: string[];
  defaultWording: { opening: string; signOff: string };
}

export interface LetterTemplateInput {
  opening: string;
  closing?: string | null;
  signOff: string;
  standardClauses?: string[];
}

export type DisclosurePart = "fees" | "refund_terms" | "default_terms";

export interface EstateLetterTerms {
  estateId: string;
  estateName: string;
  version: number; // 0 = never saved
  clauses: string[];
  updatedAt: string | null;
  generatedClauses: string[];
  disclosureVersions: { fees: number | null; refundTerms: number | null; defaultTerms: number | null };
  missingDisclosure: DisclosurePart[];
  reviewStatus: ReviewStatus | null; // null before the first save
  reviewNote: string | null;
  reviewedAt: string | null;
  approvedVersion: number | null; // what letters use; null = can't issue letters
}

export interface LetterTermsVersion {
  version: number;
  clauses: string[];
  savedAt: string;
  reviewStatus: VersionReviewStatus;
  reviewNote: string | null;
  reviewedAt: string | null;
}

export interface LetterVersions {
  terms: number | null;
  companyLetterhead: number | null;
  branchLetterhead: number | null;
  fees: number | null;
  refundTerms: number | null;
  defaultTerms: number | null;
  templateSource: "default" | "company" | "branch" | null;
  template: number | null;
}

export type LetterBlocker = "no_approved_terms" | LetterheadMissing;
export type LetterChange = "terms" | "company_letterhead" | "branch_letterhead" | "fees" | "refund_terms" | "default_terms" | "template";

export interface LetterApproval {
  estateId: string;
  estateName: string;
  approved: boolean;
  approvedAt: string | null;
  approvedVersions: LetterVersions | null;
  currentVersions: LetterVersions;
  changedSinceApproval: LetterChange[];
  blockers: LetterBlocker[];
  newerTermsAwaitingReview: boolean;
}

// ─── Limits and fill-in fields ───────────────────────────────────────────────

export const LETTERHEAD_IMAGE_TYPES: readonly UploadableType[] = ["image/png", "image/jpeg"];
export const LETTERHEAD_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const SIGNATORY_MAX = 120;
export const MAX_CLAUSES = 30;
export const CLAUSE_MAX = 600;
export const OPENING_MAX = 1500;
export const CLOSING_MAX = 1000;
export const SIGN_OFF_MAX = 80;
export const TEMPLATE_FIELDS = ["buyerName", "plot", "estate", "location", "applicationDate", "allocationDate"] as const;
export const REQUIRED_OPENING_FIELDS = ["plot", "estate"] as const;

export const IMAGE_KIND_LABELS: Record<ImageKind, string> = { logo: "Logo", signature: "Signature", seal: "Company seal" };

// ─── Errors ──────────────────────────────────────────────────────────────────

/** The backend's code, if the error carries one. */
export function errorCode(err: unknown): string | undefined {
  return err instanceof ApiError ? err.body?.code : undefined;
}

/** `{ "clauses[2]": "…", "opening": "…" }` — one entry per field the server refused. */
export function fieldErrorsOf(err: unknown): Record<string, string> {
  return err instanceof ApiError ? err.body?.fieldErrors ?? {} : {};
}

export function errorMessage(err: unknown, fallback = "That didn't go through. Try again."): string {
  if (errorCode(err) === "DOCUMENTS_REQUIRE_COMPANY_WIDE_SCOPE") {
    return "Letters can only be changed with a company-wide view, not while working inside one branch.";
  }
  return err instanceof Error && err.message ? err.message : fallback;
}

function refuse(status: number, code: string, message: string, fieldErrors?: Record<string, string>): never {
  throw new ApiError(status, message, { code, message, fieldErrors });
}

// ─── Letterheads ─────────────────────────────────────────────────────────────

export async function fetchLetterheads(scope: PortalScope): Promise<LetterheadOverview> {
  if (isMock("letters")) return mockOverview(scope);
  return apiClient.get<LetterheadOverview>("/api/portal/letterheads");
}

export async function setSignatory(target: string, name: string, title: string, scope: PortalScope): Promise<Letterhead> {
  if (isMock("letters")) return mockChangeLetterhead(scope, target, (h) => { h.signatoryName = name.trim(); h.signatoryTitle = title.trim(); });
  return apiClient.put<Letterhead>(`/api/portal/letterheads/${target}/signatory`, { name, title });
}

// Removes the name, title and signature together.
export async function clearSignatory(target: string, scope: PortalScope): Promise<Letterhead> {
  if (isMock("letters")) return mockChangeLetterhead(scope, target, (h) => { h.signatoryName = null; h.signatoryTitle = null; h.signature = null; });
  return apiClient.del<Letterhead>(`/api/portal/letterheads/${target}/signatory`);
}

export async function uploadLetterheadImage(target: string, kind: ImageKind, file: File, scope: PortalScope, onProgress?: (f: number) => void): Promise<Letterhead> {
  if (isMock("letters")) {
    return mockChangeLetterhead(scope, target, (h) => {
      const fileId = `mock-${kind}-${Date.now()}`;
      mockImageUrls.set(fileId, URL.createObjectURL(file));
      h[kind] = { kind, fileId, fileName: file.name, fileType: file.type === "image/png" ? "png" : "jpeg", sizeBytes: file.size, source: h.scope };
    });
  }
  return uploadFile<Letterhead>(file, {
    maxBytes: LETTERHEAD_IMAGE_MAX_BYTES,
    types: LETTERHEAD_IMAGE_TYPES,
    onProgress,
    requestUpload: (body) => apiClient.post<UploadTicket>(`/api/portal/letterheads/${target}/images/uploads`, { kind, ...body }),
    confirmUpload: (fileId) => apiClient.post<Letterhead>(`/api/portal/letterheads/${target}/images/${fileId}/confirm`),
  });
}

export async function removeLetterheadImage(target: string, kind: ImageKind, scope: PortalScope): Promise<Letterhead> {
  if (isMock("letters")) return mockChangeLetterhead(scope, target, (h) => { h[kind] = null; });
  return apiClient.del<Letterhead>(`/api/portal/letterheads/${target}/images/${kind}`);
}

/** A five-minute link to a current image. Fetched when shown, never kept. */
export async function letterheadImageLink(fileId: string): Promise<{ url: string; expiresAt: string }> {
  if (isMock("letters")) return { url: mockImageUrls.get(fileId) ?? "", expiresAt: new Date(Date.now() + 300_000).toISOString() };
  return apiClient.get<{ url: string; expiresAt: string }>(`/api/portal/letterheads/files/${fileId}/link`);
}

// ─── Letter templates ────────────────────────────────────────────────────────

export async function fetchLetterTemplates(scope: PortalScope): Promise<LetterTemplatesOverview> {
  if (isMock("letters")) return mockTemplatesOverview(scope);
  return apiClient.get<LetterTemplatesOverview>("/api/portal/letter-templates");
}

export async function fetchLetterTemplateVersions(target: string, scope: PortalScope): Promise<LetterTemplateVersion[]> {
  if (isMock("letters")) return [...(mockStore(scope.tenantId).templates.get(target) ?? [])].reverse().map(withVersionStatus);
  return apiClient.get<LetterTemplateVersion[]>(`/api/portal/letter-templates/${target}/versions`);
}

export async function saveLetterTemplate(target: string, input: LetterTemplateInput, scope: PortalScope): Promise<LetterTemplate> {
  if (isMock("letters")) return mockSaveTemplate(scope, target, input);
  return apiClient.put<LetterTemplate>(`/api/portal/letter-templates/${target}`, input);
}

/** Fields used in the text that aren't HomeTrue's — "{amount}" would be refused. */
export function unknownFields(text: string): string[] {
  const used = [...text.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]);
  return [...new Set(used.filter((f) => !(TEMPLATE_FIELDS as readonly string[]).includes(f)))];
}

export function missingOpeningFields(opening: string): string[] {
  return REQUIRED_OPENING_FIELDS.filter((f) => !opening.includes(`{${f}}`));
}

// ─── An estate's conditions ──────────────────────────────────────────────────

export async function fetchLetterTerms(estateId: string, scope: PortalScope): Promise<EstateLetterTerms> {
  if (isMock("letters")) return mockTerms(scope, estateId);
  return apiClient.get<EstateLetterTerms>(`/api/portal/estates/${estateId}/letter-terms`);
}

export async function fetchLetterTermsVersions(estateId: string, scope: PortalScope): Promise<LetterTermsVersion[]> {
  if (isMock("letters")) return [...(mockStore(scope.tenantId).terms.get(estateId) ?? [])].reverse().map(withVersionStatus);
  return apiClient.get<LetterTermsVersion[]>(`/api/portal/estates/${estateId}/letter-terms/versions`);
}

export async function saveLetterTerms(estateId: string, clauses: string[], scope: PortalScope): Promise<EstateLetterTerms> {
  if (isMock("letters")) return mockSaveTerms(scope, estateId, clauses);
  return apiClient.put<EstateLetterTerms>(`/api/portal/estates/${estateId}/letter-terms`, { clauses });
}

// ─── Preview and approval ────────────────────────────────────────────────────

export async function fetchLetterApproval(estateId: string, scope: PortalScope): Promise<LetterApproval> {
  if (isMock("letters")) return mockApproval(scope, estateId);
  return apiClient.get<LetterApproval>(`/api/portal/estates/${estateId}/letter-approval`);
}

/** The real letter with placeholders, stamped SAMPLE. `latest` shows conditions still awaiting HomeTrue. */
export async function fetchLetterPreview(estateId: string, format: "pdf" | "jpeg", terms: "approved" | "latest"): Promise<File> {
  if (isMock("letters")) throw new Error("Letter previews are drawn by the backend. Demo mode has none.");
  const blob = await apiClient.getBlob(`/api/portal/estates/${estateId}/letter-preview/${format}?terms=${terms}`);
  return new File([blob], `HomeTrue-letter-preview-${terms}.${format === "pdf" ? "pdf" : "jpg"}`, { type: format === "pdf" ? "application/pdf" : "image/jpeg" });
}

/** Sends back the versions the director previewed: 409 LETTER_SETUP_CHANGED if any moved since. */
export async function approveLetter(estateId: string, versions: LetterVersions, scope: PortalScope): Promise<LetterApproval> {
  if (isMock("letters")) return mockApprove(scope, estateId, versions);
  return apiClient.post<LetterApproval>(`/api/portal/estates/${estateId}/letter-approval`, { versions });
}

export async function withdrawLetterApproval(estateId: string, scope: PortalScope): Promise<LetterApproval> {
  if (isMock("letters")) {
    mockRequireCompanyWide(scope);
    mockStore(scope.tenantId).approvals.delete(estateId);
    return mockApproval(scope, estateId);
  }
  return apiClient.post<LetterApproval>(`/api/portal/estates/${estateId}/letter-approval/withdraw`);
}

// ─── Mock (demo mode only) ───────────────────────────────────────────────────
// Enough to walk the screens: nothing is stamped, rendered or emailed. The
// money check is a small subset of the backend's ClauseRules, so a demo can
// show a refused clause; HomeTrue's generated clauses aren't drawn (the
// disclosure lives in another mock) and are shown as none.

interface MockVersion<T> { body: T; savedAt: string; decision: { status: "approved" | "rejected"; note: string | null; at: string } | null }
interface MockTenantStore {
  letterheads: Map<string, Letterhead>; // "company" | branch id
  templates: Map<string, MockVersion<Omit<LetterTemplateVersion, "version" | "savedAt" | "reviewStatus" | "reviewNote" | "reviewedAt">>[]>;
  terms: Map<string, MockVersion<{ clauses: string[] }>[]>;
  approvals: Map<string, { versions: LetterVersions; at: string }>;
}

const mockTenants = new Map<string, MockTenantStore>();
const mockImageUrls = new Map<string, string>();

function mockStore(tenantId: string): MockTenantStore {
  if (!mockTenants.has(tenantId)) mockTenants.set(tenantId, { letterheads: new Map(), templates: new Map(), terms: new Map(), approvals: new Map() });
  return mockTenants.get(tenantId)!;
}

/** For the demo review queues (part 5): every tenant's mock store. */
export function mockLetterTenants(): [string, MockTenantStore][] {
  return [...mockTenants.entries()];
}

function mockRequireCompanyWide(scope: PortalScope): void {
  if (scope.branchId) refuse(403, "DOCUMENTS_REQUIRE_COMPANY_WIDE_SCOPE", "Letters can only be changed with a company-wide view.");
}

function blankLetterhead(scope: "company" | "branch", branchId: string | null, branchName: string | null): Letterhead {
  return {
    scope, branchId, branchName, version: 0, updatedAt: null, signatoryName: null, signatoryTitle: null, logo: null, signature: null, seal: null,
    printed: { companyName: null, rcNumber: null, address: null, phone: null, email: null, website: null, signatoryName: null, signatoryTitle: null, signatorySource: null, logo: null, signature: null, seal: null },
    missing: [],
  };
}

// Recomputes `printed` and `missing` the way the backend does: the branch's
// own signer as one unit, otherwise the company's; images field by field.
function project(own: Letterhead, company: Letterhead, companyName: string | null): Letterhead {
  const branchSigns = own.scope === "branch" && !!(own.signatoryName || own.signatoryTitle || own.signature);
  const signer = own.scope === "company" || branchSigns ? own : company;
  const printed: PrintedLetterhead = {
    companyName, rcNumber: null, address: null, phone: null, email: null, website: null,
    signatoryName: signer.signatoryName, signatoryTitle: signer.signatoryTitle,
    signatorySource: signer.signatoryName || signer.signatoryTitle || signer.signature ? signer.scope : null,
    logo: own.logo ?? (own.scope === "branch" ? company.logo : null),
    signature: signer.signature,
    seal: own.seal ?? (own.scope === "branch" ? company.seal : null),
  };
  const missing: LetterheadMissing[] = [];
  if (!printed.signatoryName) missing.push("signatory_name");
  if (!printed.signatoryTitle) missing.push("signatory_title");
  if (!printed.signature) missing.push("signature");
  return { ...own, printed, missing };
}

async function mockOverview(scope: PortalScope): Promise<LetterheadOverview> {
  const store = mockStore(scope.tenantId);
  const tenant = fetchTenantByIdSync(scope.tenantId);
  const companyName = tenant ? tenantDisplayName(tenant) : null;
  if (!store.letterheads.has("company")) store.letterheads.set("company", blankLetterhead("company", null, null));
  const branches = await fetchBranches(scope);
  for (const b of branches) if (!store.letterheads.has(b.id)) store.letterheads.set(b.id, blankLetterhead("branch", b.id, b.name));
  const company = store.letterheads.get("company")!;
  return {
    company: project(company, company, companyName),
    branches: branches.map((b) => project(store.letterheads.get(b.id)!, company, companyName)),
  };
}

async function mockChangeLetterhead(scope: PortalScope, target: string, change: (h: Letterhead) => void): Promise<Letterhead> {
  mockRequireCompanyWide(scope);
  await mockOverview(scope);
  const h = mockStore(scope.tenantId).letterheads.get(target);
  if (!h) refuse(404, "BRANCH_NOT_FOUND", "That branch doesn't exist.");
  change(h);
  h.version += 1;
  h.updatedAt = new Date().toISOString();
  const overview = await mockOverview(scope);
  return target === "company" ? overview.company : overview.branches.find((b) => b.branchId === target)!;
}

function withVersionStatus<T>(v: MockVersion<T>, index: number, all: MockVersion<T>[]): T & { version: number; savedAt: string; reviewStatus: VersionReviewStatus; reviewNote: string | null; reviewedAt: string | null } {
  // `all` is newest first here; the version number counts from the oldest.
  const version = all.length - index;
  const reviewStatus: VersionReviewStatus = v.decision?.status ?? (index === 0 ? "pending" : "superseded");
  return { ...v.body, version, savedAt: v.savedAt, reviewStatus, reviewNote: v.decision?.note ?? null, reviewedAt: v.decision?.at ?? null };
}

function newestApproved<T>(versions: MockVersion<T>[]): { v: MockVersion<T>; version: number } | null {
  for (let i = versions.length - 1; i >= 0; i--) if (versions[i].decision?.status === "approved") return { v: versions[i], version: i + 1 };
  return null;
}

function templateFor(store: MockTenantStore, target: string, source: "company" | "branch", branchId: string | null, branchName: string | null, companyApproved: boolean): LetterTemplate {
  const versions = store.templates.get(target) ?? [];
  const newestFirst = [...versions].reverse().map(withVersionStatus);
  const approved = newestApproved(versions);
  return {
    source, branchId, branchName,
    current: newestFirst[0] ?? null,
    approved: approved ? newestFirst[versions.length - approved.version] : null,
    inUse: approved ? source : source === "branch" && companyApproved ? "company" : "default",
  };
}

async function mockTemplatesOverview(scope: PortalScope): Promise<LetterTemplatesOverview> {
  const store = mockStore(scope.tenantId);
  const branches = await fetchBranches(scope);
  const company = templateFor(store, "company", "company", null, null, false);
  return {
    company,
    branches: branches.map((b) => templateFor(store, b.id, "branch", b.id, b.name, !!company.approved)),
    fields: [...TEMPLATE_FIELDS],
    defaultWording: { opening: "We are pleased to allocate to you {plot} at {estate}, {location}, subject to the following terms and conditions.", signOff: "Congratulations." },
  };
}

// A small subset of the backend's ClauseRules: currency marks and words,
// thousands-grouped figures, a 10-digit run (a NUBAN) and account phrases.
function mockMoneyProblem(text: string): string | null {
  if (/₦|\bNGN\b|\bnaira\b|\bN\d/i.test(text) || /\b\d{1,3}(,\d{3})+(\.\d+)?\b/.test(text)) return "No amounts in a condition: fees come from the cost disclosure.";
  // Exactly ten digits (spaces or dashes allowed): an 11-digit phone number passes.
  if (/(^|\D)\d{10}(\D|$)/.test(text.replace(/(\d)[ -](?=\d)/g, "$1"))) return "No bank account numbers: payments go only through HomeTrue.";
  if (/account (number|name)|bank details|pay into/i.test(text)) return "No bank details: payments go only through HomeTrue.";
  return null;
}

async function mockSaveTemplate(scope: PortalScope, target: string, input: LetterTemplateInput): Promise<LetterTemplate> {
  mockRequireCompanyWide(scope);
  const fieldErrors: Record<string, string> = {};
  const opening = input.opening.trim();
  const missing = missingOpeningFields(opening);
  if (!opening) fieldErrors.opening = "Write the opening paragraph.";
  else if (missing.length) fieldErrors.opening = `The opening must include ${missing.map((f) => `{${f}}`).join(" and ")}.`;
  const check = (key: string, text: string | null | undefined) => {
    if (!text) return;
    const bad = unknownFields(text);
    if (bad.length) fieldErrors[key] = `${bad.map((f) => `{${f}}`).join(", ")} isn't a field HomeTrue fills in.`;
    else { const p = mockMoneyProblem(text); if (p) fieldErrors[key] = p; }
  };
  if (!fieldErrors.opening) check("opening", opening);
  check("closing", input.closing);
  if (!input.signOff.trim()) fieldErrors.signOff = "Write the sign-off line.";
  else if (/\{/.test(input.signOff)) fieldErrors.signOff = "The sign-off can't use fill-in fields.";
  (input.standardClauses ?? []).forEach((c, i) => check(`standardClauses[${i}]`, c));
  if (Object.keys(fieldErrors).length) refuse(400, "TEMPLATE_REFUSED", "Some of the wording can't be used. See each field.", fieldErrors);

  const store = mockStore(scope.tenantId);
  const versions = store.templates.get(target) ?? [];
  versions.push({
    body: { opening, closing: input.closing?.trim() || null, signOff: input.signOff.trim(), standardClauses: (input.standardClauses ?? []).map((c) => c.trim()).filter(Boolean) },
    savedAt: new Date().toISOString(), decision: null,
  });
  store.templates.set(target, versions);
  const overview = await mockTemplatesOverview(scope);
  return target === "company" ? overview.company : overview.branches.find((b) => b.branchId === target)!;
}

function mockEstate(scope: PortalScope, estateId: string) {
  const estate = findMockEstateForAdmin(estateId);
  if (!estate || estate.tenantId !== scope.tenantId || (scope.branchId && estate.branchId !== scope.branchId && estate.branchId !== null)) {
    refuse(404, "ESTATE_NOT_FOUND", "Estate not found.");
  }
  return estate;
}

function mockTerms(scope: PortalScope, estateId: string): EstateLetterTerms {
  const estate = mockEstate(scope, estateId);
  const versions = mockStore(scope.tenantId).terms.get(estateId) ?? [];
  const current = versions.at(-1);
  const approved = newestApproved(versions);
  return {
    estateId, estateName: estate.name, version: versions.length, clauses: current?.body.clauses ?? [], updatedAt: current?.savedAt ?? null,
    generatedClauses: [], disclosureVersions: { fees: null, refundTerms: null, defaultTerms: null }, missingDisclosure: [],
    reviewStatus: current ? current.decision?.status ?? "pending" : null, reviewNote: current?.decision?.note ?? null, reviewedAt: current?.decision?.at ?? null,
    approvedVersion: approved?.version ?? null,
  };
}

function mockSaveTerms(scope: PortalScope, estateId: string, clauses: string[]): EstateLetterTerms {
  mockRequireCompanyWide(scope);
  mockEstate(scope, estateId);
  const trimmed = clauses.map((c) => c.trim());
  if (trimmed.length < 1 || trimmed.length > MAX_CLAUSES || trimmed.some((c) => !c)) refuse(400, "VALIDATION_ERROR", `Write between 1 and ${MAX_CLAUSES} conditions, none empty.`);
  const fieldErrors: Record<string, string> = {};
  trimmed.forEach((c, i) => {
    if (c.length > CLAUSE_MAX) fieldErrors[`clauses[${i}]`] = `Keep each condition under ${CLAUSE_MAX} characters.`;
    else { const p = mockMoneyProblem(c); if (p) fieldErrors[`clauses[${i}]`] = p; }
  });
  if (Object.keys(fieldErrors).length) refuse(400, "CLAUSE_REFUSED", "Some conditions can't be used. See each one.", fieldErrors);
  const store = mockStore(scope.tenantId);
  const versions = store.terms.get(estateId) ?? [];
  if (JSON.stringify(versions.at(-1)?.body.clauses) !== JSON.stringify(trimmed)) {
    versions.push({ body: { clauses: trimmed }, savedAt: new Date().toISOString(), decision: null });
    store.terms.set(estateId, versions);
  }
  return mockTerms(scope, estateId);
}

async function mockCurrentVersions(scope: PortalScope, estateId: string): Promise<{ versions: LetterVersions; missing: LetterheadMissing[] }> {
  const estate = mockEstate(scope, estateId);
  const store = mockStore(scope.tenantId);
  const overview = await mockOverview(scope);
  const branchHead = estate.branchId ? overview.branches.find((b) => b.branchId === estate.branchId) : undefined;
  const printedUnder = branchHead ?? overview.company;
  const templates = await mockTemplatesOverview(scope);
  const tpl = estate.branchId ? templates.branches.find((b) => b.branchId === estate.branchId) ?? templates.company : templates.company;
  const inUse = tpl.inUse === "company" ? templates.company : tpl;
  return {
    versions: {
      terms: newestApproved(store.terms.get(estateId) ?? [])?.version ?? null,
      companyLetterhead: overview.company.version,
      branchLetterhead: branchHead ? branchHead.version : null,
      fees: null, refundTerms: null, defaultTerms: null,
      templateSource: tpl.inUse, template: tpl.inUse === "default" ? null : inUse.approved?.version ?? null,
    },
    missing: printedUnder.missing,
  };
}

const CHANGE_KEYS: [keyof LetterVersions, LetterChange][] = [
  ["terms", "terms"], ["companyLetterhead", "company_letterhead"], ["branchLetterhead", "branch_letterhead"],
  ["fees", "fees"], ["refundTerms", "refund_terms"], ["defaultTerms", "default_terms"], ["template", "template"],
];

async function mockApproval(scope: PortalScope, estateId: string): Promise<LetterApproval> {
  const estate = mockEstate(scope, estateId);
  const store = mockStore(scope.tenantId);
  const { versions, missing } = await mockCurrentVersions(scope, estateId);
  const record = store.approvals.get(estateId) ?? null;
  const approved = record?.versions ?? null;
  const changed = approved
    ? CHANGE_KEYS.filter(([k]) => approved[k] !== versions[k] || (k === "template" && approved.templateSource !== versions.templateSource)).map(([, c]) => c)
    : [];
  const terms = store.terms.get(estateId) ?? [];
  return {
    estateId, estateName: estate.name, approved: !!approved && changed.length === 0, approvedAt: record?.at ?? null,
    approvedVersions: approved, currentVersions: versions, changedSinceApproval: changed,
    blockers: [...(versions.terms === null ? ["no_approved_terms" as const] : []), ...missing],
    newerTermsAwaitingReview: terms.length > 0 && !terms.at(-1)!.decision,
  };
}

async function mockApprove(scope: PortalScope, estateId: string, previewed: LetterVersions): Promise<LetterApproval> {
  mockRequireCompanyWide(scope);
  const now = await mockApproval(scope, estateId);
  if (JSON.stringify(now.currentVersions) !== JSON.stringify(previewed)) refuse(409, "LETTER_SETUP_CHANGED", "The letter's setup changed since you previewed it. Preview it again.");
  if (now.blockers.length) refuse(409, "LETTER_NOT_READY", "The letter isn't ready to approve yet.");
  mockStore(scope.tenantId).approvals.set(estateId, { versions: previewed, at: new Date().toISOString() });
  return mockApproval(scope, estateId);
}
