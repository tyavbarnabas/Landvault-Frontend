// Where `mustChangePassword` routes to. A temporary password has been through
// an environment variable and probably a shell history, so it shouldn't stay
// in use — but nothing was routing on the flag and no screen existed.
//
// CONTRACT GAP, stated plainly rather than worked around: there is no
// session-authenticated change-password endpoint on the backend.
// `SuperAdminBootstrap` says so in as many words ("the endpoint doesn't
// exist"). So this screen completes using the two endpoints that DO exist —
// forgot-password to send a code, reset-password to set the new one — which
// means the change is verified against the account's email rather than against
// the current password. See INTEGRATION.md for the endpoint worth adding.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../contexts/AppContext";
import { MOCK_DEMO_CODES, errorCodeOf, forgotPassword, resetPassword } from "../../services/authService";
import { apiClient } from "../../lib/apiClient";
import { AuthShell } from "./Login";
import { landingRouteFor } from "../../services/authService";

type Stage = "request" | "enter" | "done";

export default function ChangePassword() {
  const navigate = useNavigate();
  const { user } = useApp();
  const [stage, setStage] = useState<Stage>("request");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const email = user?.email ?? "";

  const requestCode = async () => {
    setLoading(true);
    setError("");
    try {
      await forgotPassword(email);
      setStage("enter");
    } catch {
      setError("Couldn't send a code just now. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) { setError("Enter the code we emailed you."); return; }
    if (!password) { setError("Choose a new password."); return; }
    if (password !== confirm) { setError("Those passwords don't match."); return; }

    setLoading(true);
    setError("");
    try {
      await resetPassword({ email, code: code.trim(), newPassword: password });
      setStage("done");
    } catch (err) {
      setError(errorCodeOf(err) === "INVALID_OR_EXPIRED_CODE"
        ? "That code is invalid or has expired. Send a new one and try again."
        : "Couldn't change your password. Please try again.");
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      <div className="w-full max-w-sm mx-auto">
        <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">Change your password</h1>

        {stage === "request" && (
          <>
            <p className="text-sm text-[var(--muted-foreground)] mb-8">
              You're signed in with a temporary password. Set one of your own before carrying on — we'll email a code to
              <span className="text-[var(--foreground)]"> {email}</span> to confirm it's you.
            </p>
            {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
            <button onClick={requestCode} disabled={loading} className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium disabled:opacity-60 hover:opacity-90">
              {loading ? "Sending…" : "Email me a code"}
            </button>
          </>
        )}

        {stage === "enter" && (
          <>
            <p className="text-sm text-[var(--muted-foreground)] mb-8">Enter the code we sent, then choose your new password.</p>
            <form onSubmit={submit} className="space-y-4">
              <Field id="cp-code" label="Code" type="text" value={code} onChange={setCode} placeholder="000000" maxLength={6} />
              <Field id="cp-password" label="New password" type="password" value={password} onChange={setPassword} placeholder="••••••••" />
              <Field id="cp-confirm" label="Confirm new password" type="password" value={confirm} onChange={setConfirm} placeholder="••••••••" />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button type="submit" disabled={loading} className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium disabled:opacity-60 hover:opacity-90">
                {loading ? "Updating…" : "Set new password"}
              </button>
            </form>
            {apiClient.isMockMode && (
              <p className="text-xs text-[var(--muted-foreground)] mt-3">Demo mode: the code is {MOCK_DEMO_CODES.reset}.</p>
            )}
          </>
        )}

        {stage === "done" && (
          <>
            <p className="text-sm text-[var(--muted-foreground)] mb-8">Your password has been changed.</p>
            <button onClick={() => navigate(landingRouteFor(user))} className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90">
              Continue
            </button>
          </>
        )}
      </div>
    </AuthShell>
  );
}

function Field({ id, label, type, value, onChange, placeholder, maxLength }: {
  id: string; label: string; type: string; value: string; onChange: (v: string) => void; placeholder: string; maxLength?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">{label}</label>
      <input
        id={id} type={type} value={value} maxLength={maxLength} placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]"
      />
    </div>
  );
}
