// SA-3.4 — "detect duplicate & conflicting listings," the Super Admin
// backlog's own headline differentiator: real stored geometry lets the
// platform catch two different sellers listing overlapping land, something
// no address-as-text competitor can do. See listingConflictsService.ts for
// the actual detection (real polygon-intersection math over each estate's
// real footprint) and src/lib/geometry.ts for the algorithm itself.
//
// Laid out from the Figma review-queue proposal: tabs by status with counts,
// the conflicts as a list on the left and the chosen one in full on the
// right, with the decisions as buttons. The tab and the chosen conflict are
// kept in the URL (?tab=, ?id=) so a link from the dashboard lands on it.

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import LoadError from "../../../components/LoadError";
import { useApp } from "../../../contexts/AppContext";
import { useFetch } from "../../../lib/useFetch";
import { formatDay, formatDayTime } from "../../../lib/formatDate";
import { useTabCounts, withCount } from "../../../lib/useTabCounts";
import {
  fetchConflicts, reviewConflict,
  type ConflictStatus, type GeoPoint, type ListingConflict,
} from "../../../services/listingConflictsService";
import StatusBadge, { conflictStatusBadge } from "../../../components/StatusBadge";
import Page, { Loading } from "../../../components/ui/Page";
import Card, { InfoBox } from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import TextLink from "../../../components/ui/TextLink";
import EmptyState from "../../../components/ui/EmptyState";
import TabBar from "../../../components/ui/Tabs";
import Dialog, { DialogActions } from "../../../components/ui/Dialog";
import { ErrorText, Field, Textarea, describedBy } from "../../../components/ui/Field";
import { cx } from "../../../components/ui/cx";

type Tab = ConflictStatus | "all";
const TABS: { id: Tab; label: string }[] = [
  { id: "open", label: "Open" },
  { id: "investigating", label: "Investigating" },
  { id: "confirmed_duplicate", label: "Confirmed duplicate" },
  { id: "dismissed", label: "Dismissed" },
  // Closed by the system when a corrected boundary no longer overlaps.
  { id: "auto_resolved", label: "Auto-resolved" },
  { id: "all", label: "All" },
];
const TAB_IDS = TABS.map((t) => t.id);

const sqm = (n: number) => `${Math.round(n).toLocaleString()} sqm`;
const statusFilter = (tab: Tab) => ({ status: tab === "all" ? undefined : [tab] });

