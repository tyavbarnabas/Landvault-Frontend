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
import { formatDayTime } from "../../../lib/formatDate";
import Page from "../../../components/ui/Page";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import Alert from "../../../components/ui/Alert";
import { ErrorText, Field, Input, Textarea, describedBy } from "../../../components/ui/Field";

const ID_HINT = "The developer sees it in the portal when their boundary is refused.";
const REASON_HINT = "Required, and kept with the override — say what was checked (e.g. the title's registering state).";

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
    <Page title="Estate state override" description="For land on a disputed state border, where the reference boundaries and the land registry disagree." width="lg">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem] items-start">
        <div className="space-y-5">
          <Card as="section" aria-labelledby="override-heading" className="space-y-4">
            <h2 id="override-heading" className="font-semibold text-[var(--foreground)]">Record or remove an override</h2>
            <Field id="override-estate" label="Estate id" hint={ID_HINT}>
              <Input id="override-estate" inputSize="md" value={estateId} onChange={(e) => { setEstateId(e.target.value); setResult(null); }}
                className="font-mono-data" placeholder="3f6c…" aria-describedby={describedBy("override-estate", { hint: ID_HINT })} />
            </Field>
            <Field id="override-reason" label="Reason" hint={REASON_HINT}>
              <Textarea id="override-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} aria-describedby={describedBy("override-reason", { hint: REASON_HINT })} />
            </Field>

            {error && <ErrorText>{error}</ErrorText>}

            <div className="flex flex-wrap gap-3">
              <Button onClick={() => run("set")} disabled={busy !== null || !estateId.trim() || !reason.trim()}>
                {busy === "set" ? "Recording…" : "Record override"}
              </Button>
              <Button variant="secondary" onClick={() => run("clear")} disabled={busy !== null || !estateId.trim()}>
                {busy === "clear" ? "Removing…" : "Remove override"}
              </Button>
            </div>
          </Card>

          {result && (
            <Card as="section" role="status" className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <StatusBadge label={result.overriddenAt ? "Override in place" : "No override"} variant={result.overriddenAt ? "warning" : "neutral"} />
                <span className="text-sm text-[var(--foreground)]">{result.state} <span className="font-mono-data text-[var(--muted-foreground)]">{result.stateCode}</span></span>
              </div>
              {result.overriddenAt ? (
                <>
                  <p className="text-sm text-[var(--foreground)]">{result.reason}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Recorded {formatDayTime(result.overriddenAt)}{result.overriddenBy ? ` by ${result.overriddenBy}` : ""}. The developer can now add the boundary.
                  </p>
                </>
              ) : (
                <p className="text-sm text-[var(--muted-foreground)]">The boundary-in-state check applies to this estate's future boundary writes.</p>
              )}
            </Card>
          )}
        </div>

        <Alert tone="info" title="What an override does">
          <p>It says a person verified the estate's declared state, and skips the boundary-in-state check for that estate only.</p>
          <p className="mt-2">Changing the estate's state later clears it.</p>
        </Alert>
      </div>

      <p className="text-xs text-[var(--muted-foreground)] mt-6 italic">{STATE_BOUNDARY_ATTRIBUTION}.</p>
    </Page>
  );
}
