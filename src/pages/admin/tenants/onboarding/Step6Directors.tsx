import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import type { TenantOnboardingValues } from "../../../../lib/onboarding/schema";
import { GOV_ID_TYPES, BENEFICIAL_OWNER_THRESHOLD, isBeneficialOwner } from "../../../../lib/onboarding/schema";
import { TextField, SelectField, CheckboxField } from "./FormField";
import RepeatableFieldList from "../../../../components/onboarding/RepeatableFieldList";
import { newDirector } from "./defaultValues";
import Alert from "../../../../components/ui/Alert";
import Badge from "../../../../components/ui/Badge";
import { ErrorText } from "../../../../components/ui/Field";

export default function Step6Directors() {
  const { register, control, formState: { errors } } = useFormContext<TenantOnboardingValues>();
  const directors = useFieldArray({ control, name: "directors" });
  const watchedDirectors = useWatch({ control, name: "directors" });
  const totalPct = Math.round((watchedDirectors ?? []).reduce((sum, d) => sum + (Number(d?.ownershipPct) || 0), 0) * 100) / 100;

  return (
    <div className="space-y-6">
      <Alert tone="info">
        Flagging beneficial owners ({BENEFICIAL_OWNER_THRESHOLD}% ownership or more) for enhanced verification is standard AML practice — it
        protects the platform from onboarding a front company.
      </Alert>

      {errors.directors?.message && <ErrorText>{errors.directors.message as string}</ErrorText>}

      <RepeatableFieldList
        items={directors.fields}
        getKey={(item) => item.id}
        minItems={1}
        onAdd={() => directors.append(newDirector())}
        onRemove={directors.remove}
        addLabel="Add a director"
        renderItem={(_item, i) => {
          const pct = watchedDirectors?.[i]?.ownershipPct ?? 0;
          const flagged = isBeneficialOwner(Number(pct) || 0);
          const directorErrors = errors.directors?.[i];
          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 pr-16">
                <span className="font-semibold text-[var(--foreground)]">
                  {[watchedDirectors?.[i]?.firstName, watchedDirectors?.[i]?.lastName].filter(Boolean).join(" ") || `Director ${i + 1}`}
                </span>
                {flagged && <Badge label={`Beneficial owner · ${BENEFICIAL_OWNER_THRESHOLD}%+ · enhanced verification`} variant="info" />}
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <TextField label="First name" required error={directorErrors?.firstName?.message} {...register(`directors.${i}.firstName`)} />
                <TextField label="Last name" required error={directorErrors?.lastName?.message} {...register(`directors.${i}.lastName`)} />
                <TextField label="Role" required error={directorErrors?.role?.message} {...register(`directors.${i}.role`)} />
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <TextField label="Nationality" required error={directorErrors?.nationality?.message} {...register(`directors.${i}.nationality`)} />
                <SelectField label="ID type" required {...register(`directors.${i}.idType`)}>
                  {GOV_ID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </SelectField>
                <TextField label="ID number" required error={directorErrors?.idNumber?.message} {...register(`directors.${i}.idNumber`)} />
                <TextField
                  label="Ownership %"
                  type="number"
                  min={0}
                  max={100}
                  required
                  error={directorErrors?.ownershipPct?.message}
                  {...register(`directors.${i}.ownershipPct`, { valueAsNumber: true })}
                />
              </div>
            </div>
          );
        }}
      />

      {/* Shown so a gap or a double count is easy to spot — not a rule. */}
      <div className="rounded-lg bg-[var(--muted)] p-3.5">
        <div className="text-sm font-semibold text-[var(--foreground)]">Ownership recorded: {totalPct}%</div>
        <div className="h-2 rounded-full bg-[var(--border)] overflow-hidden mt-2 flex" aria-hidden="true">
          {(watchedDirectors ?? []).map((d, i) => (
            <span key={i} className={i % 2 ? "bg-[var(--accent)]" : "bg-[var(--primary)]"} style={{ width: `${Math.min(100, Math.max(0, Number(d?.ownershipPct) || 0))}%` }} />
          ))}
        </div>
        <p className="text-xs text-[var(--muted-foreground)] mt-2">Shown so a gap or a double count is easy to spot; it isn't required to add up to 100%.</p>
      </div>

      <CheckboxField
        label="I confirm I am a director of this company and am authorised to register it on HomeTrue."
        error={errors.attestation?.message}
        {...register("attestation")}
      />
    </div>
  );
}
