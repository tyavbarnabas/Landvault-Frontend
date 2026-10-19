// Super Admin review of estate boundary corrections (FP-2, option C).
//
// A correction waits here only when a PUBLISHED estate's land changes by more
// than 5% (land added plus land removed). Real survey corrections are small;
// a big change to a live listing is what a person should see before buyers
// do — and the one case overlap detection can't police, because a boundary
// moved onto land no other company has listed raises no conflict.
//
// Approving re-checks that every plot still fits (plots may have been mapped
// while it waited), applies it, and re-runs detection. Rejecting needs a note
// the developer will see; the current boundary stays.
//
// Laid out from the Figma review-queue proposal: counted tabs and a table,
// each correction opening under its row with the map and the decision.

import { useState } from "react";
import LoadError from "../../../components/LoadError";
import { useFetch } from "../../../lib/useFetch";
import { formatDay } from "../../../lib/formatDate";
import { tokenColor } from "../../../lib/tokenColor";
import { useTabCounts, withCount } from "../../../lib/useTabCounts";
import {
  EstateEditError, decideBoundaryChange, fetchBoundaryChangesForReview,
  type BoundaryChange, type BoundaryChangeStatus,
} from "../../../services/portalEstatesService";
import EstateBoundaryMap from "../../../components/map/EstateBoundaryMap";
import ConflictChangesView from "../../../components/portal/ConflictChangesView";
import StatusBadge, { boundaryChangeBadge } from "../../../components/StatusBadge";
import Page, { Loading } from "../../../components/ui/Page";
import Card from "../../../components/ui/Card";
import Alert from "../../../components/ui/Alert";
import Button from "../../../components/ui/Button";
import EmptyState from "../../../components/ui/EmptyState";
import TabBar from "../../../components/ui/Tabs";
import DisclosureTable, { DisclosureRow } from "../../../components/ui/DisclosureTable";
import { ErrorText, Field, Input, describedBy } from "../../../components/ui/Field";

const TABS: { id: BoundaryChangeStatus; label: string }[] = [
  { id: "pending", label: "Waiting for review" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "applied", label: "Applied without review" },
  { id: "withdrawn", label: "Withdrawn" },
];
const TAB_IDS = TABS.map((t) => t.id);

const COLUMNS = ["Estate", "Company", "Land changed", "Reason", "Requested", "Status"];
const GRID = "lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,2fr)_7rem_minmax(0,1.1fr)_16px]";

export default function BoundaryChanges() {
  const [status, setStatus] = useState<BoundaryChangeStatus>("pending");
  const list = useFetch(() => fetchBoundaryChangesForReview(status), [status]);
  const { counts, refetch: recount } = useTabCounts(TAB_IDS, async (s) => (await fetchBoundaryChangesForReview(s)).length);
  const tabs = TABS.map((t) => ({ id: t.id, label: withCount(t.label, counts[t.id]) }));
  const reload = () => { list.refetch(); recount(); };

  return (
    <Page title="Boundary changes" description="Corrections to published estates that change more than 5% of their land. The current boundary stays live until you decide.">
      <TabBar tabs={tabs} active={status} onActivate={setStatus} ariaLabel="Boundary changes by status" divider />

      <div id={`panel-${status}`} role="tabpanel" aria-labelledby={`tab-${status}`}>
        {list.loading && !list.data && <Loading />}
        {!list.loading && list.error && <LoadError error={list.errorValue} what="boundary changes" onRetry={list.refetch} />}
        {list.data && list.data.length === 0 && (
          <Card padding="sm">
            <EmptyState
              title={status === "pending" ? "Nothing waiting" : "None"}
              description={status === "pending" ? "Corrections needing a decision appear here, oldest first." : "Nothing with this status yet."}
            />
          </Card>
        )}
        {list.data && list.data.length > 0 && (
          <DisclosureTable columns={COLUMNS} grid={GRID} label="Boundary changes">
            {list.data.map((change) => <ChangeRow key={change.id} change={change} onlyOne={list.data!.length === 1} onDecided={reload} />)}
          </DisclosureTable>
        )}
      </div>
    </Page>
  );
}

