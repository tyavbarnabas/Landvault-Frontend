// /portal/estates — every estate the caller's scope reaches, from the Figma
// portal proposal: tabs by marketplace status over a table of estate, status,
// plots and a sales bar (one card per estate on a phone).

import { useState } from "react";
import LoadError from "../../../components/LoadError";
import { Link } from "react-router-dom";
import { useFetch } from "../../../lib/useFetch";
import { estatePlace, fetchPortalEstates, type PortalEstate } from "../../../services/portalEstatesService";
import StatusBadge, { portalEstateStatusBadge } from "../../../components/StatusBadge";
import EmptyState from "../../../components/ui/EmptyState";
import Card from "../../../components/ui/Card";
import Page, { Loading } from "../../../components/ui/Page";
import { LinkButton } from "../../../components/ui/Button";
import TabBar from "../../../components/ui/Tabs";
import SalesBar from "../../../components/portal/SalesBar";
import { ChevronRightIcon, SearchIcon } from "../../../components/icons";
import { usePortalScope } from "../usePortalScope";
import { useApp } from "../../../contexts/AppContext";
import { canManageEstates } from "../../../services/authService";
import { ownershipLabel, useBranchNames } from "../useBranchNames";

// The list endpoint's largest page: enough to count the tabs from one load.
const PAGE_SIZE = 100;

type Tab = "all" | "live" | "not_live" | "not_published";
const TAB_LABEL: Record<Tab, string> = { all: "All", live: "Live", not_live: "Published, not live", not_published: "Not published" };

function tabOf(e: PortalEstate): Tab | null {
  if (!e.published) return "not_published";
  if (e.status === "published") return "live";
  if (e.status === "published_not_live") return "not_live";
  return null; // published, but the marketplace couldn't be asked
}

const ROW_GRID = "sm:grid sm:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_0.5fr_minmax(0,1.8fr)_16px] sm:items-center sm:gap-4";

export default function PortalEstateList() {
  const scope = usePortalScope();
  const { user } = useApp();
  const branchNames = useBranchNames(scope);
  // Creating an estate needs portal.estates.manage — which a branch manager
  // doesn't hold (only the director and the surveyor do).
  const canCreate = canManageEstates(user);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("all");

  const estates = useFetch(async () => {
    if (!scope) return null;
    // Whatever the API returns IS the list. No second filter is applied here:
    // re-filtering client-side would either duplicate RLS or quietly disagree
    // with it, and a wrongly-scoped list just looks shorter than expected.
    return fetchPortalEstates(scope, { query: query.trim() || undefined }, { limit: PAGE_SIZE });
  }, [scope?.tenantId, scope?.branchId, query]);

  if (!scope) {
    return <Page title="Estates"><p className="text-sm text-[var(--muted-foreground)]">This account isn't linked to a company.</p></Page>;
  }

  const items = estates.data?.items ?? [];
  const complete = !estates.data?.hasMore;
  const count = (t: Tab) => (t === "all" ? estates.data?.total ?? 0 : items.filter((e) => tabOf(e) === t).length);
  const tabs = (Object.keys(TAB_LABEL) as Tab[]).map((id) => ({ id, label: items.length && (complete || id === "all") ? `${TAB_LABEL[id]} ${count(id)}` : TAB_LABEL[id] }));
  const shown = tab === "all" ? items : items.filter((e) => tabOf(e) === tab);

  return (
    <Page title="Estates"
      // Says whose estates these are, so a short list reads as a scope
      // rather than as missing data.
      description={scope.branchId
        ? `Your branch's estates${branchNames[scope.branchId] ? ` (${branchNames[scope.branchId]})` : ""}, and the company's own.`
        : "Every estate across your company — its branches' and its own."}
      actions={canCreate ? <LinkButton to="/portal/estates/new">New estate</LinkButton> : undefined}>
      <div className="flex flex-col-reverse lg:flex-row lg:items-end lg:justify-between gap-3 border-b border-[var(--border)] mb-5">
        <div className="min-w-0 -mb-px"><TabBar tabs={tabs} active={tab} onActivate={setTab} ariaLabel="Filter estates" /></div>
        <label className="relative block lg:w-72 lg:mb-2">
          <span className="sr-only">Search estates</span>
          <SearchIcon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, area or city"
            className="w-full pl-9 pr-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm" />
        </label>
      </div>

      {estates.loading && <Loading label="Loading estates…" />}
      {!estates.loading && estates.error && <LoadError error={estates.errorValue} what="your estates" onRetry={estates.refetch} />}

      {!estates.loading && !estates.error && items.length === 0 && (
        <Card padding="sm">
          <EmptyState
            title={query ? "No estates match that search" : "No estates yet"}
            description={query ? "Try a different name, area or city." : "Create your first estate to start building its inventory."}
            action={!query && canCreate ? <LinkButton to="/portal/estates/new">Create an estate</LinkButton> : undefined}
          />
        </Card>
      )}

      {!estates.loading && !estates.error && items.length > 0 && (
        <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
          {shown.length === 0 ? (
            <Card><p className="text-sm text-[var(--muted-foreground)]">No estate is {TAB_LABEL[tab].toLowerCase()}.</p></Card>
          ) : (
            <Card padding="none" className="overflow-hidden">
              <div aria-hidden="true" className={`hidden ${ROW_GRID} bg-[var(--muted)] px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]`}>
                <span>Estate</span><span>Status</span><span>Plots</span><span>Sales</span><span />
              </div>
              <ul className="divide-y divide-[var(--border)]">
                {shown.map((estate) => <EstateRow key={estate.id} estate={estate} branchNames={branchNames} />)}
              </ul>
            </Card>
          )}
          <p className="text-sm text-[var(--muted-foreground)] mt-4">
            {complete ? `Showing all ${estates.data!.total} estate${estates.data!.total === 1 ? "" : "s"}` : `Showing ${items.length} of ${estates.data!.total} — search to narrow the list.`}
          </p>
        </div>
      )}
    </Page>
  );
}

