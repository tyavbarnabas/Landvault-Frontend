// Declaring penalty, revocation and transfer terms (PD-6).
//
// `onRevocationRefund` is required: "your allocation may be revoked" without
// saying what happens to money already paid is not a disclosure, and it is
// exactly what both source letters left out.
//
// Two things are said plainly so the developer isn't misled about what the
// platform does with them: the development deadline is stored but nothing
// tracks it, and transfer consent is disclosed but nothing enforces it.

import { useState } from "react";
import {
  buildDefaultRequest, declareDefaultTerms, defaultDraftFrom,
  type DefaultDraft, type DefaultTerms, type FieldErrors,
} from "../../services/estateDisclosureService";
import { Choice, Field, FieldError, SubmitButton, VersionNote, YES_NO, inputClass, serverMessage } from "./formParts";

export const DEADLINE_NOT_TRACKED = "Stored and shown to buyers, but not tracked: nothing on the platform watches this deadline or warns as it approaches.";
export const CONSENT_NOT_ENFORCED = "Shown to buyers, but not enforced: the platform has no resale flow yet, so nothing checks for your consent.";

export default function DefaultTermsForm({ estateId, current, onDeclared }: {
  estateId: string;
  current: DefaultTerms | null;
  onDeclared: () => void;
}) {
  const [draft, setDraft] = useState<DefaultDraft>(defaultDraftFrom(current));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<DefaultDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const setTier = (i: number, patch: Partial<DefaultDraft["penaltyTiers"][number]>) =>
    set({ penaltyTiers: draft.penaltyTiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const built = buildDefaultRequest(draft);
    if (built.errors) { setErrors(built.errors); return; }
    setErrors({});
    setServerError("");
    setSaving(true);
    try {
      await declareDefaultTerms(estateId, built.request);
      onDeclared();
    } catch (err) {
      setServerError(serverMessage(err, "The default terms weren't saved."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-5" noValidate>
      <div>
        <h3 className="text-sm font-semibold text-[var(--foreground)]">Declare default terms</h3>
        <p className="text-xs text-[var(--muted-foreground)] mt-1">
          What happens if a buyer falls behind on instalments or doesn't meet a condition. Penalties are shown to buyers in naira.
        </p>
      </div>

      <fieldset>
        <legend className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Late-payment penalties</legend>
        <p className="text-xs text-[var(--muted-foreground)] mb-2">One row per step, e.g. 5% at 3 months late, 10% at 6, 20% at 12. Leave empty if there are none.</p>
        <div className="space-y-2">
          {draft.penaltyTiers.map((tier, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="flex-1">
                <label htmlFor={`tier-${i}-months`} className="sr-only">Months late</label>
                <input id={`tier-${i}-months`} type="number" min={1} step="1" placeholder="Months late" value={tier.monthsLate} onChange={(e) => setTier(i, { monthsLate: e.target.value })} className={inputClass} />
                <FieldError message={errors[`penaltyTiers.${i}.monthsLate`]} />
              </div>
              <div className="flex-1">
                <label htmlFor={`tier-${i}-pct`} className="sr-only">Penalty %</label>
                <input id={`tier-${i}-pct`} type="number" min={0} max={100} step="0.01" placeholder="Penalty %" value={tier.penaltyPct} onChange={(e) => setTier(i, { penaltyPct: e.target.value })} className={inputClass} />
                <FieldError message={errors[`penaltyTiers.${i}.penaltyPct`]} />
              </div>
              <button type="button" onClick={() => set({ penaltyTiers: draft.penaltyTiers.filter((_, j) => j !== i) })} className="text-xs text-[var(--muted-foreground)] hover:underline py-2">
                Remove
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => set({ penaltyTiers: [...draft.penaltyTiers, { monthsLate: "", penaltyPct: "" }] })} className="mt-2 text-sm font-semibold text-[var(--accent)] hover:underline">
          + Add a penalty step
        </button>
      </fieldset>

      <Field id="revocationTrigger" label="What triggers revocation" error={errors.revocationTrigger}>
        <textarea id="revocationTrigger" rows={2} value={draft.revocationTrigger} onChange={(e) => set({ revocationTrigger: e.target.value })} className={inputClass}
          placeholder="Payment more than 12 months overdue, or failure to start building within the stated period." />
      </Field>

      <Field id="revocationNoticeDays" label="Notice given before revocation (days, optional)" error={errors.revocationNoticeDays}>
        <input id="revocationNoticeDays" type="number" min={0} step="1" value={draft.revocationNoticeDays} onChange={(e) => set({ revocationNoticeDays: e.target.value })} className={inputClass} />
      </Field>

      <Field
        id="onRevocationRefund"
        label="What happens to money already paid"
        error={errors.onRevocationRefund}
        hint="Required. Saying an allocation may be revoked without saying this leaves a buyer unable to judge their exposure."
      >
        <textarea id="onRevocationRefund" rows={2} value={draft.onRevocationRefund} onChange={(e) => set({ onRevocationRefund: e.target.value })} className={inputClass}
          placeholder="Payments to date are refunded less a 20% administrative charge, within 90 days." />
      </Field>

      <Field id="developmentDeadlineMonths" label="Development deadline (months, optional)" error={errors.developmentDeadlineMonths} hint={DEADLINE_NOT_TRACKED}>
        <input id="developmentDeadlineMonths" type="number" min={1} step="1" value={draft.developmentDeadlineMonths} onChange={(e) => set({ developmentDeadlineMonths: e.target.value })} className={inputClass} />
      </Field>

      <Choice<boolean>
        name="transferRequiresConsent"
        legend="Does transferring a plot to someone else need your consent?"
        value={draft.transferRequiresConsent}
        onChange={(transferRequiresConsent) => set({ transferRequiresConsent })}
        error={errors.transferRequiresConsent}
        options={YES_NO}
        hint={CONSENT_NOT_ENFORCED}
      />

      <Field id="default-notes" label="Notes (optional)">
        <textarea id="default-notes" rows={2} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} className={inputClass} />
      </Field>

      {serverError && <p className="text-sm text-red-700" role="alert">{serverError}</p>}

      <div className="space-y-2">
        <VersionNote nextVersion={(current?.version ?? 0) + 1} />
        <SubmitButton saving={saving}>Declare default terms</SubmitButton>
      </div>
    </form>
  );
}
