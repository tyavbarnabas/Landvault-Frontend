import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell } from "./Login";

type Step = "email" | "code" | "newpass" | "done";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleEmail = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { setError("Enter your email address."); return; }
    setError("");
    setLoading(true);
    setTimeout(() => { setLoading(false); setStep("code"); }, 700);
  };

  const handleCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length < 6) { setError("Enter the 6-digit reset code."); return; }
    setError("");
    setStep("newpass");
  };

  const handlePassword = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setError("");
    setLoading(true);
    setTimeout(() => { setLoading(false); setStep("done"); }, 800);
  };

  return (
    <AuthShell>
      <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">Reset password</h1>
      <p className="text-[var(--muted-foreground)] text-sm mb-8">
        Remember it? <Link to="/login" className="text-[var(--accent)] hover:underline">Sign in</Link>
      </p>

      {/* Progress */}
      <div className="flex gap-1.5 mb-8">
        {(["email", "code", "newpass", "done"] as Step[]).map((s, i) => (
          <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${i <= (["email", "code", "newpass", "done"] as Step[]).indexOf(step) ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`} />
        ))}
      </div>

      {step === "email" && (
        <form onSubmit={handleEmail} className="space-y-4">
          <p className="text-sm text-[var(--muted-foreground)]">
            Enter the email or phone number associated with your account. We'll send a one-time reset code.
          </p>
          <div>
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Email or phone</label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="emeka@example.com"
              className="w-full px-3 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm"
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" disabled={loading} className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium disabled:opacity-60 hover:opacity-90 transition-opacity">
            {loading ? "Sending code…" : "Send reset code"}
          </button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={handleCode} className="space-y-4">
          <div className="bg-[var(--secondary)] rounded-lg p-4 text-sm text-[var(--muted-foreground)]">
            A 6-digit reset code was sent to <span className="font-medium text-[var(--foreground)]">{email}</span>. It expires in 15 minutes and can only be used once.
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Reset code</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000"
              maxLength={6}
              className="w-full px-3 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm font-mono-data tracking-widest text-center text-lg"
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
            Verify code
          </button>
          <p className="text-xs text-center text-[var(--muted-foreground)]">
            Didn't receive it?{" "}
            <button type="button" className="text-[var(--accent)] hover:underline">Resend (rate-limited to 3/hour)</button>
          </p>
        </form>
      )}

      {step === "newpass" && (
        <form onSubmit={handlePassword} className="space-y-4">
          <p className="text-sm text-[var(--muted-foreground)]">Choose a new password. All active sessions will be signed out immediately.</p>
          <div>
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              className="w-full px-3 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm"
            />
            {/* Strength indicator */}
            {password.length > 0 && (
              <div className="mt-1.5">
                <div className="flex gap-1 mb-1">
                  {[1, 2, 3, 4].map((n) => (
                    <div key={n} className={`h-1 flex-1 rounded-full transition-colors ${n <= passwordStrength(password) ? strengthColor(passwordStrength(password)) : "bg-[var(--border)]"}`} />
                  ))}
                </div>
                <div className="text-xs text-[var(--muted-foreground)]">{strengthLabel(passwordStrength(password))}</div>
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Confirm new password</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat password"
              className="w-full px-3 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm"
            />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading || password.length < 8}
            className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium disabled:opacity-60 hover:opacity-90 transition-opacity"
          >
            {loading ? "Resetting…" : "Set new password"}
          </button>
        </form>
      )}

      {step === "done" && (
        <div className="text-center py-6">
          <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5 text-2xl">🔐</div>
          <h2 className="font-display text-xl mb-2">Password reset</h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-6">
            Your password has been updated and all other sessions have been signed out for security.
          </p>
          <button onClick={() => navigate("/login")} className="px-6 py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
            Sign in with new password
          </button>
        </div>
      )}
    </AuthShell>
  );
}

function passwordStrength(p: string): number {
  let s = 0;
  if (p.length >= 8) s++;
  if (p.length >= 12) s++;
  if (/[A-Z]/.test(p) && /[0-9]/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return Math.max(1, s);
}
function strengthColor(n: number) {
  return ["bg-red-400", "bg-amber-400", "bg-yellow-400", "bg-emerald-500"][n - 1] || "bg-emerald-500";
}
function strengthLabel(n: number) {
  return ["Weak", "Fair", "Good", "Strong"][n - 1] || "Strong";
}
