// SA-3.4 — "detect duplicate & conflicting listings," the Super Admin
// backlog's own headline differentiator: real stored geometry lets the
// platform catch two different sellers listing overlapping land, something
// no address-as-text competitor can do. See listingConflictsService.ts for
// the actual detection (real polygon-intersection math over each estate's
// real footprint) and src/lib/geometry.ts for the algorithm itself.
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../../../contexts/AppContext";
import {
  fetchConflicts, reviewConflict,
  type ListingConflict, type ConflictStatus, type GeoPoint,
} from "../../../services/listingConflictsService";
import StatusBadge, { conflictStatusBadge } from "../../../components/StatusBadge";

const STATUS_OPTIONS: { value: ConflictStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "open", label: "Open" },
  { value: "investigating", label: "Investigating" },
  { value: "confirmed_duplicate", label: "Confirmed duplicate" },
  { value: "dismissed", label: "Dismissed" },
];

function formatSqm(sqm: number): string {
  return `${Math.round(sqm).toLocaleString()} sqm`;
}

// Purely illustrative overlay — maps both footprints' raw lat/lng into one
// shared SVG viewbox by min/max bounds, no metric projection needed for a
// diagram. The real overlap area/percentages shown alongside it come from
// listingConflictsService's actual geometry math, not from this drawing.
function FootprintOverlay({ a, b }: { a: GeoPoint[]; b: GeoPoint[] }) {
  const all = [...a, ...b];
  const minLat = Math.min(...all.map((p) => p.lat));
  const maxLat = Math.max(...all.map((p) => p.lat));
  const minLng = Math.min(...all.map((p) => p.lng));
  const maxLng = Math.max(...all.map((p) => p.lng));
  const w = 220, h = 140, pad = 12;
  const spanLat = maxLat - minLat || 1;
  const spanLng = maxLng - minLng || 1;
  const toXY = (p: GeoPoint) => {
    const x = pad + ((p.lng - minLng) / spanLng) * (w - pad * 2);
    const y = h - pad - ((p.lat - minLat) / spanLat) * (h - pad * 2); // lat grows up; SVG y grows down
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="bg-[var(--muted)] rounded-lg" role="img" aria-label="Approximate footprint overlap diagram">
      <polygon points={a.map(toXY).join(" ")} fill="rgba(37,99,235,0.25)" stroke="rgb(37,99,235)" strokeWidth={1.5} />
      <polygon points={b.map(toXY).join(" ")} fill="rgba(220,38,38,0.25)" stroke="rgb(220,38,38)" strokeWidth={1.5} />
    </svg>
  );
}