export default function ListingConflicts() {
  const { user } = useApp();
  const actor = user?.name ?? "Super Admin";
  const [params, setParams] = useSearchParams();
  const tab = (TAB_IDS.find((t) => t === params.get("tab")) ?? "open") as Tab;
  const selectedId = params.get("id");

  const page = useFetch(() => fetchConflicts(statusFilter(tab)), [tab]);
  const { counts, refetch: recount } = useTabCounts(TAB_IDS, async (t) => (await fetchConflicts(statusFilter(t), { limit: 1 })).total);
  // Pages after the first, and decisions made on this screen.
  const [more, setMore] = useState<{ items: ListingConflict[]; cursor?: string; hasMore: boolean } | null>(null);
  const [updated, setUpdated] = useState<Record<string, ListingConflict>>({});
  const [loadingMore, setLoadingMore] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setMore(null); setUpdated({}); }, [tab]);

  const items = [...(page.data?.items ?? []), ...(more?.items ?? [])].map((c) => updated[c.id] ?? c);
  const hasMore = more ? more.hasMore : page.data?.hasMore ?? false;
  const selected = items.find((c) => c.id === selectedId) ?? items[0] ?? null;

  const go = (next: { tab?: Tab; id?: string | null }) => {
    const t = next.tab ?? tab;
    const id = next.id === undefined ? selectedId : next.id;
    setParams({ ...(t !== "open" ? { tab: t } : {}), ...(id ? { id } : {}) }, { replace: true });
  };

  const choose = (id: string) => {
    go({ id });
    // Below lg the detail sits under the list: bring it into view.
    if (window.matchMedia("(max-width: 1023px)").matches) requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const next = await fetchConflicts(statusFilter(tab), { cursor: more?.cursor ?? page.data?.cursor });
      setMore((m) => ({ items: [...(m?.items ?? []), ...next.items], cursor: next.cursor, hasMore: next.hasMore }));
    } finally {
      setLoadingMore(false);
    }
  };

  const tabs = TABS.map((t) => ({ id: t.id, label: withCount(t.label, counts[t.id]) }));

  return (
    <Page title="Listing conflicts" description="Every estate's boundary is checked against every other's. An overlap between two different companies is a strong signal one of them is selling land they don't hold title to.">
      <TabBar tabs={tabs} active={tab} onActivate={(t) => go({ tab: t, id: null })} ariaLabel="Conflicts by status" divider />

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {page.loading && !page.data ? <Loading label="Scanning estate footprints…" />
          : page.error ? <LoadError error={page.errorValue} what="listing conflicts" onRetry={page.refetch} />
            : items.length === 0 ? (
              <Card padding="sm">
                <EmptyState
                  title={tab === "open" ? "No open conflicts" : "None"}
                  description={tab === "open" ? "No estate's boundary overlaps another's. New overlaps appear here as soon as they're detected." : "No conflicts with this status."}
                />
              </Card>
            ) : (
              <div className="grid gap-5 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] items-start">
                <div className="space-y-3">
                  <Card padding="none" className="overflow-hidden">
                    <ul aria-label="Conflicts" className="divide-y divide-[var(--border)]">
                      {items.map((c) => <ConflictListItem key={c.id} conflict={c} active={c.id === selected?.id} onChoose={() => choose(c.id)} />)}
                    </ul>
                  </Card>
                  {hasMore && (
                    <Button variant="secondary" fullWidth onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more"}</Button>
                  )}
                </div>
                <div ref={detailRef} className="scroll-mt-4">
                  {selected && (
                    <ConflictDetail
                      key={selected.id}
                      conflict={selected}
                      actor={actor}
                      onUpdated={(c) => { setUpdated((u) => ({ ...u, [c.id]: c })); recount(); }}
                    />
                  )}
                </div>
              </div>
            )}
      </div>
    </Page>
  );
}

function SeverityBadge({ conflict }: { conflict: ListingConflict }) {
  return conflict.crossTenant
    ? <StatusBadge label="Cross-company" variant="error" />
    : <StatusBadge label="Same company" variant="warning" />;
}

function ConflictListItem({ conflict: c, active, onChoose }: { conflict: ListingConflict; active: boolean; onChoose: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onChoose}
        aria-current={active ? "true" : undefined}
        className={cx("w-full text-left px-4 py-3.5 space-y-1.5 transition-colors border-l-2",
          active ? "bg-[var(--secondary)] border-[var(--primary)]" : "border-transparent hover:bg-[var(--muted)]/50")}
      >
        <div className="flex flex-wrap gap-1.5">
          <SeverityBadge conflict={c} />
          <StatusBadge {...conflictStatusBadge(c.status)} />
        </div>
        <div className="text-sm font-semibold text-[var(--foreground)]">{c.estateAName} × {c.estateBName}</div>
        <div className="text-xs text-[var(--muted-foreground)]">{c.crossTenant ? `${c.tenantAName} · ${c.tenantBName}` : c.tenantAName}</div>
        <div className="text-xs text-[var(--muted-foreground)]"><span className="font-mono-data">{sqm(c.overlapAreaSqm)}</span> overlap · detected {formatDay(c.detectedAt)}</div>
      </button>
    </li>
  );
}

