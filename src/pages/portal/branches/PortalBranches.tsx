// A company's own branches (FB-1, FB-2). Creating and renaming are for
// company-wide staff only: a branch manager able to create a sibling branch
// and assign themselves would widen their own reach. The route is gated on
// portal.branches.manage, and the backend refuses a branch-scoped caller
// regardless.

import { useState } from "react";
import LoadError from "../../../components/LoadError";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useFetch } from "../../../lib/useFetch";
import { NIGERIAN_STATES } from "../../../data/nigerianStates";
import { BranchError, createBranch, fetchBranches, updateBranch, type BranchInput, type PortalBranch } from "../../../services/branchesService";
import { Field, inputClass } from "../../../components/portal/formParts";
import EmptyState from "../../../components/ui/EmptyState";
import Card from "../../../components/ui/Card";
import Page, { Loading } from "../../../components/ui/Page";
import Button, { LinkButton } from "../../../components/ui/Button";
import Alert from "../../../components/ui/Alert";
import { ErrorText, Input } from "../../../components/ui/Field";
import { BriefcaseIcon, InfoIcon } from "../../../components/icons";
import { usePortalScope } from "../usePortalScope";
import { useApp } from "../../../contexts/AppContext";
import { canInviteStaff, canRequestStaff, DOCUMENTS_VIEW_PERMISSION } from "../../../services/authService";
import { fetchPortalEstates } from "../../../services/portalEstatesService";
import { fetchStaff } from "../../../services/staffService";
import { fetchLetterheads, fetchLetterTemplates, type LetterheadOverview, type LetterTemplatesOverview } from "../../../services/lettersService";

