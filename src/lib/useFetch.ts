import { useState, useEffect, useCallback, useRef } from "react";

export interface UseFetchResult<T> {
  data: T | null;
  loading: boolean;
  error: boolean;
  refetch: () => void;
  /** Escape hatch for a mutation that already knows the new server-confirmed
   * state (e.g. a payment verification response) and wants to reflect it
   * immediately, without a full network refetch. Prefer `refetch()` when
   * there's no such value in hand. */
  setData: (value: T | ((prev: T | null) => T)) => void;
}

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}

// Standardises the `let cancelled = false` + fetch pattern repeated across
// this app (~70 call sites before this pass): correct cleanup on unmount or
// a dependency change, a real AbortController whose signal is handed to the
// fetcher (apiClient-backed fetchers can wire it straight through via
// RequestOptions.signal — see lib/apiClient.ts), and a refetch escape hatch
// for a "Try again" button. One pattern instead of two competing ones.
//
// `fetcher` receives the AbortSignal so a caller CAN thread it into a real
// network call; a fetcher that ignores it (most mock-mode ones today) still
// benefits from the loading/error/refetch bookkeeping and the
// setState-after-unmount guard.
export function useFetch<T>(fetcher: (signal: AbortSignal) => Promise<T>, deps: unknown[] = []): UseFetchResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  // Ref so a fetcher recreated every render (an inline arrow function, the
  // overwhelmingly common case at call sites) doesn't retrigger the effect —
  // only entries in `deps` do.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    fetcherRef.current(controller.signal)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled && !isAbortError(err)) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadToken]);

  const refetch = useCallback(() => setReloadToken((t) => t + 1), []);

  return { data, loading, error, refetch, setData };
}

// The polling counterpart — ResaleTransferDetail / UpgradeRequestDetail's
// "clone on every tick, poll on an interval, stop cleanly on unmount" shape,
// generalised so both use the same primitive instead of two hand-rolled
// copies. Cloning matters because the mock stores return the same mutated
// object reference each tick; setState with an unchanged reference is a
// no-op (Object.is), which would otherwise freeze the UI on the first stage
// forever — see the comment history on both call sites this replaces.
export function usePolling<T>(fetcher: (signal: AbortSignal) => Promise<T | undefined>, intervalMs: number, deps: unknown[] = []): T | null | undefined {
  // undefined = still loading; null = fetched and genuinely not found
  const [data, setData] = useState<T | null | undefined>(undefined);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const poll = () => {
      fetcherRef.current(controller.signal)
        .then((d) => { if (!cancelled) setData(d ? ({ ...d }) : null); })
        .catch((err) => { if (!cancelled && !isAbortError(err)) setData(null); });
    };
    poll();
    const interval = setInterval(poll, intervalMs);
    return () => { cancelled = true; controller.abort(); clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return data;
}
