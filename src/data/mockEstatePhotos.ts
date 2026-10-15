// Mock mode's estate photos, in one place that the portal (estatePhotosService),
// the readiness check (portalEstatesService) and the marketplace
// (marketplaceService) all read. Its own module because those three already
// import one another; a store inside any of them would close the loop.
//
// Seeded from each demo estate's existing imageUrl, so the marketplace keeps
// a picture. Estates published in the seed data stand in for the ones listed
// before photos were required: exempt, so they report hasPhoto true.

import { ESTATES } from "./mockData";
import type { EstatePhoto } from "../services/estatePhotosService";

const store = new Map<string, EstatePhoto[]>();
const EXEMPT = new Set(ESTATES.filter((e) => e.published).map((e) => e.id));

// The live array, for the mock service to change in place.
export function mockPhotos(estateId: string): EstatePhoto[] {
  let photos = store.get(estateId);
  if (!photos) {
    const seed = ESTATES.find((e) => e.id === estateId)?.imageUrl;
    photos = seed ? [{
      id: `${estateId}-photo-1`, url: seed, caption: null, position: 0, cover: true, fileType: "jpeg", sizeBytes: 0,
      uploadedBy: "seed", uploadedAt: "2026-01-01T00:00:00Z",
    }] : [];
    store.set(estateId, photos);
  }
  return photos;
}

// Copies, positioned as the server numbers them.
export function mockList(estateId: string): EstatePhoto[] {
  return mockPhotos(estateId).map((p, position) => ({ ...p, position }));
}

export function mockHasPhoto(estateId: string): boolean {
  return EXEMPT.has(estateId) || mockPhotos(estateId).length > 0;
}

// What the public listing carries: cover first, then the rest in order.
export function mockListingPhotos(estateId: string): { url: string; caption: string | null }[] {
  const photos = mockPhotos(estateId);
  const cover = photos.find((p) => p.cover);
  return [...(cover ? [cover] : []), ...photos.filter((p) => p !== cover)].map(({ url, caption }) => ({ url, caption }));
}
