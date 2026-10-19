// Mock mode's estate titles, read by the portal and admin review
// (estateTitleService) and the marketplace (marketplaceService). Its own
// module for the same reason as mockEstatePhotos: those services import one
// another, and a store inside either would close the loop.
//
// Seeded from the demo estates: one whose title the old data marked verified
// is "verified" (dated its lastVerified); one with only a declared type is
// "pending". Seeds have no documents. Estates created in the portal start with
// no title at all, never a plausible one.

import { ESTATES } from "./mockData";
import type { EstateTitle, TitleDocument } from "../services/estateTitleService";

const titles = new Map<string, EstateTitle>();
let seeded = false;

// Confirmed but not yet submitted, by file id. Mock mode has no storage, so
// the browser's own copy of the file stands in for the stored one.
export const mockTitleDocuments = new Map<string, TitleDocument & { estateId: string; url: string }>();

function seed() {
  if (seeded) return;
  seeded = true;
  for (const estate of ESTATES) {
    if (!estate.titleType) continue;
    const verified = estate.titleVerified && !!estate.lastVerified;
    const at = `${estate.lastVerified || "2026-01-01"}T09:00:00Z`;
    titles.set(estate.id, {
      id: `${estate.id}-title`,
      estateId: estate.id,
      titleType: estate.titleType,
      // Recorded before numbers and documents were asked for.
      titleNumber: "",
      issuedDate: null,
      status: verified ? "verified" : "pending",
      documents: [],
      submittedAt: at,
      submittedBy: "seed",
      decidedAt: verified ? at : null,
      decidedBy: verified ? "seed" : null,
      verificationSource: verified ? "manual_review" : null,
      decisionNote: null,
    });
  }
}

export function mockTitle(estateId: string): EstateTitle | undefined {
  seed();
  return titles.get(estateId);
}

export function mockSetTitle(title: EstateTitle) {
  seed();
  titles.set(title.estateId, title);
}

export function mockAllTitles(): EstateTitle[] {
  seed();
  return [...titles.values()];
}

// What the public listing carries.
export function mockListingTitle(estateId: string): { titleType: EstateTitle["titleType"] | null; titleStatus: EstateTitle["status"] | null; titleVerifiedAt: string | null } {
  const title = mockTitle(estateId);
  return {
    titleType: title?.titleType ?? null,
    titleStatus: title?.status ?? null,
    titleVerifiedAt: title?.status === "verified" ? title.decidedAt : null,
  };
}
