// One upload helper for every feature that stores a file: estate photos next,
// then KYC and company documents. Files go straight from the browser to
// S3-compatible storage (RustFS locally, Cloudflare R2 later), never through
// our API:
//
//   1. request  POST <feature's upload route> { fileName, contentType, sizeBytes, … }
//               → { fileId, uploadUrl, method: "PUT", headers, expiresAt }
//   2. PUT      the File, as-is, to uploadUrl with exactly those headers. NOT
//               through apiClient: no Authorization header, a different origin.
//               The link lasts 10 minutes and is signed for that exact size
//               and type.
//   3. confirm  POST <feature's confirm route> → the stored file. The server
//               checks the file really is the promised type by its first bytes.
//
// Each feature passes its own request/confirm functions, so the helper never
// knows a route. Public files carry `publicUrl`; a private file is read through
// a short-lived (5-minute) download link from the owning feature, fetched when
// needed and never stored or cached.

import { ApiError } from "./apiClient";

// Never SVG or HTML: both can carry script. The server refuses them too
// (FILE_TYPE_NOT_ALLOWED); checking here gives a friendlier error sooner.
export const UPLOADABLE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type UploadableType = (typeof UPLOADABLE_TYPES)[number];

// For <input type="file" accept={…}>.
export function acceptAttribute(types: readonly UploadableType[] = UPLOADABLE_TYPES): string {
  return types.join(",");
}

const TYPE_NAMES: Record<UploadableType, string> = {
  "image/jpeg": "JPG", "image/png": "PNG", "image/webp": "WebP", "application/pdf": "PDF",
};

// Step 1's answer.
export interface UploadTicket {
  fileId: string;
  uploadUrl: string;
  method: string;
  headers: Record<string, string>;
  expiresAt: string;
}

// Step 3's answer (StoredFileInfo). `visibility` ("public" / "private") and
// `fileType` ("jpeg", "png", "webp", "pdf") are lowercase on the wire; they
// arrived uppercase before backend branch storage-lowercase-wire, so compare
// with the helpers below rather than ===.
export interface StoredFile {
  id: string;
  visibility: string;
  purpose: string;
  fileType: string;
  fileName: string;
  sizeBytes: number;
  status: string;
  publicUrl: string | null;
  uploadedBy: string;
  createdAt: string;
  confirmedAt: string | null;
}

export function sameValue(a: string | null | undefined, b: string): boolean {
  return (a ?? "").toLowerCase() === b.toLowerCase();
}

export const isPublicFile = (file: Pick<StoredFile, "visibility">) => sameValue(file.visibility, "public");
export const isReadyFile = (file: Pick<StoredFile, "status">) => sameValue(file.status, "ready");

export interface UploadRequestBody {
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

export interface UploadOptions<T> {
  // The feature's step 1 and step 3, e.g. estate photos' own routes.
  requestUpload: (body: UploadRequestBody) => Promise<UploadTicket>;
  confirmUpload: (fileId: string) => Promise<T>;
  // The feature's own limit, checked before step 1.
  maxBytes: number;
  // Narrower than UPLOADABLE_TYPES when the feature takes fewer (photos: no PDF).
  types?: readonly UploadableType[];
  // 0..1 during step 2. Passing it switches step 2 to XMLHttpRequest, since
  // fetch can't report upload progress.
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

// `code` is the backend's where there is one (FILE_TOO_LARGE,
// UPLOAD_CONTENT_MISMATCH, STORAGE_UNAVAILABLE…), else one of this helper's:
//   UPLOAD_BLOCKED       step 2 never got an answer: CORS refused this origin,
//                        or the connection dropped
//   UPLOAD_LINK_REFUSED  storage refused the signed link twice
//   UPLOAD_FAILED        storage answered with some other error
export class UploadError extends Error {
  code: string;
  retryable: boolean;
  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = "UploadError";
    this.code = code;
    this.retryable = retryable;
  }
}

function formatMegabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return `${mb >= 10 ? Math.round(mb) : Math.round(mb * 10) / 10} MB`;
}

