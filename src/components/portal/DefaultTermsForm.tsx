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

      {draft.penaltyTiers.length > 0 && (
        <Choice<boolean>
          name="penaltiesRefundable"
          legend="If a buyer withdraws or is revoked, are penalties they've paid refunded?"
          value={draft.penaltiesRefundable}
          onChange={(penaltiesRefundable) => set({ penaltiesRefundable })}
          error={errors.penaltiesRefundable}
          options={[{ value: true, label: "Refunded" }, { value: false, label: "Not refunded" }]}
          hint="Buyers see this on the listing and in their offer letter."
        />
      )}

      {/* Revocation as numbers (phase 5b): HomeTrue words it for buyers. */}
      <fieldset className="rounded-lg bg-[var(--muted)] p-4 space-y-2">
        <legend className="sr-only">Revocation</legend>
        <p className="text-sm font-semibold text-[var(--foreground)]">Revocation</p>
        <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--foreground)]">
          <span>A plan can be revoked once an instalment is</span>
          <label htmlFor="revocationAfterMonths" className="sr-only">Months unpaid before a plan can be revoked</label>
          <input id="revocationAfterMonths" type="number" min={3} max={120} step="1" value={draft.revocationAfterMonths}
            onChange={(e) => set({ revocationAfterMonths: e.target.value })} className={`${inputClass} w-20 font-mono-data`}
            aria-invalid={!!errors.revocationAfterMonths} aria-describedby="revocation-hint" />
          <span>months unpaid, after</span>
          <label htmlFor="revocationNoticeDays" className="sr-only">Days of written notice</label>
          <input id="revocationNoticeDays" type="number" min={14} step="1" value={draft.revocationNoticeDays} placeholder="14"
            onChange={(e) => set({ revocationNoticeDays: e.target.value })} className={`${inputClass} w-20 font-mono-data`}
            aria-invalid={!!errors.revocationNoticeDays} aria-describedby="revocation-hint" />
          <span>days' written notice.</span>
        </div>
        <FieldError message={errors.revocationAfterMonths ?? errors.revocationNoticeDays} />
        <p id="revocation-hint" className="text-xs text-[var(--muted-foreground)]">
          3–120 months; notice at least 14 days (14 if left empty). HomeTrue words this for buyers; a revoked buyer is refunded exactly as if they had withdrawn.
        </p>
      </fieldset>

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

      {serverError && <p className="text-sm text-[var(--error-text)]" role="alert">{serverError}</p>}

      <div className="space-y-2">
        <VersionNote nextVersion={(current?.version ?? 0) + 1} />
        <SubmitButton saving={saving}>Declare default terms</SubmitButton>
      </div>
    </form>
  );
}
