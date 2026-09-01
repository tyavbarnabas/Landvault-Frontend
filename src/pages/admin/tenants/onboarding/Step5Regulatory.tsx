import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form";
import type { TenantOnboardingValues } from "../../../../lib/onboarding/schema";
import { TextField } from "./FormField";
import FileUpload from "../../../../components/onboarding/FileUpload";
import { StateSelect } from "../../../../components/onboarding/StateSelect";
import RepeatableFieldList from "../../../../components/onboarding/RepeatableFieldList";
import { newStateRegulatorEntry, newPermit } from "./defaultValues";
import { LAGOS } from "../../../../data/nigerianStates";

export default function Step5Regulatory() {
  const { register, control, formState: { errors } } = useFormContext<TenantOnboardingValues>();
  const statesOfOperation = useWatch({ control, name: "statesOfOperation" });
  const operatesInLagos = statesOfOperation?.includes(LAGOS);

  const regulators = useFieldArray({ control, name: "otherStateRegulators" });
  const permits = useFieldArray({ control, name: "additionalPermits" });

  return (
    <div className="space-y-6">
      <div className="bg-[var(--secondary)] rounded-lg p-4 text-sm text-[var(--muted-foreground)]">
        Real estate firms are Designated Non-Financial Businesses under Nigeria's AML regime and are generally required to register with SCUML (under the EFCC) — this is the one most operators overlook, and it matters because you're facilitating large property payments.
      </div>

      <TextField label="SCUML registration number" required error={errors.scumlNumber?.message} {...register("scumlNumber")} />
      <Controller
        control={control}
        name="scumlCertificate"
        render={({ field }) => (
          <FileUpload label="SCUML certificate" required file={field.value} onChange={field.onChange} error={errors.scumlCertificate?.message as string | undefined} />
        )}
      />

      {operatesInLagos && (
        <fieldset className="border border-[var(--border)] rounded-lg p-4">
          <legend className="text-sm font-semibold px-1">LASRERA registration (Lagos)</legend>
          <p className="text-xs text-[var(--muted-foreground)] mb-3">You listed Lagos as a state of operation — Lagos has its own real estate regulator (LASRERA).</p>
          <div className="space-y-4">
            <TextField label="LASRERA registration number" error={errors.lasreraRegNumber?.message} {...register("lasreraRegNumber")} />
            <Controller
              control={control}
              name="lasreraDocument"
              render={({ field }) => <FileUpload label="LASRERA certificate" file={field.value} onChange={field.onChange} />}
            />
          </div>
        </fieldset>
      )}

      <div>
        <div className="text-sm font-semibold mb-2">Other state regulators</div>
        <p className="text-xs text-[var(--muted-foreground)] mb-3">Other states have introduced their own real estate regulators — add any that apply.</p>
        <RepeatableFieldList
          items={regulators.fields}
          getKey={(item) => item.id}
          onAdd={() => regulators.append(newStateRegulatorEntry())}
          onRemove={regulators.remove}
          addLabel="Add a state regulator"
          renderItem={(_item, i) => (
            <div className="grid sm:grid-cols-2 gap-4">
              <Controller
                control={control}
                name={`otherStateRegulators.${i}.state`}
                render={({ field }) => <StateSelect label="State" value={field.value} onChange={field.onChange} />}
              />
              <TextField label="Regulator name" {...register(`otherStateRegulators.${i}.regulatorName`)} />
              <TextField label="Registration number" {...register(`otherStateRegulators.${i}.regNumber`)} />
              <Controller
                control={control}
                name={`otherStateRegulators.${i}.document`}
                render={({ field }) => <FileUpload label="Registration document" file={field.value} onChange={field.onChange} />}
              />
            </div>
          )}
        />
      </div>

      <div>
        <TextField label="REDAN membership number" error={errors.redanNumber?.message} {...register("redanNumber")} />
        <p className="text-xs text-[var(--muted-foreground)] mt-1.5">Real Estate Developers Association of Nigeria — a credibility signal, not a licence.</p>
      </div>

      <div>
        <div className="text-sm font-semibold mb-2">Additional state permits (optional)</div>
        <RepeatableFieldList
          items={permits.fields}
          getKey={(item) => item.id}
          onAdd={() => permits.append(newPermit())}
          onRemove={permits.remove}
          addLabel="Add a permit"
          renderItem={(_item, i) => (
            <div className="grid sm:grid-cols-2 gap-4">
              <TextField label="Permit name" {...register(`additionalPermits.${i}.name`)} />
              <Controller
                control={control}
                name={`additionalPermits.${i}.document`}
                render={({ field }) => <FileUpload label="Document" file={field.value} onChange={field.onChange} />}
              />
            </div>
          )}
        />
      </div>
    </div>
  );
}
