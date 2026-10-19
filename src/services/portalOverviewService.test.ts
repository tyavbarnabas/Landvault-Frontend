// The portal overview's attention list and the estates list's status, from
// the data the portal already has (no overview endpoint exists).

import { describe, expect, it } from "vitest";
import { failedPayouts, overviewItems } from "./portalOverviewService";
import { estatePlace, listStatus, type PortalEstate } from "./portalEstatesService";
import type { Payout } from "./financeService";

const payout = (id: string, transactionId: string, status: Payout["status"], createdAt: string, extra: Partial<Payout> = {}): Payout => ({
  id, transactionId, tenantId: "t1", amount: 7_500_000, currency: "NGN", partNumber: 1, partCount: 1, status, reference: `po-${id}`,
  gatewayMessage: null, bankName: "Stanbic IBTC Bank", accountLast4: "0566", createdAt, transferredAt: null, reviewReason: null, ...extra,
} as Payout);

const estate = (name: string, status: PortalEstate["status"], published: boolean, totalPlots = 0) =>
  ({ id: name, name, status, published, totalPlots, area: "", city: "", state: "Lagos" }) as unknown as PortalEstate;


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

  it("lists money first, then buyers, listings and payouts waiting on HomeTrue — never staff with an unconfirmed contact", () => {
    const items = overviewItems({
      estates: [estate("Boundary Test Estate", "published_not_live", true), estate("Lugbe", "published", true, 56), estate("Draft", "not_published", false)],
      queue: 2, late: 0,
      payouts: [payout("w", "t-3", "awaiting_otp", "2026-10-11T00:00:00Z", { partNumber: 2, partCount: 2 })],
    });
    expect(items.map((i) => i.kind)).toEqual(["verify", "estate", "payout_waiting"]);
    expect(items[0].title).toBe("2 payments waiting for verification");
    expect(items[1].detail).toBe("At least one condition for listing isn't met. Open it to see which.");
    expect(items[2].detail).toBe("Part 2 of 2 to Stanbic IBTC Bank ••0566. HomeTrue confirms the transfer; nothing to do on your side.");
  });

  it("says nothing it wasn't allowed to read", () => {
    expect(overviewItems({ estates: null, queue: null, late: null, payouts: null })).toEqual([]);
  });
});

describe("payouts by sale", () => {
  it("groups a sale's parts, counts a retried failure once, newest sale first", async () => {
    const { saleGroups } = await import("./financeService");
    const groups = saleGroups([
      payout("f", "s1", "failed", "2026-10-08T23:22:00Z", { amount: 15_000_000 }),
      payout("a", "s1", "success", "2026-10-09T10:43:00Z", { partNumber: 1, partCount: 2 }),
      payout("b", "s1", "success", "2026-10-09T11:00:00Z", { partNumber: 2, partCount: 2 }),
      payout("c", "s2", "success", "2026-10-11T02:40:00Z", { partNumber: 1, partCount: 2 }),
      payout("d", "s2", "awaiting_otp", "2026-10-11T02:48:00Z", { partNumber: 2, partCount: 2 }),
    ]);
    expect(groups.map((g) => [g.transactionId, g.amount, g.parts.map((p) => p.id), g.retried])).toEqual([
      ["s2", 15_000_000, ["c", "d"], false],
      ["s1", 15_000_000, ["f", "a", "b"], true],
    ]);
  });
});

describe("inventory, live", () => {
  it("names a block plainly", async () => {
    const { blockLabel } = await import("./portalInventoryService");
    expect(blockLabel("B")).toBe("Block B");
    expect(blockLabel("Block A")).toBe("Block A");
  });
});
