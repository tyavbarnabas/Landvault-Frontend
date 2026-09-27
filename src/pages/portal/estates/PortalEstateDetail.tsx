import { useParams, Link } from "react-router-dom";
import { useFetch } from "../../../lib/useFetch";
import { formatAmount } from "../../../data/mockData";
import { fetchEstateGeoJson, fetchPortalEstateById } from "../../../services/portalEstatesService";
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

  if (loaded.loading) return <div className="p-8 text-sm text-[var(--muted-foreground)]">Loading estate…</div>;

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
        <StatusBadge label={badge.label} variant={badge.variant} />
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
          <p className="text-sm text-[var(--muted-foreground)]">
            No boundary has been submitted yet. An estate can stay a draft until it's surveyed.
          </p>
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
      <div className="text-xs text-[var(--muted-foreground)] mb-1">{label}</div>
      <div className="font-semibold font-mono-data text-lg text-[var(--foreground)]">{value}</div>
    </div>
  );
}
