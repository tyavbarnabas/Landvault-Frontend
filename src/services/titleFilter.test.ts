// The marketplace's title filter matches verified titles only: "C of O" means
// a C of O HomeTrue has verified, never one the developer only declared.

import { describe, expect, it } from "vitest";
import { fetchListings, isTitleVerified, matchesTitleFilter } from "./marketplaceService";
import { fetchUnifiedListings } from "./marketplaceFeedService";

describe("title filter", () => {
  it("matches the type only when HomeTrue has verified it", () => {
    expect(matchesTitleFilter({ titleType: "C of O", titleStatus: "verified" }, "C of O")).toBe(true);
    expect(matchesTitleFilter({ titleType: "C of O", titleStatus: "pending" }, "C of O")).toBe(false);
    expect(matchesTitleFilter({ titleType: "C of O", titleStatus: "rejected" }, "C of O")).toBe(false);
    expect(matchesTitleFilter({ titleType: "Gazette", titleStatus: "verified" }, "C of O")).toBe(false);
  });

  it("returns only verified titles of that type from the estates list", async () => {
    const page = await fetchListings({ titleType: "C of O" }, { limit: 500 });
    expect(page.items.length).toBeGreaterThan(0);
    for (const l of page.items) {
      expect(l.titleType).toBe("C of O");
      expect(isTitleVerified(l)).toBe(true);
    }
  });

  it("keeps a resale plot only when its estate's title is verified, even with resale alone shown", async () => {
    const estates = await fetchListings({}, { limit: 500 });
    const verified = new Set(estates.items.filter((e) => matchesTitleFilter(e, "C of O")).map((e) => e.id));
    const all = await fetchUnifiedListings({ type: "resale" }, { limit: 500 });
    const filtered = await fetchUnifiedListings({ type: "resale", titleType: "C of O" }, { limit: 500 });
    for (const l of filtered.items) {
      expect(l.listingType).toBe("resale");
      if (l.listingType === "resale") expect(verified.has(l.data.estateId)).toBe(true);
    }
    const expected = all.items.filter((l) => l.listingType === "resale" && l.data.titleType === "C of O" && verified.has(l.data.estateId));
    expect(filtered.items.length).toBe(expected.length);
  });

  it("gives a resale plot its estate's title status, so its card matches the filter", async () => {
    const feed = await fetchUnifiedListings({ type: "resale", titleType: "C of O" }, { limit: 500 });
    expect(feed.items.length).toBeGreaterThan(0);
    for (const l of feed.items) if (l.listingType === "resale") expect(l.data.estateTitleStatus).toBe("verified");
  });
});
