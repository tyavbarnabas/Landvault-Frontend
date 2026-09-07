import { describe, it, expect } from "vitest";
import { polygonOverlap, type GeoPoint } from "./geometry";

const METERS_PER_DEG_LAT = 111_320;
const ORIGIN = { lat: 6.5, lng: 3.5 };

// Builds an axis-aligned square footprint `sizeMeters` on a side, whose
// bottom-left corner sits `offsetXMeters`/`offsetYMeters` from ORIGIN — lets
// the tests reason in plain metres instead of hand-picked degree fractions.
function square(sizeMeters: number, offsetXMeters = 0, offsetYMeters = 0): GeoPoint[] {
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos((ORIGIN.lat * Math.PI) / 180);
  const toPoint = (x: number, y: number): GeoPoint => ({
    lat: ORIGIN.lat + (offsetYMeters + y) / METERS_PER_DEG_LAT,
    lng: ORIGIN.lng + (offsetXMeters + x) / metersPerDegLng,
  });
  return [toPoint(0, 0), toPoint(sizeMeters, 0), toPoint(sizeMeters, sizeMeters), toPoint(0, sizeMeters)];
}

describe("polygonOverlap", () => {
  it("returns null for two footprints nowhere near each other", () => {
    const a = square(100);
    const b = square(100, 1000, 1000); // 1km away — no overlap possible
    expect(polygonOverlap(a, b)).toBeNull();
  });

  it("returns null for footprints that are close but don't actually touch", () => {
    const a = square(100);
    const b = square(100, 150, 0); // 100m square starting 50m past A's far edge
    expect(polygonOverlap(a, b)).toBeNull();
  });

  it("computes the real intersection area and each side's own overlap percentage", () => {
    const a = square(100); // 10,000 sqm, at (0,0)-(100,100)
    const b = square(100, 50, 0); // same size, shifted 50m right -> overlap is a 50m x 100m strip
    const overlap = polygonOverlap(a, b);
    expect(overlap).not.toBeNull();
    expect(overlap!.areaSqm).toBeCloseTo(5000, 0);
    expect(overlap!.pctOfA).toBeCloseTo(50, 0); // half of A's own area
    expect(overlap!.pctOfB).toBeCloseTo(50, 0); // half of B's own area too, since they're equal-sized
  });

  it("reports near-total overlap when one footprint sits almost entirely inside the other", () => {
    const a = square(300); // 90,000 sqm
    const b = square(100, 150, 150); // fully inside A, offset to its center
    const overlap = polygonOverlap(a, b);
    expect(overlap).not.toBeNull();
    expect(overlap!.pctOfB).toBeCloseTo(100, 0); // B is entirely consumed
    expect(overlap!.pctOfA).toBeLessThan(15); // but it's a small fraction of A
  });
});
