// A company's roles: HomeTrue's standard ones and the company's own, which an
// Executive Director (portal.roles.manage) bundles from the seeded portal.*
// permissions they hold (changeset 084).
//
// Reading roles works in a branch-narrowed view too; creating, editing and
// deleting don't. So the page decides "can edit" from the permission AND a
// company-wide scope, never from a successful read.

import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useApp } from "../../../contexts/AppContext";
import { useFetch } from "../../../lib/useFetch";
import { canManageRoles } from "../../../services/authService";
import {
  MAX_CUSTOM_ROLES, StaffError, companyOnlyPermissions, groupPermissions, createRole, deleteRole, fetchAssignableRoles, fetchPortalPermissions, updateRole,
  type AssignableRole, type PortalPermission, type RoleScope, type StaffCaller,
} from "../../../services/staffService";
import LoadError from "../../../components/LoadError";
import StatusBadge, { roleKindBadge } from "../../../components/StatusBadge";
import Page, { Loading } from "../../../components/ui/Page";
import { ListCard } from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import TextLink from "../../../components/ui/TextLink";
import Alert from "../../../components/ui/Alert";
import Dialog, { DialogActions } from "../../../components/ui/Dialog";
import { ErrorText, Field, Input, Textarea } from "../../../components/ui/Field";
import { fetchBranches } from "../../../services/branchesService";
import { usePortalScope } from "../usePortalScope";

const SCOPES: { id: RoleScope; label: string; hint: string }[] = [
  { id: "either", label: "Company-wide or one branch", hint: "Chosen when you invite someone." },
  { id: "branch", label: "One branch", hint: "Always given for a particular branch." },
  { id: "company", label: "Company-wide only", hint: "Never limited to a branch. Needed for permissions that only work company-wide." },
];

const scopeLabel = (scope: RoleScope) => SCOPES.find((s) => s.id === scope)?.label ?? scope;

const PROPAGATION_NOTE = "People with this role get the change the next time they sign in (within 15 minutes).";

// Who's acting, and whether they may change roles: the permission, in a
// company-wide view (no branch on the session).
function useRoleCaller(): { caller: StaffCaller | null; holdsPermission: boolean; canEdit: boolean } {
  const { user } = useApp();
  const scope = usePortalScope();
  const caller = scope && user ? { tenantId: scope.tenantId, branchId: scope.branchId ?? null, email: user.email, permissions: user.permissions } : null;
  const holdsPermission = canManageRoles(user);
  return { caller, holdsPermission, canEdit: !!caller && holdsPermission && caller.branchId === null };
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : "That didn't go through.");

// ─── /portal/staff/roles ─────────────────────────────────────────────────────

