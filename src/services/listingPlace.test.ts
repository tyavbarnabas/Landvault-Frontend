// An estate's place, as buyers read it: no repeats, no blanks.

import { describe, expect, it } from "vitest";
import { listingPlace } from "./marketplaceService";

describe("listingPlace", () => {
  it("drops a city that repeats the state", () => {
    expect(listingPlace({ area: "Mowe", city: "Ogun", state: "Ogun" })).toBe("Mowe, Ogun");
  });
  it("keeps area, city and state when they differ, and skips blanks", () => {
    expect(listingPlace({ area: "Lekki", city: "Lagos", state: "Lagos" })).toBe("Lekki, Lagos");
    expect(listingPlace({ area: "", city: "Ibadan", state: "Oyo" })).toBe("Ibadan, Oyo");
    expect(listingPlace({ area: "GRA Phase 2", city: "Port Harcourt", state: "Rivers" })).toBe("GRA Phase 2, Port Harcourt, Rivers");
  });
});
