// A company's own staff (FS-1..FS-5, FS-7).
//
// Two audiences on one page, decided by permission, never by role string:
//   portal.staff.invite  (Executive Director) — invite directly, approve or
//     reject branch requests, revoke/resend, change roles, deactivate.
//   portal.staff.request (Branch Manager) — ASK head office for someone for
//     their own branch, and cancel their own request. Nothing is sent to the
//     person until it's approved.
//
// Until invitations existed no branch-scoped user could ever log in: the wall
// between Double King and Harmony was built and tested with nobody on either
// side of it. This page is what puts people there.

import { useState } from "react";
import LoadError from "../../../components/LoadError";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../../../contexts/AppContext";
import { useFetch } from "../../../lib/useFetch";
import { canInviteStaff, canManageRoles, canRequestStaff } from "../../../services/authService";
import TextLink from "../../../components/ui/TextLink";
import { fetchBranches, type PortalBranch } from "../../../services/branchesService";
import { isLive } from "../../../lib/backends";
import {
  StaffError, actOnInvitation, branchRuleForScope, fetchAssignableRoles, requestableRoles, type AssignableRole, changeStaffRole, fetchInvitations, fetchStaff,
  inviteStaff, mockInvitationLink, rejectInvitation, requestStaff, setStaffActive,
  type StaffCaller, type StaffInvitation, type StaffMember,
} from "../../../services/staffService";
import StatusBadge, { invitationStatusBadge, staffStatusBadge } from "../../../components/StatusBadge";
import TabBar from "../../../components/ui/Tabs";
import EmptyState from "../../../components/ui/EmptyState";
import Card, { ListCard } from "../../../components/ui/Card";
import Page, { Loading } from "../../../components/ui/Page";
import Button, { LinkButton } from "../../../components/ui/Button";
import Alert from "../../../components/ui/Alert";
import Dialog from "../../../components/ui/Dialog";
import Popover from "../../../components/ui/Popover";
import { ErrorText, Input, Select } from "../../../components/ui/Field";
import { Field, inputClass } from "../../../components/portal/formParts";
import { usePortalScope } from "../usePortalScope";

type Tab = "team" | "invitations";

