// Completes the reset flow that /forgot-password starts (laid out from the
// Figma "Sign-in & landing" proposal). Until now that screen
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
import { useLocation, useNavigate } from "react-router-dom";
import AuthShell, { AuthHeading } from "../../components/auth/AuthShell";
import CodeInput from "../../components/auth/CodeInput";
import Button from "../../components/ui/Button";
import TextLink from "../../components/ui/TextLink";
import { ErrorText, Field, Input } from "../../components/ui/Field";
import { CheckIcon } from "../../components/icons";
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
        <span className="w-11 h-11 rounded-lg bg-[var(--success-surface)] text-[var(--success-text)] flex items-center justify-center mb-5"><CheckIcon size={20} /></span>
        <AuthHeading title="Password updated">You can now sign in with your new password.</AuthHeading>
        <Button size="lg" fullWidth onClick={() => navigate("/login")}>Go to sign in</Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <AuthHeading title="Set a new password">Enter the code we emailed you, then choose a new password.</AuthHeading>

      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field id="reset-email" label="Email">
          <Input id="reset-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </Field>
        <Field id="reset-code" label="Reset code">
          <CodeInput id="reset-code" value={code} onChange={setCode} />
        </Field>
        <Field id="reset-password" label="New password">
          <PasswordInput id="reset-password" value={password} onChange={setPassword} autoComplete="new-password" placeholder="Choose a strong password" describedBy="reset-password-guide" />
          <PasswordStrength id="reset-password-guide" assessment={assessPassword(password, { email })} started={password.length > 0} />
        </Field>

        {error && <ErrorText>{error}</ErrorText>}

        <Button type="submit" size="lg" fullWidth disabled={loading}>{loading ? "Updating…" : "Update password"}</Button>
      </form>

      <p className="text-sm mt-6 text-[var(--muted-foreground)]">
        Didn't get a code? <TextLink to="/forgot-password" className="font-medium">Request another</TextLink>
      </p>

      {!isLive("auth") && (
        <p className="text-xs text-[var(--muted-foreground)] mt-2">Demo mode: the reset code is {MOCK_DEMO_CODES.reset}.</p>
      )}
    </AuthShell>
  );
}
