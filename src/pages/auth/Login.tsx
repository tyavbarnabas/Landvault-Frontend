// Sign in, from the Figma "Sign-in & landing" proposal: email and password,
// then — only when the backend asks — the authenticator code in six boxes,
// with the recovery-code route kept in view.

import { useState } from "react";
import PasswordInput from "../../components/auth/PasswordInput";
import CodeInput from "../../components/auth/CodeInput";
import AuthShell, { AuthHeading } from "../../components/auth/AuthShell";
import { useNavigate, useSearchParams } from "react-router-dom";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import TextLink from "../../components/ui/TextLink";
import { ErrorText, Field, Input } from "../../components/ui/Field";
import { LockIcon } from "../../components/icons";
import { useApp } from "../../contexts/AppContext";
import { completePendingWishlistIntent } from "../../lib/pendingWishlist";
import { consumePendingIntent } from "../../lib/pendingIntent";
import { isLive } from "../../lib/backends";
import {
  MOCK_DEMO_CODES, errorCodeOf, landingRouteFor,
  type AuthUser, type TwoFactorChallenge,
} from "../../services/authService";

// The old second step accepted ANY six digits and always succeeded, sitting in
// front of a real TwoFactorController. A check that verifies nothing teaches
// users the check is meaningless, so it is gone: this screen now shows a second
// step ONLY when the backend answers login with a challenge, and an account
// without 2FA sees exactly what it saw before.
type Step = "credentials" | "challenge";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, completeTwoFactor, reloadWishlist, signOutNotice, clearSignOutNotice } = useApp();
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
    await completePendingWishlistIntent(reloadWishlist);

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
      {step === "credentials" ? (
        <>
          <AuthHeading title="Sign in">
            New to HomeTrue? <TextLink to="/register" className="font-medium">Create an account</TextLink>
          </AuthHeading>

          {/* Why the last session ended — a suspension, or a session that
              expired — said once, then cleared on the next sign-in. */}
          {signOutNotice && (
            <Alert role="status" className="mb-5 flex items-start justify-between gap-3">
              <span>{signOutNotice}</span>
              <Button variant="linkMuted" onClick={clearSignOutNotice} className="text-xs shrink-0">Dismiss</Button>
            </Alert>
          )}

          <form onSubmit={handleCredentials} className="space-y-4" noValidate>
            <Field id="login-email" label="Email">
              <Input id="login-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="emeka@example.com" />
            </Field>
            <Field id="login-password" label="Password"
              hint={<TextLink to="/forgot-password" muted>Forgot password? Reset it by email</TextLink>}>
              <PasswordInput id="login-password" value={password} onChange={setPassword} autoComplete="current-password" describedBy="login-password-hint" />
            </Field>
            {error && <ErrorText>{error}</ErrorText>}
            <Button type="submit" size="lg" fullWidth disabled={loading}>{loading ? "Signing in…" : "Sign in"}</Button>
          </form>

          <p className="mt-6 flex gap-2.5 rounded-lg bg-[var(--secondary)] p-3 text-xs text-[var(--secondary-foreground)]">
            <span className="mt-0.5 shrink-0"><LockIcon size={14} /></span>
            If your account uses two-factor authentication, we'll ask for your code next. Developer staff sign in here too — your portal opens automatically.
          </p>
        </>
      ) : (
        <>
          <AuthHeading title={usingRecoveryCode ? "Use a recovery code" : "Enter your code"}>
            {usingRecoveryCode
              ? "Enter one of the recovery codes you saved when you turned on two-factor authentication. Each code works once."
              : "Open your authenticator app and enter the 6-digit code for HomeTrue."}
          </AuthHeading>

          <form onSubmit={handleChallenge} className="space-y-4" noValidate>
            {usingRecoveryCode ? (
              <Field id="login-code" label="Recovery code">
                <Input id="login-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="xxxx-xxxx" maxLength={12} autoComplete="off" kind="code" />
              </Field>
            ) : (
              <Field id="login-code" label="Authenticator code">
                <CodeInput id="login-code" value={code} onChange={setCode} invalid={!!error && !lockedOut} autoFocus />
              </Field>
            )}

            {error && (lockedOut ? <Alert role="alert">{error}</Alert> : <ErrorText>{error}</ErrorText>)}

            <Button type="submit" size="lg" fullWidth disabled={loading || lockedOut}>{loading ? "Verifying…" : "Verify and sign in"}</Button>

            {/* Discoverable on purpose: someone reaching for this has lost
                their phone and is already having a bad day. */}
            <div className="flex flex-col items-start gap-3 pt-1">
              <Button variant="link" className="font-medium" onClick={() => { setUsingRecoveryCode((v) => !v); setCode(""); setError(""); }}>
                {usingRecoveryCode ? "Use my authenticator app instead" : "Lost your phone? Use a recovery code"}
              </Button>
              <Button variant="linkMuted" onClick={restart}>← Use a different account</Button>
            </div>

            {!isLive("auth") && (
              <p className="text-xs text-[var(--muted-foreground)]">Demo mode: the authenticator code is {MOCK_DEMO_CODES.totp}.</p>
            )}
          </form>
        </>
      )}
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
