// Requests a reset code, then hands off to /reset-password. It used to run a
// four-step flow entirely on setTimeout and never reached the backend at all.
//
// The response is IDENTICAL whether or not the email has an account — so this
// screen always says "if there's an account, we've sent a code". Anything more
// specific would let an attacker enumerate registered addresses.

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell } from "./Login";
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
      <div className="w-full max-w-sm mx-auto">
        <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">Reset your password</h1>

        {sent ? (
          <>
            {/* Deliberately non-committal: the same words for a registered
                address and an unregistered one. */}
            <p className="text-sm text-[var(--muted-foreground)] mb-8">
              If there's an account for <span className="text-[var(--foreground)]">{email}</span>, we've sent it a reset code. Enter it on
              the next screen to choose a new password.
            </p>
            <button
              onClick={() => navigate("/reset-password", { state: { email } })}
              className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90"
            >
              I have a code
            </button>
            <button onClick={submit} disabled={loading} className="w-full py-2 mt-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-60">
              Send another code
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-[var(--muted-foreground)] mb-8">
              Enter your email and we'll send a code to reset your password.
            </p>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label htmlFor="forgot-email" className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Email</label>
                <input
                  id="forgot-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]"
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button type="submit" disabled={loading} className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium disabled:opacity-60 hover:opacity-90">
                {loading ? "Sending…" : "Send reset code"}
              </button>
            </form>
          </>
        )}

        <p className="text-xs text-[var(--muted-foreground)] mt-6">
          <Link to="/login" className="text-[var(--accent)] hover:underline">Back to sign in</Link>
        </p>
      </div>
    </AuthShell>
  );
}
