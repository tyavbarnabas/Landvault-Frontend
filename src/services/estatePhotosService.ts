// An estate's photos (storage step 2): the first real feature on
// src/lib/uploadFile.ts. All under /api/portal/estates/{estateId}/photos —
// GET needs portal.estates.view, everything else portal.estates.manage.
//
//   POST   /uploads              { fileName, contentType, sizeBytes } → ticket
//   POST   /{fileId}/confirm     { caption? } → EstatePhoto (201, or 200 if already confirmed)
//   GET                          → EstatePhoto[] in order
//   PATCH  /{photoId}            { caption? } → EstatePhoto ("" clears, left out = unchanged)
//   PUT    /order                { photoIds } → EstatePhoto[] (every id exactly once)
//   PUT    /cover                { photoId } → EstatePhoto[]
//   DELETE /{photoId}            → 204
//
// Confirm strips the image's metadata (GPS, camera, dates; orientation kept)
// and stores the clean file at a NEW address. So the screen always shows the
// `url` the server returns — never a local blob or the upload URL — and every
// change re-renders from the server's answer, not from optimistic local state.
// The server owns the cover rule: the first photo becomes it, reordering never
// moves it, deleting it passes it to the next in order.

import { mockList, mockPhotos } from "../data/mockEstatePhotos";
import { apiClient, ApiError } from "../lib/apiClient";
import { isMock } from "../lib/backends";
import { checkUploadable, uploadFile, UploadError, type UploadableType, type UploadOptions, type UploadTicket } from "../lib/uploadFile";
import { fetchPortalEstateById, isReadOnlyForScope, type PortalScope } from "./portalEstatesService";

// EstatePhotoDto.
export interface EstatePhoto {
  id: string;
  url: string;
  caption: string | null;
  position: number;
  cover: boolean;
  fileType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedAt: string;
}

export const PHOTO_TYPES: readonly UploadableType[] = ["image/jpeg", "image/png", "image/webp"];
export const PHOTO_MAX_BYTES = 5_242_880;
export const PHOTO_LIMIT = 20;
export const CAPTION_MAX = 200;

const base = (estateId: string) => `/api/portal/estates/${estateId}/photos`;

// What a failed photo call means for the person looking at it:
//   reupload  the file was deleted server-side (or never arrived): send it again
//   choose    this file can't work; pick a different one
//   reload    the list on screen is stale
//   none      nothing to retry (permissions, limits, gone)
export type PhotoErrorAction = "reupload" | "choose" | "reload" | "none";

export class PhotoError extends Error {
  code: string;
  action: PhotoErrorAction;
  constructor(code: string, message: string, action: PhotoErrorAction) {
    super(message);
    this.name = "PhotoError";
    this.code = code;
    this.action = action;
  }
}

// Used only when the server sent no message of its own.
const FALLBACK: Record<string, string> = {
  FILE_TYPE_NOT_ALLOWED: "Choose a JPG, PNG or WebP photo.",
  FILE_TOO_LARGE: "That photo is over 5 MB. Export a smaller copy and try again.",
  ESTATE_PHOTO_LIMIT_REACHED: `This estate already has ${PHOTO_LIMIT} photos, the most allowed. Delete one to add another.`,
  IMAGE_UNREADABLE: "That file couldn't be read as an image, so it wasn't kept.",
  UPLOAD_SIZE_MISMATCH: "The file that arrived wasn't the size expected, so it wasn't kept.",
  UPLOAD_CONTENT_MISMATCH: "The file that arrived wasn't the image type it claimed to be, so it wasn't kept.",
  UPLOAD_NOT_RECEIVED: "Storage never received the file.",
  UPLOAD_EXPIRED: "The upload link expired before the file was finished.",
  FILE_NOT_FOUND: "Only the person who started this upload can finish it.",
  ESTATE_READ_ONLY_FOR_BRANCH: "This estate belongs to the company, not your branch. Branch staff can view its photos but not change them.",
  PHOTO_ORDER_MISMATCH: "The photos changed while you were looking at them.",
  ESTATE_NOT_FOUND: "This estate no longer exists, or isn't yours.",
  PHOTO_NOT_FOUND: "That photo has already been removed.",
  INVALID_PARAMETER: "That photo couldn't be found.",
};

// What to say after the server's own message, so it says what to do next.
const NEXT_STEP: Partial<Record<string, string>> = {
  IMAGE_UNREADABLE: "Open it in a photo app, export it again as JPG or PNG, and upload that copy.",
  UPLOAD_SIZE_MISMATCH: "Upload it again.",
  UPLOAD_CONTENT_MISMATCH: "Upload it again.",
  UPLOAD_NOT_RECEIVED: "Start the upload again.",
  UPLOAD_EXPIRED: "Start the upload again.",
};

