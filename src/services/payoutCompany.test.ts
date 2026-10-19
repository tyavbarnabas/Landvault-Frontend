// Whose payout it is, on the Super Admin Payouts screen: the payout's own
// company name, and the tenant directory only for a backend that doesn't send one.

import { describe, expect, it } from "vitest";
import type { Payout } from "./financeService";

const base: Payout = {
  id: "po", transactionId: "t", tenantId: "estintin-group", amount: 1, currency: "NGN", partNumber: 1, partCount: 1, status: "failed",
  reference: "PO-1", gatewayMessage: null, bankName: null, accountLast4: null, createdAt: "2026-10-06T09:00:00Z", transferredAt: null, reviewReason: null,
};
const directory = new Map([["estintin-group", "Estintin Group (directory)"]]);

describe("payoutCompany", () => {
  it("uses the name the payout carries, without the directory", async () => {
    const { payoutCompany } = await import("../pages/admin/payments/Payouts");
    expect(payoutCompany({ ...base, companyName: "Estintin Group" }, new Map())).toBe("Estintin Group");
  });

  it("stays neutral when the backend has no name on record, rather than guessing", async () => {
    const { payoutCompany } = await import("../pages/admin/payments/Payouts");
    expect(payoutCompany({ ...base, companyName: null }, directory)).toBe("Company not shown");
  });

  it("falls back to the directory only when the backend doesn't send the field", async () => {
    const { payoutCompany } = await import("../pages/admin/payments/Payouts");
    expect(payoutCompany(base, directory)).toBe("Estintin Group (directory)");
    expect(payoutCompany(base, new Map())).toBe("Company not shown");
  });
});
