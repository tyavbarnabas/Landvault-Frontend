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

import { useState } from "react";
import { useFetch } from "../../../lib/useFetch";
import {
  EstateEditError, decideBoundaryChange, fetchBoundaryChangesForReview,
  type BoundaryChange, type BoundaryChangeStatus,
} from "../../../services/portalEstatesService";
import EstateBoundaryMap from "../../../components/map/EstateBoundaryMap";
import ConflictChangesView from "../../../components/portal/ConflictChangesView";
import StatusBadge, { boundaryChangeBadge } from "../../../components/StatusBadge";
import TabBar from "../../../components/TabBar";
import EmptyState from "../../../components/marketplace/EmptyState";
import { Field, inputClass } from "../../../components/portal/formParts";

const TABS: { id: BoundaryChangeStatus; label: string }[] = [
  { id: "pending", label: "Waiting for review" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "applied", label: "Applied without review" },
  { id: "withdrawn", label: "Withdrawn" },
];

export default function BoundaryChanges() {
  const [status, setStatus] = useState<BoundaryChangeStatus>("pending");
  const list = useFetch(() => fetchBoundaryChangesForReview(status), [status]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">Boundary changes</h1>
      <p className="text-sm text-[var(--muted-foreground)] mb-6">
        Corrections to published estates that change more than 5% of their land. The current boundary stays live until you decide.
      </p>

      <div className="border-b border-[var(--border)] mb-5">
        <TabBar tabs={TABS} active={status} onActivate={setStatus} ariaLabel="Boundary changes by status" />
      </div>

      {list.loading && !list.data && <p className="text-sm text-[var(--muted-foreground)]">Loading…</p>}
      {list.error && (
        <p className="text-sm text-[var(--foreground)]">
          Couldn't load them. <button onClick={list.refetch} className="text-[var(--accent)] hover:underline">Try again</button>
        </p>
      )}
      {list.data && list.data.length === 0 && (
        <EmptyState title={status === "pending" ? "Nothing waiting" : "None"} description={status === "pending" ? "Corrections needing a decision appear here." : "Nothing with this status yet."} />
      )}
      {list.data && list.data.length > 0 && (
        <ul className="space-y-3">
          {list.data.map((change) => <ChangeCard key={change.id} change={change} onDecided={list.refetch} />)}
        </ul>
      )}
    </div>
  );
}

function ChangeCard({ change, onDecided }: { change: BoundaryChange; onDecided: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState("");
  const [decided, setDecided] = useState<BoundaryChange | null>(null);
  const badge = boundaryChangeBadge((decided ?? change).status);

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

  return (
    <li className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 min-h-28 space-y-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[200px]">
          <div className="font-semibold text-[var(--foreground)]">{change.estateName}</div>
          <div className="text-xs text-[var(--muted-foreground)]">
            {change.companyName ?? "Company not shown"} · requested {new Date(change.createdAt).toLocaleDateString()}
          </div>
        </div>
        <StatusBadge label={badge.label} variant={badge.variant} />
      </div>

      <p className="text-sm text-[var(--foreground)]">“{change.reason}”</p>
      <p className="text-xs text-[var(--muted-foreground)] font-mono-data">
        {change.previousAreaSqm?.toLocaleString()} → {change.proposedAreaSqm?.toLocaleString()} sqm · {change.changedAreaSqm?.toLocaleString()} sqm
        changed ({change.changedPct}% of the land, added plus removed)
      </p>

      {features.length > 0 && (
        <EstateBoundaryMap
          boundary={{ type: "FeatureCollection", features } as never}
          heightClass="h-64"
          label={`${change.estateName}: current boundary and proposed correction`}
          styleForFeature={(props) => props.kind === "proposed"
            ? { color: "#2563EB", weight: 2, fillOpacity: 0.15, dashArray: "6 4" }
            : { color: "#f59e0b", weight: 2, fillOpacity: 0.05 }}
          legend={[{ color: "#f59e0b", label: "Current boundary" }, { color: "#2563EB", label: "Proposed" }]}
        />
      )}

      {change.decisionNote && <p className="text-xs text-[var(--muted-foreground)]">Decision note: {change.decisionNote}</p>}

      {change.status === "pending" && !decided && (
        <div className="space-y-3 pt-1">
          <Field id={`note-${change.id}`} label="Note" hint="Optional when approving; required when rejecting — the developer sees it.">
            <input id={`note-${change.id}`} value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
          </Field>
          {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={() => decide("approve")} disabled={busy !== null}
              className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-60">
              {busy === "approve" ? "Checking and applying…" : "Approve and apply"}
            </button>
            <button type="button" onClick={() => decide("reject")} disabled={busy !== null}
              className="px-4 py-2 border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-60">
              {busy === "reject" ? "Rejecting…" : "Reject"}
            </button>
          </div>
        </div>
      )}

      {decided && (
        <div className="rounded-lg bg-[var(--muted)] p-3 space-y-2" role="status">
          <p className="text-sm text-[var(--foreground)]">
            {decided.status === "approved" ? "Approved — the new boundary is live." : "Rejected — the current boundary stays."}
          </p>
          {decided.publicationBlocked && <p className="text-sm text-amber-800">{decided.blockReason}</p>}
          <ConflictChangesView changes={decided.conflictChanges} />
          <button type="button" onClick={onDecided} className="text-xs text-[var(--accent)] hover:underline">Refresh the list</button>
        </div>
      )}
    </li>
  );
}