// The friendly check before anything is sent: null when the file may go.
export function checkUploadable(file: Pick<File, "type" | "size">, maxBytes: number, types: readonly UploadableType[] = UPLOADABLE_TYPES): UploadError | null {
  if (!(types as readonly string[]).includes(file.type)) {
    return new UploadError("FILE_TYPE_NOT_ALLOWED", `Choose a ${types.map((t) => TYPE_NAMES[t]).join(", ").replace(/, ([^,]*)$/, " or $1")} file.`);
  }
  if (file.size === 0) return new UploadError("FILE_EMPTY", "That file is empty.");
  if (file.size > maxBytes) {
    return new UploadError("FILE_TOO_LARGE", `That file is ${formatMegabytes(file.size)}. The most allowed here is ${formatMegabytes(maxBytes)}.`);
  }
  return null;
}

// Steps 1 and 3 are our API: show the backend's message, which is written for users.
function apiUploadError(err: unknown): unknown {
  if (err instanceof ApiError) {
    const code = err.body?.code ?? `HTTP_${err.status}`;
    return new UploadError(code, err.body?.message ?? "The upload didn't go through. Try again.", code === "STORAGE_UNAVAILABLE" || err.status >= 500);
  }
  return err;
}

async function step<R>(call: () => Promise<R>): Promise<R> {
  try {
    return await call();
  } catch (err) {
    throw apiUploadError(err);
  }
}

// What step 2 came back with — or "blocked" when there was no answer at all.
type PutOutcome = { kind: "ok" } | { kind: "refused"; status: number; body: string } | { kind: "blocked" };

function abortError(): DOMException {
  return new DOMException("The upload was cancelled.", "AbortError");
}

async function putWithFetch(file: File, ticket: UploadTicket, signal?: AbortSignal): Promise<PutOutcome> {
  let res: Response;
  try {
    res = await fetch(ticket.uploadUrl, { method: ticket.method || "PUT", headers: ticket.headers, body: file, signal });
  } catch {
    if (signal?.aborted) throw abortError();
    return { kind: "blocked" };
  }
  if (res.ok) return { kind: "ok" };
  return { kind: "refused", status: res.status, body: await res.text().catch(() => "") };
}

function putWithXhr(file: File, ticket: UploadTicket, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<PutOutcome> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(ticket.method || "PUT", ticket.uploadUrl);
    for (const [name, value] of Object.entries(ticket.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { onProgress(1); resolve({ kind: "ok" }); }
      else resolve({ kind: "refused", status: xhr.status, body: xhr.responseText ?? "" });
    };
    // A CORS refusal and a dropped connection look the same here: status 0.
    xhr.onerror = () => resolve({ kind: "blocked" });
    xhr.onabort = () => reject(abortError());
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

function blocked(): UploadError {
  const origin = typeof window !== "undefined" ? window.location.origin : "this site";
  return new UploadError("UPLOAD_BLOCKED",
    `Upload blocked: this site isn't allowed to upload to storage, or the connection dropped. If it keeps happening, storage must allow ${origin} (FRONTEND_ORIGIN).`,
    true);
}

/**
 * Checks, requests a link, PUTs the file and confirms it. Returns whatever the
 * feature's confirm returns. A link storage refuses (403: expired, or the size
 * or type differed from what was signed) is started again from step 1 once.
 */
export async function uploadFile<T = StoredFile>(file: File, options: UploadOptions<T>): Promise<T> {
  const { requestUpload, confirmUpload, maxBytes, types = UPLOADABLE_TYPES, onProgress, signal } = options;
  const problem = checkUploadable(file, maxBytes, types);
  if (problem) throw problem;

  for (let attempt = 0; ; attempt++) {
    if (signal?.aborted) throw abortError();
    // The File itself is sent as-is, so its size and type are what's signed.
    const ticket = await step(() => requestUpload({ fileName: file.name, contentType: file.type, sizeBytes: file.size }));
    onProgress?.(0);
    const outcome = onProgress && typeof XMLHttpRequest !== "undefined"
      ? await putWithXhr(file, ticket, onProgress, signal)
      : await putWithFetch(file, ticket, signal);

    if (outcome.kind === "blocked") throw blocked();
    if (outcome.kind === "refused") {
      // SignatureDoesNotMatch / an expired link: a fresh ticket fixes it.
      if (outcome.status === 403 && attempt === 0) continue;
      throw outcome.status === 403
        ? new UploadError("UPLOAD_LINK_REFUSED", "Storage refused the upload link. Try again.", true)
        : new UploadError("UPLOAD_FAILED", "Storage didn't accept the file. Try again.", outcome.status >= 500);
    }
    return step(() => confirmUpload(ticket.fileId));
  }
}
