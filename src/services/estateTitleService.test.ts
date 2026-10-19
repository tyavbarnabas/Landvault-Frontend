import { describe, it, expect } from "vitest";
import { ESTATES } from "../data/mockData";
import { mockSetTitle } from "../data/mockEstateTitles";
import { createPortalEstate } from "./portalEstatesService";
import { fetchListingById, titleLabel } from "./marketplaceService";
import {
  TitleError, checkSubmission, fetchEstateTitle, fetchTitleReviews, rejectTitle, submitEstateTitle, uploadTitleDocument, verifyTitle,
} from "./estateTitleService";

const DIRECTOR = { tenantId: "estintin-group", branchId: null };
const BRANCH = { tenantId: "estintin-group", branchId: "heritage" };
const pdf = (name: string) => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], name, { type: "application/pdf" });

async function newEstate(companyLevel = false) {
  return createPortalEstate({
    name: `Title Estate ${Math.random().toString(16).slice(2, 8)}`, description: "", area: "Guzape", city: "Abuja",
    state: "Federal Capital Territory (Abuja)", address: "", cornerPremiumPct: 0, amenities: [], branchId: companyLevel ? undefined : "heritage",
  }, DIRECTOR);
}

async function declare(estateId: string, titleNumber = "FCT/ABU/2019/1234") {
  const titleDoc = await uploadTitleDocument(estateId, "title_document", pdf("c-of-o.pdf"), DIRECTOR);
  const survey = await uploadTitleDocument(estateId, "survey_plan", pdf("survey.pdf"), DIRECTOR);
  return submitEstateTitle(estateId, {
    titleType: "C of O", titleNumber, issuedDate: "2019-05-14",
    titleDocumentFileId: titleDoc.fileId, surveyPlanFileId: survey.fileId, deedFileId: null,
  }, DIRECTOR);
}

describe("estate titles: developers declare", () => {
  it("starts a new estate with no title, never a plausible one", async () => {
    const estate = await newEstate();
    expect(await fetchEstateTitle(estate.id, DIRECTOR)).toBeNull();
  });

  it("sends a declared title for review with its documents", async () => {
    const estate = await newEstate();
    const title = await declare(estate.id);
    expect(title.status).toBe("pending");
    expect(title.documents.map((d) => d.kind).sort()).toEqual(["survey_plan", "title_document"]);
    expect((await fetchTitleReviews("pending")).some((t) => t.id === title.id)).toBe(true);
  });

  it("needs the title document and survey plan before anything is sent", () => {
    const errors = checkSubmission({ titleNumber: " ", issuedDate: "2999-01-01", documents: {} });
    expect(Object.keys(errors).sort()).toEqual(["issuedDate", "survey_plan", "titleNumber", "title_document"]);
  });

  it("refuses a document uploaded for a different estate", async () => {
    const [a, b] = [await newEstate(), await newEstate()];
    const other = await uploadTitleDocument(b.id, "title_document", pdf("x.pdf"), DIRECTOR);
    const survey = await uploadTitleDocument(a.id, "survey_plan", pdf("s.pdf"), DIRECTOR);
    await expect(submitEstateTitle(a.id, {
      titleType: "Gazette", titleNumber: "G-1", issuedDate: null, titleDocumentFileId: other.fileId, surveyPlanFileId: survey.fileId, deedFileId: null,
    }, DIRECTOR)).rejects.toMatchObject({ code: "TITLE_DOCUMENT_NOT_FOUND" });
  });

  it("refuses a file that isn't PDF, JPG or PNG", async () => {
    const estate = await newEstate();
    await expect(uploadTitleDocument(estate.id, "deed", new File(["x"], "deed.docx", { type: "application/msword" }), DIRECTOR))
      .rejects.toBeInstanceOf(TitleError);
  });

  it("keeps branch staff out of a company-level estate's title", async () => {
    const estate = await newEstate(true);
    await expect(uploadTitleDocument(estate.id, "title_document", pdf("t.pdf"), BRANCH)).rejects.toMatchObject({ code: "ESTATE_READ_ONLY_FOR_BRANCH" });
  });
});

describe("estate titles: HomeTrue verifies", () => {
  it("verifies a pending title with how it was checked", async () => {
    const estate = await newEstate();
    const title = await declare(estate.id);
    const verified = await verifyTitle(title, "registry_search", "AGIS search ref 4471");
    expect(verified).toMatchObject({ status: "verified", verificationSource: "registry_search", decisionNote: "AGIS search ref 4471" });
    expect(verified.decidedAt).not.toBeNull();
  });

  it("decides a title only once", async () => {
    const estate = await newEstate();
    const title = await declare(estate.id);
    await verifyTitle(title, "manual_review", "");
    await expect(rejectTitle(title, "late")).rejects.toMatchObject({ code: "TITLE_NOT_PENDING" });
  });

  it("needs a note to reject, because the developer sees it", async () => {
    const estate = await newEstate();
    const title = await declare(estate.id);
    await expect(rejectTitle(title, "  ")).rejects.toMatchObject({ code: "NOTE_REQUIRED", field: "note" });
    expect(await rejectTitle(title, "The survey plan is for a different plot.")).toMatchObject({ status: "rejected" });
  });

  it("refuses a decision on a title the developer has changed since", async () => {
    const estate = await newEstate();
    const seen = await declare(estate.id);
    await new Promise((r) => setTimeout(r, 5));
    await declare(estate.id, "FCT/ABU/2019/5555");
    await expect(verifyTitle(seen, "manual_review", "")).rejects.toMatchObject({ code: "TITLE_CHANGED" });
  });

  it("won't verify a title with no documents, only reject it", async () => {
    const estate = await newEstate();
    const old = { ...(await declare(estate.id)), documents: [] };
    mockSetTitle(old);
    await expect(verifyTitle(old, "manual_review", "")).rejects.toMatchObject({ code: "TITLE_DOCUMENTS_MISSING" });
  });

  it("sends a changed verified title back for review", async () => {
    const estate = await newEstate();
    const title = await declare(estate.id);
    await verifyTitle(title, "manual_review", "");
    const changed = await declare(estate.id, "FCT/ABU/2019/9999");
    expect(changed).toMatchObject({ id: title.id, status: "pending", decidedAt: null, verificationSource: null });
  });
});

describe("estate titles on the marketplace", () => {
  it("shows a declared title as declared until HomeTrue verifies it", async () => {
    const seeded = ESTATES.find((e) => e.published && e.tenantId === "estintin-group")!;
    const title = await declare(seeded.id);
    let listing = await fetchListingById(seeded.id);
    expect(listing).toMatchObject({ titleType: "C of O", titleStatus: "pending", titleVerifiedAt: null });
    expect(titleLabel(listing!.titleType, listing!.titleStatus)).toBe("C of O (declared)");

    await verifyTitle(title, "manual_review", "");
    listing = await fetchListingById(seeded.id);
    expect(listing?.titleStatus).toBe("verified");
    expect(titleLabel(listing!.titleType, listing!.titleStatus)).toBe("C of O, verified by HomeTrue");
  });

  it("never drops the qualifier without a verified status", () => {
    expect(titleLabel(null, "verified")).toBe("Title not recorded");
    expect(titleLabel("Gazette")).toBe("Gazette (declared)");
    expect(titleLabel("Gazette", "rejected")).toBe("Gazette (declared, not confirmed)");
    expect(titleLabel("R of O", "verified", "2026-10-12T09:00:00Z", true)).toBe("R of O, verified by HomeTrue on 12 Oct 2026");
  });
});
