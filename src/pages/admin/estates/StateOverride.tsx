// SB-1's override: verify an estate's state by hand, for land on a genuinely
// disputed state border.
//
// The reference boundaries are GRID3's operational ones — a mistake-catcher,
// not the legal record — and some state borders are disputed. When the land
// registry and the reference data disagree, a person checks the title and
// records the outcome here, with a reason. The boundary-in-state check is then
// skipped for that one estate; the developer adds the boundary as usual.
//
// There's no admin estate list, so this starts from the id the developer
// quotes: the portal shows it to them when their boundary is refused.

import { useState } from "react";
import {
  StateOverrideError, clearStateOverride, setStateOverride, type EstateStateOverride,
} from "../../../services/estateStateOverrideService";
import { STATE_BOUNDARY_ATTRIBUTION } from "../../../components/portal/BoundaryField";
import StatusBadge from "../../../components/StatusBadge";
import { Field, inputClass } from "../../../components/portal/formParts";

export default function StateOverride() {
  const [estateId, setEstateId] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<EstateStateOverride | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"set" | "clear" | null>(null);

  const run = async (action: "set" | "clear") => {
    setBusy(action);
    setError("");
    try {
      setResult(action === "set" ? await setStateOverride(estateId, reason) : await clearStateOverride(estateId));
      if (action === "set") setReason("");
    } catch (err) {
      setResult(null);
      setError(err instanceof StateOverrideError || err instanceof Error ? err.message : "That didn't go through.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">Estate state override</h1>
      <p className="text-sm text-[var(--muted-foreground)] mb-6">
        For land on a disputed state border, where the reference boundaries and the land registry disagree. Recording an override says a
        person verified the estate's declared state, and skips the boundary-in-state check for that estate only. Changing the estate's
        state later clears it.
      </p>

      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4">
        <Field id="override-estate" label="Estate id" hint="The developer sees it in the portal when their boundary is refused.">
          <input id="override-estate" value={estateId} onChange={(e) => { setEstateId(e.target.value); setResult(null); }}
            className={`${inputClass} font-mono-data`} placeholder="3f6c…" />
        </Field>
        <Field id="override-reason" label="Reason" hint="Required, and kept with the override — say what was checked (e.g. the title's registering state).">
          <textarea id="override-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
        </Field>

        {error && <p className="text-sm text-red-700" role="alert">{error}</p>}

        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => run("set")} disabled={busy !== null || !estateId.trim() || !reason.trim()}
            className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-60">
            {busy === "set" ? "Recording…" : "Record override"}
          </button>
          <button type="button" onClick={() => run("clear")} disabled={busy !== null || !estateId.trim()}
            className="px-4 py-2 border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-60">
            {busy === "clear" ? "Removing…" : "Remove override"}
          </button>
        </div>
      </div>

      {result && (
        <div className="mt-6 bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-2" role="status">
          <div className="flex items-center gap-3">
            <StatusBadge label={result.overriddenAt ? "Override in place" : "No override"} variant={result.overriddenAt ? "warning" : "neutral"} />
            <span className="text-sm text-[var(--foreground)]">{result.state} <span className="font-mono-data text-[var(--muted-foreground)]">{result.stateCode}</span></span>
          </div>
          {result.overriddenAt ? (
            <>
              <p className="text-sm text-[var(--foreground)]">{result.reason}</p>
              <p className="text-xs text-[var(--muted-foreground)]">
                Recorded {new Date(result.overriddenAt).toLocaleString()}{result.overriddenBy ? ` by ${result.overriddenBy}` : ""}. The developer can now add the
                boundary.
              </p>
            </>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">The boundary-in-state check applies to this estate's future boundary writes.</p>
          )}
        </div>
      )}

      <p className="text-xs text-[var(--muted-foreground)] mt-6 italic">{STATE_BOUNDARY_ATTRIBUTION}.</p>
    </div>
  );
}
