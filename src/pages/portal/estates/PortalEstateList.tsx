import { useState } from "react";
import { Link } from "react-router-dom";
import { useFetch } from "../../../lib/useFetch";
import { formatCompactCurrency } from "../../../lib/formatCurrency";
import { fetchPortalEstates, type PortalEstate } from "../../../services/portalEstatesService";
import StatusBadge, { portalEstateStatusBadge } from "../../../components/StatusBadge";
import EmptyState from "../../../components/marketplace/EmptyState";
import { usePortalScope } from "../usePortalScope";
import { useApp } from "../../../contexts/AppContext";

const PAGE_SIZE = 20;

export default function PortalEstateList() {
  const scope = usePortalScope();
  const { user } = useApp();
  const [query, setQuery] = useState("");

  const estates = useFetch(async () => {
    if (!scope) return null;
    // Whatever the API returns IS the list. No second filter is applied here:
    // re-filtering client-side would either duplicate RLS or quietly disagree
    // with it, and a wrongly-scoped list just looks shorter than expected.
    return fetchPortalEstates(scope, { query: query.trim() || undefined }, { limit: PAGE_SIZE });
  }, [scope?.tenantId, scope?.branchId, query]);

  if (!scope) {
    return <div className="p-8 text-sm text-[var(--muted-foreground)]">This account isn't linked to a company.</div>;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">Estates</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            {/* Says whose estates these are, so a short list reads as a scope
                rather than as missing data. */}
            {scope.branchId ? `Managed by your branch — ${user?.name}.` : "Every estate across your company's branches."}
          </p>
        </div>
        <Link
          to="/portal/estates/new"
          className="shrink-0 px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 transition-opacity"
        >
          New estate
        </Link>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name, area or city"
        aria-label="Search estates"
        className="w-full mb-5 px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--accent)]"
      />

      {estates.loading && <div className="text-sm text-[var(--muted-foreground)]">Loading estates…</div>}

      {!estates.loading && estates.error && (
        <div className="text-center py-10">
          <p className="text-sm font-medium text-[var(--foreground)] mb-2">Couldn't load your estates.</p>
          <button onClick={estates.refetch} className="text-sm text-[var(--accent)] hover:underline">Try again</button>
        </div>
      )}

      {!estates.loading && !estates.error && estates.data?.items.length === 0 && (
        <EmptyState
          title={query ? "No estates match that search" : "No estates yet"}
          description={query ? "Try a different name, area or city." : "Create your first estate to start building its inventory."}
          action={!query ? <Link to="/portal/estates/new" className="inline-block px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90">Create an estate</Link> : undefined}
        />
      )}

      {!estates.loading && !estates.error && (estates.data?.items.length ?? 0) > 0 && (
        <>
          <div className="space-y-3">
            {estates.data!.items.map((estate) => <EstateRow key={estate.id} estate={estate} />)}
          </div>
          <p className="text-xs text-[var(--muted-foreground)] mt-4">
            Showing {estates.data!.items.length} of {estates.data!.total}.
          </p>
        </>
      )}
    </div>
  );
}

function EstateRow({ estate }: { estate: PortalEstate }) {
  const badge = portalEstateStatusBadge(estate.status);

  return (
    <Link
      to={`/portal/estates/${estate.id}`}
      className="block bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 hover:border-[var(--accent)]/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-4 mb-2">
        <div className="min-w-0">
          <div className="font-semibold text-[var(--foreground)]">{estate.name}</div>
          <div className="text-xs text-[var(--muted-foreground)]">
            {estate.area}, {estate.city}, {estate.state} · {estate.branchId} branch
          </div>
        </div>
        <StatusBadge label={badge.label} variant={badge.variant} />
      </div>

      {/* Counts and prices arrive computed — displayed, never re-derived. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)]">
        <span>{estate.totalPlots} plots</span>
        <span>·</span>
        <span>{estate.availablePlots} available</span>
        <span>·</span>
        <span>{estate.reservedPlots} reserved</span>
        <span>·</span>
        <span>{estate.soldPlots} sold</span>
        {estate.priceTo > 0 && (
          <>
            <span>·</span>
            <span className="font-mono-data">
              {formatCompactCurrency(estate.priceFrom, estate.currency)}–{formatCompactCurrency(estate.priceTo, estate.currency)}
            </span>
          </>
        )}
      </div>

      {/* Never "cannot publish" on its own: naming the failing condition is
          the difference between a next step and a support ticket. */}
      {estate.blockingReasons.length > 0 && estate.status !== "published" && (
        <ul className="mt-3 pt-3 border-t border-[var(--border)] space-y-1">
          {estate.blockingReasons.map((reason) => (
            <li key={reason} className="text-xs text-amber-700">Cannot publish — {reason.toLowerCase()}</li>
          ))}
        </ul>
      )}
    </Link>
  );
}
