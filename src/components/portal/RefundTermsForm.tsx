// Declaring refund terms (PD-5).
//
// `appliesTo` starts unanswered and must be chosen. A deduction taken from the
// full price and one taken from what has actually been paid are different
// figures for anyone paying in instalments, and both source letters left it
// ambiguous — so the form asks rather than assumes.

import { useState } from "react";
import {
  FEE_TYPES, FEE_TYPE_LABELS, buildRefundRequest, declareRefundTerms, refundDraftFrom,
  type EstateFee, type FieldErrors, type RefundAppliesTo, type RefundDraft, type RefundTerms,
} from "../../services/estateDisclosureService";
import { Choice, Field, SubmitButton, VersionNote, inputClass, serverMessage } from "./formParts";

export default function RefundTermsForm({ estateId, current, declaredFees, onDeclared }: {
  estateId: string;
  current: RefundTerms | null;
  // The current fee schedule, so the developer can see which charges they
  // already marked non-refundable there. Nothing is ticked for them.
  declaredFees: EstateFee[];
  onDeclared: () => void;
}) {
  const [draft, setDraft] = useState<RefundDraft>(refundDraftFrom(current));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<RefundDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const markedNonRefundable = new Set(declaredFees.filter((f) => !f.refundable).map((f) => f.feeType));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const built = buildRefundRequest(draft);
    if (built.errors) { setErrors(built.errors); return; }
    setErrors({});
    setServerError("");
    setSaving(true);
    try {
      await declareRefundTerms(estateId, built.request);
      onDeclared();
    } catch (err) {
      setServerError(serverMessage(err, "The refund terms weren't saved."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-5" noValidate>
      <div>
        <h3 className="text-sm font-semibold text-[var(--foreground)]">Declare refund terms</h3>
        <p className="text-xs text-[var(--muted-foreground)] mt-1">
          What a buyer gets back if they withdraw, and how long it takes. Buyers see this in naira, not as a percentage.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field id="deductionPct" label="Deduction (%)" error={errors.deductionPct} hint="0 if nothing is deducted.">
          <input id="deductionPct" type="number" min={0} max={100} step="0.01" value={draft.deductionPct} onChange={(e) => set({ deductionPct: e.target.value })} className={inputClass} />
        </Field>
        <Field id="processingDays" label="Processing time (days)" error={errors.processingDays} hint="How long a refund takes to arrive. Time is part of the cost.">
          <input id="processingDays" type="number" min={0} step="1" value={draft.processingDays} onChange={(e) => set({ processingDays: e.target.value })} className={inputClass} />
        </Field>
      </div>

      <Choice<RefundAppliesTo>
        name="appliesTo"
        legend="The deduction is taken from…"
        value={draft.appliesTo}
        onChange={(appliesTo) => set({ appliesTo })}
        error={errors.appliesTo}
        hint="These give different figures for anyone paying in instalments, so there's no default."
        options={[
          { value: "amount_paid", label: "What the buyer has actually paid", description: "20% of ₦2,000,000 paid is ₦400,000." },
          { value: "total_price", label: "The full price, whatever has been paid", description: "20% of a ₦6,000,000 price is ₦1,200,000, even if ₦2,000,000 was paid." },
        ]}
      />

      <fieldset>
        <legend className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Fees never refunded</legend>
        <p className="text-xs text-[var(--muted-foreground)] mb-2">
          Shown to buyers as part of what they lose on withdrawal, alongside the deduction — not taken quietly out of the refund.
        </p>
        <div className="grid sm:grid-cols-2 gap-1.5">
          {FEE_TYPES.map((type) => (
            <label key={type} className="flex items-center gap-2 text-sm text-[var(--foreground)]">
              <input
                type="checkbox"
                checked={draft.nonRefundableFeeTypes.includes(type)}
                onChange={(e) => set({
                  nonRefundableFeeTypes: e.target.checked
                    ? [...draft.nonRefundableFeeTypes, type]
                    : draft.nonRefundableFeeTypes.filter((t) => t !== type),
                })}
              />
              {FEE_TYPE_LABELS[type]}
              {markedNonRefundable.has(type) && <span className="text-xs text-[var(--muted-foreground)]">· non-refundable in your fee schedule</span>}
            </label>
          ))}
        </div>
      </fieldset>

      <Field id="refund-notes" label="Notes (optional)">
        <textarea id="refund-notes" rows={2} value={draft.notes} onChange={(e) => set({ notes: e.target.value })} className={inputClass} />
      </Field>

      {serverError && <p className="text-sm text-red-700" role="alert">{serverError}</p>}

      <div className="space-y-2">
        <VersionNote nextVersion={(current?.version ?? 0) + 1} />
        <SubmitButton saving={saving}>Declare refund terms</SubmitButton>
      </div>
    </form>
  );
}
