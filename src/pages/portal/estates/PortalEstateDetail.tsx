import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useFetch } from "../../../lib/useFetch";
import { formatAmount } from "../../../data/mockData";
import {
  BOUNDARY_REVIEW_THRESHOLD_PCT, EstateEditError, addEstateBoundary, correctEstateBoundary, fetchBoundaryChanges,
  fetchEstateGeoJson, fetchPortalEstateById, isReadOnlyForScope, withdrawBoundaryChange, type BoundaryChange,
  type EstateBoundaryResult, type GeoJsonPolygon, type PortalScope,
} from "../../../services/portalEstatesService";
import BoundaryField from "../../../components/portal/BoundaryField";
import ConflictChangesView from "../../../components/portal/ConflictChangesView";
import { Field, inputClass } from "../../../components/portal/formParts";
import { canManageEstates } from "../../../services/authService";
import { useApp } from "../../../contexts/AppContext";
import PublicationPanel from "../../../components/portal/PublicationPanel";
import StatusBadge, { boundaryChangeBadge, portalEstateStatusBadge } from "../../../components/StatusBadge";
import EstateBoundaryMap from "../../../components/map/EstateBoundaryMap";
import { usePortalScope } from "../usePortalScope";
import { ownershipLabel, useBranchNames } from "../useBranchNames";
import { ReadOnlyNotice } from "./PortalEstateInventory";

