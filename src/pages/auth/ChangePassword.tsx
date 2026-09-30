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

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useApp } from "../../contexts/AppContext";
import { MOCK_DEMO_CODES, changePassword, errorCodeOf, landingRouteFor } from "../../services/authService";
import { apiClient } from "../../lib/apiClient";
import { AuthShell } from "./Login";

type FieldKey = "currentPassword" | "newPassword" | "confirm";

export default function ChangePassword() {
  const navigate = useNavigate();
  const { user, logout, passwordChanged } = useApp();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const temporary = user?.mustChangePassword === true;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Partial<Record<FieldKey, string>> = {};
    if (!current) errors.currentPassword = "Enter your current password.";
    if (!password.trim()) errors.newPassword = "Choose a new password.";
    else if (password !== confirm) errors.confirm = "Those passwords don't match.";
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
        } else {
          setFormError("Couldn't change your password. Please try again.");
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const signInAgain = () => {
    logout();
    navigate("/login");
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
              <Field id="cp-password" label="New password" value={password} onChange={setPassword} error={fieldErrors.newPassword} autoComplete="new-password" />
              <Field id="cp-confirm" label="Confirm new password" value={confirm} onChange={setConfirm} error={fieldErrors.confirm} autoComplete="new-password" />
              {formError && <p className="text-sm text-red-600" role="alert">{formError}</p>}
              <button type="submit" disabled={loading} className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium disabled:opacity-60 hover:opacity-90">
                {loading ? "Updating…" : "Change password"}
              </button>
            </form>
            {apiClient.isMockMode && (
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
            {/* Honest about reach: refresh tokens are revoked now, but an
                access token already issued rides out its remaining lifetime —
                up to 15 minutes. This session is no exception. */}
            <p className="text-sm text-[var(--muted-foreground)] mb-8">
              No session — this one included — can renew itself with the old sign-in any more. That isn't instant: a session
              that's already open, on this device or another, keeps working until its current access expires, which can take
              up to 15 minutes. After that, it asks for your new password.
            </p>
            <div className="space-y-2">
              <button onClick={() => navigate(landingRouteFor(user))} className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90">
                Continue
              </button>
              <button onClick={signInAgain} className="w-full py-2.5 border border-[var(--border)] text-[var(--foreground)] rounded-md text-sm font-medium hover:bg-[var(--muted)]">
                Sign in again now
              </button>
            </div>
          </>
        )}
      </div>
    </AuthShell>
  );
}

function Field({ id, label, value, onChange, error, autoComplete }: {
  id: string; label: string; value: string; onChange: (v: string) => void; error?: string; autoComplete: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">{label}</label>
      <input
        id={id} type="password" value={value} placeholder="••••••••" autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`w-full px-3 py-2.5 bg-[var(--card)] border rounded-md text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] ${error ? "border-red-400" : "border-[var(--border)]"}`}
      />
      {error && <p id={`${id}-error`} className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}
