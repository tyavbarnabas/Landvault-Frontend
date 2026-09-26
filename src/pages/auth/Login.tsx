import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "../../contexts/AppContext";
import { completePendingWishlistIntent } from "../../lib/pendingWishlist";
import { consumePendingIntent } from "../../lib/pendingIntent";
import {
  MOCK_DEMO_CODES, errorCodeOf, landingRouteFor,
  type AuthUser, type TwoFactorChallenge,
} from "../../services/authService";
import { apiClient } from "../../lib/apiClient";

// The old second step accepted ANY six digits and always succeeded, sitting in
// front of a real TwoFactorController. A check that verifies nothing teaches
// users the check is meaningless, so it is gone: this screen now shows a second
// step ONLY when the backend answers login with a challenge, and an account
// without 2FA sees exactly what it saw before.
type Step = "credentials" | "challenge";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, completeTwoFactor, toggleWishlistItem } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<Step>("credentials");
  const [challenge, setChallenge] = useState<TwoFactorChallenge | null>(null);
  const [code, setCode] = useState("");
  const [usingRecoveryCode, setUsingRecoveryCode] = useState(false);
  const [lockedOut, setLockedOut] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Where to go once a session genuinely exists. Account state is ROUTED on,
  // never blocked on: the backend deliberately doesn't block login for these,
  // because a bootstrapped Super Admin has to be able to sign in to fix them.
  const finish = async (user: AuthUser) => {
    await completePendingWishlistIntent(toggleWishlistItem);

    const pendingAction = consumePendingIntent();
    if (pendingAction) {
      if (pendingAction.action === "reserve") { navigate(`/marketplace/checkout/${pendingAction.listingId}/${pendingAction.plotId}`); return; }
      if (pendingAction.action === "inspect") { navigate(`/inspections/new?listingId=${pendingAction.listingId}&plotId=${pendingAction.plotId}`); return; }
      const returnUrl = searchParams.get("returnUrl");
      if (pendingAction.action === "enquire") {
        navigate(`${returnUrl ?? `/marketplace/${pendingAction.listingId}`}${returnUrl?.includes("?") ? "&" : "?"}enquire=1`);
        return;
      }
      if (pendingAction.action === "resale_offer") {
        navigate(`${returnUrl ?? `/marketplace/resale/${pendingAction.listingId}`}${returnUrl?.includes("?") ? "&" : "?"}offer=1`);
        return;
      }
    }

    // A temporary password has been through an environment variable and
    // probably a shell history, so it comes first — before even a returnUrl.
    if (user.mustChangePassword) { navigate("/change-password"); return; }
    // Then mandatory 2FA for platform staff, who hold the platform-scope RLS
    // bypass and for whom a password alone is too thin.
    if (user.mustSetUpTwoFa) { navigate("/security/two-factor"); return; }

    navigate(searchParams.get("returnUrl") || landingRouteFor(user));
  };

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError("Enter your email and password."); return; }
    setLoading(true);
    setError("");
    try {
      const outcome = await login(email, password);
      if (outcome.kind === "two_factor_required") {
        // No session yet. The challenge token identifies this pending login and
        // can't reach a protected route.
        setChallenge(outcome.challenge);
        setStep("challenge");
        setLoading(false);
        return;
      }
      await finish(outcome.user);
    } catch (err) {
      setLoading(false);
      setError(messageForLoginError(err));
    }
  };

  const handleChallenge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!challenge || !code.trim()) { setError("Enter the code from your authenticator app."); return; }
    setLoading(true);
    setError("");
    try {
      await finish(await completeTwoFactor(challenge.challengeToken, code));
    } catch (err) {
      setLoading(false);
      const errorCode = errorCodeOf(err);
      if (errorCode === "TWO_FACTOR_LOCKED_OUT") {
        // Say so, rather than letting someone retry into a wall.
        setLockedOut(true);
        setError("Too many incorrect codes. Wait a few minutes before trying again.");
        return;
      }
      if (errorCode === "INVALID_TWO_FACTOR_CHALLENGE") {
        setStep("credentials");
        setChallenge(null);
        setCode("");
        setError("That sign-in attempt expired. Please enter your password again.");
        return;
      }
      setError(errorCode === "INVALID_TWO_FACTOR_CODE"
        ? "That code isn't valid. Check your authenticator app, or use a recovery code."
        : "Couldn't verify that code. Please try again.");
    }
  };

  const restart = () => {
    setStep("credentials");
    setChallenge(null);
    setCode("");
    setUsingRecoveryCode(false);
    setLockedOut(false);
    setError("");
  };

  return (
    <AuthShell>
      <div className="w-full max-w-sm mx-auto">
        <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">Sign in</h1>
        <p className="text-[var(--muted-foreground)] text-sm mb-8">
          New here? <Link to="/register" className="text-[var(--accent)] hover:underline">Create an account</Link>
        </p>


        {step === "credentials" ? (
          <form onSubmit={handleCredentials} className="space-y-4">
            <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="emeka@example.com" />
            <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" />
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="text-right">
              <Link to="/forgot-password" className="text-xs text-[var(--muted-foreground)] hover:text-[var(--accent)]">Forgot password?</Link>
            </div>
            <button type="submit" disabled={loading} className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium disabled:opacity-60 hover:opacity-90 transition-opacity">
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleChallenge} className="space-y-4">
            <div className="bg-[var(--secondary)] rounded-lg p-4 text-sm text-[var(--muted-foreground)]">
              {usingRecoveryCode
                ? "Enter one of the recovery codes you saved when you turned on two-factor authentication. Each code works once."
                : "Enter the 6-digit code from your authenticator app to finish signing in."}
            </div>

            <Field
              label={usingRecoveryCode ? "Recovery code" : "Authenticator code"}
              type="text"
              value={code}
              onChange={setCode}
              placeholder={usingRecoveryCode ? "xxxx-xxxx" : "000000"}
              maxLength={usingRecoveryCode ? 12 : 6}
            />

            {error && <p className={`text-sm ${lockedOut ? "text-amber-700" : "text-red-600"}`}>{error}</p>}

            <button type="submit" disabled={loading || lockedOut} className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium disabled:opacity-60 hover:opacity-90 transition-opacity">
              {loading ? "Verifying…" : "Verify & sign in"}
            </button>

            {/* Discoverable on purpose: someone reaching for this has lost
                their phone and is already having a bad day. */}
            <button
              type="button"
              onClick={() => { setUsingRecoveryCode((v) => !v); setCode(""); setError(""); }}
              className="w-full py-2 text-sm text-[var(--accent)] hover:underline"
            >
              {usingRecoveryCode ? "Use my authenticator app instead" : "I've lost my phone — use a recovery code"}
            </button>

            <button type="button" onClick={restart} className="w-full py-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
              ← Start again
            </button>

            {apiClient.isMockMode && (
              <p className="text-xs text-[var(--muted-foreground)] text-center">
                Demo mode: the authenticator code is {MOCK_DEMO_CODES.totp}.
              </p>
            )}
          </form>
        )}
      </div>
    </AuthShell>
  );
}

