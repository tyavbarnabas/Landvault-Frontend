// An estate's land title: developers declare it, HomeTrue verifies it.
//
// The developer records the title (type, number, date) and uploads the
// documents behind it. That makes it "pending": buyers see "C of O
// (declared)". Only a HomeTrue reviewer (admin.titles.review) can mark it
// "verified" or "rejected", after reading the documents or running an
// official search at the land registry. A developer can never verify its own
// land, and changing a verified title sends it back to pending, because the
// verification was of the old document.
//
// Portal, under /api/portal/estates/{estateId}/title (GET .view, rest .manage):
//   GET                                → EstateTitle, or 404 TITLE_NOT_RECORDED
//   POST /documents/uploads            { fileName, contentType, sizeBytes, kind } → ticket
//   POST /documents/{fileId}/confirm   → TitleDocument
//   GET  /documents/{fileId}/download  → { url, expiresAt } (private, 5 minutes)
//   PUT                                { titleType, titleNumber, issuedDate, titleDocumentFileId, surveyPlanFileId, deedFileId } → EstateTitle
// Admin (admin.titles.review):
//   GET  /api/admin/title-reviews?status=…                           → TitleReview[]
//   GET  /api/admin/title-reviews/{titleId}/documents/{fileId}/download → { url, expiresAt }
//   POST /api/admin/title-reviews/{titleId}/verify   { verificationSource, note?, submittedAt }
//   POST /api/admin/title-reviews/{titleId}/reject   { note, submittedAt }
// A decision sends back the submittedAt of the title the reviewer read: if the
// developer has resubmitted since, it's refused (409 TITLE_CHANGED) rather than
// approving documents nobody looked at. submittedBy and decidedBy are user ids,
// so they're never shown as names.

import { mockAllTitles, mockSetTitle, mockTitle, mockTitleDocuments } from "../data/mockEstateTitles";
import { apiClient, ApiError } from "../lib/apiClient";
import { isMock } from "../lib/backends";
import { checkUploadable, uploadFile, UploadError, type UploadableType, type UploadOptions, type UploadTicket } from "../lib/uploadFile";
import type { TitleType } from "./marketplaceService";
import { fetchPortalEstateById, findMockEstateForAdmin, isReadOnlyForScope, type PortalScope } from "./portalEstatesService";
import { fetchTenantByIdSync, tenantDisplayName } from "./tenantsService";

export type TitleStatus = "pending" | "verified" | "rejected";
export type TitleDocumentKind = "title_document" | "survey_plan" | "deed";
export type VerificationSource = "manual_review" | "registry_search";

export const TITLE_TYPES: TitleType[] = ["C of O", "R of O", "Governor's Consent", "Gazette"];
export const TITLE_DOCUMENT_TYPES: readonly UploadableType[] = ["application/pdf", "image/jpeg", "image/png"];
export const TITLE_DOCUMENT_MAX_BYTES = 10_485_760;
export const TITLE_NUMBER_MAX = 100;

export const DOCUMENT_KINDS: { kind: TitleDocumentKind; label: string; hint: string; required: boolean }[] = [
  { kind: "title_document", label: "Title document", hint: "The C of O, R of O, Governor's Consent, or the Gazette page naming the land.", required: true },
  { kind: "survey_plan", label: "Survey plan", hint: "The registered survey plan showing the estate's boundary and coordinates.", required: true },
  { kind: "deed", label: "Deed of assignment", hint: "Only if the land was bought from the title holder.", required: false },
];

export const VERIFICATION_SOURCES: { value: VerificationSource; label: string; hint: string }[] = [
  { value: "manual_review", label: "Document review", hint: "A reviewer compared the documents with each other and with the estate." },
  { value: "registry_search", label: "Official registry search", hint: "Someone searched the title at the land registry and has the search report." },
];

// TitleDocumentDto.
export interface TitleDocument {
  fileId: string;
  kind: TitleDocumentKind;
  fileName: string;
  fileType: string;
  sizeBytes: number;
  uploadedAt: string;
}

// EstateTitleDto.
export interface EstateTitle {
  id: string;
  estateId: string;
  titleType: TitleType;
  titleNumber: string;
  issuedDate: string | null;
  status: TitleStatus;
  documents: TitleDocument[];
  submittedAt: string;
  submittedBy: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  verificationSource: VerificationSource | null;
  decisionNote: string | null;
}

// TitleReviewDto: the reviewer also sees whose estate it is.
export interface TitleReview extends EstateTitle {
  estateName: string;
  estateState: string;
  companyName: string | null;
}

export interface TitleSubmission {
  titleType: TitleType;
  titleNumber: string;
  issuedDate: string | null;
  titleDocumentFileId: string;
  surveyPlanFileId: string;
  deedFileId: string | null;
}