export default function PortalBranches() {
  const scope = usePortalScope();
  const { user } = useApp();
  const perms = user?.permissions ?? [];
  const seesStaff = canInviteStaff(user) || canRequestStaff(user);
  const seesLetters = perms.includes(DOCUMENTS_VIEW_PERMISSION);
  const branches = useFetch(async () => (scope ? fetchBranches(scope) : []), [scope?.tenantId, scope?.branchId]);
  // What each branch holds, from the lists those pages read. One that fails or
  // isn't this role's to read leaves its column out, never a zero.
  const extras = useFetch(async () => {
    if (!scope || !user) return null;
    const optional = <T,>(on: boolean, load: () => Promise<T>) => (on ? load().catch(() => null) : Promise.resolve(null));
    const [estates, staff, letterheads, templates] = await Promise.all([
      optional(true, () => fetchPortalEstates(scope, {}, { limit: 100 }).then((p) => p.items)),
      optional(seesStaff, () => fetchStaff({ tenantId: scope.tenantId, branchId: scope.branchId ?? null, email: user.email, permissions: user.permissions })),
      optional(seesLetters, () => fetchLetterheads(scope)),
      optional(seesLetters, () => fetchLetterTemplates(scope)),
    ]);
    return { estates, staff, letterheads, templates };
  }, [scope?.tenantId, scope?.branchId, user?.email]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Set by the New branch page on its way back, so the new one is pointed out.
  const created = (useLocation().state as { created?: string } | null)?.created;

  if (!scope) return <Page title="Branches"><p className="text-sm text-[var(--muted-foreground)]">This account isn't linked to a company.</p></Page>;
  if (branches.loading && !branches.data) return <Page title="Branches"><Loading label="Loading branches…" /></Page>;
  if (branches.error) return <LoadError error={branches.errorValue} what="your branches" onRetry={branches.refetch} />;

  const all = branches.data ?? [];
  // Search only once the list is long enough to need it.
  const searchable = all.length > 10;
  const q = query.trim().toLowerCase();
  const list = q ? all.filter((b) => `${b.name} ${b.city ?? ""} ${b.state ?? ""}`.toLowerCase().includes(q)) : all;
  const x = extras.data;
  const estatesOf = (id: string | null) => (x?.estates ?? []).filter((e) => e.branchId === id);
  const staffOf = (id: string) => (x?.staff ?? []).filter((m) => m.roles.some((r) => r.branchId === id));
  const companyEstates = x?.estates ? estatesOf(null).length : null;
  const companyStaff = x?.staff ? x.staff.filter((m) => m.roles.every((r) => !r.branchId)).length : null;
  const withOffice = all.filter((b) => officeParts(b).length > 0).length;

  return (
    <Page title="Branches"
      description="How your company is organised is up to you. Each branch's staff see only that branch's estates, plus the company's own."
      actions={<LinkButton to="/portal/branches/new">New branch</LinkButton>}>
      {created && <Alert tone="success" role="status" className="mb-4">Branch "{created}" added.</Alert>}

      {all.length > 0 && (
        <dl className="grid sm:grid-cols-3 gap-3 mb-6">
          <Figure label="Branches" value={all.length} sub={`${withOffice} with office details on listings`} />
          {x?.estates && <Figure label="Estates" value={x.estates.length} sub={`${x.estates.length - (companyEstates ?? 0)} in branches · ${companyEstates} company-level`} />}
          {x?.staff && <Figure label="Staff" value={x.staff.length} sub={`${x.staff.length - (companyStaff ?? 0)} in branches · ${companyStaff} company-wide`} />}
        </dl>
      )}

      {searchable && (
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, city or state" aria-label="Search branches" className="w-full mb-4" />
      )}

      {all.length === 0 ? (
        // Never an invented "Head Office": no branches is a real, valid state.
        <Card padding="sm"><EmptyState title="No branches yet" description="A single-office company doesn't need any — estates can belong to the company itself." /></Card>
      ) : list.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">No branches match "{query}".</p>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div aria-hidden="true" className={`hidden ${ROW_GRID} bg-[var(--muted)] px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]`}>
            <span>Branch</span><span>Office shown on listings</span><span>Estates</span><span>Staff</span><span>Letters</span><span />
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {list.map((branch) => {
              const estates = estatesOf(branch.id);
              const live = estates.filter((e) => e.status === "published").length;
              return (
                <li key={branch.id} className="px-4 sm:px-5 py-3.5">
                  {editingId === branch.id ? (
                    <BranchForm
                      initial={branch}
                      submitLabel="Save changes"
                      onCancel={() => setEditingId(null)}
                      onSubmit={async (input) => { await updateBranch(branch.id, input, scope); setEditingId(null); branches.refetch(); }}
                    />
                  ) : (
                    <div className={ROW_GRID}>
                      <div className="flex items-center gap-3 min-w-0">
                        <span aria-hidden="true" className="w-9 h-9 shrink-0 rounded-lg bg-[var(--secondary)] text-[var(--secondary-foreground)] flex items-center justify-center"><BriefcaseIcon size={16} /></span>
                        <span className="font-semibold text-[var(--foreground)] truncate flex-1">{branch.name}</span>
                        <Button variant="link" className="lg:hidden" onClick={() => setEditingId(branch.id)}>Edit</Button>
                      </div>
                      <div className="mt-2 lg:mt-0 min-w-0"><OfficeLine branch={branch} /></div>
                      <div className="mt-2 lg:mt-0 text-sm">
                        {x?.estates ? <><span className="font-mono-data text-[var(--foreground)]">{estates.length}</span><span className="text-xs text-[var(--muted-foreground)] lg:block"><span className="lg:hidden"> estates · </span>{estates.length ? `${live} live` : "none yet"}</span></> : <span className="text-[var(--muted-foreground)]">—</span>}
                      </div>
                      <div className="text-sm">
                        {x?.staff ? <><span className="font-mono-data text-[var(--foreground)]">{staffOf(branch.id).length}</span><span className="lg:hidden text-xs text-[var(--muted-foreground)]"> staff</span></> : <span className="text-[var(--muted-foreground)]">—</span>}
                      </div>
                      <div className="mt-1 lg:mt-0 text-xs"><LettersLine branchId={branch.id} letterheads={x?.letterheads ?? null} templates={x?.templates ?? null} /></div>
                      <div className="hidden lg:block justify-self-end"><Button variant="link" onClick={() => setEditingId(branch.id)}>Edit</Button></div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {(companyEstates || companyStaff) ? (
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-[var(--muted)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
          <InfoIcon size={16} className="mt-0.5 shrink-0" />
          <span>
            Company-level: {[companyEstates ? `${companyEstates} estate${companyEstates === 1 ? "" : "s"}` : null, companyStaff ? `${companyStaff} staff` : null].filter(Boolean).join(" and ")}.
            {" "}Every branch can see company-level estates, and they print under the company letterhead.
          </span>
        </p>
      ) : null}
    </Page>
  );
}

const ROW_GRID = "lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_6rem_5rem_minmax(0,1.3fr)_3rem] lg:items-center lg:gap-4";

function Figure({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
      <dt className="text-xs text-[var(--muted-foreground)]">{label}</dt>
      <dd className="font-display text-3xl text-[var(--foreground)]">{value}</dd>
      <dd className="text-xs text-[var(--muted-foreground)] mt-1">{sub}</dd>
    </div>
  );
}

// Whether this branch's letters use anything of its own: a signer or images,
// its own office details on the letterhead, its own wording.
function LettersLine({ branchId, letterheads, templates }: { branchId: string; letterheads: LetterheadOverview | null; templates: LetterTemplatesOverview | null }) {
  if (!letterheads && !templates) return <span className="text-[var(--muted-foreground)]">—</span>;
  const head = letterheads?.branches.find((b) => b.branchId === branchId);
  const ownSigner = !!(head && (head.signatoryName || head.logo || head.signature || head.seal));
  const ownOffice = !!(head && letterheads && head.printed.address !== letterheads.company.printed.address);
  const wording = templates?.branches.find((t) => t.branchId === branchId);
  const ownWording = wording?.inUse === "branch";
  return (
    <div className="space-y-0.5">
      {head && <div className="text-[var(--foreground)]">Letterhead: {ownSigner ? "own signer or images" : ownOffice ? "own office details" : "the company's"}</div>}
      {wording && (
        <div className={ownWording ? "text-[var(--success-text)]" : "text-[var(--muted-foreground)]"}>
          Wording: {ownWording ? (wording.approved ? "own · approved" : "own · awaiting HomeTrue") : wording.current ? "own, awaiting HomeTrue — company's in use" : "the company's"}
        </div>
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
    <div className="p-6 max-w-3xl mx-auto">
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

function officeParts(branch: PortalBranch): string[] {
  const address = [branch.street, branch.city, branch.state].filter(Boolean).join(", ");
  return [address, branch.phone, branch.email].filter(Boolean) as string[];
}

function OfficeLine({ branch }: { branch: PortalBranch }) {
  const address = [branch.street, branch.city, branch.state].filter(Boolean).join(", ");
  const contact = [branch.phone, branch.email].filter(Boolean).join(" · ");
  if (!address && !contact) {
    return <div className="text-sm text-[var(--muted-foreground)]">No office details<span className="block text-xs">Nothing is shown on listings</span></div>;
  }
  return (
    <div className="text-sm text-[var(--foreground)]">
      {address || contact}
      {address && contact && <span className="block text-xs text-[var(--muted-foreground)]">{contact}</span>}
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
      {error?.field === "form" && <ErrorText>{error.message}</ErrorText>}
      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : submitLabel}</Button>
        {onCancel && <Button variant="secondary" onClick={onCancel}>Cancel</Button>}
      </div>
    </form>
  );
}