export default function PortalEstateDetail() {
  const { estateId } = useParams<{ estateId: string }>();
  const scope = usePortalScope();
  const { user } = useApp();
  const mayManage = canManageEstates(user);
  const branchNames = useBranchNames(scope);

  const loaded = useFetch(async () => {
    if (!scope || !estateId) return null;
    const [estate, boundary] = await Promise.all([
      fetchPortalEstateById(estateId, scope),
      fetchEstateGeoJson(estateId, scope),
    ]);
    return { estate, boundary };
  }, [scope?.tenantId, scope?.branchId, estateId]);

  const [boundaryResult, setBoundaryResult] = useState<EstateBoundaryResult | null>(null);

  // Only the first load blanks the page — a refetch after adding a boundary
  // keeps its result on screen.
  if (loaded.loading && !loaded.data) return <div className="p-8 text-sm text-[var(--muted-foreground)]">Loading estate…</div>;

  const estate = loaded.data?.estate;
  if (!estate) {
    // Covers both "doesn't exist" and "not in your scope" — deliberately not
    // distinguished, since telling a branch manager an estate exists but
    // isn't theirs leaks the very thing scoping withholds.
    return (
      <div className="p-8">
        <p className="text-sm text-[var(--foreground)] font-medium mb-2">Estate not found.</p>
        <Link to="/portal/estates" className="text-sm text-[var(--accent)] hover:underline">Back to estates</Link>
      </div>
    );
  }

  const badge = portalEstateStatusBadge(estate.status);
  // EB-2: branch staff see a company-level estate but can't change it.
  const readOnly = isReadOnlyForScope(estate, scope);
  const canManage = mayManage && !readOnly;
  const boundary = loaded.data?.boundary ?? null;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link to="/portal/estates" className="text-xs text-[var(--accent)] hover:underline">← Estates</Link>

      <div className="mt-2 mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">{estate.name}</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            {estate.area}, {estate.city}, {estate.state} · {ownershipLabel(estate.branchId, branchNames)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusBadge label={badge.label} variant={badge.variant} />
          {canManage && (
            <Link to={`/portal/estates/${estate.id}/edit`} className="text-xs font-semibold text-[var(--accent)] hover:underline">
              Edit details →
            </Link>
          )}
        </div>
      </div>

      {readOnly && <ReadOnlyNotice />}

      {estate.description && <p className="text-sm text-[var(--foreground)] leading-relaxed mb-6">{estate.description}</p>}

      <PublicationPanel estate={estate} scope={scope!} canManage={canManage} onChanged={loaded.refetch} />

      <section className="mb-8">
        <div className="flex items-center justify-between gap-4 mb-3">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Disclosure</h2>
          <Link to={`/portal/estates/${estate.id}/disclosure`} className="text-xs font-semibold text-[var(--accent)] hover:underline">
            Fees &amp; terms →
          </Link>
        </div>
        <p className="text-sm text-[var(--muted-foreground)]">
          The fee schedule, refund terms and default terms a buyer sees before committing, and a preview of how they read.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Boundary</h2>
        {boundary ? (
          <>
            <EstateBoundaryMap boundary={boundary} label={`${estate.name} boundary on satellite imagery`} />
            <p className="text-xs text-[var(--muted-foreground)] mt-2">
              Check the outline sits over the right ground. A swapped coordinate pair can still fall inside Nigeria, so the imagery is the
              only reliable confirmation.
            </p>
          </>
        ) : (
          // No boundary means no map — never an empty one centred on nothing.
          <>
            <p className="text-sm text-[var(--muted-foreground)] mb-4">
              No boundary yet. An estate can stay a draft until it's surveyed, but it can't be published without one — without a
              boundary it can't be checked against neighbouring land.
            </p>
            {canManage && scope && (
              <AddBoundary estateId={estate.id} scope={scope} onAdded={(result) => { setBoundaryResult(result); loaded.refetch(); }} />
            )}
          </>
        )}
        {boundaryResult && <BoundaryAddedResult result={boundaryResult} />}
        {/* FP-2: correcting a boundary that's already set, and its history. */}
        {boundary && scope && (
          <BoundaryCorrection
            estateId={estate.id}
            published={!!estate.eligibility?.published}
            canManage={canManage}
            scope={scope}
            onApplied={loaded.refetch}
          />
        )}
      </section>

      <section className="mb-8">
        <div className="flex items-center justify-between gap-4 mb-3">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Inventory</h2>
          <Link to={`/portal/estates/${estate.id}/inventory`} className="text-xs font-semibold text-[var(--accent)] hover:underline">
            Manage tiers &amp; plots →
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Total plots" value={estate.totalPlots.toString()} />
          <Stat label="Available" value={estate.availablePlots.toString()} />
          <Stat label="Reserved" value={estate.reservedPlots.toString()} />
          <Stat label="Sold" value={estate.soldPlots.toString()} />
        </div>
        {estate.totalPlots === 0 ? (
          <p className="text-xs text-[var(--muted-foreground)] mt-3">
            No plots yet. Add price tiers, then create plots priced by them.
          </p>
        ) : (
          <p className="text-xs text-[var(--muted-foreground)] mt-3 font-mono-data">
            {formatAmount(estate.priceFrom, estate.currency)} – {formatAmount(estate.priceTo, estate.currency)}
          </p>
        )}
      </section>

      <section>
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Title</h2>
        {/* NOT_CHECKED never renders as verified, and an estate with no title
            record shows none rather than a placeholder. */}
        {estate.titleVerified ? (
          <p className="text-sm text-[var(--foreground)]">{estate.titleType} — verified</p>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">
            No verified title record on file{estate.titleType ? ` (declared as ${estate.titleType})` : ""}. Filing title and verification
            records comes in a later release.
          </p>
        )}
        <p className="text-xs text-[var(--muted-foreground)] mt-3">
          Corner premium: {estate.cornerPremiumPct}%
          {estate.amenities.length > 0 ? ` · ${estate.amenities.join(", ")}` : ""}
        </p>
      </section>
    </div>
  );
}

