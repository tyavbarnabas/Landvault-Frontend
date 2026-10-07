// Change your own password by proving you know the current one —
// `POST /api/auth/change-password`.
//
// This is deliberately NOT the reset flow. A reset proves control of a
// mailbox; this proves knowledge of the password being replaced, which is what
// a change-password screen means. It also works with no mail configured, so a
// bootstrapped admin can retire a temporary credential that has been through
// an environment variable and a shell history. Someone who has FORGOTTEN
// their password belongs on /forgot-password → /reset-password instead.
//
// The only client-side checks are that the fields are filled in and the two
// new-password fields match (a typo guard). There is no strength rule here:
// the backend applies registration's rule and nothing stricter, and a rule
// the backend won't enforce would only be theatre.

import { assessPassword } from "../../lib/passwordPolicy";
import PasswordInput from "../../components/auth/PasswordInput";
import PasswordStrength from "../../components/auth/PasswordStrength";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../../contexts/AppContext";
import { MOCK_DEMO_CODES, changePassword, errorCodeOf, landingRouteFor } from "../../services/authService";
import { AuthShell } from "./Login";
import { isLive } from "../../lib/backends";

type FieldKey = "currentPassword" | "newPassword";

export default function ChangePassword() {
  const navigate = useNavigate();
  const { user, passwordChanged } = useApp();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const temporary = user?.mustChangePassword === true;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Partial<Record<FieldKey, string>> = {};
    if (!current) errors.currentPassword = "Enter your current password.";
    const pw = assessPassword(password, { email: user?.email });
    if (!password) errors.newPassword = "Choose a new password.";
    else if (!pw.acceptable) errors.newPassword = pw.problem ?? "Choose a stronger password.";
    else if (password === current) errors.newPassword = "Choose a password different from your current one.";
    setFieldErrors(errors);
    setFormError("");
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    try {
      await changePassword({ currentPassword: current, newPassword: password }, user?.email ?? "");
      passwordChanged();
      setDone(true);
    } catch (err) {
      // 401 INVALID_CREDENTIALS is the backend's answer for a wrong current
      // password — login's own response, not an expired session.
      if (errorCodeOf(err) === "INVALID_CREDENTIALS") {
        setFieldErrors({ currentPassword: "That isn't your current password." });
      } else {
        const serverFields = (err as { body?: { fieldErrors?: Record<string, string> } }).body?.fieldErrors;
        if (serverFields && (serverFields.currentPassword || serverFields.newPassword)) {
          setFieldErrors({ currentPassword: serverFields.currentPassword, newPassword: serverFields.newPassword });
        } else if ((errorCodeOf(err) as string | null) === "WEAK_PASSWORD") {
          // The backend's pending password rule — its message, as-is.
          setFieldErrors({ newPassword: err instanceof Error && err.message ? err.message : "Choose a stronger password." });
        } else {
          setFormError("Couldn't change your password. Please try again.");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <div className="w-full max-w-sm mx-auto">
        <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">Change your password</h1>

        {!done && (
          <>
            <p className="text-sm text-[var(--muted-foreground)] mb-8">
              {temporary
                ? "You're signed in with a temporary password. Set one of your own before carrying on."
                : "Enter your current password, then choose a new one."}
            </p>
            <form onSubmit={submit} className="space-y-4" noValidate>
              <Field id="cp-current" label={temporary ? "Temporary password" : "Current password"} value={current} onChange={setCurrent} error={fieldErrors.currentPassword} autoComplete="current-password" />
              <Field id="cp-password" label="New password" value={password} onChange={setPassword} error={fieldErrors.newPassword} autoComplete="new-password">
                <PasswordStrength id="cp-password-guide" assessment={assessPassword(password, { email: user?.email })} started={password.length > 0} />
              </Field>
              {formError && <p className="text-sm text-red-600" role="alert">{formError}</p>}
              <button type="submit" disabled={loading} className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium disabled:opacity-60 hover:opacity-90">
                {loading ? "Updating…" : "Change password"}
              </button>
            </form>
            {!isLive("auth") && (
              <p className="text-xs text-[var(--muted-foreground)] mt-3">Demo mode: the current password is {MOCK_DEMO_CODES.currentPassword}.</p>
            )}
            <p className="text-xs text-[var(--muted-foreground)] mt-6">
              Forgotten your current password? <Link to="/forgot-password" className="text-[var(--accent)] hover:underline">Reset it by email</Link> instead.
            </p>
          </>
        )}

        {done && (
          <>
            <p className="text-sm text-[var(--foreground)] mb-3">Your password has been changed.</p>
            {/* Honest about reach. This browser gets a fresh session cookie and
                stays signed in. Every other session's refresh is revoked now,
                but an access token already issued rides out its remaining
                lifetime — up to 15 minutes. Not instant. */}
            <p className="text-sm text-[var(--muted-foreground)] mb-8">
              You stay signed in here. Everywhere else you're signed in has been told to stop renewing — but that isn't
              instant: a session already open on another device can keep working for up to 15 minutes before it asks for
              your new password.
            </p>
            <button onClick={() => navigate(landingRouteFor(user))} className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90">
              Continue
            </button>
          </>
        )}
      </div>
    </AuthShell>
  );
}

function Field({ id, label, value, onChange, error, autoComplete, children }: {
  id: string; label: string; value: string; onChange: (v: string) => void; error?: string; autoComplete: "current-password" | "new-password"; children?: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">{label}</label>
      <PasswordInput id={id} value={value} onChange={onChange} autoComplete={autoComplete} invalid={!!error} describedBy={error ? `${id}-error` : undefined} />
      {error && <p id={`${id}-error`} className="text-xs text-red-600 mt-1">{error}</p>}
      {children}
    </div>
  );
}
