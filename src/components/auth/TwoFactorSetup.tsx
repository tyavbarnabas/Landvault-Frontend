// Turning 2FA on, in the two steps the backend deliberately splits it into.
//
// `setup` returns enrolment material and DOES NOT enable anything.
// `confirm` proves the authenticator app actually holds the secret, and only
// then is 2FA switched on — and only then are recovery codes issued.
//
// COLLAPSING THESE TWO WOULD BE THE WORST THING THIS FEATURE CAN DO: if a QR
// scan silently fails while 2FA is already on, the user is locked out
// permanently, with no recovery codes, because those come from confirmation.
// So this component never enables on step one, and abandoning it leaves 2FA off.
//
// Laid out from the Figma "Sign-in & landing" proposal as two step cards.
//
// The secret is returned by `setup` and nowhere else. It is never logged and
// never persisted — it lives in component state for as long as this screen is
// open, and goes away with it.

import { useEffect, useState } from "react";
import { isLive } from "../../lib/backends";
import {
  MOCK_DEMO_CODES, confirmTwoFactor, errorCodeOf, setupTwoFactor,
  type TwoFactorSetup as Enrolment,
} from "../../services/authService";
import RecoveryCodes from "./RecoveryCodes";
import CodeInput from "./CodeInput";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Card from "../ui/Card";
import { ErrorText, Field } from "../ui/Field";
import { Loading } from "../ui/Page";

type Stage = "loading" | "scan" | "confirm" | "codes" | "failed";

// Each setup call replaces the backend's unconfirmed secret. React's
// StrictMode mounts this twice in development, and two concurrent calls left
// the screen showing one secret while the backend kept the other, so every
// code was refused. Mounts that overlap share one request; a later visit
// (after it settles) still gets a fresh secret.
let inFlightSetup: ReturnType<typeof setupTwoFactor> | null = null;
function setupOnce(): ReturnType<typeof setupTwoFactor> {
  inFlightSetup ??= setupTwoFactor().finally(() => { inFlightSetup = null; });
  return inFlightSetup;
}

export default function TwoFactorSetup({ onEnabled, onCancel }: { onEnabled: () => void; onCancel?: () => void }) {
  const [stage, setStage] = useState<Stage>("loading");
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [code, setCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setupOnce()
      .then(async (result) => {
        if (cancelled) return;
        setEnrolment(result);
        // Imported on demand so the QR library isn't in the main bundle —
        // most sessions never open this screen. Rendered client-side; the URI
        // never leaves the page.
        const { toDataURL } = await import("qrcode");
        setQrDataUrl(await toDataURL(result.otpAuthUri, { width: 220, margin: 1 }));
        setStage("scan");
      })
      .catch(() => { if (!cancelled) setStage("failed"); });
    return () => { cancelled = true; };
  }, []);

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) { setError("Enter the code shown in your authenticator app."); return; }
    setBusy(true);
    setError("");
    try {
      setRecoveryCodes(await confirmTwoFactor(code));
      setStage("codes");
    } catch (err) {
      const errorCode = errorCodeOf(err);
      // Locked out after 5 wrong codes, even a correct one is refused: say so,
      // or the next correct code reads as wrong too.
      setError(errorCode === "TWO_FACTOR_SETUP_REQUIRED"
        ? "This setup session has expired. Start again to get a fresh QR code."
        : errorCode === "TWO_FACTOR_LOCKED_OUT"
          ? "Too many incorrect codes, so codes are paused for 15 minutes. Wait, then try again with the code your app shows at that point."
          : "That code isn't valid. Check your authenticator app and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (stage === "loading") return <Loading label="Preparing setup…" />;

  if (stage === "failed") {
    return (
      <Alert tone="error" title="Couldn't start two-factor setup">
        Two-factor authentication has not been changed. Please try again.
      </Alert>
    );
  }

  if (stage === "codes") {
    return <RecoveryCodes codes={recoveryCodes} onAcknowledged={onEnabled} />;
  }

  return (
    <div className="space-y-4">
      <Card as="section" aria-labelledby="twofa-step1" className="flex flex-col sm:flex-row gap-5">
        {qrDataUrl && (
          // The QR encodes the same secret shown below it.
          <img src={qrDataUrl} alt="QR code for adding this account to an authenticator app" className="rounded-lg bg-white p-2 self-center shrink-0" width={168} height={168} />
        )}
        <div className="space-y-2 min-w-0">
          <h3 id="twofa-step1" className="text-sm font-semibold text-[var(--foreground)]">1 · Scan it with your authenticator app</h3>
          <p className="text-sm text-[var(--muted-foreground)]">
            Google Authenticator, 1Password, Authy or similar. Two-factor authentication is
            <span className="font-medium text-[var(--foreground)]"> not on yet</span> — it switches on once you enter a code below.
          </p>
          {/* Manual entry: some people type it, and some apps scan badly on a
              small screen. Hidden until asked for, so it isn't on display. */}
          {showSecret ? (
            <div className="rounded-lg bg-[var(--muted)] p-3">
              <div className="text-xs text-[var(--muted-foreground)] mb-1">Enter this key manually instead:</div>
              <code className="font-mono-data text-sm text-[var(--foreground)] tracking-wider break-all">{enrolment?.secret}</code>
              <p className="text-xs text-[var(--muted-foreground)] mt-1">If your app asks, choose <span className="font-medium">Time based</span>.</p>
            </div>
          ) : (
            <Button variant="link" className="text-sm font-medium text-left" onClick={() => setShowSecret(true)}>Can't scan it? Enter a key instead</Button>
          )}
        </div>
      </Card>

      <Card as="section" aria-labelledby="twofa-step2">
        <form onSubmit={confirm} className="space-y-3" noValidate>
          <div>
            <h3 id="twofa-step2" className="text-sm font-semibold text-[var(--foreground)] mb-1">2 · Enter the code it shows</h3>
            <p className="text-sm text-[var(--muted-foreground)]">
              We check it before turning anything on, so a failed scan can't lock you out. Recovery codes come next.
            </p>
          </div>
          <Field id="twofa-confirm" label="Authenticator code">
            <CodeInput id="twofa-confirm" value={code} onChange={setCode} invalid={!!error} />
          </Field>
          {error && <ErrorText>{error}</ErrorText>}
          <div className="flex gap-3 pt-1">
            {onCancel && <Button variant="secondary" size="lg" onClick={onCancel}>Not now</Button>}
            <Button type="submit" size="lg" className="flex-1" disabled={busy}>{busy ? "Checking…" : "Turn on two-factor"}</Button>
          </div>
          {!isLive("auth") && (
            <p className="text-xs text-[var(--muted-foreground)]">Demo mode: enter {MOCK_DEMO_CODES.totp}.</p>
          )}
        </form>
      </Card>
    </div>
  );
}
