// Where a started refund stands — what the Refunds screen's tabs and the
// dashboard's queue are built on.

import { describe, expect, it } from "vitest";
import { refundStage, type AdminRefund } from "./adminPayoutsService";

const base: AdminRefund = {
  id: "rf", paymentId: "p", paymentReference: "PAY", transactionId: "t", buyerName: "A", buyerEmail: null, amount: 1, currency: "NGN",
  status: "needs-attention", gatewayMessage: null, reason: null, createdAt: "2026-10-01T00:00:00Z", expectedAt: null, refundedAt: null,
  account: null, accountNameMatchesBuyer: null,
};
const account = { bankName: "Zenith Bank", accountNumber: "2012345678", accountName: "A", submittedAt: "2026-10-02T00:00:00Z", sentAt: null };

describe("refundStage", () => {
  it("waits on the buyer until they give an account, then on HomeTrue to send it", () => {
    expect(refundStage(base)).toBe("waiting_on_buyer");
    expect(refundStage({ ...base, account })).toBe("ready_to_send");
    expect(refundStage({ ...base, account: { ...account, sentAt: "2026-10-03T00:00:00Z" } })).toBe("in_progress");
  });

  it("puts Paystack's own statuses in progress, refunded or failed", () => {
    expect(refundStage({ ...base, status: "processing" })).toBe("in_progress");
    expect(refundStage({ ...base, status: "sending" })).toBe("in_progress");
    expect(refundStage({ ...base, status: "processed" })).toBe("refunded");
    expect(refundStage({ ...base, status: "failed" })).toBe("failed");
  });
});