export interface DownloadLink {
  url: string;
  expiresAt: string;
}

// `field` names the form control the message belongs to, when there is one.
export class TitleError extends Error {
  code: string;
  field: string | null;
  constructor(code: string, message: string, field: string | null = null) {
    super(message);
    this.name = "TitleError";
    this.code = code;
    this.field = field;
  }
}

const MESSAGES: Record<string, string> = {
  TITLE_DOCUMENT_REQUIRED: "Upload the title document.",
  SURVEY_PLAN_REQUIRED: "Upload the survey plan.",
  TITLE_DOCUMENT_NOT_FOUND: "That document is missing or still uploading. Upload it again.",
  ISSUED_DATE_IN_FUTURE: "The issue date can't be in the future.",
  ESTATE_READ_ONLY_FOR_BRANCH: "This estate belongs to the company, not your branch. Branch staff can view its title but not change it.",
  ESTATE_NOT_FOUND: "This estate no longer exists, or isn't yours.",
  TITLE_NOT_PENDING: "This title has already been decided. Reload the list.",
  TITLE_CHANGED: "This title changed since you opened it: the developer sent a new version. Reload it and review that one.",
  TITLE_DOCUMENTS_MISSING: "This title has no documents to check, so it can't be verified. Use \"Can't confirm\" and ask the developer to upload them.",
  INVALID_ISSUED_DATE: "Enter the issue date as a full date.",
  VERIFICATION_SOURCE_NOT_ALLOWED: "Choose document review or official registry search.",
  TITLE_NOT_FOUND: "That title no longer exists.",
  NOTE_REQUIRED: "Say why. The developer sees this note.",
};

const FIELD_OF: Record<string, string> = {
  TITLE_DOCUMENT_REQUIRED: "title_document",
  SURVEY_PLAN_REQUIRED: "survey_plan",
  ISSUED_DATE_IN_FUTURE: "issuedDate",
  INVALID_ISSUED_DATE: "issuedDate",
  NOTE_REQUIRED: "note",
};

// The backend's field names, mapped to this form's.
const WIRE_FIELD: Record<string, string> = {
  titleDocumentFileId: "title_document",
  surveyPlanFileId: "survey_plan",
  deedFileId: "deed",
};

export function toTitleError(err: unknown): unknown {
  if (err instanceof TitleError) return err;
  if (err instanceof DOMException && err.name === "AbortError") return err;
  if (err instanceof UploadError) return new TitleError(err.code, err.message);
  if (err instanceof ApiError) {
    const code = err.body?.code ?? `HTTP_${err.status}`;
    const fieldErrors = err.body?.fieldErrors;
    if (fieldErrors) {
      const [field, message] = Object.entries(fieldErrors)[0] ?? [];
      if (field && message) return new TitleError("VALIDATION", message, WIRE_FIELD[field] ?? field);
    }
    return new TitleError(code, err.body?.message ?? MESSAGES[code] ?? "That didn't go through. Try again.", FIELD_OF[code] ?? null);
  }
  return err;
}

async function call<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    throw toTitleError(err);
  }
}

const base = (estateId: string) => `/api/portal/estates/${estateId}/title`;

function fail(status: number, code: string): never {
  throw new ApiError(status, MESSAGES[code], { code, message: MESSAGES[code] });
}

// ─── What it says ────────────────────────────────────────────────────────────

export function titleStatusText(status: TitleStatus): string {
  return status === "verified" ? "Verified by HomeTrue" : status === "rejected" ? "Not confirmed" : "Waiting for HomeTrue review";
}

export function sourceLabel(source: VerificationSource | null): string {
  return VERIFICATION_SOURCES.find((s) => s.value === source)?.label ?? "Not recorded";
}

// Client-side checks, before anything is sent.
export function checkSubmission(draft: { titleNumber: string; issuedDate: string; documents: Partial<Record<TitleDocumentKind, string>> }): Record<string, string> {
  const errors: Record<string, string> = {};
  const number = draft.titleNumber.trim();
  if (!number) errors.titleNumber = "Enter the title number exactly as it appears on the document.";
  else if (number.length > TITLE_NUMBER_MAX) errors.titleNumber = `At most ${TITLE_NUMBER_MAX} characters.`;
  if (draft.issuedDate && draft.issuedDate > new Date().toISOString().slice(0, 10)) errors.issuedDate = MESSAGES.ISSUED_DATE_IN_FUTURE;
  if (!draft.documents.title_document) errors.title_document = MESSAGES.TITLE_DOCUMENT_REQUIRED;
  if (!draft.documents.survey_plan) errors.survey_plan = MESSAGES.SURVEY_PLAN_REQUIRED;
  return errors;
}

