// Completes the reset flow that /forgot-password starts. Until now that screen
// led nowhere and this one didn't exist.
//
// ENUMERATION PROTECTION IS THE POINT HERE: the backend returns the same
// response whether or not an email has an account, and one generic error for a
// wrong code, an expired code, and a code that was never requested. It even
// does a dummy hash comparison on login to keep the timing equal. A helpful
// "no account found" here would throw all of that away.

import { assessPassword } from "../../lib/passwordPolicy";
import PasswordInput from "../../components/auth/PasswordInput";
import PasswordStrength from "../../components/auth/PasswordStrength";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthShell } from "./Login";
import { MOCK_DEMO_CODES, errorCodeOf, resetPassword } from "../../services/authService";
import { isLive } from "../../lib/backends";

export default function ResetPassword() {
  const navigate = useNavigate();
  // Carried in router state, never in the URL — a reset code in a query string
  // ends up in history, logs and referrers.
  const carriedEmail = (useLocation().state as { email?: string } | null)?.email ?? "";

  const [email, setEmail] = useState(carriedEmail);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError("Enter the email address you requested the code for."); return; }
    if (!code.trim()) { setError("Enter the reset code from your email."); return; }
    // The same rule as sign-up (passwordPolicy.ts) — a reset must not be the
    // way round it.
    const pw = assessPassword(password, { email });
    if (!password) { setError("Choose a new password."); return; }
    if (!pw.acceptable) { setError(pw.problem ?? "Choose a stronger password."); return; }

    setLoading(true);
    setError("");
    try {
      await resetPassword({ email: email.trim(), code: code.trim(), newPassword: password });
      setDone(true);
    } catch (err) {
      // One message for every code failure, on purpose — except a weak
      // password, which is about what was typed here, not about the code.
      // WEAK_PASSWORD: the backend's pending password rule (not in
      // AUTH_ERROR_CODES until the backend sends it), surfaced as-is.
      const code: string | null = errorCodeOf(err);
      setError(code === "WEAK_PASSWORD" && err instanceof Error && err.message ? err.message
        : code === "INVALID_OR_EXPIRED_CODE"
          ? "That code is invalid or has expired. Request a new one and try again."
          : "Couldn't reset your password. Please request a new code and try again.");
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthShell>
        <div className="w-full max-w-sm mx-auto">
          <h1 className="font-display text-3xl text-[var(--foreground)] mb-2">Password updated</h1>
          <p className="text-sm text-[var(--muted-foreground)] mb-8">You can now sign in with your new password.</p>
          <button onClick={() => navigate("/login")} className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90">
            Go to sign in
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="w-full max-w-sm mx-auto">
        <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">Set a new password</h1>
        <p className="text-sm text-[var(--muted-foreground)] mb-8">
          Enter the code we emailed you, then choose a new password.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <Field id="reset-email" label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" />
          <Field id="reset-code" label="Reset code" type="text" value={code} onChange={setCode} placeholder="000000" maxLength={6} />
          <div>
            <label htmlFor="reset-password" className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">New password</label>
            <PasswordInput id="reset-password" value={password} onChange={setPassword} autoComplete="new-password" placeholder="Choose a strong password" describedBy="reset-password-guide" />
            <PasswordStrength id="reset-password-guide" assessment={assessPassword(password, { email })} started={password.length > 0} />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={loading} className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium disabled:opacity-60 hover:opacity-90">
            {loading ? "Updating…" : "Update password"}
          </button>
        </form>

        <p className="text-xs text-[var(--muted-foreground)] mt-6">
          Didn't get a code? <Link to="/forgot-password" className="text-[var(--accent)] hover:underline">Request another</Link>.
        </p>

        {!isLive("auth") && (
          <p className="text-xs text-[var(--muted-foreground)] mt-2">Demo mode: the reset code is {MOCK_DEMO_CODES.reset}.</p>
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
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full px-3 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]"
      />
    </div>
  );
}
