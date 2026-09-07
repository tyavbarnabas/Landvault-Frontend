// Pure 2D polygon geometry — no app-specific types, no dependency on any
// service. Reused by listingConflictsService.ts to detect overlapping estate
// footprints (see Super Admin backlog SA-3.4: "because real PostGIS geometry
// is stored, the system can automatically detect when two different sellers
// list overlapping land — precisely the duplicate-allocation scam the
// platform exists to kill... no competitor in the Nigerian market can do
// this, they store addresses as text, not polygons"). This module supplies
// the real intersection math that differentiator depends on. The footprints
// it operates on are this repo's mock stand-in for actual surveyed/cadastral
// polygons (see mockData.ts's Estate.footprint comment) — the ALGORITHM
// itself is genuine geometry, not a fabricated formula standing in for one.

export interface GeoPoint {
  lat: number;
  lng: number;
}

interface XY {
  x: number;
  y: number;
}

const METERS_PER_DEG_LAT = 111_320;

function metersPerDegLng(atLatDeg: number): number {
  return METERS_PER_DEG_LAT * Math.cos((atLatDeg * Math.PI) / 180);
}

// Equirectangular projection onto a local metric plane centered on `origin`
// — accurate to well under a metre of error across a single estate's
// footprint (at most a few hundred metres wide), the same simplification any
// small-parcel cadastral survey makes rather than a full geodesic model.
function toLocalMeters(point: GeoPoint, origin: GeoPoint): XY {
  return {
    x: (point.lng - origin.lng) * metersPerDegLng(origin.lat),
    y: (point.lat - origin.lat) * METERS_PER_DEG_LAT,
  };
}

// Signed shoelace area — positive for a counter-clockwise ring, negative for
// clockwise. `polygonArea` below is just its absolute value.
function signedArea(points: XY[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

function polygonArea(points: XY[]): number {
  return Math.abs(signedArea(points));
}

function ensureCounterClockwise(points: XY[]): XY[] {
  return signedArea(points) >= 0 ? points : [...points].reverse();
}

// Sutherland–Hodgman polygon clipping: clips `subject` against convex
// polygon `clip`, one clip edge at a time. Every footprint in this app is a
// convex quad by construction, so this always returns the exact intersection
// polygon (or an empty array when the two don't overlap at all). Both inputs
// must already wind counter-clockwise.
function clipConvexPolygon(subject: XY[], clip: XY[]): XY[] {
  let output = subject;
  for (let i = 0; i < clip.length; i++) {
    if (output.length === 0) break;
    const clipA = clip[i];
    const clipB = clip[(i + 1) % clip.length];
    const isInside = (p: XY) => (clipB.x - clipA.x) * (p.y - clipA.y) - (clipB.y - clipA.y) * (p.x - clipA.x) >= 0;

    const input = output;
    output = [];
    for (let j = 0; j < input.length; j++) {
      const current = input[j];
      const previous = input[(j - 1 + input.length) % input.length];
      const currentInside = isInside(current);
      const previousInside = isInside(previous);
      if (currentInside) {
        if (!previousInside) output.push(intersectEdge(previous, current, clipA, clipB));
        output.push(current);
      } else if (previousInside) {
        output.push(intersectEdge(previous, current, clipA, clipB));
      }
    }
  }
  return output;
}

function intersectEdge(a: XY, b: XY, clipA: XY, clipB: XY): XY {
  const d1x = b.x - a.x, d1y = b.y - a.y;
  const d2x = clipB.x - clipA.x, d2y = clipB.y - clipA.y;
  const denom = d1x * d2y - d1y * d2x;
  const t = ((clipA.x - a.x) * d2y - (clipA.y - a.y) * d2x) / denom;
  return { x: a.x + t * d1x, y: a.y + t * d1y };
}

export interface PolygonOverlap {
  areaSqm: number;
  pctOfA: number; // overlap area as a % of polygon A's own area
  pctOfB: number; // overlap area as a % of polygon B's own area
}

// Returns null when the two footprints don't meaningfully overlap (below a
// 1 sqm floor, to absorb floating-point noise from the projection above —
// never a true false negative for any overlap a person would actually care about).
export function polygonOverlap(a: GeoPoint[], b: GeoPoint[]): PolygonOverlap | null {
  if (a.length < 3 || b.length < 3) return null;

  // Project both onto a shared local plane centered on A's first vertex —
  // an arbitrary but consistent origin; the projection error this introduces
  // over a few hundred metres is negligible for cadastral-parcel purposes.
  const origin = a[0];
  const ringA = ensureCounterClockwise(a.map((p) => toLocalMeters(p, origin)));
  const ringB = ensureCounterClockwise(b.map((p) => toLocalMeters(p, origin)));

  const intersection = clipConvexPolygon(ringA, ringB);
  const overlapArea = polygonArea(intersection);
  if (overlapArea < 1) return null;

  const areaA = polygonArea(ringA);
  const areaB = polygonArea(ringB);
  return {
    areaSqm: overlapArea,
    pctOfA: areaA > 0 ? (overlapArea / areaA) * 100 : 0,
    pctOfB: areaB > 0 ? (overlapArea / areaB) * 100 : 0,
  };
}
