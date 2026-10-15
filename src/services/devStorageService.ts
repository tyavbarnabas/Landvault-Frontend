// DEV ONLY: the backend's storage test routes (dev profile, Super Admin), for
// trying src/lib/uploadFile.ts end to end before any real feature uses it.
// Estate photos will bring the first real upload routes; this file stays a
// test harness and is never called from a real screen.
//
//   POST   /api/dev/storage/uploads                     step 1
//   POST   /api/dev/storage/uploads/{fileId}/confirm    step 3
//   GET    /api/dev/storage/files/{fileId}/download-link
//   DELETE /api/dev/storage/files/{fileId}

import { apiClient } from "../lib/apiClient";
import { uploadFile, type StoredFile, type UploadOptions, type UploadTicket } from "../lib/uploadFile";

export type DevVisibility = "PUBLIC" | "PRIVATE";

// The dev routes take any accepted type up to the platform limit; a real
// feature states its own. 10 MB keeps the test honest.
export const DEV_MAX_BYTES = 10 * 1024 * 1024;

export function devUpload(file: File, visibility: DevVisibility, options: Pick<UploadOptions<StoredFile>, "onProgress" | "signal"> = {}): Promise<StoredFile> {
  return uploadFile(file, {
    ...options,
    maxBytes: DEV_MAX_BYTES,
    requestUpload: (body) => apiClient.post<UploadTicket>("/api/dev/storage/uploads", { ...body, visibility }),
    confirmUpload: (fileId) => apiClient.post<StoredFile>(`/api/dev/storage/uploads/${fileId}/confirm`),
  });
}

// Valid 5 minutes. Fetch it when it's needed; never store or cache it.
export function devDownloadLink(fileId: string): Promise<{ url: string; expiresAt: string }> {
  return apiClient.get(`/api/dev/storage/files/${fileId}/download-link`);
}

export function devDeleteFile(fileId: string): Promise<void> {
  return apiClient.del<void>(`/api/dev/storage/files/${fileId}`);
}
