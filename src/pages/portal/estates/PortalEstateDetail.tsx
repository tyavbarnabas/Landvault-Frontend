import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useFetch } from "../../../lib/useFetch";
import { formatAmount } from "../../../data/mockData";
import {
  EstateEditError, addEstateBoundary, fetchEstateGeoJson, fetchPortalEstateById,
  type EstateBoundaryResult, type GeoJsonPolygon, type PortalScope,
} from "../../../services/portalEstatesService";
import BoundaryField from "../../../components/portal/BoundaryField";
import { canManageEstates } from "../../../services/authService";
import { useApp } from "../../../contexts/AppContext";
import PublicationPanel from "../../../components/portal/PublicationPanel";
import StatusBadge, { portalEstateStatusBadge } from "../../../components/StatusBadge";
import EstateBoundaryMap from "../../../components/map/EstateBoundaryMap";
import { usePortalScope } from "../usePortalScope";

export default function PortalEstateDetail() {
  const { estateId } = useParams<{ estateId: string }>();
  const scope = usePortalScope();
  const { user } = useApp();
  const canManage = canManageEstates(user);

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
  const boundary = loaded.data?.boundary ?? null;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link to="/portal/estates" className="text-xs text-[var(--accent)] hover:underline">← Estates</Link>

      <div className="mt-2 mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">{estate.name}</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            {estate.area}, {estate.city}, {estate.state} · {estate.branchId} branch
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
        {boundary && canManage && !boundaryResult && (
          <p className="text-xs text-[var(--muted-foreground)] mt-2">Changing a boundary once it's set isn't supported.</p>
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
