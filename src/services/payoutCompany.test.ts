// Whose payout it is, on the Super Admin Payouts screen: the payout's own
// company name, and a neutral "Company not shown" when none is on record.

import { describe, expect, it } from "vitest";

describe("payoutCompany", () => {
  it("uses the name the payout carries", async () => {
    const { payoutCompany } = await import("../pages/admin/payments/Payouts");
    expect(payoutCompany({ companyName: "Estintin Group" })).toBe("Estintin Group");
  });

  it("stays neutral when the backend has no name on record, rather than guessing", async () => {
    const { payoutCompany } = await import("../pages/admin/payments/Payouts");
    expect(payoutCompany({ companyName: null })).toBe("Company not shown");
  });
});