export default function PortalStaff() {
  const { user } = useApp();
  const scope = usePortalScope();
  const canInvite = canInviteStaff(user);
  const canRequest = canRequestStaff(user);
  // Set by the invite page on its way back, so what was just sent is shown
  // and its tab is the one open.
  const sent = (useLocation().state as { sent?: StaffInvitation } | null)?.sent;
  const [tab, setTab] = useState<Tab>(sent || !canInvite ? "invitations" : "team");
  const [query, setQuery] = useState("");
  // null = every branch; "" = company-wide only.
  const [branchFilter, setBranchFilter] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState("");

  const caller: StaffCaller | null = scope && user ? { tenantId: scope.tenantId, branchId: scope.branchId ?? null, email: user.email, permissions: user.permissions } : null;
  const data = useFetch(async () => {
    if (!caller) return null;
    const [staff, invitations, branches, roles] = await Promise.all([fetchStaff(caller), fetchInvitations(caller), fetchBranches(scope!), fetchAssignableRoles(caller)]);
    return { staff, invitations, branches, roles };
  }, [scope?.tenantId, scope?.branchId, user?.email]);

  if (!caller) return <Page title="Staff"><p className="text-sm text-[var(--muted-foreground)]">This account isn't linked to a company.</p></Page>;
  if (data.loading && !data.data) return <Page title="Staff"><Loading label="Loading staff…" /></Page>;
  if (data.error) return <LoadError error={data.errorValue} what="your staff" onRetry={data.refetch} />;
  if (!data.data) {
    return (
      <Page title="Staff">
        <p className="text-sm text-[var(--foreground)] mb-2">Couldn't load your staff.</p>
        <Button variant="link" onClick={data.refetch}>Try again</Button>
      </Page>
    );
  }

  const { staff, invitations, branches, roles } = data.data;
  const awaiting = invitations.filter((i) => i.status === "awaiting_approval").length;
  // Search only once the open list is long enough to need it.
  const q = query.trim().toLowerCase();
  const matches = (text: string) => !q || text.toLowerCase().includes(q);
  const branchOf = (m: StaffMember) => m.roles[0]?.branchName ?? "";
  const branchOptions = [...new Set(staff.map(branchOf))].sort();
  const roleOptions = [...new Set(staff.flatMap((m) => m.roles.map((r) => r.roleName)))].sort();
  const shownStaff = staff
    .filter((m) => matches(`${m.firstName} ${m.lastName} ${m.email} ${m.roles.map((r) => `${r.roleName} ${r.branchName ?? ""}`).join(" ")}`))
    .filter((m) => branchFilter === null || branchOf(m) === branchFilter)
    .filter((m) => !roleFilter || m.roles.some((r) => r.roleName === roleFilter));
  const shownInvitations = invitations.filter((i) => matches(`${i.firstName} ${i.lastName} ${i.email} ${i.roleName} ${i.branchName ?? ""}`));
  const searchable = (tab === "team" ? staff.length : invitations.length) > 10;
  const unconfirmed = staff.some((m) => m.status === "pending_verification");

  return (
    <Page title="Staff"
      description={canInvite
        ? "Who works in your company, what they can do, and where. Branch staff see only their branch's estates."
        : "Your branch's team. To add someone, ask head office — they approve it before anything is sent."}
      actions={
        <div className="flex flex-wrap gap-2">
          {canManageRoles(user) && <LinkButton to="/portal/staff/roles" variant="secondary">Roles &amp; permissions</LinkButton>}
          {(canInvite || canRequest) && <LinkButton to="/portal/staff/new">{canInvite ? "Invite someone" : "Ask for someone"}</LinkButton>}
        </div>
      }>
      {sent && <SentNotice sent={sent} />}

      <StaffFigures staff={staff} invitations={invitations} />

      <div className="flex flex-col-reverse lg:flex-row lg:items-end lg:justify-between gap-3 border-b border-[var(--border)] mb-5">
        <div className="min-w-0 -mb-px">
          <TabBar
            tabs={[{ id: "team", label: `Team ${staff.length}` }, { id: "invitations", label: awaiting > 0 && canInvite ? `Invitations · ${awaiting} to review` : `Invitations ${invitations.length}` }]}
            active={tab}
            onActivate={setTab}
            ariaLabel="Staff sections"
          />
        </div>
        {tab === "team" && (branchOptions.length > 1 || roleOptions.length > 1) && (
          <div className="flex gap-2 lg:mb-2">
            {branchOptions.length > 1 && (
              <Select inputSize="sm" className="w-auto" aria-label="Filter by branch" value={branchFilter ?? "*"} onChange={(e) => setBranchFilter(e.target.value === "*" ? null : e.target.value)}>
                <option value="*">All branches</option>
                {branchOptions.map((b) => <option key={b || "company"} value={b}>{b || "Company-wide"}</option>)}
              </Select>
            )}
            {roleOptions.length > 1 && (
              <Select inputSize="sm" className="w-auto" aria-label="Filter by role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                <option value="">All roles</option>
                {roleOptions.map((r) => <option key={r} value={r}>{r}</option>)}
              </Select>
            )}
          </div>
        )}
      </div>

      {searchable && (
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email, role or branch"
          aria-label={tab === "team" ? "Search staff" : "Search invitations"}
          className="mb-4"
        />
      )}

      {tab === "team" && unconfirmed && (
        <Alert tone="info" className="mb-4">
          “Not confirmed” means the person hasn't confirmed their email or phone. That step isn't switched on yet, so new accounts stay unconfirmed — they can still sign in and work.
        </Alert>
      )}

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {(q || branchFilter !== null || roleFilter) && (tab === "team" ? shownStaff : shownInvitations).length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">No one matches{q ? ` "${query}"` : " those filters"}.</p>
        ) : tab === "team"
          ? <TeamList staff={shownStaff} caller={caller} canManage={canInvite} branches={branches} roles={roles} onChanged={data.refetch} />
          : <InvitationList invitations={shownInvitations} caller={caller} canApprove={canInvite} canCancel={canRequest} onChanged={data.refetch} />}
      </div>
    </Page>
  );
}

