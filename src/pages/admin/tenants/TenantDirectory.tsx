// SA-1.5 — tenant directory, from the Figma console proposal: tabs by where
// verification stands (with counts), plan and state filters plus search, and
// a table of company, status, plan, states, branches and when it was submitted.
import { useState, useEffect } from "react";
import LoadError from "../../../components/LoadError";
import { Link, useSearchParams } from "react-router-dom";
import { fetchTenants, type TenantSummary, type VerificationState, type TenantPlan } from "../../../services/tenantsService";
import StatusBadge, { verificationStateBadge } from "../../../components/StatusBadge";
import Card from "../../../components/ui/Card";
import Page, { Loading } from "../../../components/ui/Page";
import Button, { LinkButton } from "../../../components/ui/Button";
import TabBar from "../../../components/ui/Tabs";
import EmptyState from "../../../components/ui/EmptyState";
import { Input, Select } from "../../../components/ui/Field";
import { ChevronRightIcon, SearchIcon } from "../../../components/icons";
import { formatDay } from "../../../lib/formatDate";
import type { NigerianState } from "../../../data/nigerianStates";

const VALID_VERIFICATION_STATES: VerificationState[] = ["created", "documents_submitted", "under_review", "verified", "rejected", "suspended"];

// Tabs over the verification filter. "To verify" is both pre-decision states;
// "Suspended" is the ACCOUNT (staff and listings blocked), not verification.
type Tab = "all" | "to_verify" | "verified" | "suspended" | "rejected";
const TAB_LABEL: Record<Tab, string> = { all: "All", to_verify: "To verify", verified: "Verified", suspended: "Suspended", rejected: "Rejected" };
const TAB_STATES: Record<Tab, VerificationState[] | undefined> = {
  all: undefined, to_verify: ["documents_submitted", "under_review"], verified: ["verified"], suspended: undefined, rejected: ["rejected"],
};
function inTab(t: TenantSummary, tab: Tab): boolean {
  if (tab === "suspended") return t.status === "suspended";
  const states = TAB_STATES[tab];
  return !states || states.includes(t.verificationState);
}