export default function PortalRoles() {
  const { caller, holdsPermission, canEdit } = useRoleCaller();
  // Set by the editor on its way back.
  const saved = (useLocation().state as { saved?: { name: string; edited: boolean } } | null)?.saved;
  const roles = useFetch(async () => (caller ? fetchAssignableRoles(caller) : null), [caller?.tenantId, caller?.branchId, caller?.email]);
  const permissions = useFetch(async () => (caller ? fetchPortalPermissions(caller) : null), [caller?.tenantId, caller?.branchId, caller?.email]);
  const [deleting, setDeleting] = useState<AssignableRole | null>(null);
  const [notice, setNotice] = useState("");

  if (!caller) return <Page title="Roles"><p className="text-sm text-[var(--muted-foreground)]">This account isn't linked to a company.</p></Page>;

  const header = { title: "Roles", back: { to: "/portal/staff", label: "Staff" }, description: "What each role lets someone do. Make your own from the permissions you hold; HomeTrue's standard roles can't be changed." };
  if (roles.error || permissions.error) {
    return <Page {...header}><LoadError error={roles.errorValue ?? permissions.errorValue} what="your roles" onRetry={() => { roles.refetch(); permissions.refetch(); }} /></Page>;
  }
  if (!roles.data || !permissions.data) return <Page {...header}><Loading label="Loading roles…" /></Page>;

  const custom = roles.data.filter((r) => r.custom);
  const standard = roles.data.filter((r) => !r.custom);
  const atLimit = custom.length >= MAX_CUSTOM_ROLES;
  const labelFor = (code: string) => permissions.data!.find((p) => p.code === code)?.label ?? code;

  return (
    <Page {...header}>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {!atLimit && <TextLink to="/portal/staff/roles/new" className="font-semibold">+ New role</TextLink>}
          {atLimit && <span className="text-xs text-[var(--muted-foreground)]">Your company has {MAX_CUSTOM_ROLES} roles of its own, the most allowed. Delete one you no longer use first.</span>}
        </div>
      )}
      {!canEdit && holdsPermission && (
        <Alert tone="info" className="mb-6">Roles are managed company-wide. Switch to the whole-company view to create, edit or delete them.</Alert>
      )}
      {saved && !notice && (
        <p className="text-sm text-[var(--muted-foreground)] mb-4" role="status">
          {saved.edited ? `Saved "${saved.name}". ${PROPAGATION_NOTE}` : `Created "${saved.name}". It's now offered when you invite someone or change their role.`}
        </p>
      )}
      {notice && <p className="text-sm text-[var(--muted-foreground)] mb-4" role="status">{notice}</p>}

      <section className="mb-8">
        <h2 className="font-semibold text-[var(--foreground)] mb-3">Your company's roles</h2>
        {custom.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">None yet. {canEdit ? "Create one when the standard roles don't fit how your team works." : ""}</p>
        ) : (
          <ul className="space-y-3">
            {custom.map((role) => (
              <RoleRow key={role.code} role={role} labelFor={labelFor}
                actions={canEdit && (
                  role.canGrant ? (
                    <div className="flex gap-4">
                      <TextLink to={`/portal/staff/roles/${encodeURIComponent(role.code)}/edit`} className="text-sm">Edit</TextLink>
                      <Button variant="linkDanger" className="text-sm" onClick={() => { setDeleting(role); setNotice(""); }}>Delete…</Button>
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--muted-foreground)]">It carries permissions you don't hold, so you can't change it.</p>
                  )
                )} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="font-semibold text-[var(--foreground)] mb-3">HomeTrue's standard roles</h2>
        <ul className="space-y-3">
          {standard.map((role) => <RoleRow key={role.code} role={role} labelFor={labelFor} />)}
        </ul>
      </section>

      {deleting && (
        <DeleteRoleDialog role={deleting} caller={caller} onClose={() => setDeleting(null)}
          onDeleted={() => { setNotice(`Deleted "${deleting.name}".`); setDeleting(null); roles.refetch(); }} />
      )}
    </Page>
  );
}

function RoleRow({ role, labelFor, actions }: { role: AssignableRole; labelFor: (code: string) => string; actions?: React.ReactNode }) {
  const badge = roleKindBadge(role.custom);
  return (
    <ListCard className="space-y-2">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[200px]">
          <div className="font-semibold text-[var(--foreground)]">{role.name}</div>
          {role.description && <p className="text-sm text-[var(--muted-foreground)]">{role.description}</p>}
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{scopeLabel(role.scope)}</p>
        </div>
        <StatusBadge label={badge.label} variant={badge.variant} />
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--foreground)]">
        {role.permissions.map((code) => <li key={code}>✓ {labelFor(code)}</li>)}
      </ul>
      {actions}
    </ListCard>
  );
}

function DeleteRoleDialog({ role, caller, onClose, onDeleted }: { role: AssignableRole; caller: StaffCaller; onClose: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      await deleteRole(role.code, caller);
      onDeleted();
    } catch (err) {
      // ROLE_IN_USE says what to do first: reassign, or revoke an invitation.
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <Dialog title={`Delete "${role.name}"?`} onClose={onClose}>
      <p className="text-sm text-[var(--muted-foreground)] mb-3">Only possible while nobody holds it and no open invitation or branch request offers it. Past invitations keep its name.</p>
      {error && <ErrorText className="mb-3">{error}</ErrorText>}
      <DialogActions onCancel={onClose} onConfirm={confirm} confirmLabel="Delete role" busy={busy} busyLabel="Deleting…" variant="danger" />
    </Dialog>
  );
}

