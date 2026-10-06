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
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useApp } from "../../../contexts/AppContext";
import { useFetch } from "../../../lib/useFetch";
import { apiClient } from "../../../lib/apiClient";
import { canInviteStaff, canRequestStaff } from "../../../services/authService";
import { fetchBranches, type PortalBranch } from "../../../services/branchesService";
import {
  StaffError, actOnInvitation, branchRuleForScope, fetchAssignableRoles, requestableRoles, type AssignableRole, changeStaffRole, fetchInvitations, fetchStaff,
  inviteStaff, mockInvitationLink, rejectInvitation, requestStaff, setStaffActive,
  type StaffCaller, type StaffInvitation, type StaffMember,
} from "../../../services/staffService";
import StatusBadge, { invitationStatusBadge, staffStatusBadge } from "../../../components/StatusBadge";
import TabBar from "../../../components/TabBar";
import EmptyState from "../../../components/marketplace/EmptyState";
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

  const caller: StaffCaller | null = scope && user ? { tenantId: scope.tenantId, branchId: scope.branchId ?? null, email: user.email, permissions: user.permissions } : null;
  const data = useFetch(async () => {
    if (!caller) return null;
    const [staff, invitations, branches, roles] = await Promise.all([fetchStaff(caller), fetchInvitations(caller), fetchBranches(scope!), fetchAssignableRoles(caller)]);
    return { staff, invitations, branches, roles };
  }, [scope?.tenantId, scope?.branchId, user?.email]);

  if (!caller) return <div className="p-8 text-sm text-[var(--muted-foreground)]">This account isn't linked to a company.</div>;
  if (data.loading && !data.data) return <div className="p-8 text-sm text-[var(--muted-foreground)]">Loading staff…</div>;
  if (!data.data) {
    return (
      <div className="p-8">
        <p className="text-sm text-[var(--foreground)] mb-2">Couldn't load your staff.</p>
        <button onClick={data.refetch} className="text-sm text-[var(--accent)] hover:underline">Try again</button>
      </div>
    );
  }

  const { staff, invitations, branches, roles } = data.data;
  const awaiting = invitations.filter((i) => i.status === "awaiting_approval").length;
  // Search only once the open list is long enough to need it.
  const q = query.trim().toLowerCase();
  const matches = (text: string) => !q || text.toLowerCase().includes(q);
  const shownStaff = staff.filter((m) => matches(`${m.firstName} ${m.lastName} ${m.email} ${m.roles.map((r) => `${r.roleName} ${r.branchName ?? ""}`).join(" ")}`));
  const shownInvitations = invitations.filter((i) => matches(`${i.firstName} ${i.lastName} ${i.email} ${i.roleName} ${i.branchName ?? ""}`));
  const searchable = (tab === "team" ? staff.length : invitations.length) > 10;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* The action sits beside the heading, as on Estates and Branches —
          never above or below a list that may run to fifty people. */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">Staff</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            {canInvite
              ? "Invite people to your company and decide what they can do. Branch staff see only their branch's estates."
              : "Your branch's team. To add someone, ask head office — they approve it before anything is sent."}
          </p>
        </div>
        {(canInvite || canRequest) && (
          <Link to="/portal/staff/new" className="shrink-0 px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90">
            {canInvite ? "Invite someone" : "Ask for someone"}
          </Link>
        )}
      </div>

      {sent && <SentNotice sent={sent} />}

      <div className="border-b border-[var(--border)] mb-5 mt-2">
        <TabBar
          tabs={[{ id: "team", label: "Team" }, { id: "invitations", label: awaiting > 0 && canInvite ? `Invitations (${awaiting} to review)` : "Invitations" }]}
          active={tab}
          onActivate={setTab}
          ariaLabel="Staff sections"
        />
      </div>

      {searchable && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email, role or branch"
          aria-label={tab === "team" ? "Search staff" : "Search invitations"}
          className={`${inputClass} mb-4`}
        />
      )}

      <div role="tabpanel">
        {q && (tab === "team" ? shownStaff : shownInvitations).length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">No one matches "{query}".</p>
        ) : tab === "team"
          ? <TeamList staff={shownStaff} caller={caller} canManage={canInvite} branches={branches} roles={roles} onChanged={data.refetch} />
          : <InvitationList invitations={shownInvitations} caller={caller} canApprove={canInvite} canCancel={canRequest} onChanged={data.refetch} />}
      </div>
    </div>
  );
}

// What was just sent, shown on return from the invite page.
function SentNotice({ sent }: { sent: StaffInvitation }) {
  const demoLink = apiClient.isMockMode ? mockInvitationLink(sent.id) : null;
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
    <div className="p-6 max-w-2xl mx-auto">
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
        <Field id="inv-email" label="Work email" error={errorFor("email")} hint="An address with no LandVault account yet — not a personal buyer account.">
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
            <p className="text-xs text-[var(--muted-foreground)] self-end pb-2">An Executive Director is company-wide — no branch.</p>
          )}
        </div>
        {mode === "invite" && rule === "required" && branches.length === 0 && (
          <p className="text-xs text-amber-700">Your company has no branches yet. Add one under Branches first.</p>
        )}
        {error?.field === "form" && <p className="text-sm text-red-700" role="alert">{error.message}</p>}
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
          <li key={inv.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 min-h-28 space-y-2">
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
                  <button type="button" disabled={busy} onClick={() => run(inv, () => rejectInvitation(inv.id, reason, caller), "Request rejected.")}
                    className="px-3 py-1.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold disabled:opacity-60">Reject request</button>
                  <button type="button" onClick={() => setRejecting(null)} className="px-3 py-1.5 border border-[var(--border)] rounded-md text-sm">Cancel</button>
                </div>
              </div>
            )}

            {message?.id === inv.id && (
              <p className={`text-sm ${message.tone === "error" ? "text-red-700" : "text-[var(--muted-foreground)]"}`} role={message.tone === "error" ? "alert" : "status"}>
                {message.text}
              </p>
            )}
          </li>
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

