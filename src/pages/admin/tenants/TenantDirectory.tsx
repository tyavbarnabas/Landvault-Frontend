// SA-1.5 — tenant directory with health signals, searchable and filterable.
import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fetchTenants, tenantDisplayName, type Tenant, type VerificationState, type TenantPlan } from "../../../services/tenantsService";
import StatusBadge, { verificationStateBadge } from "../../../components/StatusBadge";
import type { NigerianState } from "../../../data/nigerianStates";

const VALID_VERIFICATION_STATES: VerificationState[] = ["created", "documents_submitted", "under_review", "verified", "rejected", "suspended"];

export default function TenantDirectory() {
  const [searchParams] = useSearchParams();
  const statusParam = searchParams.get("status");
  const initialVerificationFilter: VerificationState | "all" = VALID_VERIFICATION_STATES.includes(statusParam as VerificationState) ? (statusParam as VerificationState) : "all";

  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [verificationFilter, setVerificationFilter] = useState<VerificationState | "all">(initialVerificationFilter);
  const [planFilter, setPlanFilter] = useState<TenantPlan | "all">("all");
  const [stateFilter, setStateFilter] = useState<NigerianState | "all">("all");
  const [submittedAfter, setSubmittedAfter] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchTenants().then((data) => { if (!cancelled) { setTenants(data); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="p-8 text-[var(--muted-foreground)] text-sm">Loading tenants…</div>;

  const allStates = Array.from(new Set(tenants.flatMap((t) => t.identity.statesOfOperation))).sort();

  const filtered = tenants.filter((t) => {
    const name = tenantDisplayName(t).toLowerCase();
    const matchesQuery = name.includes(query.toLowerCase()) || t.primaryContact.workEmail.toLowerCase().includes(query.toLowerCase());
    const matchesVerification = verificationFilter === "all" || t.verificationState === verificationFilter;
    const matchesPlan = planFilter === "all" || t.plan === planFilter;
    const matchesState = stateFilter === "all" || t.identity.statesOfOperation.includes(stateFilter);
    const matchesSubmitted = !submittedAfter || t.createdDate >= submittedAfter;
    return matchesQuery && matchesVerification && matchesPlan && matchesState && matchesSubmitted;
  });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">Tenants</h1>
          <p className="text-sm text-[var(--muted-foreground)]">Every company operating on LandVault. Isolated from each other — this view is the only place they're seen together.</p>
        </div>
        <Link to="/admin/tenants/new" className="shrink-0 px-4 py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
          + Onboard company
        </Link>
      </div>

      <div className="flex flex-wrap gap-3 mb-5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or contact email…"
          className="flex-1 min-w-[220px] px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]"
        />
        <select value={verificationFilter} onChange={(e) => setVerificationFilter(e.target.value as VerificationState | "all")} className="px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm cursor-pointer">
          <option value="all">All verification states</option>
          <option value="created">Created</option>
          <option value="documents_submitted">Documents submitted</option>
          <option value="under_review">Under review</option>
          <option value="verified">Verified</option>
          <option value="rejected">Rejected</option>
          <option value="suspended">Verification suspended</option>
        </select>
        <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value as TenantPlan | "all")} className="px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm cursor-pointer">
          <option value="all">All plans</option>
          <option value="starter">Starter</option>
          <option value="growth">Growth</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value as NigerianState | "all")} className="px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm cursor-pointer">
          <option value="all">All states of operation</option>
          {allStates.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input
          type="date"
          value={submittedAfter}
          onChange={(e) => setSubmittedAfter(e.target.value)}
          title="Submitted on or after"
          className="px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm text-[var(--foreground)]"
        />
      </div>

      <div className="space-y-3">
        {filtered.map((t) => {
          const estateCount = t.branches.reduce((s, b) => s + b.estateCount, 0);
          const verBadge = verificationStateBadge(t.verificationState);
          return (
            <Link
              key={t.id}
              to={`/admin/tenants/${t.id}`}
              className="block bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 hover:border-[var(--accent)]/50 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="font-semibold text-[var(--foreground)] mb-1">{tenantDisplayName(t)}</div>
                  <div className="text-xs text-[var(--muted-foreground)]">{t.primaryContact.fullName} · {t.primaryContact.workEmail}</div>
                </div>
                <StatusBadge label={verBadge.label} variant={verBadge.variant} />
              </div>

              <div className="flex flex-wrap gap-4 mt-4 text-xs text-[var(--muted-foreground)]">
                <span className="capitalize font-medium text-[var(--foreground)]">{t.plan} plan</span>
                <span>·</span>
                <span>{t.identity.statesOfOperation.join(", ") || "No states listed"}</span>
                <span>·</span>
                <span>{t.branches.length} {t.branches.length === 1 ? "branch" : "branches"}</span>
                <span>·</span>
                <span>{estateCount} {estateCount === 1 ? "estate" : "estates"}</span>
                <span>·</span>
                <span className="font-mono-data">Submitted {t.createdDate}</span>
                {t.status === "suspended" && (
                  <>
                    <span>·</span>
                    <span className="text-red-600 font-medium">Account suspended</span>
                  </>
                )}
              </div>
            </Link>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-16 text-sm text-[var(--muted-foreground)]">No tenants match your filters.</div>
        )}
      </div>
    </div>
  );
}
