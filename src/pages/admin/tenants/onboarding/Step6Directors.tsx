import { useFieldArray, useFormContext, useWatch } from "react-hook-form";
import type { TenantOnboardingValues } from "../../../../lib/onboarding/schema";
import { GOV_ID_TYPES, BENEFICIAL_OWNER_THRESHOLD, isBeneficialOwner } from "../../../../lib/onboarding/schema";
import { TextField, SelectField, CheckboxField } from "./FormField";
import RepeatableFieldList from "../../../../components/onboarding/RepeatableFieldList";
import { newDirector } from "./defaultValues";

export default function Step6Directors() {
  const { register, control, formState: { errors } } = useFormContext<TenantOnboardingValues>();
  const directors = useFieldArray({ control, name: "directors" });
  const watchedDirectors = useWatch({ control, name: "directors" });

  return (
    <div className="space-y-6">
      <div className="bg-[var(--secondary)] rounded-lg p-4 text-sm text-[var(--muted-foreground)]">
        Flagging beneficial owners (≥{BENEFICIAL_OWNER_THRESHOLD}% ownership) for enhanced verification is standard AML practice — it protects the platform from onboarding a front company.
      </div>

      {errors.directors?.message && <p role="alert" className="text-red-600 text-sm">{errors.directors.message as string}</p>}

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
              {flagged && (
                <div className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border bg-amber-50 text-amber-700 border-amber-200">
                  Beneficial owner — requires enhanced verification
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-4">
                <TextField label="Full name" required error={directorErrors?.fullName?.message} {...register(`directors.${i}.fullName`)} />
                <TextField label="Role" required error={directorErrors?.role?.message} {...register(`directors.${i}.role`)} />
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <TextField label="Nationality" required error={directorErrors?.nationality?.message} {...register(`directors.${i}.nationality`)} />
                <SelectField label="ID type" required {...register(`directors.${i}.idType`)}>
                  {GOV_ID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </SelectField>
                <TextField label="ID number" required error={directorErrors?.idNumber?.message} {...register(`directors.${i}.idNumber`)} />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <TextField
                  label="BVN (optional, sensitive)"
                  {...register(`directors.${i}.bvn`)}
                />
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

      <CheckboxField
        label="I confirm I am a director of this company and am authorised to register it on LandVault."
        error={errors.attestation?.message}
        {...register("attestation")}
      />
    </div>
  );
}