// POST .../boundary — only for an estate with none. Checked at once against
// every other estate; the result says whether that blocks publication.
function AddBoundary({ estateId, scope, onAdded }: { estateId: string; scope: PortalScope; onAdded: (result: EstateBoundaryResult) => void }) {
  const [polygon, setPolygon] = useState<GeoJsonPolygon | null>(null);
  const [unresolved, setUnresolved] = useState(false);
  const [error, setError] = useState("");
  const [outsideState, setOutsideState] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!polygon) return;
    setSaving(true);
    setError("");
    setOutsideState(false);
    try {
      onAdded(await addEstateBoundary(estateId, polygon, scope));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the boundary.");
      setOutsideState(err instanceof EstateEditError && err.code === "BOUNDARY_OUTSIDE_STATE");
      setSaving(false);
    }
  };

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-[var(--foreground)]">Add a boundary</h3>
      <BoundaryField
        label="Estate boundary"
        intro="A GeoJSON Polygon in [longitude, latitude] order, with the ring closed — the last coordinate repeats the first."
        onChange={(state) => { setPolygon(state.polygon); setUnresolved(state.hasUnresolvedInput); setError(""); }}
      />
      <p className="text-xs text-[var(--muted-foreground)]">
        Once saved it's checked straight away for overlaps with other estates on the platform, and it can't be changed afterwards.
        Any plots that already have shapes must sit inside it.
      </p>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      {/* SB-1. Usually a swapped coordinate pair or the wrong state chosen.
          For a genuinely disputed border, support can verify the state by
          hand — and needs this id to do it. */}
      {outsideState && (
        <p className="text-xs text-[var(--muted-foreground)]">
          Check the coordinates aren't swapped, or correct the estate's state under Edit details. If the land genuinely sits on a
          disputed border, contact support and quote this estate's id: <span className="font-mono-data text-[var(--foreground)] select-all">{estateId}</span>
        </p>
      )}
      <button
        type="button"
        onClick={submit}
        disabled={!polygon || unresolved || saving}
        className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-60"
      >
        {saving ? "Checking and saving…" : "Save boundary"}
      </button>
    </div>
  );
}

// Never names the other company — only whether publication is blocked.
function BoundaryAddedResult({ result }: { result: EstateBoundaryResult }) {
  return (
    <div className="mt-3 space-y-2" role="status">
      <p className="text-sm text-[var(--foreground)]">
        Boundary saved{result.footprintAreaSqm !== null ? ` — ${result.footprintAreaSqm.toLocaleString()} sqm` : ""}.
      </p>
      {result.publicationBlocked ? (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          {result.blockReason ?? "This boundary overlaps land registered by another company."} It can't be published until that's resolved.
        </p>
      ) : (
        <p className="text-sm text-[var(--muted-foreground)]">No overlap with another company's land blocks publication.</p>
      )}
      {result.warningConflictCount > 0 && (
        <p className="text-xs text-[var(--muted-foreground)]">
          It overlaps {result.warningConflictCount} of your own {result.warningConflictCount === 1 ? "estate" : "estates"}. That doesn't block
          publication, but it's worth checking.
        </p>
      )}
      <ConflictChangesView changes={result.conflictChanges} />
    </div>
  );
}

// ─── Correcting a boundary (FP-2) ────────────────────────────────────────────