export default function TenantDirectory() {
  const [searchParams] = useSearchParams();
  const statusParam = searchParams.get("status");
  // An old link's ?status= still lands on the matching tab.
  const initialTab: Tab = statusParam === "under_review" || statusParam === "documents_submitted" ? "to_verify"
    : statusParam === "verified" || statusParam === "rejected" ? statusParam
      : statusParam === "suspended" ? "suspended" : VALID_VERIFICATION_STATES.includes(statusParam as VerificationState) ? "all" : "all";

  const [tenants, setTenants] = useState<TenantSummary[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>(initialTab);
  const [planFilter, setPlanFilter] = useState<TenantPlan | "all">("all");
  const [stateFilter, setStateFilter] = useState<NigerianState | "all">("all");
  const [submittedAfter, setSubmittedAfter] = useState("");
  // The "states of operation" dropdown lists every state seen across the
  // unfiltered directory — fetched once, separately from the filtered/paged
  // list below, so narrowing other filters doesn't shrink this dropdown's
  // own options.
  const [allStates, setAllStates] = useState<string[]>([]);
  // The whole directory, unfiltered, for the tab counts and the states list.
  const [everyone, setEveryone] = useState<TenantSummary[] | null>(null);

  const filters = { query: query || undefined, verificationState: TAB_STATES[tab], plan: planFilter === "all" ? undefined : planFilter, state: stateFilter === "all" ? undefined : stateFilter, submittedAfter: submittedAfter || undefined };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    // A failure says what failed, instead of leaving "Loading…" up forever.
    fetchTenants(filters).catch((err) => { if (!cancelled) { setLoadError(err); setLoading(false); } return null; }).then((page) => {
      if (cancelled || !page) return;
      setTenants(page.items);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
      setLoading(false);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, tab, planFilter, stateFilter, submittedAfter]);

  useEffect(() => {
    let cancelled = false;
    fetchTenants({}, { limit: 10_000 }).then((page) => {
      if (cancelled) return;
      setAllStates(Array.from(new Set(page.items.flatMap((t) => t.statesOfOperation))).sort());
      setEveryone(page.items);
    });
    return () => { cancelled = true; };
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    const page = await fetchTenants(filters, { cursor });
    setTenants((prev) => [...prev, ...page.items]);
    setCursor(page.cursor);
    setHasMore(page.hasMore);
    setLoadingMore(false);
  };

  if (loadError) return <LoadError error={loadError} what="the tenant directory" onRetry={() => window.location.reload()} />;

  const tabs = (Object.keys(TAB_LABEL) as Tab[]).map((id) => ({ id, label: everyone ? `${TAB_LABEL[id]} ${everyone.filter((t) => inTab(t, id)).length}` : TAB_LABEL[id] }));
  // The account-suspended tab has no server filter: it narrows what was loaded.
  const shown = tab === "suspended" ? tenants.filter((t) => t.status === "suspended") : tenants;

  return (
    <Page title="Tenants" description="Every company operating on HomeTrue. Isolated from each other — this view is the only place they're seen together."
      actions={<LinkButton to="/admin/tenants/new">Onboard company</LinkButton>}>
      <div className="flex flex-col-reverse xl:flex-row xl:items-end xl:justify-between gap-3 border-b border-[var(--border)] mb-5">
        <div className="min-w-0 -mb-px"><TabBar tabs={tabs} active={tab} onActivate={setTab} ariaLabel="Filter tenants" /></div>
        <div className="flex flex-wrap gap-2 xl:mb-2">
          <Select inputSize="sm" className="w-auto" aria-label="Filter by plan" value={planFilter} onChange={(e) => setPlanFilter(e.target.value as TenantPlan | "all")}>
            <option value="all">All plans</option>
            <option value="starter">Starter</option>
            <option value="growth">Growth</option>
            <option value="enterprise">Enterprise</option>
          </Select>
          <Select inputSize="sm" className="w-auto" aria-label="Filter by state of operation" value={stateFilter} onChange={(e) => setStateFilter(e.target.value as NigerianState | "all")}>
            <option value="all">All states</option>
            {allStates.map((st) => <option key={st} value={st}>{st}</option>)}
          </Select>
          <Input inputSize="sm" type="date" className="w-auto" value={submittedAfter} onChange={(e) => setSubmittedAfter(e.target.value)} aria-label="Submitted on or after" title="Submitted on or after" />
          <label className="relative">
            <span className="sr-only">Search companies</span>
            <SearchIcon size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <Input inputSize="sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or email" className="pl-8 w-52" />
          </label>
        </div>
      </div>

      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="space-y-3">
        {loading ? <Loading label="Loading tenants…" /> : shown.length === 0 ? (
          <Card padding="sm"><EmptyState title="No tenants match" description="Try another tab or clear a filter." /></Card>
        ) : (
          <Card padding="none" className="overflow-hidden">
            <div aria-hidden="true" className={`hidden ${ROW_GRID} bg-[var(--muted)] px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]`}>
              <span>Company</span><span>Status</span><span>Plan</span><span>Operates in</span><span>Branches</span><span>Submitted</span><span />
            </div>
            <ul className="divide-y divide-[var(--border)]">
              {shown.map((t) => <TenantRow key={t.id} tenant={t} />)}
            </ul>
          </Card>
        )}
        {hasMore && (
          <Button variant="secondary" size="lg" fullWidth onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more"}</Button>
        )}
      </div>
    </Page>
  );
}

const ROW_GRID = "lg:grid lg:grid-cols-[minmax(0,2.4fr)_minmax(0,1.4fr)_6rem_minmax(0,1.3fr)_5rem_7rem_16px] lg:items-center lg:gap-4";

function TenantRow({ tenant: t }: { tenant: TenantSummary }) {
  const verBadge = verificationStateBadge(t.verificationState);
  const initials = t.displayName.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <li>
      <Link to={`/admin/tenants/${t.id}`} className={`group block px-4 sm:px-5 py-3.5 hover:bg-[var(--muted)]/50 transition-colors ${ROW_GRID}`}>
        <div className="flex items-center gap-3 min-w-0">
          <span aria-hidden="true" className="w-9 h-9 shrink-0 rounded-lg bg-[var(--secondary)] text-[var(--secondary-foreground)] flex items-center justify-center text-xs font-semibold">{initials}</span>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-[var(--foreground)] group-hover:underline truncate">{t.displayName}</div>
            <div className="text-xs text-[var(--muted-foreground)] truncate">{[t.primaryContactName, t.primaryContactEmail].filter(Boolean).join(" · ")}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2 lg:mt-0 pl-12 lg:pl-0">
          <StatusBadge label={verBadge.label} variant={verBadge.variant} />
          {t.status === "suspended" && <StatusBadge label="Account suspended" variant="error" />}
        </div>
        <div className="text-sm text-[var(--foreground)] capitalize pl-12 lg:pl-0 mt-1 lg:mt-0">{t.plan}<span className="lg:hidden normal-case text-[var(--muted-foreground)]"> plan · {t.statesOfOperation.join(", ") || "no states listed"} · {t.branchCount} branch{t.branchCount === 1 ? "" : "es"}</span></div>
        <div className="hidden lg:block text-sm text-[var(--foreground)] truncate">{t.statesOfOperation.join(", ") || "—"}</div>
        <div className="hidden lg:block text-sm font-mono-data text-[var(--foreground)]">{t.branchCount}</div>
        <div className="hidden lg:block text-sm text-[var(--muted-foreground)]">{formatDay(t.createdDate)}</div>
        <ChevronRightIcon size={16} className="hidden lg:block text-[var(--muted-foreground)]" />
      </Link>
    </li>
  );
}
