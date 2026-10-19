// HomeTrue's review of what developers write into allocation letters
// (admin.documents.review: Super Admin and compliance officers). No pattern
// catches every way of writing a sum, so a person reads every version of an
// estate's conditions and of a company's or branch's wording before a letter
// may use it.
//
//   /api/admin/letter-terms-reviews?status=pending|approved|rejected
//   /api/admin/letter-terms-reviews/{termsId}/approve   { note? }
//   /api/admin/letter-terms-reviews/{termsId}/reject    { note }   (shown to the developer)
//   /api/admin/letter-template-reviews…                  the same, by templateId
//
// Pending lists each one's newest undecided version, oldest first. Only the
// newest version can be decided: *_SUPERSEDED (409) means the developer saved
// a newer one, *_ALREADY_DECIDED (409) that another reviewer got there first.

import { apiClient, ApiError } from "../lib/apiClient";
import { isMock } from "../lib/backends";
import { findMockEstateForAdmin } from "./portalEstatesService";
import { fetchTenantByIdSync, tenantDisplayName } from "./tenantsService";
import { mockBranchNameFor } from "./branchesService";
import { mockLetterTenants, type LetterTemplateVersion, type ReviewStatus } from "./lettersService";

export interface LetterTermsReview {
  termsId: string;
  estateId: string;
  estateName: string;
  estateState: string | null;
  companyName: string | null;
  version: number;
  clauses: string[];
  savedAt: string;
  generatedClauses: string[];
  status: ReviewStatus;
  note: string | null;
  reviewedAt: string | null;
  approvedVersion: number | null;
  approvedClauses: string[] | null;
}

export interface LetterTemplateReview {
  templateId: string;
  tenantId: string;
  companyName: string | null;
  source: "company" | "branch";
  branchId: string | null;
  branchName: string | null;
  version: number;
  opening: string;
  closing: string | null;
  signOff: string;
  standardClauses: string[];
  savedAt: string;
  status: ReviewStatus;
  note: string | null;
  reviewedAt: string | null;
  approved: LetterTemplateVersion | null;
}

export const REVIEW_NOTE_MAX = 2000;

/** The queue moved under the reviewer: reload it rather than retry. */
export function isStaleReview(err: unknown): boolean {
  const code = err instanceof ApiError ? err.body?.code : undefined;
  return !!code && /_(SUPERSEDED|ALREADY_DECIDED|NOT_FOUND)$/.test(code);
}

// ─── Estate conditions ───────────────────────────────────────────────────────

export async function fetchTermsReviews(status: ReviewStatus): Promise<LetterTermsReview[]> {
  if (isMock("letters")) return mockTermsReviews().filter((r) => r.status === status);
  return apiClient.get<LetterTermsReview[]>(`/api/admin/letter-terms-reviews?status=${status}`);
}

export async function approveTerms(termsId: string, note: string): Promise<LetterTermsReview> {
  if (isMock("letters")) return mockDecideTerms(termsId, "approved", note);
  return apiClient.post<LetterTermsReview>(`/api/admin/letter-terms-reviews/${termsId}/approve`, note.trim() ? { note: note.trim() } : {});
}

export async function rejectTerms(termsId: string, note: string): Promise<LetterTermsReview> {
  if (isMock("letters")) return mockDecideTerms(termsId, "rejected", note);
  return apiClient.post<LetterTermsReview>(`/api/admin/letter-terms-reviews/${termsId}/reject`, { note: note.trim() });
}

// ─── Letter wording ──────────────────────────────────────────────────────────

export async function fetchTemplateReviews(status: ReviewStatus): Promise<LetterTemplateReview[]> {
  if (isMock("letters")) return mockTemplateReviews().filter((r) => r.status === status);
  return apiClient.get<LetterTemplateReview[]>(`/api/admin/letter-template-reviews?status=${status}`);
}

export async function approveTemplate(templateId: string, note: string): Promise<LetterTemplateReview> {
  if (isMock("letters")) return mockDecideTemplate(templateId, "approved", note);
  return apiClient.post<LetterTemplateReview>(`/api/admin/letter-template-reviews/${templateId}/approve`, note.trim() ? { note: note.trim() } : {});
}

export async function rejectTemplate(templateId: string, note: string): Promise<LetterTemplateReview> {
  if (isMock("letters")) return mockDecideTemplate(templateId, "rejected", note);
  return apiClient.post<LetterTemplateReview>(`/api/admin/letter-template-reviews/${templateId}/reject`, { note: note.trim() });
}

// ─── Mock (demo mode only): reads the letters service's store ────────────────

function refuse(status: number, code: string, message: string, fieldErrors?: Record<string, string>): never {
  throw new ApiError(status, message, { code, message, fieldErrors });
}

function companyName(tenantId: string): string | null {
  const tenant = fetchTenantByIdSync(tenantId);
  return tenant ? tenantDisplayName(tenant) : null;
}

type Decision = { status: "approved" | "rejected"; note: string | null; at: string } | null;
function statusOf(decision: Decision, newest: boolean): ReviewStatus | "superseded" {
  return decision?.status ?? (newest ? "pending" : "superseded");
}