// ─── /portal/staff/roles/new and /portal/staff/roles/:code/edit ──────────────

export function RoleEditor() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { caller, canEdit } = useRoleCaller();
  const loaded = useFetch(async () => {
    if (!caller) return null;
    // Branches only matter when creating: the scope is chosen then, never after.
    const [permissions, roles, branches] = await Promise.all([
      fetchPortalPermissions(caller),
      code ? fetchAssignableRoles(caller) : Promise.resolve([]),
      code ? Promise.resolve(null) : fetchBranches({ tenantId: caller.tenantId, branchId: caller.branchId }),
    ]);
    return { permissions, role: code ? roles.find((r) => r.code === code) ?? null : null, hasBranches: branches === null || branches.length > 0 };
  }, [code, caller?.tenantId, caller?.branchId, caller?.email]);

  const title = code ? "Edit role" : "New role";
  const back = { to: "/portal/staff/roles", label: "Roles" };
  if (!caller) return <Page title={title} back={back} width="lg"><p className="text-sm text-[var(--muted-foreground)]">This account isn't linked to a company.</p></Page>;
  if (!canEdit) return <Page title={title} back={back} width="lg"><Alert tone="info">Roles are managed company-wide. Switch to the whole-company view to create or edit them.</Alert></Page>;
  if (loaded.error) return <Page title={title} back={back} width="lg"><LoadError error={loaded.errorValue} what="this role" onRetry={loaded.refetch} /></Page>;
  if (!loaded.data) return <Page title={title} back={back} width="lg"><Loading /></Page>;

  const { permissions, role, hasBranches } = loaded.data;
  if (code && !role) return <Page title={title} back={back} width="lg"><Alert>That role no longer exists.</Alert></Page>;
  if (role && !role.custom) return <Page title={title} back={back} width="lg"><Alert>HomeTrue's standard roles can't be changed. Create your own role instead.</Alert></Page>;

  return (
    <Page title={role ? `Edit ${role.name}` : title} back={back} width="lg"
      description={role ? PROPAGATION_NOTE : "A name, where it can be given, and what it lets someone do. You can only include permissions you hold."}>
      <RoleForm role={role} permissions={permissions} caller={caller} hasBranches={hasBranches}
        onDone={(saved) => navigate("/portal/staff/roles", { state: { saved: { name: saved.name, edited: !!role } } })}
        onCancel={() => navigate("/portal/staff/roles")} />
    </Page>
  );
}

