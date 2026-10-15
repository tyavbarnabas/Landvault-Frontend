import { describe, it, expect, afterEach, vi } from "vitest";
import { ApiError } from "./apiClient";
import { UploadError, acceptAttribute, checkUploadable, isPublicFile, isReadyFile, uploadFile, type StoredFile, type UploadTicket } from "./uploadFile";

const MB = 1024 * 1024;
const jpeg = (bytes = 1000, name = "plot.jpg") => new File([new Uint8Array(bytes)], name, { type: "image/jpeg" });

const ticket = (n: number): UploadTicket => ({
  fileId: `f${n}`, uploadUrl: `http://storage.test/bucket/f${n}?X-Amz-Signature=s${n}`, method: "PUT",
  headers: { "content-type": "image/jpeg" }, expiresAt: "2026-10-14T12:10:00Z",
});

const stored: StoredFile = {
  id: "f1", visibility: "private", purpose: "dev-test", fileType: "jpeg", fileName: "plot.jpg", sizeBytes: 1000,
  status: "ready", publicUrl: null, uploadedBy: "u1", createdAt: "2026-10-14T12:00:00Z", confirmedAt: "2026-10-14T12:00:05Z",
};

function harness(...puts: (Response | Error)[]) {
  let n = 0;
  const requestUpload = vi.fn(async () => ticket(++n));
  const confirmUpload = vi.fn(async (fileId: string) => ({ ...stored, id: fileId }));
  const fetchMock = vi.fn(async () => {
    const next = puts.shift();
    if (next instanceof Error) throw next;
    return next ?? new Response(null, { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { requestUpload, confirmUpload, fetchMock };
}

afterEach(() => vi.unstubAllGlobals());

describe("before anything is sent", () => {
  it("accepts only JPG, PNG, WebP and PDF — never SVG or HTML", () => {
    expect(acceptAttribute()).toBe("image/jpeg,image/png,image/webp,application/pdf");
    expect(checkUploadable({ type: "image/svg+xml", size: 10 }, MB)?.code).toBe("FILE_TYPE_NOT_ALLOWED");
    expect(checkUploadable({ type: "text/html", size: 10 }, MB)?.code).toBe("FILE_TYPE_NOT_ALLOWED");
    expect(checkUploadable({ type: "application/pdf", size: 10 }, MB, ["image/jpeg", "image/png"])?.message).toBe("Choose a JPG or PNG file.");
    expect(checkUploadable({ type: "image/png", size: 10 }, MB)).toBeNull();
  });

  it("states the feature's size limit", () => {
    expect(checkUploadable({ type: "image/jpeg", size: 12 * MB }, 5 * MB)?.message).toBe("That file is 12 MB. The most allowed here is 5 MB.");
    expect(checkUploadable({ type: "image/jpeg", size: 0 }, 5 * MB)?.code).toBe("FILE_EMPTY");
  });

  it("refuses without calling the feature's route", async () => {
    const h = harness();
    await expect(uploadFile(jpeg(2 * MB), { ...h, maxBytes: MB })).rejects.toMatchObject({ code: "FILE_TOO_LARGE" });
    expect(h.requestUpload).not.toHaveBeenCalled();
  });
});

describe("the three steps", () => {
  it("requests with the file's own name, type and size; PUTs the File as-is with exactly the ticket's headers; confirms", async () => {
    const h = harness();
    const file = jpeg(1234);
    const result = await uploadFile(file, { ...h, maxBytes: MB });

    expect(h.requestUpload).toHaveBeenCalledWith({ fileName: "plot.jpg", contentType: "image/jpeg", sizeBytes: 1234 });
    const [url, init] = h.fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ticket(1).uploadUrl);
    expect(init).toMatchObject({ method: "PUT", headers: { "content-type": "image/jpeg" }, body: file });
    // Never our API's credentials on a storage request.
    expect(JSON.stringify(init.headers)).not.toMatch(/Authorization/i);
    expect(h.confirmUpload).toHaveBeenCalledWith("f1");
    expect(result.id).toBe("f1");
  });

  it("a refused link (403 SignatureDoesNotMatch) starts again from step 1, once", async () => {
    const refused = () => new Response("<Error><Code>SignatureDoesNotMatch</Code></Error>", { status: 403 });
    const h = harness(refused());
    expect((await uploadFile(jpeg(), { ...h, maxBytes: MB })).id).toBe("f2");
    expect(h.requestUpload).toHaveBeenCalledTimes(2);

    const twice = harness(refused(), refused());
    await expect(uploadFile(jpeg(), { ...twice, maxBytes: MB })).rejects.toMatchObject({ code: "UPLOAD_LINK_REFUSED" });
    expect(twice.confirmUpload).not.toHaveBeenCalled();
  });

  it("no answer at all from storage (CORS, or offline) is its own error", async () => {
    const h = harness(new TypeError("Failed to fetch"));
    const err = await uploadFile(jpeg(), { ...h, maxBytes: MB }).catch((e) => e);
    expect(err).toBeInstanceOf(UploadError);
    expect(err).toMatchObject({ code: "UPLOAD_BLOCKED", retryable: true });
    expect(err.message).toMatch(/^Upload blocked: this site isn't allowed to upload to storage/);
  });

  it("shows the backend's own message when confirming finds the wrong kind of file", async () => {
    const h = harness();
    h.confirmUpload.mockRejectedValueOnce(new ApiError(400, "", { code: "UPLOAD_CONTENT_MISMATCH", message: "That file isn't really a JPG image. Upload it again." }));
    await expect(uploadFile(jpeg(), { ...h, maxBytes: MB }))
      .rejects.toMatchObject({ code: "UPLOAD_CONTENT_MISMATCH", message: "That file isn't really a JPG image. Upload it again.", retryable: false });
  });

  it("storage being down is retryable", async () => {
    const h = harness();
    h.requestUpload.mockRejectedValueOnce(new ApiError(503, "", { code: "STORAGE_UNAVAILABLE", message: "File storage is unavailable. Try again shortly." }));
    await expect(uploadFile(jpeg(), { ...h, maxBytes: MB })).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE", retryable: true });
  });

  it("a cancelled upload stops before confirming", async () => {
    const controller = new AbortController();
    const h = harness();
    h.fetchMock.mockImplementationOnce(async () => { controller.abort(); throw new DOMException("aborted", "AbortError"); });
    await expect(uploadFile(jpeg(), { ...h, maxBytes: MB, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(h.confirmUpload).not.toHaveBeenCalled();
  });
});

describe("reading the stored file", () => {
  it("compares visibility and status ignoring case — older backends sent them uppercase", () => {
    expect(isPublicFile({ visibility: "PUBLIC" })).toBe(true);
    expect(isPublicFile({ visibility: "public" })).toBe(true);
    expect(isPublicFile({ visibility: "PRIVATE" })).toBe(false);
    expect(isReadyFile({ status: "ready" })).toBe(true);
  });
});
