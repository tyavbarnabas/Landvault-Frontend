// A company's own branches (FB-1, FB-2). Creating and renaming are for
// company-wide staff only: a branch manager able to create a sibling branch
// and assign themselves would widen their own reach. The route is gated on
// portal.branches.manage, and the backend refuses a branch-scoped caller
// regardless.

import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useFetch } from "../../../lib/useFetch";
import { NIGERIAN_STATES } from "../../../data/nigerianStates";
import { BranchError, createBranch, fetchBranches, updateBranch, type BranchInput, type PortalBranch } from "../../../services/branchesService";
import { Field, inputClass } from "../../../components/portal/formParts";
import EmptyState from "../../../components/marketplace/EmptyState";
import { usePortalScope } from "../usePortalScope";

export default function PortalBranches() {
  const scope = usePortalScope();
  const branches = useFetch(async () => (scope ? fetchBranches(scope) : []), [scope?.tenantId, scope?.branchId]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Set by the New branch page on its way back, so the new one is pointed out.
  const created = (useLocation().state as { created?: string } | null)?.created;

  if (!scope) return <div className="p-8 text-sm text-[var(--muted-foreground)]">This account isn't linked to a company.</div>;
  if (branches.loading && !branches.data) return <div className="p-8 text-sm text-[var(--muted-foreground)]">Loading branches…</div>;

  const all = branches.data ?? [];
  // Search only once the list is long enough to need it.
  const searchable = all.length > 10;
  const q = query.trim().toLowerCase();
  const list = q ? all.filter((b) => `${b.name} ${b.city ?? ""} ${b.state ?? ""}`.toLowerCase().includes(q)) : all;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* The action sits beside the heading, as on Estates — never below a
          list that may run to fifty rows. */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">Branches</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            How your company is organised is up to you. Each branch's staff see only that branch's estates, plus the company's own.
          </p>
        </div>
        <Link to="/portal/branches/new" className="shrink-0 px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90">
          New branch
        </Link>
      </div>

      {created && <p className="text-sm text-[var(--muted-foreground)] mb-4" role="status">Branch "{created}" added.</p>}

      {searchable && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, city or state"
          aria-label="Search branches"
          className={`${inputClass} mb-4`}
        />
      )}

      {all.length === 0 ? (
        // Never an invented "Head Office": no branches is a real, valid state.
        <EmptyState title="No branches yet" description="A single-office company doesn't need any — estates can belong to the company itself." />
      ) : list.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">No branches match "{query}".</p>
      ) : (
        <ul className="space-y-3">
          {list.map((branch) => (
            <li key={branch.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 min-h-28">
              {editingId === branch.id ? (
                <BranchForm
                  initial={branch}
                  submitLabel="Save changes"
                  onCancel={() => setEditingId(null)}
                  onSubmit={async (input) => { await updateBranch(branch.id, input, scope); setEditingId(null); branches.refetch(); }}
                />
              ) : (
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <div className="font-semibold text-[var(--foreground)]">{branch.name}</div>
                    <OfficeLine branch={branch} />
                  </div>
                  <button type="button" onClick={() => setEditingId(branch.id)} className="text-sm text-[var(--accent)] hover:underline">Edit</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

    </div>
  );
}

// /portal/branches/new — its own page, like New estate.
export function NewPortalBranch() {
  const scope = usePortalScope();
  const navigate = useNavigate();
  if (!scope) return <div className="p-8 text-sm text-[var(--muted-foreground)]">This account isn't linked to a company.</div>;
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Link to="/portal/branches" className="text-xs text-[var(--accent)] hover:underline">← Branches</Link>
      <h1 className="font-display text-3xl text-[var(--foreground)] mt-2 mb-1">New branch</h1>
      <p className="text-sm text-[var(--muted-foreground)] mb-6">
        A branch's staff see only its estates, plus the company's own.
      </p>
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
        <BranchForm
          submitLabel="Add branch"
          onCancel={() => navigate("/portal/branches")}
          onSubmit={async (input) => {
            const branch = await createBranch(input, scope);
            navigate("/portal/branches", { state: { created: branch.name } });
          }}
        />
      </div>
    </div>
  );
}

function OfficeLine({ branch }: { branch: PortalBranch }) {
  const address = [branch.street, branch.city, branch.state].filter(Boolean).join(", ");
  const parts = [address, branch.phone, branch.email].filter(Boolean);
  return (
    <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
      {parts.length > 0 ? parts.join(" · ") : "No office details — none shown on listings."}
    </div>
  );
}

function BranchForm({ initial, submitLabel, onSubmit, onCancel }: {
  initial?: PortalBranch; submitLabel: string; onSubmit: (input: BranchInput) => Promise<void>; onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [street, setStreet] = useState(initial?.street ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [state, setState] = useState(initial?.state ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const id = initial?.id ?? "new";
  const errorFor = (field: string) => (error?.field === field ? error.message : undefined);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ name, street, city, state: state as BranchInput["state"], phone, email });
    } catch (err) {
      setError(err instanceof BranchError ? { field: err.field, message: err.message } : { field: "form", message: "Couldn't save the branch." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field id={`branch-name-${id}`} label="Branch name" error={errorFor("name")} hint="Unique within your company.">
        <input id={`branch-name-${id}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="Double King" className={inputClass} />
      </Field>
      <p className="text-xs text-[var(--muted-foreground)]">
        Office details are optional and <span className="font-medium text-[var(--foreground)]">shown publicly</span> on this branch's listings,
        so buyers know where to find you.
      </p>
      <Field id={`branch-street-${id}`} label="Street address" error={errorFor("street")}>
        <input id={`branch-street-${id}`} value={street} onChange={(e) => setStreet(e.target.value)} className={inputClass} />
      </Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field id={`branch-city-${id}`} label="City" error={errorFor("city")}>
          <input id={`branch-city-${id}`} value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
        </Field>
        <Field id={`branch-state-${id}`} label="State" error={errorFor("state")}>
          <select id={`branch-state-${id}`} value={state} onChange={(e) => setState(e.target.value)} className={inputClass}>
            <option value="">—</option>
            {NIGERIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field id={`branch-phone-${id}`} label="Office phone" error={errorFor("phone")}>
          <input id={`branch-phone-${id}`} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+234 …" className={inputClass} />
        </Field>
        <Field id={`branch-email-${id}`} label="Office email" error={errorFor("email")}>
          <input id={`branch-email-${id}`} type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>
      </div>
      {error?.field === "form" && <p className="text-sm text-red-700" role="alert">{error.message}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-60">
          {saving ? "Saving…" : submitLabel}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="px-4 py-2 border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] hover:bg-[var(--muted)]">Cancel</button>
        )}
      </div>
    </form>
  );
}