function RoleForm({ role, permissions, caller, hasBranches, onDone, onCancel }: {
  role: AssignableRole | null; permissions: PortalPermission[]; caller: StaffCaller; hasBranches: boolean;
  onDone: (saved: AssignableRole) => void; onCancel: () => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [scope, setScope] = useState<RoleScope>(role?.scope ?? "either");
  const [chosen, setChosen] = useState<string[]>(role?.permissions ?? []);
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const errorFor = (field: string) => (error?.field === field ? error.message : undefined);

  // Company-wide-only permissions can't sit in a narrower role, so changing
  // the scope drops any already ticked.
  const changeScope = (next: RoleScope) => {
    setScope(next);
    const dropped = companyOnlyPermissions(next, chosen, permissions);
    if (dropped.length) setChosen(chosen.filter((c) => !dropped.includes(c)));
  };

  const toggle = (code: string) => setChosen(chosen.includes(code) ? chosen.filter((c) => c !== code) : [...chosen, code]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      // Kept in catalogue order, so the role reads the same way everywhere.
      const ordered = permissions.map((p) => p.code).filter((c) => chosen.includes(c));
      const saved = role
        ? await updateRole(role.code, { name, description, permissions: ordered }, caller)
        : await createRole({ name, description, scope, permissions: ordered }, caller);
      onDone(saved);
    } catch (err) {
      setError(err instanceof StaffError ? { field: err.field, message: err.message } : { field: "form", message: errorText(err) });
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-5" noValidate>
      <Field id="role-name" label="Name" error={errorFor("name")} hint="Unique in your company, and not the name of one of HomeTrue's standard roles.">
        <Input id="role-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Accounts Clerk" />
      </Field>
      <Field id="role-description" label="Description (optional)" error={errorFor("description")}>
        <Textarea id="role-description" value={description} maxLength={500} rows={2} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      {role ? (
        <div>
          <div className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Where it can be given</div>
          <p className="text-sm text-[var(--foreground)]">{scopeLabel(role.scope)}</p>
          <p className="text-xs text-[var(--muted-foreground)] mt-1">A role's scope can't change, because people may already hold it that way. Create a new role instead.</p>
        </div>
      ) : (
        <fieldset>
          <legend className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Where it can be given</legend>
          <div className="space-y-2">
            {SCOPES.map((s) => (
              <label key={s.id} className="flex items-start gap-2 text-sm cursor-pointer">
                <input type="radio" name="role-scope" value={s.id} checked={scope === s.id} onChange={() => changeScope(s.id)} className="mt-1" />
                <span>
                  <span className="text-[var(--foreground)]">{s.label}</span>
                  <span className="block text-xs text-[var(--muted-foreground)]">{s.hint}</span>
                  {/* Allowed — a company may set roles up before opening
                      branches, and the scope can't be changed later — but
                      nobody can be given it yet. Said only once chosen. */}
                  {s.id === "branch" && !hasBranches && (
                    <span role="status" className="block text-xs text-[var(--warning-text)] mt-0.5">
                      {scope === "branch" && "Your company has no branches yet. You can create this role now, but you can't give it to anyone until you add a branch."}
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
          {errorFor("scope") && <p className="text-xs text-[var(--error-text)] mt-1">{errorFor("scope")}</p>}
        </fieldset>
      )}

      <fieldset aria-describedby={errorFor("permissions") ? "role-permissions-error" : undefined}>
        <legend className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5">What it lets someone do</legend>
        {/* Grouped under HomeTrue's headings (changeset 085), in its order. */}
        <div className="space-y-5">
          {groupPermissions(permissions).map((g) => (
            <div key={g.group} role="group" aria-labelledby={`perm-group-${g.group}`}>
              <h3 id={`perm-group-${g.group}`} className="text-sm font-semibold text-[var(--foreground)] mb-2">{g.label}</h3>
              <div className="space-y-3 pl-1">
                {g.permissions.map((p) => {
                  // Shown but disabled, with the reason: you can only give what
                  // you hold, and some permissions only work company-wide.
                  const narrow = p.requiresCompanyWide && scope !== "company";
                  const reason = !p.held ? "You don't hold this, so you can't give it." : narrow ? "Only works for company-wide staff — needs a \"Company-wide only\" role." : null;
                  const id = `perm-${p.code}`;
                  return (
                    <label key={p.code} htmlFor={id} className={`flex items-start gap-2 text-sm ${reason ? "opacity-60" : "cursor-pointer"}`}>
                      <input id={id} type="checkbox" checked={chosen.includes(p.code)} disabled={!!reason} onChange={() => toggle(p.code)} className="mt-1" />
                      <span>
                        <span className="text-[var(--foreground)]">{p.label}</span>
                        <span className="block text-xs text-[var(--muted-foreground)]">{p.description}</span>
                        {reason && <span className="block text-xs text-[var(--muted-foreground)] italic">{reason}</span>}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {errorFor("permissions") && <p id="role-permissions-error" className="text-xs text-[var(--error-text)] mt-2">{errorFor("permissions")}</p>}
      </fieldset>

      {role && <Alert tone="info">{PROPAGATION_NOTE}</Alert>}
      {error?.field === "form" && <ErrorText>{error.message}</ErrorText>}
      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : role ? "Save changes" : "Create role"}</Button>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
