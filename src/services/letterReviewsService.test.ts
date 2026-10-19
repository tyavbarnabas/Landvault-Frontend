// HomeTrue's letter reviews in demo mode, with the backend's rules: only the
// newest version can be decided, once; a rejection carries a note; letters
// keep the last approved version meanwhile.

import { describe, expect, it } from "vitest";
import { saveLetterTemplate, saveLetterTerms, fetchLetterTerms } from "./lettersService";
import { approveTemplate, approveTerms, fetchTemplateReviews, fetchTermsReviews, isStaleReview, rejectTerms } from "./letterReviewsService";

const ED = { tenantId: "estintin-group", branchId: null };
const ESTATE = "double-king-estate";

describe("reviewing an estate's conditions", () => {
  it("queues each saved version, and letters use only what's approved", async () => {
    await saveLetterTerms(ESTATE, ["That the land is for residential use only."], ED);
    const [v1] = (await fetchTermsReviews("pending")).filter((r) => r.estateId === ESTATE);
    expect(v1).toMatchObject({ version: 1, approvedVersion: null, approvedClauses: null });

    await approveTerms(v1.termsId, "");
    expect((await fetchLetterTerms(ESTATE, ED)).approvedVersion).toBe(1);

    await saveLetterTerms(ESTATE, ["That the land is for residential use only.", "That no fence is higher than 2 metres."], ED);
    const [v2] = (await fetchTermsReviews("pending")).filter((r) => r.estateId === ESTATE);
    // Shown beside what letters use now, so the reviewer reads the change.
    expect(v2).toMatchObject({ version: 2, approvedVersion: 1, approvedClauses: ["That the land is for residential use only."] });

    const err = await rejectTerms(v2.termsId, "  ").catch((e) => e);
    expect(err).toMatchObject({ status: 400, body: { fieldErrors: { note: expect.any(String) } } });

    await rejectTerms(v2.termsId, "Clause 2: say who approves fences.");
    const terms = await fetchLetterTerms(ESTATE, ED);
    expect(terms).toMatchObject({ reviewStatus: "rejected", reviewNote: "Clause 2: say who approves fences.", approvedVersion: 1 });
  });

  it("refuses an older version, or one already decided — reload, don't retry", async () => {
    await saveLetterTerms(ESTATE, ["Version three."], ED);
    const [v3] = (await fetchTermsReviews("pending")).filter((r) => r.estateId === ESTATE);
    await saveLetterTerms(ESTATE, ["Version four."], ED);
    const superseded = await approveTerms(v3.termsId, "").catch((e) => e);
    expect(superseded.body.code).toBe("LETTER_TERMS_SUPERSEDED");
    expect(isStaleReview(superseded)).toBe(true);

    const [v4] = (await fetchTermsReviews("pending")).filter((r) => r.estateId === ESTATE);
    await approveTerms(v4.termsId, "");
    const twice = await approveTerms(v4.termsId, "").catch((e) => e);
    expect(twice.body.code).toBe("LETTER_TERMS_ALREADY_DECIDED");
  });
});

describe("reviewing letter wording", () => {
  it("compares a branch's new wording with what it uses now", async () => {
    await saveLetterTemplate("double-king", { opening: "Double King allocates {plot} at {estate}.", signOff: "Welcome." }, ED);
    const [w] = (await fetchTemplateReviews("pending")).filter((r) => r.branchId === "double-king");
    expect(w).toMatchObject({ source: "branch", version: 1, approved: null });
    const decided = await approveTemplate(w.templateId, "Fine.");
    expect(decided).toMatchObject({ status: "approved", note: "Fine." });
  });
});
