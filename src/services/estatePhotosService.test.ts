import { describe, it, expect } from "vitest";
import { ApiError } from "../lib/apiClient";
import { UploadError } from "../lib/uploadFile";
import { createPortalEstate } from "./portalEstatesService";
import {
  PHOTO_LIMIT, PhotoError, checkPhoto, deleteEstatePhoto, fetchEstatePhotos, reorderPhotos, setCoverPhoto, toPhotoError,
  updatePhotoCaption, uploadEstatePhoto,
} from "./estatePhotosService";

const DIRECTOR = { tenantId: "estintin-group", branchId: null };
const jpeg = (name: string) => new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: "image/jpeg" });

async function estateWithPhotos(count: number) {
  const estate = await createPortalEstate({
    name: `Photo Estate ${Math.random().toString(16).slice(2, 8)}`, description: "", area: "Guzape", city: "Abuja",
    state: "Federal Capital Territory (Abuja)", address: "", cornerPremiumPct: 0, amenities: [], branchId: "heritage",
  }, DIRECTOR);
  for (let i = 0; i < count; i++) await uploadEstatePhoto(estate.id, jpeg(`p${i}.jpg`), DIRECTOR);
  return { estateId: estate.id, photos: await fetchEstatePhotos(estate.id, DIRECTOR) };
}

describe("estate photos: the cover rule", () => {
  it("makes the first photo the cover, and keeps exactly one cover", async () => {
    const { photos } = await estateWithPhotos(3);
    expect(photos.map((p) => p.cover)).toEqual([true, false, false]);
  });

  it("never moves the cover on reorder", async () => {
    const { estateId, photos } = await estateWithPhotos(3);
    const reordered = await reorderPhotos(estateId, [photos[2].id, photos[1].id, photos[0].id], DIRECTOR);
    expect(reordered.find((p) => p.cover)?.id).toBe(photos[0].id);
    expect(reordered.map((p) => p.position)).toEqual([0, 1, 2]);
  });

  it("passes the cover to the next in order when the cover is deleted", async () => {
    const { estateId, photos } = await estateWithPhotos(3);
    const changed = await setCoverPhoto(estateId, photos[1].id, DIRECTOR);
    expect(changed.filter((p) => p.cover).map((p) => p.id)).toEqual([photos[1].id]);
    await deleteEstatePhoto(estateId, photos[1].id, DIRECTOR);
    const after = await fetchEstatePhotos(estateId, DIRECTOR);
    expect(after.filter((p) => p.cover).map((p) => p.id)).toEqual([photos[2].id]);
  });

  it("refuses a partial order as a stale list to reload", async () => {
    const { estateId, photos } = await estateWithPhotos(2);
    const error = await reorderPhotos(estateId, [photos[0].id], DIRECTOR).catch((e) => e);
    expect(error).toBeInstanceOf(PhotoError);
    expect(error).toMatchObject({ code: "PHOTO_ORDER_MISMATCH", action: "reload" });
  });

  it("clears a caption with an empty string", async () => {
    const { estateId, photos } = await estateWithPhotos(1);
    expect((await updatePhotoCaption(estateId, photos[0].id, "  The main gate  ", DIRECTOR)).caption).toBe("The main gate");
    expect((await updatePhotoCaption(estateId, photos[0].id, "", DIRECTOR)).caption).toBeNull();
  });
});

describe("estate photos: checks before a ticket is requested", () => {
  it("takes JPG, PNG and WebP up to 5,242,880 bytes, and no 21st photo", () => {
    expect(checkPhoto({ type: "image/jpeg", size: 5_242_880 }, 0)).toBeNull();
    expect(checkPhoto({ type: "image/webp", size: 10 }, PHOTO_LIMIT - 1)).toBeNull();
    expect(checkPhoto({ type: "image/jpeg", size: 5_242_881 }, 0)?.code).toBe("FILE_TOO_LARGE");
    expect(checkPhoto({ type: "application/pdf", size: 10 }, 0)?.code).toBe("FILE_TYPE_NOT_ALLOWED");
    expect(checkPhoto({ type: "image/svg+xml", size: 10 }, 0)?.code).toBe("FILE_TYPE_NOT_ALLOWED");
    expect(checkPhoto({ type: "image/jpeg", size: 10 }, PHOTO_LIMIT)?.code).toBe("ESTATE_PHOTO_LIMIT_REACHED");
  });
});

describe("estate photos: what a failure tells the person", () => {
  it("re-upload after a mismatch or an expired link; a different file when unreadable", () => {
    const action = (code: string) => (toPhotoError(new UploadError(code, "msg")) as PhotoError).action;
    expect(action("UPLOAD_SIZE_MISMATCH")).toBe("reupload");
    expect(action("UPLOAD_CONTENT_MISMATCH")).toBe("reupload");
    expect(action("UPLOAD_NOT_RECEIVED")).toBe("reupload");
    expect(action("UPLOAD_EXPIRED")).toBe("reupload");
    expect(action("IMAGE_UNREADABLE")).toBe("choose");
    expect(action("FILE_NOT_FOUND")).toBe("none");
  });

  it("keeps the server's message, and adds what to do next", () => {
    const error = toPhotoError(new UploadError("UPLOAD_EXPIRED", "The upload link expired.")) as PhotoError;
    expect(error.message).toBe("The upload link expired. Start the upload again.");
    const forbidden = toPhotoError(new ApiError(403, "x", { code: "ESTATE_READ_ONLY_FOR_BRANCH" })) as PhotoError;
    expect(forbidden.message).toContain("Branch staff can view");
  });
});
