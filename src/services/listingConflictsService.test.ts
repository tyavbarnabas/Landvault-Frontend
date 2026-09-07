import { describe, it, expect } from "vitest";
import { fetchConflicts } from "./listingConflictsService";

describe("fetchConflicts (mock detection over the real fixture estates)", () => {
  it("flags the deliberately-overlapping Peaceland / Lekki Grand Court pair as a high-severity, cross-tenant conflict", async () => {
    const { items } = await fetchConflicts();
    const seeded = items.find((c) => [c.estateAId, c.estateBId].includes("peaceland") && [c.estateAId, c.estateBId].includes("lekki-grand-court"));

    expect(seeded).toBeDefined();
    expect(seeded!.crossTenant).toBe(true);
    expect(seeded!.severity).toBe("high");
    expect(seeded!.overlapAreaSqm).toBeGreaterThan(0);
    expect(seeded!.overlapPctOfA).toBeGreaterThan(0);
    expect(seeded!.overlapPctOfB).toBeGreaterThan(0);
    expect(seeded!.status).toBe("open");
  });

  it("never flags two estates that are nowhere near each other", async () => {
    const { items } = await fetchConflicts();
    const falsePositive = items.find((c) => [c.estateAId, c.estateBId].includes("emerald-hills") && [c.estateAId, c.estateBId].includes("crown-court"));
    expect(falsePositive).toBeUndefined();
  });
});
