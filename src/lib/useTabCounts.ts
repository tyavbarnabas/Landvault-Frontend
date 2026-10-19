// Counts on a review queue's tabs ("Waiting for review 2"), each counted from
// the same list endpoint the tab itself shows — there is no count endpoint.
// A count that can't be read is left off its tab rather than shown as zero.

import { useFetch } from "./useFetch";

export function useTabCounts<T extends string>(ids: readonly T[], count: (id: T) => Promise<number>, deps: unknown[] = []) {
  const counts = useFetch(async () => {
    const settled = await Promise.allSettled(ids.map(count));
    const out: Partial<Record<T, number>> = {};
    settled.forEach((r, i) => { if (r.status === "fulfilled") out[ids[i]] = r.value; });
    return out;
  }, deps);
  const none: Partial<Record<T, number>> = {};
  return { counts: counts.data ?? none, refetch: counts.refetch };
}

// "Waiting for review 2", or just the label while the count is unknown.
export function withCount(label: string, n: number | undefined): string {
  return n === undefined ? label : `${label} ${n}`;
}