const ACTION: Record<string, PhotoErrorAction> = {
  IMAGE_UNREADABLE: "choose",
  FILE_TYPE_NOT_ALLOWED: "choose",
  FILE_TOO_LARGE: "choose",
  FILE_EMPTY: "choose",
  UPLOAD_SIZE_MISMATCH: "reupload",
  UPLOAD_CONTENT_MISMATCH: "reupload",
  UPLOAD_NOT_RECEIVED: "reupload",
  UPLOAD_EXPIRED: "reupload",
  PHOTO_ORDER_MISMATCH: "reload",
  PHOTO_NOT_FOUND: "reload",
};

function withNextStep(code: string, message: string): string {
  const next = NEXT_STEP[code];
  return next && !message.includes(next) ? `${message} ${next}` : message;
}

// Both an ApiError (the photo routes) and an UploadError (uploadFile, which
// already wraps steps 1 and 3 and adds its own storage codes) end up here.
export function toPhotoError(err: unknown): unknown {
  if (err instanceof PhotoError) return err;
  if (err instanceof DOMException && err.name === "AbortError") return err;
  if (err instanceof UploadError) {
    const action = ACTION[err.code] ?? (err.retryable ? "reupload" : "none");
    return new PhotoError(err.code, withNextStep(err.code, err.message || FALLBACK[err.code] || "The upload didn't go through."), action);
  }
  if (err instanceof ApiError) {
    const code = err.body?.code ?? `HTTP_${err.status}`;
    const fieldError = err.body?.fieldErrors ? Object.values(err.body.fieldErrors)[0] : undefined;
    const message = fieldError ?? err.body?.message ?? FALLBACK[code] ?? "That didn't go through. Try again.";
    return new PhotoError(code, withNextStep(code, message), ACTION[code] ?? (err.status >= 500 ? "reload" : "none"));
  }
  return err;
}

async function call<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    throw toPhotoError(err);
  }
}

// The friendly check before a ticket is requested: type, size, and room left.
export function checkPhoto(file: Pick<File, "type" | "size">, photosNow: number): PhotoError | null {
  if (photosNow >= PHOTO_LIMIT) return new PhotoError("ESTATE_PHOTO_LIMIT_REACHED", FALLBACK.ESTATE_PHOTO_LIMIT_REACHED, "none");
  const problem = checkUploadable(file, PHOTO_MAX_BYTES, PHOTO_TYPES);
  return problem ? (toPhotoError(problem) as PhotoError) : null;
}

export function fetchEstatePhotos(estateId: string, scope: PortalScope): Promise<EstatePhoto[]> {
  if (!isMock("portalEstates")) return call(() => apiClient.get<EstatePhoto[]>(base(estateId)));
  return call(async () => {
    await mockReadable(estateId, scope);
    return mockList(estateId);
  });
}

// Request → PUT straight to storage → confirm. Returns the photo as stored,
// whose url and size are NOT the upload's.
export function uploadEstatePhoto(
  estateId: string,
  file: File,
  scope: PortalScope,
  options: Pick<UploadOptions<EstatePhoto>, "onProgress" | "signal"> & { caption?: string } = {},
): Promise<EstatePhoto> {
  const { caption, ...rest } = options;
  const body = caption?.trim() ? { caption: caption.trim() } : undefined;
  if (!isMock("portalEstates")) {
    return call(() => uploadFile(file, {
      ...rest,
      maxBytes: PHOTO_MAX_BYTES,
      types: PHOTO_TYPES,
      requestUpload: (req) => apiClient.post<UploadTicket>(`${base(estateId)}/uploads`, req),
      confirmUpload: (fileId) => apiClient.post<EstatePhoto>(`${base(estateId)}/${fileId}/confirm`, body),
    }));
  }
  return call(async () => {
    await mockWritable(estateId, scope);
    const photos = mockPhotos(estateId);
    const problem = checkPhoto(file, photos.length);
    if (problem) throw problem;
    rest.onProgress?.(1);
    // Mock mode has no storage, so the browser's own copy stands in for the
    // stored file. Live mode never does this.
    const photo: EstatePhoto = {
      id: mockId(), url: URL.createObjectURL(file), caption: body?.caption ?? null, position: photos.length,
      cover: photos.length === 0, fileType: file.type.replace("image/", ""), sizeBytes: file.size,
      uploadedBy: "mock-user", uploadedAt: new Date().toISOString(),
    };
    photos.push(photo);
    return { ...photo };
  });
}

