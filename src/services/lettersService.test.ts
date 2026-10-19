// Demo-mode letter setup: the rules the screens rely on, mirrored from the
// backend (DS-1..DS-5): a branch inherits until it sets its own, its signer is
// one unit, refusals come back one per field, and an approval stands only
// while everything it was drawn from is unchanged.

import { describe, expect, it } from "vitest";
import {
  approveLetter, clearSignatory, fetchLetterApproval, fetchLetterheads, missingOpeningFields, saveLetterTemplate, saveLetterTerms, setSignatory, unknownFields,
  type LetterVersions,
} from "./lettersService";
import { mockLetterTenants } from "./lettersService";

const ED = { tenantId: "estintin-group", branchId: null };
const BRANCH = { tenantId: "estintin-group", branchId: "heritage" };
const ESTATE = "greenfield-park"; // a Heritage estate

// HomeTrue's review, as the demo queue (part 5) will do it.
function approveNewestTerms(estateId: string) {
  const store = mockLetterTenants().find(([t]) => t === ED.tenantId)![1];
  store.terms.get(estateId)!.at(-1)!.decision = { status: "approved", note: null, at: new Date().toISOString() };
}

describe("letterheads", () => {
  it("a branch prints the company's signer until it names its own, then only its own", async () => {
    await setSignatory("company", "Adaeze Okafor", "Chief Executive Officer", ED);
    let heritage = (await fetchLetterheads(ED)).branches.find((b) => b.branchId === "heritage")!;
    expect(heritage.printed).toMatchObject({ signatoryName: "Adaeze Okafor", signatorySource: "company" });

    heritage = await setSignatory("heritage", "Tunde Bakare", "Branch Manager", ED);
    // The company has no signature yet, but even once it does, a branch's own
    // signer never gets it: they need their own.
    expect(heritage.printed).toMatchObject({ signatoryName: "Tunde Bakare", signatorySource: "branch", signature: null });
    expect(heritage.missing).toEqual(["signature"]);

    heritage = await clearSignatory("heritage", ED);
    expect(heritage.printed.signatorySource).toBe("company");
  });

  it("can't be changed from inside one branch", async () => {
    await expect(setSignatory("heritage", "X", "Y", BRANCH)).rejects.toMatchObject({ status: 403, body: { code: "DOCUMENTS_REQUIRE_COMPANY_WIDE_SCOPE" } });
  });
});

describe("wording", () => {
  it("knows HomeTrue's fill-in fields, and the two the opening needs", () => {
    expect(unknownFields("Dear {buyerName}, {amount} for {plot} in {estate}")).toEqual(["amount"]);
    expect(missingOpeningFields("We allocate {plot}.")).toEqual(["estate"]);
  });

  it("refuses with one error per field, keyed the way the server keys them", async () => {
    await expect(saveLetterTemplate("company", {
      opening: "We allocate {plot} at {estate}.", signOff: "Congratulations.", closing: "Pay ₦500,000 at the office.",
      standardClauses: ["Fine.", "Account number 0123456789."],
    }, ED)).rejects.toMatchObject({ status: 400, body: { code: "TEMPLATE_REFUSED", fieldErrors: { closing: expect.any(String), "standardClauses[1]": expect.any(String) } } });
  });

  it("lets an 11-digit phone number through, but not a 10-digit account", async () => {
    await expect(saveLetterTerms(ESTATE, ["Call the site office on 08012345678."], ED)).resolves.toMatchObject({ version: 1 });
    await expect(saveLetterTerms(ESTATE, ["Fine.", "Pay into 0123 456 789."], ED)).rejects.toMatchObject({ body: { code: "CLAUSE_REFUSED", fieldErrors: { "clauses[1]": expect.any(String) } } });
  });
});

describe("approving a letter", () => {
  it("needs approved conditions and a complete letterhead, then stands only while nothing changes", async () => {
    await saveLetterTerms(ESTATE, ["That the land is for residential use only."], ED);
    let a = await fetchLetterApproval(ESTATE, ED);
    expect(a.blockers).toContain("no_approved_terms");
    expect(a.newerTermsAwaitingReview).toBe(true);

    approveNewestTerms(ESTATE);
    await setSignatory("heritage", "Tunde Bakare", "Branch Manager", ED);
    a = await fetchLetterApproval(ESTATE, ED);
    expect(a.blockers).toEqual(["signature"]);
    await clearSignatory("heritage", ED);

    // The company signer has no signature in the demo store: still blocked.
    a = await fetchLetterApproval(ESTATE, ED);
    await expect(approveLetter(ESTATE, a.currentVersions, ED)).rejects.toMatchObject({ status: 409, body: { code: "LETTER_NOT_READY" } });
  });

  it("refuses versions that moved since the preview", async () => {
    const a = await fetchLetterApproval(ESTATE, ED);
    const stale: LetterVersions = { ...a.currentVersions, companyLetterhead: (a.currentVersions.companyLetterhead ?? 0) - 1 };
    await expect(approveLetter(ESTATE, stale, ED)).rejects.toMatchObject({ status: 409, body: { code: "LETTER_SETUP_CHANGED" } });
  });
});