function BoundaryCorrection({ estateId, published, canManage, scope, onApplied }: {
  estateId: string; published: boolean; canManage: boolean; scope: PortalScope; onApplied: () => void;
}) {
  const history = useFetch(() => fetchBoundaryChanges(estateId, scope), [estateId]);
  const [open, setOpen] = useState(false);
  const [polygon, setPolygon] = useState<GeoJsonPolygon | null>(null);
  const [unresolved, setUnresolved] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<BoundaryChange | null>(null);
  const changes = history.data ?? [];
  const pending = changes.find((c) => c.status === "pending");

  const submit = async () => {
    if (!polygon) return;
    setSaving(true);
    setError(null);
    try {
      const change = await correctEstateBoundary(estateId, polygon, reason, scope);
      setResult(change);
      setOpen(false);
      setReason("");
      history.refetch();
      if (change.status === "applied") onApplied();
    } catch (err) {
      setError(err instanceof EstateEditError ? { field: err.field, message: err.message } : { field: "boundary", message: "Couldn't change the boundary." });
    } finally {
      setSaving(false);
    }
  };

  const withdraw = async (changeId: string) => {
    setError(null);
    try {
      await withdrawBoundaryChange(estateId, changeId, scope);
      setResult(null);
      history.refetch();
    } catch (err) {
      setError({ field: "history", message: err instanceof Error ? err.message : "Couldn't withdraw it." });
    }
  };

  return (
    <div className="mt-4 space-y-4">
      {canManage && !open && !pending && (
        <button type="button" onClick={() => { setOpen(true); setResult(null); }}
          className="px-4 py-2 border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] hover:bg-[var(--muted)]">
          Correct the boundary
        </button>
      )}

      {canManage && open && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Correct the boundary</h3>
          {/* Said before submitting: which corrections wait for a person. */}
          <p className="text-xs text-[var(--muted-foreground)]">
            {published
              ? `This estate is published. A small correction applies at once; if more than ${BOUNDARY_REVIEW_THRESHOLD_PCT}% of its land changes (land added plus land removed), our team reviews it first and the current boundary stays live until then.`
              : "This estate isn't published, so the correction applies at once."}{" "}
            Every plot that already has a shape must still sit inside it.
          </p>
          <BoundaryField
            inputId="correct-boundary"
            label="Corrected boundary"
            intro="A GeoJSON Polygon in [longitude, latitude] order, with the ring closed."
            onChange={(state) => { setPolygon(state.polygon); setUnresolved(state.hasUnresolvedInput); setError(null); }}
          />
          <Field id="correct-reason" label="Why did it change?" hint="Kept in the boundary history and shown to a reviewer."
            error={error?.field === "reason" ? error.message : undefined}>
            <input id="correct-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Re-survey corrected the north-east pillar" className={inputClass} />
          </Field>
          {error && error.field !== "reason" && error.field !== "history" && <p className="text-sm text-red-700" role="alert">{error.message}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={submit} disabled={!polygon || unresolved || saving}
              className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-60">
              {saving ? "Checking…" : "Submit correction"}
            </button>
            <button type="button" onClick={() => { setOpen(false); setError(null); }}
              className="px-4 py-2 border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] hover:bg-[var(--muted)]">Cancel</button>
          </div>
        </div>
      )}

      {result && <CorrectionResult change={result} />}

      {changes.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-2">Boundary history</h3>
          {error?.field === "history" && <p className="text-sm text-red-700 mb-2" role="alert">{error.message}</p>}
          <ul className="space-y-2">
            {changes.map((c) => {
              const badge = boundaryChangeBadge(c.status);
              return (
                <li key={c.id} className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge label={badge.label} variant={badge.variant} />
                    <span className="text-xs text-[var(--muted-foreground)]">{new Date(c.createdAt).toLocaleDateString()}</span>
                    {c.changedPct !== null && <span className="text-xs text-[var(--muted-foreground)] font-mono-data">{c.changedPct}% of the land changed</span>}
                    {canManage && c.status === "pending" && (
                      <button type="button" onClick={() => withdraw(c.id)} className="ml-auto text-xs text-[var(--accent)] hover:underline">Withdraw</button>
                    )}
                  </div>
                  <p className="text-[var(--foreground)]">{c.reason}</p>
                  {c.decisionNote && <p className="text-xs text-[var(--muted-foreground)]">Reviewer: {c.decisionNote}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function CorrectionResult({ change }: { change: BoundaryChange }) {
  if (change.status === "pending") {
    return (
      <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900" role="status">
        Sent for review — {change.changedPct}% of the land changes, over the {BOUNDARY_REVIEW_THRESHOLD_PCT}% that a published estate can change
        without a check. The current boundary stays live until our team decides. You can withdraw it from the history below.
      </div>
    );
  }
  return (
    <div className="rounded-lg bg-[var(--muted)] p-3 space-y-2" role="status">
      <p className="text-sm text-[var(--foreground)]">
        Boundary corrected: {change.previousAreaSqm?.toLocaleString()} → {change.proposedAreaSqm?.toLocaleString()} sqm
        {change.changedPct !== null ? ` (${change.changedPct}% of the land changed)` : ""}.
      </p>
      {change.publicationBlocked && (
        <p className="text-sm text-amber-800">{change.blockReason ?? "It now overlaps another company's land, so the estate is off the marketplace."}</p>
      )}
      <ConflictChangesView changes={change.conflictChanges} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
      <div className="text-xs text-[var(--muted-foreground)] mb-1">{label}</div>
      <div className="font-semibold font-mono-data text-lg text-[var(--foreground)]">{value}</div>
    </div>
  );
}
