// The portal overview's attention list and the estates list's status, from
// the data the portal already has (no overview endpoint exists).

import { describe, expect, it } from "vitest";
import { failedPayouts, overviewItems } from "./portalOverviewService";
import { estatePlace, listStatus, type PortalEstate } from "./portalEstatesService";
import type { Payout } from "./financeService";
import type { StaffMember } from "./staffService";

const payout = (id: string, transactionId: string, status: Payout["status"], createdAt: string, extra: Partial<Payout> = {}): Payout => ({
  id, transactionId, tenantId: "t1", amount: 7_500_000, currency: "NGN", partNumber: 1, partCount: 1, status, reference: `po-${id}`,
  gatewayMessage: null, bankName: "Stanbic IBTC Bank", accountLast4: "0566", createdAt, transferredAt: null, reviewReason: null, ...extra,
} as Payout);

const estate = (name: string, status: PortalEstate["status"], published: boolean, totalPlots = 0) =>
  ({ id: name, name, status, published, totalPlots, area: "", city: "", state: "Lagos" }) as unknown as PortalEstate;

const member = (firstName: string, status: StaffMember["status"]) => ({ userId: firstName, firstName, lastName: "M", email: "", phone: null, status, roles: [], lastLoginAt: null, createdAt: "" }) as StaffMember;

describe("the estates list's status, from the flag and the marketplace", () => {
  it("never says live without the marketplace's word", () => {
    expect(listStatus(false, true)).toBe("not_published");
    expect(listStatus(true, true)).toBe("published");
    expect(listStatus(true, false)).toBe("published_not_live");
    expect(listStatus(true, undefined)).toBe("unknown");
  });

  it("prints only the place parts an estate has", () => {
    expect(estatePlace({ area: "Lugbe", city: "Abuja", state: "Federal Capital Territory (Abuja)" } as never)).toBe("Lugbe, Abuja");
    expect(estatePlace({ area: null, city: null, state: "Federal Capital Territory (Abuja)" } as never)).toBe("Federal Capital Territory (Abuja)");
  });
});

describe("what needs the team", () => {
  it("a failed payout put right by a later one is not a problem", () => {
    const list = [payout("a", "t-1", "failed", "2026-10-08T10:00:00Z"), payout("b", "t-1", "success", "2026-10-09T10:00:00Z"), payout("c", "t-2", "failed", "2026-10-09T10:00:00Z")];
    expect(failedPayouts(list).map((p) => p.id)).toEqual(["c"]);
  });

  it("lists money first, then buyers, listings, team and payouts waiting on HomeTrue", () => {
    const items = overviewItems({
      estates: [estate("Boundary Test Estate", "published_not_live", true), estate("Lugbe", "published", true, 56), estate("Draft", "not_published", false)],
      queue: 2, late: 0,
      payouts: [payout("w", "t-3", "awaiting_otp", "2026-10-11T00:00:00Z", { partNumber: 2, partCount: 2 })],
      staff: [member("Chidi", "pending_verification"), member("Ada", "active"), member("Bala", "pending_verification")],
    });
    expect(items.map((i) => i.kind)).toEqual(["verify", "estate", "staff", "payout_waiting"]);
    expect(items[0].title).toBe("2 payments waiting for verification");
    expect(items[1].detail).toBe("At least one condition for listing isn't met. Open it to see which.");
    expect(items[2]).toMatchObject({ title: "2 staff haven't activated their accounts", detail: "Chidi M and Bala M." });
    expect(items[3].detail).toBe("Part 2 of 2 to Stanbic IBTC Bank ••0566. HomeTrue confirms the transfer; nothing to do on your side.");
  });

  it("says nothing it wasn't allowed to read", () => {
    expect(overviewItems({ estates: null, queue: null, late: null, payouts: null, staff: null })).toEqual([]);
  });
});