function ConflictCard({ conflict, actor, onUpdated }: { conflict: ListingConflict; actor: string; onUpdated: (c: ListingConflict) => void }) {
  const [busy, setBusy] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<"confirmed_duplicate" | "dismissed" | null>(null);
  const [note, setNote] = useState("");
  const badge = conflictStatusBadge(conflict.status);
  const isTerminal = conflict.status === "confirmed_duplicate" || conflict.status === "dismissed";

  const runReview = async (decision: ConflictStatus, decisionNote?: string) => {
    setBusy(true);
    const updated = await reviewConflict(conflict.id, decision, actor, decisionNote);
    if (updated) onUpdated(updated);
    setBusy(false);
    setPendingDecision(null);
    setNote("");
  };

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge label={badge.label} variant={badge.variant} />
          <StatusBadge
            label={conflict.severity === "high" ? "Cross-tenant" : "Same tenant"}
            variant={conflict.severity === "high" ? "error" : "warning"}
          />
        </div>
        <span className="text-xs text-[var(--muted-foreground)] font-mono-data shrink-0">Detected {new Date(conflict.detectedAt).toLocaleDateString()}</span>
      </div>

      <div className="grid md:grid-cols-[1fr_auto] gap-5">
        <div>
          <div className="grid sm:grid-cols-2 gap-4 mb-3">
            <div>
              <div className="text-xs text-[var(--muted-foreground)] mb-0.5">Estate A</div>
              <div className="font-semibold text-[var(--foreground)]">{conflict.estateAName}</div>
              <Link to={`/admin/tenants/${conflict.tenantAId}`} className="text-xs text-[var(--accent)] hover:underline">{conflict.tenantAName} →</Link>
            </div>
            <div>
              <div className="text-xs text-[var(--muted-foreground)] mb-0.5">Estate B</div>
              <div className="font-semibold text-[var(--foreground)]">{conflict.estateBName}</div>
              <Link to={`/admin/tenants/${conflict.tenantBId}`} className="text-xs text-[var(--accent)] hover:underline">{conflict.tenantBName} →</Link>
            </div>
          </div>

          <p className="text-sm text-[var(--foreground)] mb-1">
            <span className="font-semibold font-mono-data">{formatSqm(conflict.overlapAreaSqm)}</span> of overlapping land —
            {" "}{conflict.overlapPctOfA.toFixed(0)}% of {conflict.estateAName}'s footprint, {conflict.overlapPctOfB.toFixed(0)}% of {conflict.estateBName}'s.
          </p>
          {conflict.crossTenant && (
            <p className="text-xs text-[var(--muted-foreground)] mb-3">Two different companies are both claiming this land — the pattern this check exists to catch.</p>
          )}

          {isTerminal && (
            <div className="mt-3 text-xs text-[var(--muted-foreground)] bg-[var(--muted)] rounded-lg p-3">
              <span className="font-medium text-[var(--foreground)]">{badge.label}</span> by {conflict.reviewedBy} · {conflict.reviewedAt && new Date(conflict.reviewedAt).toLocaleString()}
              {conflict.resolutionNote && <p className="mt-1">"{conflict.resolutionNote}"</p>}
            </div>
          )}

          {!isTerminal && (
            <div className="mt-3">
              {pendingDecision === null ? (
                <div className="flex flex-wrap gap-2">
                  {conflict.status === "open" && (
                    <button disabled={busy} onClick={() => runReview("investigating")} className="px-3 py-1.5 border border-[var(--border)] rounded-md text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-60">
                      Start investigating
                    </button>
                  )}
                  <button disabled={busy} onClick={() => setPendingDecision("confirmed_duplicate")} className="px-3 py-1.5 bg-red-600 text-white rounded-md text-xs font-medium hover:bg-red-700 disabled:opacity-60">
                    Confirm duplicate
                  </button>
                  <button disabled={busy} onClick={() => setPendingDecision("dismissed")} className="px-3 py-1.5 border border-[var(--border)] rounded-md text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-60">
                    Dismiss as false positive
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <label htmlFor={`note-${conflict.id}`} className="block text-xs font-medium text-[var(--foreground)]">
                    {pendingDecision === "confirmed_duplicate" ? "Evidence / reasoning (required)" : "Why is this a false positive? (required)"}
                  </label>
                  <textarea
                    id={`note-${conflict.id}`}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    className="w-full px-3 py-2 bg-[var(--background)] border border-[var(--border)] rounded-md text-sm text-[var(--foreground)]"
                  />
                  <div className="flex gap-2">
                    <button
                      disabled={busy || !note.trim()}
                      onClick={() => runReview(pendingDecision, note.trim())}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium disabled:opacity-60 ${pendingDecision === "confirmed_duplicate" ? "bg-red-600 text-white hover:bg-red-700" : "bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90"}`}
                    >
                      {busy ? "Submitting…" : "Submit"}
                    </button>
                    <button disabled={busy} onClick={() => { setPendingDecision(null); setNote(""); }} className="px-3 py-1.5 text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col items-center gap-1 shrink-0">
          <FootprintOverlay a={conflict.estateAFootprint} b={conflict.estateBFootprint} />
          <div className="flex items-center gap-3 text-[10px] text-[var(--muted-foreground)]">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500/40 border border-blue-600 inline-block" /> A</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-500/40 border border-red-600 inline-block" /> B</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ListingConflicts() {
  const { user } = useApp();
  const actor = user?.name ?? "Super Admin";

  const [conflicts, setConflicts] = useState<ListingConflict[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ConflictStatus | "all">("all");

  const filters = { status: statusFilter === "all" ? undefined : [statusFilter] };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchConflicts(filters).then((page) => {
      if (cancelled) return;
      setConflicts(page.items);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
      setLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const loadMore = async () => {
    setLoadingMore(true);
    const page = await fetchConflicts(filters, { cursor });
    setConflicts((prev) => [...prev, ...page.items]);
    setCursor(page.cursor);
    setHasMore(page.hasMore);
    setLoadingMore(false);
  };

  const handleUpdated = (updated: ListingConflict) => {
    setConflicts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  if (loading) return <div className="p-8 text-[var(--muted-foreground)] text-sm">Scanning estate footprints…</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">Listing conflicts</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Every published and unpublished estate's boundary is checked against every other's. An overlap between two different companies is a strong signal one of them is selling land they don't hold title to.
        </p>
      </div>

      <div className="mb-5">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ConflictStatus | "all")} className="px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm cursor-pointer">
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {conflicts.length === 0 ? (
        <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-600 shrink-0">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span className="text-sm text-emerald-800 font-medium">
            {statusFilter === "all" ? "No overlapping or duplicate listings detected." : "No conflicts match this filter."}
          </span>
        </div>
      ) : (
        <div className="space-y-4">
          {conflicts.map((c) => <ConflictCard key={c.id} conflict={c} actor={actor} onUpdated={handleUpdated} />)}
        </div>
      )}

      {hasMore && (
        <button onClick={loadMore} disabled={loadingMore} className="mt-4 w-full py-2.5 border border-[var(--border)] rounded-md text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-60">
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
