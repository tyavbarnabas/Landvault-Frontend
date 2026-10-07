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

import { assessPassword } from "../../lib/passwordPolicy";
import PasswordInput from "../../components/auth/PasswordInput";
import PasswordStrength from "../../components/auth/PasswordStrength";
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
    // The same rule as sign-up (passwordPolicy.ts) — one rule for every password.
    const pw = assessPassword(password, { email: preview?.email });
    if (!pw.acceptable) { setError(pw.problem ?? "Choose a stronger password."); return; }
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
              <div>
                <label htmlFor="inv-password" className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Choose a password</label>
                <PasswordInput id="inv-password" value={password} onChange={setPassword} autoComplete="new-password" placeholder="Choose a strong password" describedBy="inv-password-guide" />
                <PasswordStrength id="inv-password-guide" assessment={assessPassword(password, { email: preview.email })} started={password.length > 0} />
              </div>
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