// ─── Developer side ──────────────────────────────────────────────────────────

export function fetchEstateTitle(estateId: string, scope: PortalScope): Promise<EstateTitle | null> {
  if (!isMock("estateTitles")) {
    // Only "no title yet" is an empty answer; a missing estate is an error.
    return call(() => apiClient.get<EstateTitle>(base(estateId)).catch((err) => {
      if (err instanceof ApiError && err.status === 404 && err.body?.code === "TITLE_NOT_RECORDED") return null;
      throw err;
    }));
  }
  return call(async () => {
    await mockReadable(estateId, scope);
    const title = mockTitle(estateId);
    return title ? copy(title) : null;
  });
}

export function uploadTitleDocument(
  estateId: string,
  kind: TitleDocumentKind,
  file: File,
  scope: PortalScope,
  options: Pick<UploadOptions<TitleDocument>, "onProgress" | "signal"> = {},
): Promise<TitleDocument> {
  if (!isMock("estateTitles")) {
    return call(() => uploadFile(file, {
      ...options,
      maxBytes: TITLE_DOCUMENT_MAX_BYTES,
      types: TITLE_DOCUMENT_TYPES,
      requestUpload: (req) => apiClient.post<UploadTicket>(`${base(estateId)}/documents/uploads`, { ...req, kind }),
      confirmUpload: (fileId) => apiClient.post<TitleDocument>(`${base(estateId)}/documents/${fileId}/confirm`),
    }));
  }
  return call(async () => {
    await mockWritable(estateId, scope);
    // The same checks uploadFile makes first, so mock mode refuses what live mode would.
    const problem = checkUploadable(file, TITLE_DOCUMENT_MAX_BYTES, TITLE_DOCUMENT_TYPES);
    if (problem) throw problem;
    options.onProgress?.(1);
    const doc: TitleDocument = {
      fileId: mockId(), kind, fileName: file.name, fileType: file.type.split("/")[1] ?? "", sizeBytes: file.size, uploadedAt: new Date().toISOString(),
    };
    mockTitleDocuments.set(doc.fileId, { ...doc, estateId, url: URL.createObjectURL(file) });
    return doc;
  });
}

// A private file: a fresh 5-minute link each time, never stored.
export function titleDocumentLink(estateId: string, fileId: string, scope: PortalScope): Promise<DownloadLink> {
  if (!isMock("estateTitles")) return call(() => apiClient.get<DownloadLink>(`${base(estateId)}/documents/${fileId}/download`));
  return call(async () => {
    await mockReadable(estateId, scope);
    return mockLink(estateId, fileId);
  });
}

export function submitEstateTitle(estateId: string, submission: TitleSubmission, scope: PortalScope): Promise<EstateTitle> {
  const body = { ...submission, titleNumber: submission.titleNumber.trim(), issuedDate: submission.issuedDate || null };
  if (!isMock("estateTitles")) return call(() => apiClient.put<EstateTitle>(base(estateId), body));
  return call(async () => {
    await mockWritable(estateId, scope);
    if (!body.titleDocumentFileId) fail(400, "TITLE_DOCUMENT_REQUIRED");
    if (!body.surveyPlanFileId) fail(400, "SURVEY_PLAN_REQUIRED");
    if (body.issuedDate && body.issuedDate > new Date().toISOString().slice(0, 10)) fail(400, "ISSUED_DATE_IN_FUTURE");
    const previous = mockTitle(estateId);
    const documents = ([
      [body.titleDocumentFileId, "title_document"], [body.surveyPlanFileId, "survey_plan"], [body.deedFileId, "deed"],
    ] as const).flatMap(([fileId, kind]) => {
      if (!fileId) return [];
      const doc = mockTitleDocuments.get(fileId);
      if (!doc || doc.estateId !== estateId || doc.kind !== kind) fail(400, "TITLE_DOCUMENT_NOT_FOUND");
      const { estateId: _e, url: _u, ...rest } = doc;
      return [rest];
    });
    const title: EstateTitle = {
      id: previous?.id ?? mockId(), estateId, titleType: body.titleType, titleNumber: body.titleNumber, issuedDate: body.issuedDate,
      status: "pending", documents, submittedAt: new Date().toISOString(), submittedBy: "mock-user",
      decidedAt: null, decidedBy: null, verificationSource: null, decisionNote: null,
    };
    mockSetTitle(title);
    return copy(title);
  });
}

// ─── HomeTrue review ─────────────────────────────────────────────────────────