// Branch on the backend's stable code, never on its message.
function messageForLoginError(error: unknown): string {
  switch (errorCodeOf(error)) {
    case "ACCOUNT_SUSPENDED":
    case "ACCOUNT_DEACTIVATED":
      return "This account isn't active. Please contact support.";
    case "TENANT_NOT_ACTIVE":
      return "Your organisation's account isn't active. Contact your administrator.";
    // Wrong password and unknown email return an IDENTICAL body on purpose, so
    // nothing here may distinguish them — that's what stops an attacker
    // enumerating registered addresses.
    case "INVALID_CREDENTIALS":
    default:
      return "Invalid email or password.";
  }
}

function Field({ label, type, value, onChange, placeholder, maxLength }: { label: string; type: string; value: string; onChange: (v: string) => void; placeholder: string; maxLength?: number }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">{label}</label>
      <input
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

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full grid lg:grid-cols-2">
      {/* Form side */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Link to="/" className="flex items-center gap-2 mb-10">
            <span className="font-display text-xl text-[var(--foreground)]">LandVault</span>
          </Link>
          {children}
        </div>
      </div>

      {/* Image side */}
      <div className="hidden lg:block relative bg-[var(--primary)] overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1486325212027-8081e485255e?w=900&h=1200&fit=crop&auto=format"
          alt="Aerial view of an estate"
          className="w-full h-full object-cover opacity-40"
        />
        <div className="absolute inset-0 flex flex-col justify-end p-12">
          <div className="text-white">
            <p className="font-display text-2xl leading-relaxed mb-3">Verified titles. Live plot maps. One record, start to finish.</p>
            <p className="text-white/60 text-sm">Every reservation, payment, and document is tracked from allocation through to title transfer.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
