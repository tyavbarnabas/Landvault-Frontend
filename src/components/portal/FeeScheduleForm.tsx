// Declaring an estate's fee schedule (PD-1 to PD-4).
//
// The form starts UNDECIDED. "No charges beyond the land price" is a choice the
// developer makes, never the state an untouched form falls into — the backend
// treats an empty list as a positive declaration that permits publication, so
// submitting one on the developer's behalf would publish silence as a
// statement. See buildFeesRequest.
//
// No amount is judged. There is no cap, no warning and no comparison with the
// land price or with other estates: the platform discloses, it doesn't
// regulate.

import { useState } from "react";
import {
  DUE_TRIGGERS, FEE_CURRENCIES, FEE_TYPES, FEE_TYPE_LABELS, buildFeesRequest, declareFees, emptyFeeDraft, feeDraftFrom,
  type FeeDraft, type FeeDueTrigger, type FeeSchedule, type FeeScheduleMode, type FeeType, type FieldErrors,
} from "../../services/estateDisclosureService";
import type { Currency } from "../../data/mockData";
import { Choice, Field, SubmitButton, VersionNote, YES_NO, inputClass, serverMessage } from "./formParts";

const DUE_TRIGGER_OPTIONS: Record<FeeDueTrigger, string> = {
  at_application: "At application",
  at_allocation: "At allocation",
  on_construction_start: "When construction starts",
  on_milestone: "In stages as building progresses",
  before_occupation: "Before occupation",
  // Read as ongoing, not as one more line item.
  annual: "Every year, for as long as the plot is held",
};

// PD-3. The fee types that nominally apply "only if you build" — which both
// source letters also REQUIRE. The natural reading is "optional"; the right
// one is usually "mandatory", so these get the explanation up front.
const BUILD_CONDITIONAL: FeeType[] = ["setting_out", "construction_supervision"];

