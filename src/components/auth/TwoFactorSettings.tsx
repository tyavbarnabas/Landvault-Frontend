// The 2FA panel in Settings. The toggle here was wired to nothing — this is
// where it connects to the real endpoints.
//
// Three rules the backend enforces and this panel makes visible:
//   - Disabling needs a TOTP or recovery CODE, not just a session. A hijacked
//     session must not be able to strip the protection 2FA exists to provide.
//   - Regenerating needs a current TOTP code and invalidates every previous
//     code.
//   - Platform staff cannot disable it at all (TWO_FACTOR_MANDATORY), and are
//     told so plainly rather than shown a generic error.

import { useState } from "react";
import { useApp } from "../../contexts/AppContext";
import {
  MOCK_DEMO_CODES, disableTwoFactor, errorCodeOf, isPlatformStaff, regenerateRecoveryCodes,
} from "../../services/authService";
import { apiClient } from "../../lib/apiClient";
import TwoFactorSetup from "./TwoFactorSetup";
import RecoveryCodes from "./RecoveryCodes";

type Panel = "idle" | "enrolling" | "disabling" | "regenerating" | "codes";

export default function TwoFactorSettings() {
  const { user } = useApp();
  const [panel, setPanel] = useState<Panel>("idle");
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const enabled = user?.twoFAEnabled ?? false;
  // Mandatory for anyone holding the platform-scope RLS bypass.
  const mandatory = isPlatformStaff(user);
  const remaining = user?.recoveryCodesRemaining ?? 0;

  const reset = () => { setPanel("idle"); setCode(""); setError(""); };

  const submitDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await disableTwoFactor(code);
      setNotice("Two-factor authentication is off. You can turn it back on any time.");
      reset();
    } catch (err) {
      const errorCode = errorCodeOf(err);
      setError(errorCode === "TWO_FACTOR_MANDATORY"
        ? "Two-factor authentication is required for platform staff accounts and can't be turned off."
        : "That code isn't valid. Try your authenticator app again, or use a recovery code.");
    } finally {
      setBusy(false);
    }
  };

  const submitRegenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setCodes(await regenerateRecoveryCodes(code));
      setPanel("codes");
      setCode("");
    } catch {
      setError("That code isn't valid. Regenerating needs a current code from your authenticator app.");
    } finally {
      setBusy(false);
    }
  };

  if (panel === "codes") {
    return <RecoveryCodes codes={codes} title="Your new recovery codes" onAcknowledged={() => { setPanel("idle"); setNotice("Your previous recovery codes no longer work."); }} />;
  }

  return (
    <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold mb-1">Two-factor authentication</h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            A code from your authenticator app, as well as your password, each time you sign in.
          </p>
        </div>
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium shrink-0 ${enabled ? "bg-emerald-50 text-emerald-700" : "bg-[var(--muted)] text-[var(--muted-foreground)]"}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${enabled ? "bg-emerald-500" : "bg-gray-400"}`} aria-hidden="true" />
          {enabled ? "Enabled" : "Disabled"}
        </div>
      </div>

      {notice && <p className="mt-4 text-xs text-emerald-800 bg-emerald-50 rounded-lg p-3">{notice}</p>}

      {panel === "enrolling" && (
        <div className="mt-4">
          <TwoFactorSetup onEnabled={() => { setPanel("idle"); setNotice("Two-factor authentication is on."); }} onCancel={reset} />
        </div>
      )}

      {panel === "idle" && !enabled && (
        <div className="mt-4">
          <button onClick={() => setPanel("enrolling")} className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90">
            Turn on two-factor
          </button>
        </div>
      )}

      {panel === "idle" && enabled && (
        <div className="mt-4 space-y-4">
          <div className="p-3 bg-emerald-50 rounded-lg text-xs text-emerald-800">
            Active, using an authenticator app.
            {/* So a user knows to generate more before running out. */}
            {" "}
            {remaining > 0
              ? `${remaining} recovery code${remaining === 1 ? "" : "s"} left.`
              : "No recovery codes left — generate a new set so you're not locked out if you lose your phone."}
          </div>

          <div className="flex flex-wrap gap-3">
            <button onClick={() => setPanel("regenerating")} className="px-3 py-1.5 border border-[var(--border)] rounded-md text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)]">
              Generate new recovery codes
            </button>
            {/* Platform staff aren't shown a button that can only fail. */}
            {mandatory ? (
              <span className="text-xs text-[var(--muted-foreground)] self-center">
                Required for platform staff accounts — it can't be turned off.
              </span>
            ) : (
              <button onClick={() => setPanel("disabling")} className="px-3 py-1.5 border border-[var(--border)] rounded-md text-xs font-medium text-red-700 hover:bg-red-50">
                Turn off two-factor
              </button>
            )}
          </div>
        </div>
      )}

      {(panel === "disabling" || panel === "regenerating") && (
        <form onSubmit={panel === "disabling" ? submitDisable : submitRegenerate} className="mt-4 space-y-3 border-t border-[var(--border)] pt-4">
          <p className="text-sm text-[var(--foreground)]">
            {panel === "disabling"
              ? "Enter a code from your authenticator app, or a recovery code, to confirm. Your password alone isn't enough for this."
              : "Enter a current code from your authenticator app. This replaces all of your existing recovery codes."}
          </p>
          <label htmlFor="twofa-manage-code" className="block text-xs font-medium text-[var(--muted-foreground)]">
            {panel === "disabling" ? "Authenticator or recovery code" : "Authenticator code"}
          </label>
          <input
            id="twofa-manage-code"
            type="text"
            inputMode={panel === "regenerating" ? "numeric" : "text"}
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={panel === "disabling" ? "000000 or xxxx-xxxx" : "000000"}
            className="w-full px-3 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm font-mono-data"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-3">
            <button type="submit" disabled={busy} className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold disabled:opacity-60 hover:opacity-90">
              {busy ? "Checking…" : panel === "disabling" ? "Turn off two-factor" : "Generate new codes"}
            </button>
            <button type="button" onClick={reset} className="px-4 py-2 border border-[var(--border)] rounded-md text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
              Cancel
            </button>
          </div>
          {apiClient.isMockMode && (
            <p className="text-xs text-[var(--muted-foreground)]">Demo mode: the authenticator code is {MOCK_DEMO_CODES.totp}.</p>
          )}
        </form>
      )}
    </div>
  );
}
