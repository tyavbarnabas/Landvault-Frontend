// Accept a staff invitation and set your own password (FS-6). PUBLIC — no
// session exists yet.
//
// The token arrives in the URL FRAGMENT (/accept-invitation#token=…). A
// fragment is never sent to a server, so it never lands in an access log or a
// Referer header. It's read here, client-side, sent in a request BODY, and
// cleared from the address bar straight away.
//
// The preview comes first: the company, role and branch are shown before
// anything is committed. An unknown, expired, revoked or already-used link
// all get ONE message — telling them apart would reveal which links existed.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../../contexts/AppContext";
import { landingRouteFor } from "../../services/authService";
import { INVALID_INVITATION_MESSAGE, previewInvitation, tokenFromHash, type InvitationPreview } from "../../services/staffService";
import { AuthShell } from "./Login";

// Read once, at module evaluation per navigation, before the hash is cleared.
function readToken(): string | null {
  return typeof window === "undefined" ? null : tokenFromHash(window.location.hash);
}

export default function AcceptInvitation() {
  const navigate = useNavigate();
  const { acceptInvitation } = useApp();
  const [token] = useState(readToken);
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [invalid, setInvalid] = useState(!token);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Off the address bar (and out of history) as soon as it's been read.
    if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
    if (!token) return;
    let cancelled = false;
    previewInvitation(token)
      .then((p) => { if (!cancelled) setPreview(p); })
      .catch(() => { if (!cancelled) setInvalid(true); });
    return () => { cancelled = true; };
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    // A typo guard only — the password carries registration's rule and no
    // stricter one invented here.
    if (!password) { setError("Choose a password."); return; }
    if (password !== confirm) { setError("Those passwords don't match."); return; }
    setSaving(true);
    setError("");
    try {
      const user = await acceptInvitation(token, password);
      navigate(landingRouteFor(user));
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "INVITATION_INVALID") setInvalid(true);
      else setError(err instanceof Error ? err.message : "That didn't go through.");
      setSaving(false);
    }
  };

  return (
    <AuthShell>
      <div className="w-full max-w-sm mx-auto">
        <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">Join your team</h1>

        {invalid ? (
          <>
            <p className="text-sm text-[var(--muted-foreground)] mb-6" role="alert">{INVALID_INVITATION_MESSAGE}</p>
            <Link to="/login" className="text-sm text-[var(--accent)] hover:underline">Go to sign in</Link>
          </>
        ) : !preview ? (
          <p className="text-sm text-[var(--muted-foreground)]">Checking your invitation…</p>
        ) : (
          <>
            <p className="text-sm text-[var(--muted-foreground)] mb-6">
              Hi {preview.firstName} — you've been invited to join <span className="text-[var(--foreground)] font-medium">{preview.companyName}</span>{" "}
              as <span className="text-[var(--foreground)] font-medium">{preview.roleName}</span>
              {preview.branchName ? <>, in the <span className="text-[var(--foreground)] font-medium">{preview.branchName}</span> branch</> : <>, company-wide</>}.
            </p>
            <dl className="text-xs text-[var(--muted-foreground)] mb-6 space-y-1">
              <div>Your sign-in email: <span className="text-[var(--foreground)]">{preview.email}</span></div>
              <div>This link expires {new Date(preview.expiresAt).toLocaleString()} and works once.</div>
            </dl>
            <form onSubmit={submit} className="space-y-4" noValidate>
              <PasswordField id="inv-password" label="Choose a password" value={password} onChange={setPassword} />
              <PasswordField id="inv-confirm" label="Confirm password" value={confirm} onChange={setConfirm} />
              {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
              <button type="submit" disabled={saving} className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium disabled:opacity-60 hover:opacity-90">
                {saving ? "Setting up your account…" : "Accept and sign in"}
              </button>
            </form>
          </>
        )}
      </div>
    </AuthShell>
  );
}

function PasswordField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">{label}</label>
      <input id={id} type="password" autoComplete="new-password" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm text-[var(--foreground)]" />
    </div>
  );
}