function EstateRow({ estate, branchNames }: { estate: PortalEstate; branchNames: Record<string, string> }) {
  const badge = portalEstateStatusBadge(estate.status);
  return (
    <li>
      <Link to={`/portal/estates/${estate.id}`} className={`group block px-4 sm:px-5 py-3.5 hover:bg-[var(--muted)]/50 transition-colors ${ROW_GRID}`}>
        <div className="flex items-start justify-between gap-3 min-w-0">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[var(--foreground)] group-hover:underline truncate">{estate.name}</div>
            <div className="text-xs text-[var(--muted-foreground)] truncate">{[estatePlace(estate), ownershipLabel(estate.branchId, branchNames)].filter(Boolean).join(" · ")}</div>
            {/* Never "cannot publish" on its own: naming the failing condition is
                the difference between a next step and a support ticket. */}
            {estate.blockingReasons.length > 0 && estate.status !== "published" && (
              <div className="text-xs text-[var(--warning-text)] mt-1">
                {estate.status === "published_not_live" ? "Not live" : "Cannot publish"} — {estate.blockingReasons.map((r) => r.toLowerCase()).join("; ")}
              </div>
            )}
          </div>
          <span className="sm:hidden shrink-0"><StatusBadge label={badge.label} variant={badge.variant} /></span>
        </div>
        <div className="hidden sm:block"><StatusBadge label={badge.label} variant={badge.variant} /></div>
        {/* Counts arrive computed — displayed, never re-derived. */}
        <div className="hidden sm:block text-sm font-mono-data text-[var(--foreground)]">{estate.totalPlots}</div>
        <div className="mt-2.5 sm:mt-0 min-w-0">
          {estate.totalPlots > 0 ? (
            <>
              <SalesBar estate={estate} />
              <div className="text-xs text-[var(--muted-foreground)] mt-1.5">
                <span className="sm:hidden">{estate.totalPlots} plot{estate.totalPlots === 1 ? "" : "s"} · </span>{estate.soldPlots} sold · {estate.reservedPlots} reserved · {estate.availablePlots} available
              </div>
            </>
          ) : <span className="text-xs text-[var(--muted-foreground)]">No plots yet</span>}
        </div>
        <ChevronRightIcon size={16} className="hidden sm:block text-[var(--muted-foreground)]" />
      </Link>
    </li>
  );
}