export default function FeeScheduleForm({ estateId, current, onDeclared }: {
  estateId: string;
  current: FeeSchedule;
  onDeclared: () => void;
}) {
  // A previous declaration was an explicit act, so it may seed the next one.
  // With none on record the choice starts unmade.
  const [mode, setMode] = useState<FeeScheduleMode>(
    current.declaredAt === null ? "undecided" : current.fees.length === 0 ? "none" : "fees",
  );
  const [drafts, setDrafts] = useState<FeeDraft[]>(current.fees.map(feeDraftFrom));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);

  const update = (i: number, patch: Partial<FeeDraft>) => setDrafts((all) => all.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  const chooseMode = (next: FeeScheduleMode) => {
    setMode(next);
    setErrors({});
    // Choosing "there are charges" with nothing entered yet opens one row, so
    // the choice leads straight to the thing it asks for.
    if (next === "fees" && drafts.length === 0) setDrafts([emptyFeeDraft()]);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const built = buildFeesRequest(mode, mode === "fees" ? drafts : []);
    if (built.errors) { setErrors(built.errors); return; }
    setErrors({});
    setServerError("");
    setSaving(true);
    try {
      await declareFees(estateId, built.request);
      onDeclared();
    } catch (err) {
      setServerError(serverMessage(err, "The fee schedule wasn't saved."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-5" noValidate>
      <div>
        <h3 className="text-sm font-semibold text-[var(--foreground)]">Declare the fee schedule</h3>
        <p className="text-xs text-[var(--muted-foreground)] mt-1">
          Every charge a buyer pays beyond the land price. Buyers see this before they commit.
        </p>
      </div>

      <Choice<FeeScheduleMode>
        name="fee-mode"
        legend="Does this estate charge anything beyond the land price?"
        value={mode === "undecided" ? null : mode}
        onChange={chooseMode}
        error={errors.mode}
        options={[
          { value: "fees", label: "Yes — there are charges", description: "List each one below." },
          { value: "none", label: "No — the land price is the whole cost", description: "Declared as a statement to buyers." },
        ]}
      />

      {mode === "none" && (
        <p className="text-sm text-[var(--foreground)] bg-[var(--muted)] rounded-md px-3 py-2">
          You're declaring that a buyer pays nothing beyond the land price for this estate. That counts as a declaration and lets the estate
          be published.
        </p>
      )}

      {mode === "fees" && (
        <div className="space-y-4">
          {drafts.map((draft, i) => (
            <FeeRow
              key={i}
              index={i}
              draft={draft}
              errors={errors}
              onChange={(patch) => update(i, patch)}
              onRemove={() => setDrafts((all) => all.filter((_, j) => j !== i))}
            />
          ))}
          <button
            type="button"
            onClick={() => setDrafts((all) => [...all, emptyFeeDraft()])}
            className="text-sm font-semibold text-[var(--accent)] hover:underline"
          >
            + Add another fee
          </button>
        </div>
      )}

      {serverError && <p className="text-sm text-red-700" role="alert">{serverError}</p>}

      <div className="space-y-2">
        <VersionNote nextVersion={current.version + 1} />
        <SubmitButton saving={saving}>
          {mode === "none" ? "Declare no extra charges" : "Declare fee schedule"}
        </SubmitButton>
      </div>
    </form>
  );
}

function FeeRow({ index, draft, errors, onChange, onRemove }: {
  index: number;
  draft: FeeDraft;
  errors: FieldErrors;
  onChange: (patch: Partial<FeeDraft>) => void;
  onRemove: () => void;
}) {
  const id = (field: string) => `fee-${index}-${field}`;
  const err = (field: string) => errors[`fees.${index}.${field}`];

  return (
    <fieldset className="border border-[var(--border)] rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <legend className="text-sm font-semibold text-[var(--foreground)]">Fee {index + 1}</legend>
        {/* Removes a row from this unsubmitted draft — nothing already
            declared can be removed. */}
        <button type="button" onClick={onRemove} className="text-xs text-[var(--muted-foreground)] hover:underline">Remove from draft</button>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field id={id("feeType")} label="Type" error={err("feeType")}>
          <select id={id("feeType")} value={draft.feeType} onChange={(e) => onChange({ feeType: e.target.value as FeeType })} className={inputClass}>
            {FEE_TYPES.map((t) => <option key={t} value={t}>{FEE_TYPE_LABELS[t]}</option>)}
          </select>
        </Field>
        <Field id={id("label")} label={draft.feeType === "other" ? "Name of the charge (required)" : "Label (optional)"} error={err("label")}>
          <input id={id("label")} value={draft.label} onChange={(e) => onChange({ label: e.target.value })} className={inputClass} />
        </Field>
      </div>

      <Choice<"fixed" | "range">
        name={id("pricing")}
        legend="Amount"
        value={draft.pricing}
        onChange={(pricing) => onChange({ pricing })}
        error={err("pricing")}
        options={[
          { value: "fixed", label: "A fixed amount" },
          { value: "range", label: "A range, with the reason it may vary" },
        ]}
      />

      <div className="grid sm:grid-cols-3 gap-4">
        {draft.pricing === "fixed" && (
          <Field id={id("amount")} label="Amount" error={err("amount")}>
            <input id={id("amount")} type="number" min={0} value={draft.amount} onChange={(e) => onChange({ amount: e.target.value })} className={inputClass} />
          </Field>
        )}
        {draft.pricing === "range" && (
          <>
            <Field id={id("amountMin")} label="Lowest" error={err("amountMin")}>
              <input id={id("amountMin")} type="number" min={0} value={draft.amountMin} onChange={(e) => onChange({ amountMin: e.target.value })} className={inputClass} />
            </Field>
            <Field id={id("amountMax")} label="Highest" error={err("amountMax")}>
              <input id={id("amountMax")} type="number" min={0} value={draft.amountMax} onChange={(e) => onChange({ amountMax: e.target.value })} className={inputClass} />
            </Field>
          </>
        )}
        {draft.pricing !== "" && (
          <Field id={id("currency")} label="Currency">
            <select id={id("currency")} value={draft.currency} onChange={(e) => onChange({ currency: e.target.value as Currency })} className={inputClass}>
              {FEE_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        )}
      </div>

      {/* PD-2. A range is allowed because some costs genuinely move — the
          reason is what makes it a disclosure rather than a number that can
          change later. Shown to buyers beside the figure. */}
      {draft.pricing === "range" && (
        <Field
          id={id("variationBasis")}
          label="Why this amount may vary"
          error={err("variationBasis")}
          hint={'For example: "Subject to change due to fluctuations in the prices of building materials." Shown to buyers beside the range.'}
        >
          <textarea id={id("variationBasis")} rows={2} value={draft.variationBasis} onChange={(e) => onChange({ variationBasis: e.target.value })} className={inputClass} />
        </Field>
      )}

      <Field
        id={id("dueTrigger")}
        label="When it falls due"
        error={err("dueTrigger")}
        hint={draft.dueTrigger === "annual"
          ? "An annual charge is shown to buyers as ongoing, separately from the total commitment — one year of a charge with no end date isn't a meaningful figure to add to a purchase price."
          : undefined}
      >
        <select id={id("dueTrigger")} value={draft.dueTrigger} onChange={(e) => onChange({ dueTrigger: e.target.value as FeeDueTrigger })} className={inputClass}>
          <option value="" disabled>Choose…</option>
          {DUE_TRIGGERS.map((t) => <option key={t} value={t}>{DUE_TRIGGER_OPTIONS[t]}</option>)}
        </select>
      </Field>

      <div className="grid sm:grid-cols-2 gap-4">
        {/* PD-3. Asked as "can a buyer avoid it", because that is what the
            field means — and the conditional wording in allocation letters
            invites the opposite answer. */}
        <Choice<boolean>
          name={id("isMandatory")}
          legend="Mandatory — a buyer has no way to avoid it?"
          value={draft.isMandatory}
          onChange={(isMandatory) => onChange({ isMandatory })}
          error={err("isMandatory")}
          options={YES_NO}
          hint={BUILD_CONDITIONAL.includes(draft.feeType) ? (
            <span className="text-amber-700">
              Charged "only if you build"? If your terms also require buyers to build, this fee is mandatory — the condition can't be avoided,
              so neither can the fee.
            </span>
          ) : "A fee that applies only under a condition is still mandatory if that condition is itself required."}
        />
        <Choice<boolean>
          name={id("refundable")}
          legend="Refundable if the buyer withdraws?"
          value={draft.refundable}
          onChange={(refundable) => onChange({ refundable })}
          error={err("refundable")}
          options={YES_NO}
        />
      </div>

      <Field id={id("notes")} label="Notes (optional)">
        <textarea id={id("notes")} rows={2} value={draft.notes} onChange={(e) => onChange({ notes: e.target.value })} className={inputClass} />
      </Field>
    </fieldset>
  );
}
