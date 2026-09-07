import { describe, it, expect } from "vitest";
import { groupPlotsByCurrency, isActivelyOwned, urgencyRank } from "./Portfolio";
import { makeOwnedPlot } from "../../test/factories";

describe("isActivelyOwned", () => {
  it("excludes transferred and superseded plots — everything else counts as active", () => {
    expect(isActivelyOwned(makeOwnedPlot({ status: "transferred" }))).toBe(false);
    expect(isActivelyOwned(makeOwnedPlot({ status: "superseded" }))).toBe(false);
    for (const status of ["installment_active", "completed", "in_arrears", "allocated", "reserved", "pending_verification", "upgrade_pending"] as const) {
      expect(isActivelyOwned(makeOwnedPlot({ status }))).toBe(true);
    }
  });
});

describe("groupPlotsByCurrency", () => {
  it("never sums across currencies: mixed NGN/USD plots produce two independent groups", () => {
    const plots = [
      makeOwnedPlot({ id: "1", currency: "NGN", totalPrice: 10_000_000, paidAmount: 4_000_000 }),
      makeOwnedPlot({ id: "2", currency: "NGN", totalPrice: 8_000_000, paidAmount: 8_000_000 }),
      makeOwnedPlot({ id: "3", currency: "USD", totalPrice: 20_000, paidAmount: 5_000 }),
    ];

    const byCurrency = groupPlotsByCurrency(plots);

    expect(byCurrency.size).toBe(2);
    expect(byCurrency.get("NGN")).toEqual({ totalValue: 18_000_000, totalPaid: 12_000_000, count: 2 });
    expect(byCurrency.get("USD")).toEqual({ totalValue: 20_000, totalPaid: 5_000, count: 1 });
  });

  it("excludes transferred/superseded plots from every currency's totals", () => {
    const plots = [
      makeOwnedPlot({ id: "1", currency: "NGN", totalPrice: 10_000_000, paidAmount: 10_000_000, status: "completed" }),
      makeOwnedPlot({ id: "2", currency: "NGN", totalPrice: 5_000_000, paidAmount: 5_000_000, status: "superseded" }),
    ];

    const byCurrency = groupPlotsByCurrency(plots);

    expect(byCurrency.get("NGN")).toEqual({ totalValue: 10_000_000, totalPaid: 10_000_000, count: 1 });
  });

  it("returns an empty map for no plots", () => {
    expect(groupPlotsByCurrency([]).size).toBe(0);
  });
});

describe("urgencyRank", () => {
  it("ranks arrears as most urgent (0)", () => {
    expect(urgencyRank(makeOwnedPlot({ status: "in_arrears" }))).toBe(0);
  });

  it("ranks a payment due within 7 days as the next tier (1), even if not yet in arrears", () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 3);
    const plot = makeOwnedPlot({ status: "installment_active", nextDueDate: soon.toISOString().split("T")[0] });
    expect(urgencyRank(plot)).toBe(1);
  });

  it("ranks an ordinary active plan (due date far off, or none) as 2", () => {
    const far = new Date();
    far.setDate(far.getDate() + 60);
    expect(urgencyRank(makeOwnedPlot({ status: "installment_active", nextDueDate: far.toISOString().split("T")[0] }))).toBe(2);
    expect(urgencyRank(makeOwnedPlot({ status: "installment_active", nextDueDate: undefined }))).toBe(2);
  });

  it("ranks a completed plot as least urgent (3)", () => {
    expect(urgencyRank(makeOwnedPlot({ status: "completed", nextDueDate: undefined }))).toBe(3);
  });

  it("sorts a mixed list into arrears -> due-soon -> active -> completed order", () => {
    const soon = new Date();
    soon.setDate(soon.getDate() + 2);
    const soonStr = soon.toISOString().split("T")[0];
    const far = new Date();
    far.setDate(far.getDate() + 90);
    const farStr = far.toISOString().split("T")[0];

    const completed = makeOwnedPlot({ id: "completed", status: "completed" });
    const active = makeOwnedPlot({ id: "active", status: "installment_active", nextDueDate: farStr });
    const dueSoon = makeOwnedPlot({ id: "due-soon", status: "installment_active", nextDueDate: soonStr });
    const arrears = makeOwnedPlot({ id: "arrears", status: "in_arrears" });

    const sorted = [completed, active, dueSoon, arrears].sort((a, b) => urgencyRank(a) - urgencyRank(b));

    expect(sorted.map((p) => p.id)).toEqual(["arrears", "due-soon", "active", "completed"]);
  });
});