// People, roles in use and where invitations stand — from the lists loaded.
function StaffFigures({ staff, invitations }: { staff: StaffMember[]; invitations: StaffInvitation[] }) {
  const companyWide = staff.filter((m) => m.roles.every((r) => !r.branchName)).length;
  const branches = [...new Set(staff.flatMap((m) => m.roles.map((r) => r.branchName).filter(Boolean)))];
  const roleNames = [...new Set(staff.flatMap((m) => m.roles.map((r) => r.roleName)))];
  const byStatus = invitations.reduce<Record<string, number>>((n, i) => ({ ...n, [i.status]: (n[i.status] ?? 0) + 1 }), {});
  const invitationLine = Object.entries(byStatus).map(([status, n]) => `${n} ${invitationStatusBadge(status as StaffInvitation["status"]).label.toLowerCase()}`).join(" · ");
  const cards: [string, string, string][] = [
    ["People", String(staff.length), [companyWide ? `${companyWide} company-wide` : null, ...branches.map((b) => `${staff.filter((m) => m.roles.some((r) => r.branchName === b)).length} at ${b}`)].filter(Boolean).join(" · ") || "No one yet"],
    ["Roles in use", String(roleNames.length), roleNames.join(", ") || "—"],
    ["Invitations", String(invitations.length), invitationLine || "None sent yet"],
  ];
  return (
    <dl className="grid sm:grid-cols-3 gap-3 mb-6">
      {cards.map(([label, value, sub]) => (
        <div key={label} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
          <dt className="text-xs text-[var(--muted-foreground)]">{label}</dt>
          <dd className="font-display text-3xl text-[var(--foreground)]">{value}</dd>
          <dd className="text-xs text-[var(--muted-foreground)] mt-1">{sub}</dd>
        </div>
      ))}
    </dl>
  );
}

// What was just sent, shown on return from the invite page.
function SentNotice({ sent }: { sent: StaffInvitation }) {
  const demoLink = !isLive("staff") ? mockInvitationLink(sent.id) : null;
  return (
    <div className="mb-6 rounded-lg bg-[var(--muted)] p-3 text-sm text-[var(--foreground)] space-y-1" role="status">
      {sent.status === "awaiting_approval"
        ? <p>Request sent to head office for {sent.firstName} {sent.lastName} as {sent.roleName}. Nothing has been sent to them yet.</p>
        : <p>Invitation emailed to {sent.email} as {sent.roleName}{sent.branchName ? `, ${sent.branchName}` : ""}.</p>}
      {/* Mock mode only: there is no email, so show what would have been sent.
          An in-app link: a full page load would wipe the in-memory demo data. */}
      {demoLink && (
        <p className="text-xs text-[var(--muted-foreground)]">
          Demo mode — the emailed link would be: <Link to={demoLink} className="text-[var(--accent)] underline break-all">{demoLink}</Link>
        </p>
      )}
    </div>
  );
}

function ownBranchName(branches: PortalBranch[], caller: StaffCaller): string | undefined {
  return branches.find((b) => b.id === caller.branchId)?.name;
}

