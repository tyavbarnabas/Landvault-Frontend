// Requests a reset code, then hands off to /reset-password. Laid out from
// the Figma "Sign-in & landing" proposal. It used to run a
// four-step flow entirely on setTimeout and never reached the backend at all.
//
// The response is IDENTICAL whether or not the email has an account — so this
// screen always says "if there's an account, we've sent a code". Anything more
// specific would let an attacker enumerate registered addresses.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AuthShell, { AuthHeading } from "../../components/auth/AuthShell";
import Button from "../../components/ui/Button";
import TextLink from "../../components/ui/TextLink";
import { ErrorText, Field, Input } from "../../components/ui/Field";
import { LockIcon } from "../../components/icons";
import { forgotPassword } from "../../services/authService";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { setError("Enter your email address."); return; }
    setLoading(true);
    setError("");
    try {
      await forgotPassword(email.trim());
      setSent(true);
    } catch {
      // Even a failure must not hint at whether the address is registered.
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell>
      {sent ? (
        <>
          <span className="w-11 h-11 rounded-lg bg-[var(--secondary)] text-[var(--primary)] flex items-center justify-center mb-5"><LockIcon size={20} /></span>
          {/* Deliberately non-committal: the same words for a registered
              address and an unregistered one. */}
          <AuthHeading title="Check your email">
            If there's an account for <span className="text-[var(--foreground)] font-medium">{email}</span>, we've sent it a 6-digit reset code.
            It can take a minute to arrive.
          </AuthHeading>
          <div className="space-y-3">
            <Button size="lg" fullWidth onClick={() => navigate("/reset-password", { state: { email } })}>Enter the code</Button>
            <Button size="lg" variant="secondary" fullWidth onClick={submit} disabled={loading}>{loading ? "Sending…" : "Send another code"}</Button>
          </div>
        </>
      ) : (
        <>
          <AuthHeading title="Reset your password">Enter your email and we'll send a code to reset your password.</AuthHeading>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field id="forgot-email" label="Email">
              <Input id="forgot-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </Field>
            {error && <ErrorText>{error}</ErrorText>}
            <Button type="submit" size="lg" fullWidth disabled={loading}>{loading ? "Sending…" : "Send reset code"}</Button>
          </form>
        </>
      )}

      <p className="text-sm mt-6"><TextLink to="/login" muted>← Back to sign in</TextLink></p>
    </AuthShell>
  );
}