export function fetchTitleReviews(status: TitleStatus = "pending"): Promise<TitleReview[]> {
  if (!isMock("estateTitles")) return call(() => apiClient.get<TitleReview[]>(`/api/admin/title-reviews?status=${status}`));
  return call(async () => {
    const list = mockAllTitles().filter((t) => t.status === status).map(toReview);
    const time = (t: TitleReview) => (status === "pending" ? t.submittedAt : t.decidedAt ?? t.submittedAt);
    return list.sort((a, b) => (status === "pending" ? 1 : -1) * time(a).localeCompare(time(b)));
  });
}

export function reviewDocumentLink(titleId: string, fileId: string): Promise<DownloadLink> {
  if (!isMock("estateTitles")) return call(() => apiClient.get<DownloadLink>(`/api/admin/title-reviews/${titleId}/documents/${fileId}/download`));
  return call(async () => {
    const title = mockAllTitles().find((t) => t.id === titleId);
    if (!title) fail(404, "TITLE_NOT_FOUND");
    return mockLink(title.estateId, fileId);
  });
}

// `reviewed` is the title as the reviewer saw it: its submittedAt goes back
// with the decision.
export function verifyTitle(reviewed: Pick<EstateTitle, "id" | "submittedAt">, verificationSource: VerificationSource, note: string): Promise<TitleReview> {
  const body = { verificationSource, submittedAt: reviewed.submittedAt, ...(note.trim() ? { note: note.trim() } : {}) };
  if (!isMock("estateTitles")) return call(() => apiClient.post<TitleReview>(`/api/admin/title-reviews/${reviewed.id}/verify`, body));
  return call(async () => mockDecide(reviewed, "verified", verificationSource, note.trim() || null));
}

export function rejectTitle(reviewed: Pick<EstateTitle, "id" | "submittedAt">, note: string): Promise<TitleReview> {
  if (!note.trim()) return Promise.reject(new TitleError("NOTE_REQUIRED", MESSAGES.NOTE_REQUIRED, "note"));
  const body = { note: note.trim(), submittedAt: reviewed.submittedAt };
  if (!isMock("estateTitles")) return call(() => apiClient.post<TitleReview>(`/api/admin/title-reviews/${reviewed.id}/reject`, body));
  return call(async () => mockDecide(reviewed, "rejected", null, note.trim()));
}

// ─── Mock helpers ────────────────────────────────────────────────────────────

function copy(title: EstateTitle): EstateTitle {
  return { ...title, documents: title.documents.map((d) => ({ ...d })) };
}

function toReview(title: EstateTitle): TitleReview {
  const estate = findMockEstateForAdmin(title.estateId);
  const tenant = estate ? fetchTenantByIdSync(estate.tenantId) : undefined;
  return {
    ...copy(title),
    estateName: estate?.name ?? mockEstateNames.get(title.estateId) ?? "Unknown estate",
    estateState: estate?.state ?? "",
    companyName: tenant ? tenantDisplayName(tenant) : null,
  };
}

function mockDecide(reviewed: Pick<EstateTitle, "id" | "submittedAt">, status: "verified" | "rejected", source: VerificationSource | null, note: string | null): TitleReview {
  const title = mockAllTitles().find((t) => t.id === reviewed.id);
  if (!title) fail(404, "TITLE_NOT_FOUND");
  if (title.submittedAt !== reviewed.submittedAt) fail(409, "TITLE_CHANGED");
  if (title.status !== "pending") fail(409, "TITLE_NOT_PENDING");
  if (status === "verified" && title.documents.length === 0) fail(409, "TITLE_DOCUMENTS_MISSING");
  const decided: EstateTitle = {
    ...title, status, verificationSource: source, decisionNote: note, decidedAt: new Date().toISOString(), decidedBy: "mock-super-admin",
  };
  mockSetTitle(decided);
  return toReview(decided);
}

function mockLink(estateId: string, fileId: string): DownloadLink {
  const doc = mockTitleDocuments.get(fileId);
  if (!doc || doc.estateId !== estateId) fail(404, "TITLE_DOCUMENT_NOT_FOUND");
  return { url: doc.url, expiresAt: new Date(Date.now() + 5 * 60_000).toISOString() };
}

// Names of estates read through the portal, so a review of a live estate's
// mocked title (while titles alone are mocked) still says which estate it is.
const mockEstateNames = new Map<string, string>();

async function mockReadable(estateId: string, scope: PortalScope) {
  const estate = await fetchPortalEstateById(estateId, scope);
  if (!estate) fail(404, "ESTATE_NOT_FOUND");
  mockEstateNames.set(estateId, estate.name);
  return estate;
}

async function mockWritable(estateId: string, scope: PortalScope) {
  const estate = await mockReadable(estateId, scope);
  if (isReadOnlyForScope(estate, scope)) fail(403, "ESTATE_READ_ONLY_FOR_BRANCH");
}

function mockId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `title-${Math.random().toString(16).slice(2, 10)}`;
}
