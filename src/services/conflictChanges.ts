// What a boundary change did to overlaps — ConflictChanges / ConflictItem.
//
// Every route that changes a boundary returns this: adding an estate boundary,
// correcting one (and its approval), and correcting a plot's. Counts alone
// couldn't say WHICH overlap cleared; this can. It is always the caller's own
// side only: the other company is never named, by construction.
//
//   raised          a live conflict this change created
//   resolved        a live conflict this change ended
//   awaitingReview  the overlap is gone, but a conflict with ANOTHER company
//                   still blocks publication until LandVault's team closes it
//                   (the defence against shaving a boundary to dodge review)
//   stillOpen       live before and after

export type ConflictType = "estate_overlap" | "plot_overlap";

export interface ConflictItem {
  id: string;
  conflictType: ConflictType;
  yourEntityId: string;
  yourEntityLabel: string;
  overlapAreaSqm: number | null;
  severity: "high" | "medium";
  status: string;
  live: boolean;
  blocksPublication: boolean;
  underReview: boolean;
  guidance: string | null;
}

export interface ConflictChanges {
  raised: ConflictItem[];
  resolved: ConflictItem[];
  awaitingReview: ConflictItem[];
  stillOpen: ConflictItem[];
}

export const LIVE_CONFLICT_STATUSES = ["open", "investigating", "confirmed_duplicate"];

// A port of the backend's ConflictChanges.between, for mock mode — the same
// four buckets from the same two snapshots, so both modes read identically.
export function conflictChangesBetween(before: ConflictItem[], after: ConflictItem[]): ConflictChanges {
  const was = new Map(before.map((c) => [c.id, c]));
  const now = new Map(after.map((c) => [c.id, c]));
  const raised = after.filter((c) => c.live && (!was.has(c.id) || !was.get(c.id)!.live));
  const resolved = before.filter((c) => c.live && now.has(c.id) && !now.get(c.id)!.live).map((c) => now.get(c.id)!);
  const awaitingReview = after.filter((c) => c.live && c.underReview && was.has(c.id) && was.get(c.id)!.live && !was.get(c.id)!.underReview);
  const stillOpen = after.filter((c) => c.live && was.has(c.id) && was.get(c.id)!.live && !awaitingReview.includes(c));
  return { raised, resolved, awaitingReview, stillOpen };
}

export function hasAnyChange(changes: ConflictChanges | null | undefined): boolean {
  return !!changes && (changes.raised.length + changes.resolved.length + changes.awaitingReview.length + changes.stillOpen.length) > 0;
}