function TeamList({ staff, caller, canManage, branches, roles, onChanged }: {
  staff: StaffMember[]; caller: StaffCaller; canManage: boolean; branches: PortalBranch[]; roles: AssignableRole[]; onChanged: () => void;
}) {
  const [editing, setEditing] = useState<{ id: string; kind: "role" | "deactivate" } | null>(null);
  const [message, setMessage] = useState<{ id: string; text: string; tone: "error" | "ok" } | null>(null);

  if (staff.length === 0) return <EmptyState title="No staff yet" description="People appear here once they accept an invitation." />;

  return (
    <ul className="space-y-3">
      {staff.map((member) => {
        const badge = staffStatusBadge(member.status);
        const isYou = member.email.toLowerCase() === caller.email.toLowerCase();
        return (
          <li key={member.userId} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 min-h-28 space-y-2">
            <div className="flex flex-wrap items-start gap-3">
              <div className="flex-1 min-w-[200px]">
                <div className="font-semibold text-[var(--foreground)]">{member.firstName} {member.lastName}{isYou ? " (you)" : ""}</div>
                <div className="text-xs text-[var(--muted-foreground)]">{member.email}</div>
                <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  {member.roles.map((r) => `${r.roleName}${r.branchName ? ` · ${r.branchName}` : " · company-wide"}`).join("; ") || "No role"}
                </div>
              </div>
              <StatusBadge label={badge.label} variant={badge.variant} />
            </div>

            {canManage && !isYou && !editing && (
              <div className="flex gap-3">
                <button type="button" onClick={() => { setEditing({ id: member.userId, kind: "role" }); setMessage(null); }} className="text-sm text-[var(--accent)] hover:underline">Change role</button>
                {member.status === "deactivated" ? (
                  <button type="button" onClick={async () => {
                    try { await setStaffActive(member.userId, true, "", caller); setMessage({ id: member.userId, text: "Reactivated, with their role unchanged.", tone: "ok" }); onChanged(); }
                    catch (err) { setMessage({ id: member.userId, text: err instanceof Error ? err.message : "That didn't go through.", tone: "error" }); }
                  }} className="text-sm text-[var(--accent)] hover:underline">Reactivate</button>
                ) : (
                  <button type="button" onClick={() => { setEditing({ id: member.userId, kind: "deactivate" }); setMessage(null); }} className="text-sm text-[var(--muted-foreground)] hover:underline">Deactivate…</button>
                )}
              </div>
            )}

            {editing?.id === member.userId && editing.kind === "role" && (
              <RoleChange member={member} caller={caller} branches={branches} roles={roles} onCancel={() => setEditing(null)}
                onDone={(text) => { setEditing(null); setMessage({ id: member.userId, text, tone: "ok" }); onChanged(); }} />
            )}
            {editing?.id === member.userId && editing.kind === "deactivate" && (
              <Deactivate member={member} caller={caller} onCancel={() => setEditing(null)}
                onDone={(text) => { setEditing(null); setMessage({ id: member.userId, text, tone: "ok" }); onChanged(); }} />
            )}

            {message?.id === member.userId && (
              <p className={`text-sm ${message.tone === "error" ? "text-red-700" : "text-[var(--muted-foreground)]"}`} role={message.tone === "error" ? "alert" : "status"}>
                {message.text}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
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
    <div className="rounded-lg bg-[var(--muted)] p-4 space-y-3">
      <p className="text-xs text-[var(--muted-foreground)]">This replaces every role they hold with the one chosen here.</p>
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
      {error?.field === "form" && <p className="text-sm text-red-700" role="alert">{error.message}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={save} disabled={saving || !roleCode} className="px-3 py-1.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold disabled:opacity-60">
          {saving ? "Saving…" : "Change role"}
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 border border-[var(--border)] rounded-md text-sm">Cancel</button>
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
    <div className="rounded-lg bg-[var(--muted)] p-4 space-y-3">
      <p className="text-xs text-[var(--muted-foreground)]">Not a deletion: their account and history stay, and you can reactivate them later.</p>
      <Field id={`deact-${member.userId}`} label="Reason" hint="Kept in the audit log.">
        <input id={`deact-${member.userId}`} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
      </Field>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={save} disabled={saving} className="px-3 py-1.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold disabled:opacity-60">
          {saving ? "Deactivating…" : `Deactivate ${member.firstName}`}
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 border border-[var(--border)] rounded-md text-sm">Cancel</button>
      </div>
    </div>
  );
}