function mockTermsReviews(): LetterTermsReview[] {
  const out: LetterTermsReview[] = [];
  for (const [tenantId, store] of mockLetterTenants()) {
    for (const [estateId, versions] of store.terms) {
      const estate = findMockEstateForAdmin(estateId);
      versions.forEach((v, i) => {
        const status = statusOf(v.decision, i === versions.length - 1);
        if (status === "superseded") return;
        let approvedIndex = -1;
        for (let j = versions.length - 1; j >= 0; j--) if (versions[j].decision?.status === "approved") { approvedIndex = j; break; }
        out.push({
          termsId: `${estateId}~${i + 1}`, estateId, estateName: estate?.name ?? estateId, estateState: estate?.state ?? null,
          companyName: companyName(tenantId), version: i + 1, clauses: v.body.clauses, savedAt: v.savedAt, generatedClauses: [],
          status, note: v.decision?.note ?? null, reviewedAt: v.decision?.at ?? null,
          approvedVersion: approvedIndex >= 0 ? approvedIndex + 1 : null,
          approvedClauses: approvedIndex >= 0 ? versions[approvedIndex].body.clauses : null,
        });
      });
    }
  }
  return out.sort((a, b) => (a.status === "pending" ? a.savedAt.localeCompare(b.savedAt) : b.savedAt.localeCompare(a.savedAt)));
}

function mockDecideTerms(termsId: string, status: "approved" | "rejected", note: string): LetterTermsReview {
  const [estateId, v] = termsId.split("~");
  const version = Number(v);
  const store = mockLetterTenants().find(([, s]) => s.terms.has(estateId))?.[1];
  const versions = store?.terms.get(estateId);
  if (!versions || !versions[version - 1]) refuse(404, "LETTER_TERMS_NOT_FOUND", "Those conditions don't exist.");
  if (status === "rejected" && !note.trim()) refuse(400, "VALIDATION_ERROR", "Say what to change: the developer sees this note.", { note: "Say what to change: the developer sees this note." });
  if (version !== versions.length) refuse(409, "LETTER_TERMS_SUPERSEDED", "The developer has saved a newer version. Reload the queue.");
  if (versions[version - 1].decision) refuse(409, "LETTER_TERMS_ALREADY_DECIDED", "Someone has already decided this version. Reload the queue.");
  versions[version - 1].decision = { status, note: note.trim() || null, at: new Date().toISOString() };
  return mockTermsReviews().find((r) => r.termsId === termsId)!;
}

function mockTemplateReviews(): LetterTemplateReview[] {
  const out: LetterTemplateReview[] = [];
  for (const [tenantId, store] of mockLetterTenants()) {
    for (const [target, versions] of store.templates) {
      let approvedIndex = -1;
      for (let j = versions.length - 1; j >= 0; j--) if (versions[j].decision?.status === "approved") { approvedIndex = j; break; }
      const approved = approvedIndex >= 0 ? versions[approvedIndex] : null;
      versions.forEach((v, i) => {
        const status = statusOf(v.decision, i === versions.length - 1);
        if (status === "superseded") return;
        out.push({
          templateId: `${tenantId}~${target}~${i + 1}`, tenantId, companyName: companyName(tenantId),
          source: target === "company" ? "company" : "branch", branchId: target === "company" ? null : target,
          branchName: target === "company" ? null : mockBranchNameFor(tenantId, target) ?? null,
          version: i + 1, ...v.body, savedAt: v.savedAt, status, note: v.decision?.note ?? null, reviewedAt: v.decision?.at ?? null,
          approved: approved ? {
            version: approvedIndex + 1, ...approved.body, savedAt: approved.savedAt, reviewStatus: "approved", reviewNote: approved.decision!.note, reviewedAt: approved.decision!.at,
          } : null,
        });
      });
    }
  }
  return out.sort((a, b) => (a.status === "pending" ? a.savedAt.localeCompare(b.savedAt) : b.savedAt.localeCompare(a.savedAt)));
}

function mockDecideTemplate(templateId: string, status: "approved" | "rejected", note: string): LetterTemplateReview {
  const [tenantId, target, v] = templateId.split("~");
  const version = Number(v);
  const versions = mockLetterTenants().find(([t]) => t === tenantId)?.[1].templates.get(target);
  if (!versions || !versions[version - 1]) refuse(404, "LETTER_TEMPLATE_NOT_FOUND", "That wording doesn't exist.");
  if (status === "rejected" && !note.trim()) refuse(400, "VALIDATION_ERROR", "Say what to change: the developer sees this note.", { note: "Say what to change: the developer sees this note." });
  if (version !== versions.length) refuse(409, "LETTER_TEMPLATE_SUPERSEDED", "The developer has saved newer wording. Reload the queue.");
  if (versions[version - 1].decision) refuse(409, "LETTER_TEMPLATE_ALREADY_DECIDED", "Someone has already decided this version. Reload the queue.");
  versions[version - 1].decision = { status, note: note.trim() || null, at: new Date().toISOString() };
  return mockTemplateReviews().find((r) => r.templateId === templateId)!;
}