function ConflictDetail({ conflict: c, actor, onUpdated }: { conflict: ListingConflict; actor: string; onUpdated: (c: ListingConflict) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deciding, setDeciding] = useState<"confirmed_duplicate" | "dismissed" | null>(null);
  const terminal = c.status === "confirmed_duplicate" || c.status === "dismissed" || c.status === "auto_resolved";
  const live = !terminal;

  const review = async (decision: ConflictStatus, note?: string) => {
    setBusy(true);
    setError("");
    try {
      const result = await reviewConflict(c.id, decision, actor, note);
      if (result) onUpdated(result);
      else setError("This conflict wasn't found. It may have closed itself after a boundary correction; reload the page.");
      setDeciding(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card as="section" alert={c.crossTenant && live} aria-labelledby="conflict-heading" className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="conflict-heading" className="font-display text-2xl text-[var(--foreground)]">{c.estateAName} overlaps {c.estateBName}</h2>
          <p className={cx("text-sm mt-1", c.crossTenant ? "text-[var(--error-text)]" : "text-[var(--muted-foreground)]")}>
            {c.crossTenant
              ? "Two different companies are both claiming this land — the pattern this check exists to catch."
              : `Both estates belong to ${c.tenantAName}: usually a survey or data-entry mistake rather than a scam.`}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <SeverityBadge conflict={c} />
          <StatusBadge {...conflictStatusBadge(c.status)} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <EstateBox side="A" name={c.estateAName} tenantId={c.tenantAId} tenantName={c.tenantAName} pct={c.overlapPctOfA} />
        <EstateBox side="B" name={c.estateBName} tenantId={c.tenantBId} tenantName={c.tenantBName} pct={c.overlapPctOfB} />
      </div>

      {c.estateAFootprint && c.estateBFootprint && <FootprintOverlay a={c.estateAFootprint} b={c.estateBFootprint} />}

      <p className="text-sm text-[var(--foreground)]">
        <span className="font-mono-data font-medium">{sqm(c.overlapAreaSqm)}</span> of overlapping land · detected {formatDay(c.detectedAt)}
      </p>

      {terminal && c.status !== "auto_resolved" && (
        <div className="rounded-lg bg-[var(--muted)] p-3 text-sm text-[var(--muted-foreground)]">
          <span className="font-medium text-[var(--foreground)]">{conflictStatusBadge(c.status).label}</span>
          {c.reviewedBy ? ` by ${c.reviewedBy}` : ""}{c.reviewedAt ? ` · ${formatDayTime(c.reviewedAt)}` : ""}
          {c.resolutionNote && <p className="mt-1">"{c.resolutionNote}"</p>}
        </div>
      )}
      {c.status === "auto_resolved" && (
        <p className="text-sm text-[var(--muted-foreground)]">A boundary correction removed the overlap, so this closed by itself. Nothing to decide.</p>
      )}

      {error && !deciding && <ErrorText>{error}</ErrorText>}

      {live && (
        <div className="flex flex-wrap gap-3 pt-4 border-t border-[var(--border)]">
          {c.status === "open" && <Button onClick={() => review("investigating")} disabled={busy}>{busy && !deciding ? "Saving…" : "Start investigating"}</Button>}
          <Button variant="danger" onClick={() => setDeciding("confirmed_duplicate")} disabled={busy}>Confirm duplicate</Button>
          <Button variant="secondary" onClick={() => setDeciding("dismissed")} disabled={busy}>Dismiss as false positive</Button>
        </div>
      )}

      {deciding && <DecisionDialog conflict={c} decision={deciding} busy={busy} error={error} onCancel={() => { setDeciding(null); setError(""); }} onConfirm={(note) => review(deciding, note)} />}
    </Card>
  );
}

function EstateBox({ side, name, tenantId, tenantName, pct }: { side: "A" | "B"; name: string; tenantId: string; tenantName: string; pct: number }) {
  return (
    <InfoBox label={`Estate ${side}`}>
      <div className="font-semibold text-[var(--foreground)]">{name}</div>
      <TextLink to={`/admin/tenants/${tenantId}`} className="text-sm">{tenantName} →</TextLink>
      <div className="text-sm font-medium text-[var(--error-text)] mt-1">{pct.toFixed(0)}% of its land overlaps</div>
    </InfoBox>
  );
}

function DecisionDialog({ conflict: c, decision, busy, error, onCancel, onConfirm }: {
  conflict: ListingConflict; decision: "confirmed_duplicate" | "dismissed"; busy: boolean; error: string; onCancel: () => void; onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState("");
  const duplicate = decision === "confirmed_duplicate";
  const id = "conflict-note";
  const hint = duplicate
    ? "Required: the evidence, e.g. whose title covers the land. It's kept on both companies' records."
    : "Required: why the overlap isn't real, e.g. a shared road reserve.";
  const submit = () => {
    if (!note.trim()) { setNoteError(duplicate ? "Say what shows it's a duplicate." : "Say why this is a false positive."); return; }
    onConfirm(note.trim());
  };
  return (
    <Dialog title={duplicate ? "Confirm this is a duplicate listing?" : "Dismiss as a false positive?"} onClose={onCancel} size="md">
      <p className="text-sm text-[var(--muted-foreground)] mb-4">
        {c.estateAName} and {c.estateBName} · <span className="font-mono-data">{sqm(c.overlapAreaSqm)}</span> overlapping. This closes the conflict.
      </p>
      <Field id={id} label={duplicate ? "Evidence" : "Reason"} hint={hint} error={noteError || undefined} className="mb-4">
        <Textarea id={id} rows={3} value={note} onChange={(e) => { setNote(e.target.value); setNoteError(""); }}
          aria-invalid={!!noteError} aria-describedby={describedBy(id, { hint, error: noteError })} />
      </Field>
      {error && <ErrorText className="mb-3">{error}</ErrorText>}
      <DialogActions onCancel={onCancel} onConfirm={submit} confirmLabel={duplicate ? "Confirm duplicate" : "Dismiss"} busy={busy} busyLabel="Saving…" variant={duplicate ? "danger" : "primary"} />
    </Dialog>
  );
}

// A diagram, not a map: both footprints' raw lat/lng scaled into one shared
// box by their bounds. The overlap figures beside it come from the service's
// real geometry, not from this drawing. Only mock data carries footprints;
// the live list has no geometry, so the diagram is simply left out there.
function FootprintOverlay({ a, b }: { a: GeoPoint[]; b: GeoPoint[] }) {
  const all = [...a, ...b];
  const minLat = Math.min(...all.map((p) => p.lat));
  const maxLat = Math.max(...all.map((p) => p.lat));
  const minLng = Math.min(...all.map((p) => p.lng));
  const maxLng = Math.max(...all.map((p) => p.lng));
  const w = 480, h = 220, pad = 16;
  const spanLat = maxLat - minLat || 1;
  const spanLng = maxLng - minLng || 1;
  const toXY = (p: GeoPoint) => {
    const x = pad + ((p.lng - minLng) / spanLng) * (w - pad * 2);
    const y = h - pad - ((p.lat - minLat) / spanLat) * (h - pad * 2); // lat grows up; SVG y grows down
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  };
  return (
    <figure className="space-y-2">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto bg-[var(--muted)] rounded-lg" role="img" aria-label="Diagram of the two estates' footprints overlapping">
        <polygon points={a.map(toXY).join(" ")} style={{ fill: "var(--info)", fillOpacity: 0.2, stroke: "var(--info)", strokeWidth: 1.5 }} />
        <polygon points={b.map(toXY).join(" ")} style={{ fill: "var(--error)", fillOpacity: 0.2, stroke: "var(--error)", strokeWidth: 1.5 }} />
      </svg>
      <figcaption className="flex flex-wrap items-center gap-4 text-xs text-[var(--muted-foreground)]">
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="w-2.5 h-2.5 rounded-sm bg-[var(--info)]/40 border border-[var(--info)]" /> Estate A</span>
        <span className="flex items-center gap-1.5"><span aria-hidden="true" className="w-2.5 h-2.5 rounded-sm bg-[var(--error)]/40 border border-[var(--error)]" /> Estate B</span>
        <span>Approximate drawing; the figures come from the boundaries themselves.</span>
      </figcaption>
    </figure>
  );
}
