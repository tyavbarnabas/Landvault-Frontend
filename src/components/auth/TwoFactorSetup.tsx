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
// The secret is returned by `setup` and nowhere else. It is never logged and
// never persisted — it lives in component state for as long as this screen is
// open, and goes away with it.

import { useEffect, useState } from "react";
import {
  MOCK_DEMO_CODES, confirmTwoFactor, errorCodeOf, setupTwoFactor,
  type TwoFactorSetup as Enrolment,
} from "../../services/authService";
import { apiClient } from "../../lib/apiClient";
import RecoveryCodes from "./RecoveryCodes";

type Stage = "loading" | "scan" | "confirm" | "codes" | "failed";

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
    setupTwoFactor()
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
      setError(errorCode === "TWO_FACTOR_SETUP_REQUIRED"
        ? "This setup session has expired. Start again to get a fresh QR code."
        : "That code isn't valid. Check your authenticator app and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (stage === "loading") return <p className="text-sm text-[var(--muted-foreground)]">Preparing setup…</p>;

  if (stage === "failed") {
    return (
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
        <p className="text-sm text-[var(--foreground)] mb-2">Couldn't start two-factor setup.</p>
        <p className="text-sm text-[var(--muted-foreground)]">Two-factor authentication has not been changed. Please try again.</p>
      </div>
    );
  }

  if (stage === "codes") {
    return <RecoveryCodes codes={recoveryCodes} onAcknowledged={onEnabled} />;
  }

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-1">Step 1 — add LandVault to your authenticator app</h3>
        <p className="text-xs text-[var(--muted-foreground)]">
          Scan this with Google Authenticator, 1Password, Authy or similar. Two-factor authentication is
          <span className="font-medium text-[var(--foreground)]"> not on yet</span> — it switches on once you enter a code below.
        </p>
      </div>

      {qrDataUrl && (
        <div className="flex justify-center">
          {/* The QR encodes the same secret shown below it. */}
          <img src={qrDataUrl} alt="QR code for adding this account to an authenticator app" className="rounded-lg bg-white p-2" width={220} height={220} />
        </div>
      )}

      {/* Manual entry: some people type it, and some apps scan badly on a small
          screen. Hidden until asked for, so it isn't on display by default. */}
      <div className="text-center">
        {showSecret ? (
          <div>
            <div className="text-xs text-[var(--muted-foreground)] mb-1">Enter this key manually instead:</div>
            <code className="font-mono-data text-sm text-[var(--foreground)] tracking-wider break-all">{enrolment?.secret}</code>
          </div>
        ) : (
          <button type="button" onClick={() => setShowSecret(true)} className="text-xs text-[var(--accent)] hover:underline">
            Can't scan it? Enter a key manually
          </button>
        )}
      </div>

      <form onSubmit={confirm} className="space-y-3 border-t border-[var(--border)] pt-5">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-1">Step 2 — confirm the pairing</h3>
          <p className="text-xs text-[var(--muted-foreground)]">
            Enter the 6-digit code your app is showing now. We check it before turning anything on, so a failed scan can't lock you out.
          </p>
        </div>
        <label htmlFor="twofa-confirm" className="block text-xs font-medium text-[var(--muted-foreground)]">Authenticator code</label>
        <input
          id="twofa-confirm"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="000000"
          className="w-full px-3 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm font-mono-data tracking-widest"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button type="submit" disabled={busy} className="flex-1 py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold disabled:opacity-60 hover:opacity-90">
            {busy ? "Checking…" : "Turn on two-factor"}
          </button>
          {onCancel && (
            <button type="button" onClick={onCancel} className="px-4 py-2.5 border border-[var(--border)] rounded-md text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
              Cancel
            </button>
          )}
        </div>
        {apiClient.isMockMode && (
          <p className="text-xs text-[var(--muted-foreground)]">Demo mode: enter {MOCK_DEMO_CODES.totp}.</p>
        )}
      </form>
    </div>
  );
}
