import { describe, it, expect } from "vitest";
import { fetchAttentionItems, plotAttentionItem } from "./attentionService";
import { makeOwnedPlot } from "../test/factories";

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}

describe("plotAttentionItem", () => {
  it("surfaces an arrears plot as urgent, pointing at that plot", () => {
    const plot = makeOwnedPlot({
      id: "op-x",
      status: "in_arrears",
      arrears: { amountOwed: 1_600_000, overdueSinceDate: isoDaysFromNow(-30), gracePeriodDays: 30, graceEndsDate: isoDaysFromNow(0) },
    });

    const item = plotAttentionItem(plot);

    expect(item).toMatchObject({ type: "arrears", severity: "urgent", targetRoute: "/portfolio/op-x" });
  });

  it("surfaces a payment due within the week as urgent", () => {
    const plot = makeOwnedPlot({ nextDueDate: isoDaysFromNow(3), nextDueAmount: 3_200_000, installmentMonths: 12, installmentsPaid: 6 });

    const item = plotAttentionItem(plot);

    expect(item?.type).toBe("payment_due");
    expect(item?.severity).toBe("urgent");
    // The buyer's own installment number, not a generic label.
    expect(item?.detail).toContain("Installment 7 of 12");
  });

  it("surfaces a payment due later in the window as normal, not urgent", () => {
    const plot = makeOwnedPlot({ nextDueDate: isoDaysFromNow(12), nextDueAmount: 3_200_000 });

    expect(plotAttentionItem(plot)?.severity).toBe("normal");
  });

  it("ignores a payment due beyond the window — a far-off due date is a fact, not an action", () => {
    const plot = makeOwnedPlot({ nextDueDate: isoDaysFromNow(60), nextDueAmount: 3_200_000 });

    expect(plotAttentionItem(plot)).toBeNull();
  });

  it("ignores a plot with nothing due at all", () => {
    expect(plotAttentionItem(makeOwnedPlot({ status: "completed", nextDueDate: undefined }))).toBeNull();
  });
});

describe("fetchAttentionItems", () => {
  it("orders arrears ahead of an upcoming payment", async () => {
    const items = await fetchAttentionItems({ wishlist: [] });

    const types = items.map((i) => i.type);
    expect(types[0]).toBe("arrears");
    expect(types).toContain("payment_due");
    expect(types.indexOf("arrears")).toBeLessThan(types.indexOf("payment_due"));
  });

  it("treats nothing as new on a first visit, when there is no baseline to compare against", async () => {
    const items = await fetchAttentionItems({ wishlist: [] });

    expect(items.some((i) => i.type === "document_issued")).toBe(false);
  });

  it("aggregates documents issued since the last visit into a single row", async () => {
    const items = await fetchAttentionItems({ wishlist: [], documentsSince: "2000-01-01" });

    const documentItems = items.filter((i) => i.type === "document_issued");
    expect(documentItems).toHaveLength(1);
    expect(documentItems[0].targetRoute).toBe("/documents");
    // Informational — it never outranks money.
    expect(documentItems[0].severity).toBe("normal");
    expect(items.indexOf(documentItems[0])).toBeGreaterThan(items.findIndex((i) => i.type === "arrears"));
  });
});