function ChangeRow({ change, onlyOne, onDecided }: { change: BoundaryChange; onlyOne: boolean; onDecided: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState("");
  const [decided, setDecided] = useState<BoundaryChange | null>(null);
  const shown = decided ?? change;
  const noteId = `note-${change.id}`;
  const hint = "Optional when approving; required when rejecting — the developer sees it.";

  const decide = async (decision: "approve" | "reject") => {
    setBusy(decision);
    setError("");
    try {
      setDecided(await decideBoundaryChange(change.id, decision, note));
    } catch (err) {
      setError(err instanceof EstateEditError || err instanceof Error ? err.message : "That didn't go through.");
    } finally {
      setBusy(null);
    }
  };

  // Both shapes on one map: the live boundary, and what's proposed.
  const features = [
    change.previousFootprint && { type: "Feature" as const, geometry: change.previousFootprint, properties: { kind: "current" } },
    change.proposedFootprint && { type: "Feature" as const, geometry: change.proposedFootprint, properties: { kind: "proposed" } },
  ].filter(Boolean);

  const cells = [
    <span className="font-semibold text-[var(--foreground)]">{shown.estateName}</span>,
    <span className="text-sm text-[var(--foreground)]">{shown.companyName ?? "Company not shown"}</span>,
    <span className="text-sm font-mono-data text-[var(--foreground)]">{shown.changedPct != null ? `${shown.changedPct}%` : "—"}{shown.changedAreaSqm != null && <span className="block text-xs text-[var(--muted-foreground)]">{shown.changedAreaSqm.toLocaleString()} sqm</span>}</span>,
    <span className="text-sm text-[var(--muted-foreground)] line-clamp-2">{shown.reason}</span>,
    <span className="text-sm text-[var(--muted-foreground)]"><span className="lg:hidden">Requested </span>{formatDay(shown.createdAt)}</span>,
    <StatusBadge {...boundaryChangeBadge(shown.status)} />,
  ];

  return (
    <DisclosureRow id={`change-${change.id}`} grid={GRID} cells={cells} defaultOpen={onlyOne && change.status === "pending"}>
      <p className="text-sm text-[var(--foreground)]">“{change.reason}”</p>
      <p className="text-xs text-[var(--muted-foreground)] font-mono-data">
        {change.previousAreaSqm?.toLocaleString()} → {change.proposedAreaSqm?.toLocaleString()} sqm · {change.changedAreaSqm?.toLocaleString()} sqm
        changed ({change.changedPct}% of the land, added plus removed){change.requestedBy ? ` · requested by ${change.requestedBy}` : ""}
      </p>

      {features.length > 0 && (
        <EstateBoundaryMap
          boundary={{ type: "FeatureCollection", features } as never}
          heightClass="h-64"
          label={`${change.estateName}: current boundary and proposed correction`}
          styleForFeature={(props) => props.kind === "proposed"
            ? { color: tokenColor("--info"), weight: 2, fillOpacity: 0.15, dashArray: "6 4" }
            : { color: tokenColor("--warning"), weight: 2, fillOpacity: 0.05 }}
          legend={[{ color: tokenColor("--warning"), label: "Current boundary" }, { color: tokenColor("--info"), label: "Proposed" }]}
        />
      )}

      {change.decisionNote && <p className="text-sm text-[var(--muted-foreground)]">Decision note: {change.decisionNote}</p>}

      {change.status === "pending" && !decided && (
        <div className="space-y-3 pt-4 border-t border-[var(--border)]">
          <Field id={noteId} label="Note" hint={hint}>
            <Input id={noteId} inputSize="md" value={note} onChange={(e) => setNote(e.target.value)} aria-describedby={describedBy(noteId, { hint })} />
          </Field>
          {error && <ErrorText>{error}</ErrorText>}
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => decide("approve")} disabled={busy !== null}>{busy === "approve" ? "Checking and applying…" : "Approve and apply"}</Button>
            <Button variant="danger" onClick={() => decide("reject")} disabled={busy !== null}>{busy === "reject" ? "Rejecting…" : "Reject"}</Button>
          </div>
        </div>
      )}

      {decided && (
        <div className="rounded-lg bg-[var(--muted)] p-3 space-y-2" role="status">
          <p className="text-sm text-[var(--foreground)]">
            {decided.status === "approved" ? "Approved — the new boundary is live." : "Rejected — the current boundary stays."}
          </p>
          {decided.publicationBlocked && <Alert>{decided.blockReason}</Alert>}
          <ConflictChangesView changes={decided.conflictChanges} />
          <Button variant="link" onClick={onDecided}>Refresh the list</Button>
        </div>
      )}
    </DisclosureRow>
  );
}