// /portal/staff/new — its own page, like New estate and New branch. A
// director invites; a branch manager asks head office.
export function NewStaffInvitation() {
  const { user } = useApp();
  const scope = usePortalScope();
  const navigate = useNavigate();
  const canInvite = canInviteStaff(user);
  const caller: StaffCaller | null = scope && user ? { tenantId: scope.tenantId, branchId: scope.branchId ?? null, email: user.email, permissions: user.permissions } : null;
  const loaded = useFetch(async () => {
    if (!scope || !caller) return null;
    const [branches, roles] = await Promise.all([fetchBranches(scope), fetchAssignableRoles(caller)]);
    return { branches, roles };
  }, [scope?.tenantId, scope?.branchId, user?.email]);
  const branches = { data: loaded.data?.branches ?? null };

  if (!caller) return <div className="p-8 text-sm text-[var(--muted-foreground)]">This account isn't linked to a company.</div>;
  if (loaded.loading && !loaded.data) return <div className="p-8 text-sm text-[var(--muted-foreground)]">Loading…</div>;
  if (!loaded.data) {
    return (
      <div className="p-8">
        <p className="text-sm text-[var(--foreground)] mb-2">Couldn't load the roles you can give.</p>
        <button onClick={loaded.refetch} className="text-sm text-[var(--accent)] hover:underline">Try again</button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Link to="/portal/staff" className="text-xs text-[var(--accent)] hover:underline">← Staff</Link>
      <h1 className="font-display text-3xl text-[var(--foreground)] mt-2 mb-1">{canInvite ? "Invite someone" : "Ask head office for someone"}</h1>
      <p className="text-sm text-[var(--muted-foreground)] mb-6">
        {canInvite
          ? "They get an email with a link to set their own password. It works once, for 72 hours, and is never shown here."
          : `For your branch${ownBranchName(branches.data ?? [], caller) ? `, ${ownBranchName(branches.data ?? [], caller)}` : ""}. Nothing is sent to them until an Executive Director approves it, and a request with no decision lapses after 14 days.`}
      </p>
      <InviteSection
        mode={canInvite ? "invite" : "request"}
        caller={caller}
        branches={loaded.data.branches}
        roles={loaded.data.roles}
        onDone={(sent) => navigate("/portal/staff", { state: { sent } })}
        onCancel={() => navigate("/portal/staff")}
      />
    </div>
  );
}

// ─── Invite / request ────────────────────────────────────────────────────────

function InviteSection({ mode, caller, branches, roles: allRoles, onDone, onCancel }: {
  mode: "invite" | "request"; caller: StaffCaller; branches: PortalBranch[]; roles: AssignableRole[];
  onDone: (sent: StaffInvitation) => void; onCancel: () => void;
}) {
  // From GET /api/portal/roles. A request may name any branch-level role —
  // the approver is the one checked — so canGrant only gates direct invites.
  const roles = mode === "request" ? requestableRoles(allRoles) : allRoles;
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [roleCode, setRoleCode] = useState("");
  const [branchId, setBranchId] = useState("");
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // The branch picker follows the role: required, hidden or optional — so an
  // invalid role/branch pair can't be submitted.
  const chosen = roles.find((r) => r.code === roleCode);
  const rule = chosen ? branchRuleForScope(chosen.scope) : null;
  const errorFor = (field: string) => (error?.field === field ? error.message : undefined);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const input = { firstName, lastName, email, roleCode, scope: chosen?.scope };
      const result = mode === "invite"
        ? await inviteStaff({ ...input, branchId: rule === "forbidden" ? undefined : branchId || undefined }, caller)
        : await requestStaff(input, caller);
      onDone(result);
    } catch (err) {
      setError(err instanceof StaffError ? { field: err.field, message: err.message } : { field: "form", message: "That didn't go through." });
    } finally {
      setSaving(false);
    }
  };


  return (
    <section className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">

      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field id="inv-first" label="First name" error={errorFor("firstName")}>
            <input id="inv-first" value={firstName} onChange={(e) => setFirstName(e.target.value)} className={inputClass} />
          </Field>
          <Field id="inv-last" label="Last name" error={errorFor("lastName")}>
            <input id="inv-last" value={lastName} onChange={(e) => setLastName(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Field id="inv-email" label="Work email" error={errorFor("email")} hint="An address with no HomeTrue account yet — not a personal buyer account.">
          <input id="inv-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} />
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field id="inv-role" label="Role" error={errorFor("roleCode")}>
            <select id="inv-role" value={roleCode} onChange={(e) => { setRoleCode(e.target.value); setBranchId(""); setError(null); }} className={inputClass}>
              <option value="">Choose a role</option>
              {roles.map((r) => (
                // SI-4: a role carrying permissions you don't hold can't be
                // given — shown, but not selectable, with the reason.
                <option key={r.code} value={r.code} disabled={mode === "invite" && !r.canGrant}>
                  {r.name}{mode === "invite" && !r.canGrant ? " — you can't grant this" : ""}
                </option>
              ))}
            </select>
          </Field>
          {mode === "invite" && rule && rule !== "forbidden" && (
            <Field id="inv-branch" label={rule === "required" ? "Branch" : "Branch (optional)"} error={errorFor("branchId")}
              hint={rule === "required" ? `A ${chosen?.name ?? "role like this"} runs one branch.` : "Leave empty for company-wide access."}>
              <select id="inv-branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputClass}>
                <option value="">{rule === "required" ? "Choose a branch" : "Company-wide — no branch"}</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
          )}
          {chosen?.description && <p className="text-xs text-[var(--muted-foreground)] sm:col-span-2 -mt-2">{chosen.description}</p>}
          {mode === "invite" && rule === "forbidden" && (
            <p className="text-xs text-[var(--muted-foreground)] self-end pb-2">{chosen?.name ?? "This role"} is company-wide — no branch.</p>
          )}
        </div>
        {mode === "invite" && rule && rule !== "forbidden" && branches.length === 0 && <NoBranchesNote required={rule === "required"} />}
        {error?.field === "form" && <p className="text-sm text-[var(--error-text)]" role="alert">{error.message}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-60">
            {saving ? "Sending…" : mode === "invite" ? "Send invitation" : "Send request"}
          </button>
          <button type="button" onClick={onCancel} className="px-4 py-2 border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] hover:bg-[var(--muted)]">Cancel</button>
        </div>
      </form>

    </section>
  );
}

// ─── Invitations ─────────────────────────────────────────────────────────────

function InvitationList({ invitations, caller, canApprove, canCancel, onChanged }: {
  invitations: StaffInvitation[]; caller: StaffCaller; canApprove: boolean; canCancel: boolean; onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<{ id: string; text: string; tone: "error" | "ok" } | null>(null);

  if (invitations.length === 0) return <EmptyState title="No invitations yet" description="Invitations and branch requests appear here." />;

  const run = async (inv: StaffInvitation, action: () => Promise<StaffInvitation>, ok: string) => {
    setBusyId(inv.id);
    setMessage(null);
    try {
      await action();
      setMessage({ id: inv.id, text: ok, tone: "ok" });
      setRejecting(null);
      setReason("");
      onChanged();
    } catch (err) {
      setMessage({ id: inv.id, text: err instanceof Error ? err.message : "That didn't go through.", tone: "error" });
    } finally {
      setBusyId(null);
    }
  };

  // Requests waiting on a decision first — that's the queue.
  const ordered = [...invitations].sort((a, b) => Number(b.status === "awaiting_approval") - Number(a.status === "awaiting_approval"));

  return (
    <ul className="space-y-3">
      {ordered.map((inv) => {
        const badge = invitationStatusBadge(inv.status);
        const busy = busyId === inv.id;
        return (
          <ListCard key={inv.id} className="space-y-2">
            <div className="flex flex-wrap items-start gap-3">
              <div className="flex-1 min-w-[200px]">
                <div className="font-semibold text-[var(--foreground)]">{inv.firstName} {inv.lastName}</div>
                <div className="text-xs text-[var(--muted-foreground)]">{inv.email}</div>
                <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  {inv.roleName}{inv.branchName ? ` · ${inv.branchName}` : " · company-wide"}
                  {inv.approvalRequired ? " · requested by the branch" : ""}
                </div>
              </div>
              <StatusBadge label={badge.label} variant={badge.variant} />
            </div>

            <InvitationDetail inv={inv} />

            <div className="flex flex-wrap gap-3">
              {canApprove && inv.status === "awaiting_approval" && rejecting !== inv.id && (
                <>
                  <button type="button" disabled={busy} onClick={() => run(inv, () => actOnInvitation(inv.id, "approve", caller), "Approved — the invitation has been emailed.")}
                    className="text-sm font-semibold text-[var(--accent)] hover:underline disabled:opacity-50">Approve and send</button>
                  <button type="button" disabled={busy} onClick={() => { setRejecting(inv.id); setReason(""); setMessage(null); }}
                    className="text-sm text-[var(--muted-foreground)] hover:underline disabled:opacity-50">Reject…</button>
                </>
              )}
              {canCancel && inv.status === "awaiting_approval" && (
                <button type="button" disabled={busy} onClick={() => run(inv, () => actOnInvitation(inv.id, "cancel", caller), "Request cancelled.")}
                  className="text-sm text-[var(--muted-foreground)] hover:underline disabled:opacity-50">Cancel request</button>
              )}
              {canApprove && (inv.status === "pending" || inv.status === "expired") && (
                <button type="button" disabled={busy || inv.sendCount >= 5} onClick={() => run(inv, () => actOnInvitation(inv.id, "resend", caller), "Sent again with a new link — the old one no longer works.")}
                  className="text-sm text-[var(--accent)] hover:underline disabled:opacity-50">Resend</button>
              )}
              {canApprove && inv.status === "pending" && (
                <button type="button" disabled={busy} onClick={() => run(inv, () => actOnInvitation(inv.id, "revoke", caller), "Revoked — the link no longer works.")}
                  className="text-sm text-[var(--muted-foreground)] hover:underline disabled:opacity-50">Revoke</button>
              )}
            </div>

            {rejecting === inv.id && (
              <div className="space-y-2">
                <Field id={`reject-${inv.id}`} label="Why are you turning this down?" hint="The branch manager who asked will see this.">
                  <input id={`reject-${inv.id}`} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
                </Field>
                <div className="flex gap-3">
                  <Button variant="danger" disabled={busy} onClick={() => run(inv, () => rejectInvitation(inv.id, reason, caller), "Request rejected.")}>Reject request</Button>
                  <Button variant="secondary" onClick={() => setRejecting(null)}>Cancel</Button>
                </div>
              </div>
            )}

            {message?.id === inv.id && (
              <p className={`text-sm ${message.tone === "error" ? "text-[var(--error-text)]" : "text-[var(--muted-foreground)]"}`} role={message.tone === "error" ? "alert" : "status"}>
                {message.text}
              </p>
            )}
          </ListCard>
        );
      })}
    </ul>
  );
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
}

function InvitationDetail({ inv }: { inv: StaffInvitation }) {
  const text = (() => {
    switch (inv.status) {
      case "awaiting_approval": return `Waiting for an Executive Director to approve. Lapses ${formatDate(inv.expiresAt)} if nobody decides.`;
      case "pending": return `Link expires ${formatDate(inv.expiresAt)}. Sent ${inv.sendCount} ${inv.sendCount === 1 ? "time" : "times"} (at most 5).`;
      case "accepted": return `Accepted ${formatDate(inv.acceptedAt)}.`;
      case "expired": return "The link expired before it was used. Resending issues a new one.";
      case "revoked": return `Revoked ${formatDate(inv.revokedAt)}.`;
      case "rejected": return inv.rejectionReason ? `Rejected: ${inv.rejectionReason}` : "Rejected.";
    }
  })();
  return <p className="text-xs text-[var(--muted-foreground)]">{text}</p>;
}

// ─── Team ────────────────────────────────────────────────────────────────────

const TEAM_GRID = "md:grid md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_7rem] md:items-center md:gap-4";

function TeamList({ staff, caller, canManage, branches, roles, onChanged }: {
  staff: StaffMember[]; caller: StaffCaller; canManage: boolean; branches: PortalBranch[]; roles: AssignableRole[]; onChanged: () => void;
}) {
  const [editing, setEditing] = useState<{ id: string; kind: "role" | "deactivate" } | null>(null);
  const [message, setMessage] = useState<{ id: string; text: string; tone: "error" | "ok" } | null>(null);

  if (staff.length === 0) return <EmptyState title="No staff yet" description="People appear here once they accept an invitation." />;
  const member = editing ? staff.find((m) => m.userId === editing.id) : undefined;

  const reactivate = async (m: StaffMember) => {
    try { await setStaffActive(m.userId, true, "", caller); setMessage({ id: m.userId, text: "Reactivated, with their role unchanged.", tone: "ok" }); onChanged(); }
    catch (err) { setMessage({ id: m.userId, text: err instanceof Error ? err.message : "That didn't go through.", tone: "error" }); }
  };

  return (
    <>
      <Card padding="none" className="overflow-hidden">
        <div aria-hidden="true" className={`hidden ${TEAM_GRID} bg-[var(--muted)] px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]`}>
          <span>Person</span><span>Role</span><span>Status</span><span>Last signed in</span><span />
        </div>
        <ul className="divide-y divide-[var(--border)]">
          {staff.map((m) => {
            const badge = staffStatusBadge(m.status);
            const isYou = m.email.toLowerCase() === caller.email.toLowerCase();
            return (
              <li key={m.userId} className="px-4 sm:px-5 py-3.5">
                <div className={TEAM_GRID}>
                  <div className="flex items-center gap-3 min-w-0">
                    <span aria-hidden="true" className="w-9 h-9 shrink-0 rounded-full bg-[var(--secondary)] text-[var(--secondary-foreground)] flex items-center justify-center text-sm font-semibold">
                      {`${m.firstName[0] ?? ""}${m.lastName[0] ?? ""}`.toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-[var(--foreground)] truncate">{m.firstName} {m.lastName}{isYou ? " (you)" : ""}</div>
                      <div className="text-xs text-[var(--muted-foreground)] truncate">{m.email}</div>
                    </div>
                    <span className="md:hidden shrink-0"><StatusBadge label={badge.label} variant={badge.variant} /></span>
                  </div>
                  <div className="mt-2 md:mt-0 min-w-0 pl-12 md:pl-0">
                    {m.roles.length ? m.roles.map((r) => (
                      <div key={`${r.roleCode}:${r.branchId ?? ""}`}>
                        <div className="text-sm text-[var(--foreground)]">{r.roleName}</div>
                        <div className="text-xs text-[var(--muted-foreground)]">{r.branchName ?? "Company-wide"}</div>
                      </div>
                    )) : <span className="text-sm text-[var(--muted-foreground)]">No role</span>}
                  </div>
                  <div className="hidden md:block"><StatusBadge label={badge.label} variant={badge.variant} /></div>
                  <div className="text-sm pl-12 md:pl-0 mt-1 md:mt-0 text-[var(--muted-foreground)] md:text-[var(--foreground)]">
                    {m.lastLoginAt
                      ? <><span className="md:hidden">Last signed in </span>{lastSeen(m.lastLoginAt)}</>
                      : <><span className="md:hidden">Never signed in</span><span className="hidden md:inline">Never</span></>}
                  </div>
                  <div className="pl-12 md:pl-0 mt-2 md:mt-0 md:justify-self-end">
                    {canManage && !isYou ? (
                      <Popover label="Manage" align="end">
                        {(close) => (
                          <div className="py-1 min-w-44" role="menu">
                            <MenuItem onClick={() => { close(); setMessage(null); setEditing({ id: m.userId, kind: "role" }); }}>Change role</MenuItem>
                            {m.status === "deactivated"
                              ? <MenuItem onClick={() => { close(); void reactivate(m); }}>Reactivate</MenuItem>
                              : <MenuItem danger onClick={() => { close(); setMessage(null); setEditing({ id: m.userId, kind: "deactivate" }); }}>Deactivate…</MenuItem>}
                          </div>
                        )}
                      </Popover>
                    ) : <span className="hidden md:inline text-sm text-[var(--muted-foreground)]">—</span>}
                  </div>
                </div>
                {message?.id === m.userId && (
                  <p className={`text-sm mt-2 ${message.tone === "error" ? "text-[var(--error-text)]" : "text-[var(--muted-foreground)]"}`} role={message.tone === "error" ? "alert" : "status"}>
                    {message.text}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      {member && editing?.kind === "role" && (
        <Dialog title={`Change ${member.firstName}'s role`} onClose={() => setEditing(null)}>
          <RoleChange member={member} caller={caller} branches={branches} roles={roles} onCancel={() => setEditing(null)}
            onDone={(text) => { setEditing(null); setMessage({ id: member.userId, text, tone: "ok" }); onChanged(); }} />
        </Dialog>
      )}
      {member && editing?.kind === "deactivate" && (
        <Dialog title={`Deactivate ${member.firstName}?`} onClose={() => setEditing(null)}>
          <Deactivate member={member} caller={caller} onCancel={() => setEditing(null)}
            onDone={(text) => { setEditing(null); setMessage({ id: member.userId, text, tone: "ok" }); onChanged(); }} />
        </Dialog>
      )}
    </>
  );
}

function MenuItem({ onClick, danger, children }: { onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" role="menuitem" onClick={onClick}
      className={`block w-full text-left px-3 py-2 text-sm hover:bg-[var(--muted)] ${danger ? "text-[var(--error-text)]" : "text-[var(--foreground)]"}`}>
      {children}
    </button>
  );
}

// "Today", "Yesterday", or the date.
function lastSeen(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const days = Math.floor((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// Same rules as an invitation, decided by the backend's one StaffRoleRules —
// this form only shapes the branch picker to the role.
function RoleChange({ member, caller, branches, roles, onCancel, onDone }: {
  member: StaffMember; caller: StaffCaller; branches: PortalBranch[]; roles: AssignableRole[]; onCancel: () => void; onDone: (text: string) => void;
}) {
  const current = member.roles[0];
  const [roleCode, setRoleCode] = useState(current?.roleCode ?? "");
  const [branchId, setBranchId] = useState(current?.branchId ?? "");
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const chosen = roles.find((r) => r.code === roleCode);
  const rule = chosen ? branchRuleForScope(chosen.scope) : null;

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await changeStaffRole(member.userId, { roleCode, scope: chosen?.scope, branchId: rule === "forbidden" ? undefined : branchId || undefined }, caller);
      onDone(`Now ${chosen?.name ?? roleCode}. Their sessions have been told to stop renewing — one already open can keep its old access for up to 15 minutes.`);
    } catch (err) {
      setError(err instanceof StaffError ? { field: err.field, message: err.message } : { field: "form", message: "That didn't go through." });
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--muted-foreground)]">This replaces every role they hold with the one chosen here.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field id={`role-${member.userId}`} label="Role" error={error?.field === "roleCode" ? error.message : undefined}>
          <select id={`role-${member.userId}`} value={roleCode} onChange={(e) => { setRoleCode(e.target.value); setBranchId(""); }} className={inputClass}>
            {roles.map((r) => (
              <option key={r.code} value={r.code} disabled={!r.canGrant && r.code !== current?.roleCode}>
                {r.name}{!r.canGrant ? " — you can't grant this" : ""}
              </option>
            ))}
          </select>
        </Field>
        {rule && rule !== "forbidden" && (
          <Field id={`role-branch-${member.userId}`} label={rule === "required" ? "Branch" : "Branch (optional)"} error={error?.field === "branchId" ? error.message : undefined}>
            <select id={`role-branch-${member.userId}`} value={branchId} onChange={(e) => setBranchId(e.target.value)} className={inputClass}>
              <option value="">{rule === "required" ? "Choose a branch" : "Company-wide — no branch"}</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
        )}
      </div>
      {rule && rule !== "forbidden" && branches.length === 0 && <NoBranchesNote required={rule === "required"} />}
      {error?.field === "form" && <ErrorText>{error.message}</ErrorText>}
      <div className="flex justify-end gap-3 pt-1">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button onClick={save} disabled={saving || !roleCode}>{saving ? "Saving…" : "Change role"}</Button>
      </div>
    </div>
  );
}

function Deactivate({ member, caller, onCancel, onDone }: { member: StaffMember; caller: StaffCaller; onCancel: () => void; onDone: (text: string) => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await setStaffActive(member.userId, false, reason, caller);
      onDone("Deactivated. They can't sign in or renew a session; one already open can keep working for up to 15 minutes. Reactivating restores their role.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't go through.");
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--muted-foreground)]">Not a deletion: their account and history stay, and you can reactivate them later.</p>
      <Field id={`deact-${member.userId}`} label="Reason" hint="Kept in the audit log.">
        <input id={`deact-${member.userId}`} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
      </Field>
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex justify-end gap-3 pt-1">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button variant="danger" onClick={save} disabled={saving}>{saving ? "Deactivating…" : `Deactivate ${member.firstName}`}</Button>
      </div>
    </div>
  );
}

// The branch picker lists only the company's branches; with none, it offers
// nothing but "company-wide" — say why, and where to add one.
function NoBranchesNote({ required }: { required: boolean }) {
  return (
    <p className="text-xs text-[var(--muted-foreground)]">
      Your company has no branches yet{required ? ", and this role needs one" : ", so this can only be company-wide for now"}.{" "}
      <TextLink to="/portal/branches">Add a branch</TextLink> first.
    </p>
  );
}
