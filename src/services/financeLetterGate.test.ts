// Finance can't verify or allocate a sale whose estate has no approved
// allocation letter (changeset 095, option A): the letter is issued in the
// same step, so the gate is the server's — the demo store mirrors it.

import { describe, expect, it } from "vitest";
import { fetchFinanceQueue, verifyPurchase } from "./financeService";

describe("the letter gates the sale", () => {
  it("each queue row says whether its estate's letter is approved", async () => {
    const queue = await fetchFinanceQueue();
    expect(queue.every((q) => typeof q.letterApproved === "boolean")).toBe(true);
    expect(queue.some((q) => !q.letterApproved)).toBe(true);
  });

  it("refuses to verify while the letter isn't approved, and changes nothing", async () => {
    const blocked = (await fetchFinanceQueue()).find((q) => !q.letterApproved)!;
    await expect(verifyPurchase(blocked.transactionId)).rejects.toMatchObject({ code: "LETTER_NOT_APPROVED" });
    expect((await fetchFinanceQueue()).some((q) => q.transactionId === blocked.transactionId)).toBe(true);
  });

  it("a verified sale names no letter in demo mode rather than inventing a number", async () => {
    const ok = (await fetchFinanceQueue()).find((q) => q.letterApproved && q.amountsMatch)!;
    expect(await verifyPurchase(ok.transactionId)).toEqual({ transactionId: ok.transactionId, status: "verified", allocationLetterId: null, allocationLetterNumber: null });
  });
});