// "" clears the caption.
export function updatePhotoCaption(estateId: string, photoId: string, caption: string, scope: PortalScope): Promise<EstatePhoto> {
  const trimmed = caption.trim();
  if (trimmed.length > CAPTION_MAX) {
    return Promise.reject(new PhotoError("VALIDATION", `A caption can be at most ${CAPTION_MAX} characters.`, "none"));
  }
  if (!isMock("portalEstates")) return call(() => apiClient.patch<EstatePhoto>(`${base(estateId)}/${photoId}`, { caption: trimmed }));
  return call(async () => {
    await mockWritable(estateId, scope);
    const photo = mockFind(estateId, photoId);
    photo.caption = trimmed || null;
    return { ...photo };
  });
}

// Every id exactly once. A stale list gets PHOTO_ORDER_MISMATCH (action "reload").
export function reorderPhotos(estateId: string, photoIds: string[], scope: PortalScope): Promise<EstatePhoto[]> {
  if (!isMock("portalEstates")) return call(() => apiClient.put<EstatePhoto[]>(`${base(estateId)}/order`, { photoIds }));
  return call(async () => {
    await mockWritable(estateId, scope);
    const photos = mockPhotos(estateId);
    const same = photoIds.length === photos.length && new Set(photoIds).size === photoIds.length && photoIds.every((id) => photos.some((p) => p.id === id));
    if (!same) throw new ApiError(400, FALLBACK.PHOTO_ORDER_MISMATCH, { code: "PHOTO_ORDER_MISMATCH", message: FALLBACK.PHOTO_ORDER_MISMATCH });
    const reordered = photoIds.map((id) => photos.find((p) => p.id === id)!);
    photos.splice(0, photos.length, ...reordered);
    return mockList(estateId);
  });
}

export function setCoverPhoto(estateId: string, photoId: string, scope: PortalScope): Promise<EstatePhoto[]> {
  if (!isMock("portalEstates")) return call(() => apiClient.put<EstatePhoto[]>(`${base(estateId)}/cover`, { photoId }));
  return call(async () => {
    await mockWritable(estateId, scope);
    mockFind(estateId, photoId);
    for (const p of mockPhotos(estateId)) p.cover = p.id === photoId;
    return mockList(estateId);
  });
}

// Permanent: the file is removed from storage.
export function deleteEstatePhoto(estateId: string, photoId: string, scope: PortalScope): Promise<void> {
  if (!isMock("portalEstates")) return call(() => apiClient.del<void>(`${base(estateId)}/${photoId}`));
  return call(async () => {
    await mockWritable(estateId, scope);
    const photos = mockPhotos(estateId);
    const index = photos.findIndex((p) => p.id === photoId);
    if (index < 0) mockFind(estateId, photoId);
    const [removed] = photos.splice(index, 1);
    // The cover passes to the next in order — which, after the removal, is
    // whatever now sits at the same index (or the last one).
    if (removed.cover && photos.length > 0) photos[Math.min(index, photos.length - 1)].cover = true;
  });
}

// ─── Mock mode ───────────────────────────────────────────────────────────────

function mockFind(estateId: string, photoId: string): EstatePhoto {
  const photo = mockPhotos(estateId).find((p) => p.id === photoId);
  if (!photo) throw new ApiError(404, FALLBACK.PHOTO_NOT_FOUND, { code: "PHOTO_NOT_FOUND", message: FALLBACK.PHOTO_NOT_FOUND });
  return photo;
}

async function mockReadable(estateId: string, scope: PortalScope) {
  const estate = await fetchPortalEstateById(estateId, scope);
  if (!estate) throw new ApiError(404, FALLBACK.ESTATE_NOT_FOUND, { code: "ESTATE_NOT_FOUND", message: FALLBACK.ESTATE_NOT_FOUND });
  return estate;
}

async function mockWritable(estateId: string, scope: PortalScope) {
  const estate = await mockReadable(estateId, scope);
  if (isReadOnlyForScope(estate, scope)) {
    throw new ApiError(403, FALLBACK.ESTATE_READ_ONLY_FOR_BRANCH, { code: "ESTATE_READ_ONLY_FOR_BRANCH", message: FALLBACK.ESTATE_READ_ONLY_FOR_BRANCH });
  }
}

function mockId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `photo-${Math.random().toString(16).slice(2, 10)}`;
}
