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
// Laid out from the Figma "Sign-in & landing" proposal.

import { assessPassword } from "../../lib/passwordPolicy";
import PasswordInput from "../../components/auth/PasswordInput";
import PasswordStrength from "../../components/auth/PasswordStrength";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../contexts/AppContext";
import { landingRouteFor } from "../../services/authService";
import { INVALID_INVITATION_MESSAGE, previewInvitation, tokenFromHash, type InvitationPreview } from "../../services/staffService";
import AuthShell, { AuthHeading } from "../../components/auth/AuthShell";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import TextLink from "../../components/ui/TextLink";
import { InfoBox } from "../../components/ui/Card";
import { ErrorText, Field } from "../../components/ui/Field";
import { Loading } from "../../components/ui/Page";
import { BuildingIcon } from "../../components/icons";
import { formatDayTime } from "../../lib/formatDate";

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
      {invalid ? (
        <>
          <AuthHeading title="Join your team" />
          <Alert role="alert" className="mb-6">{INVALID_INVITATION_MESSAGE}</Alert>
          <TextLink to="/login" className="text-sm font-medium">Go to sign in</TextLink>
        </>
      ) : !preview ? (
        <>
          <AuthHeading title="Join your team" />
          <Loading label="Checking your invitation…" />
        </>
      ) : (
        <>
          <span className="w-11 h-11 rounded-lg bg-[var(--secondary)] text-[var(--primary)] flex items-center justify-center mb-5"><BuildingIcon size={20} /></span>
          <AuthHeading title={`Join ${preview.companyName}`}>
            Hi {preview.firstName} — you've been invited to HomeTrue's developer portal.
          </AuthHeading>
          <div className="space-y-2 mb-6">
            <InfoBox label="Role"><div className="font-medium text-[var(--foreground)]">{preview.roleName}</div></InfoBox>
            <InfoBox label="Branch"><div className="font-medium text-[var(--foreground)]">{preview.branchName ?? "Company-wide"}</div></InfoBox>
            <InfoBox label="Your sign-in email"><div className="font-medium text-[var(--foreground)] break-all">{preview.email}</div></InfoBox>
            <InfoBox label="Link expires"><div className="font-medium text-[var(--foreground)]">{formatDayTime(preview.expiresAt)} · works once</div></InfoBox>
          </div>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field id="inv-password" label="Choose a password">
              <PasswordInput id="inv-password" value={password} onChange={setPassword} autoComplete="new-password" placeholder="Choose a strong password" describedBy="inv-password-guide" />
              <PasswordStrength id="inv-password-guide" assessment={assessPassword(password, { email: preview.email })} started={password.length > 0} />
            </Field>
            {error && <ErrorText>{error}</ErrorText>}
            <Button type="submit" size="lg" fullWidth disabled={saving}>{saving ? "Setting up your account…" : "Accept and sign in"}</Button>
          </form>
        </>
      )}
    </AuthShell>
  );
}
