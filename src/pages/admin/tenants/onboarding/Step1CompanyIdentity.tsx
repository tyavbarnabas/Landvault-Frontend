import { useEffect } from "react";
import { Controller, useFormContext, useWatch } from "react-hook-form";
import type { TenantOnboardingValues } from "../../../../lib/onboarding/schema";
import { COMPANY_TYPES } from "../../../../lib/onboarding/schema";
import { TextField, SelectField, CheckboxField } from "./FormField";
import { StateSelect, MultiStateSelect } from "../../../../components/onboarding/StateSelect";

export default function Step1CompanyIdentity() {
  const { register, control, setValue, formState: { errors } } = useFormContext<TenantOnboardingValues>();
  const sameAsRegistered = useWatch({ control, name: "sameAsRegisteredAddress" });
  const registeredAddress = useWatch({ control, name: "registeredAddress" });

  // Keep operating address in sync while "same as registered" is checked.
  useEffect(() => {
    if (sameAsRegistered) setValue("operatingAddress", registeredAddress);
  }, [sameAsRegistered, registeredAddress, setValue]);

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 gap-4">
        <TextField label="Registered company name (as on CAC certificate)" required placeholder="e.g. Estintin Group Limited" error={errors.registeredName?.message} {...register("registeredName")} />
        <TextField label="Trading / brand name" placeholder="What buyers will see — defaults to registered name" error={errors.tradingName?.message} {...register("tradingName")} />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <TextField label="RC number" required placeholder="e.g. RC1234567" error={errors.rcNumber?.message} {...register("rcNumber")} />
        <SelectField label="Company type" required error={errors.companyType?.message} {...register("companyType")}>
          {COMPANY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </SelectField>
      </div>

      <TextField
        label="Date of incorporation"
        type="date"
        required
        max={new Date().toISOString().slice(0, 10)}
        error={errors.dateOfIncorporation?.message}
        {...register("dateOfIncorporation")}
      />

      <fieldset className="border border-[var(--border)] rounded-lg p-4">
        <legend className="text-sm font-semibold px-1">Registered office address</legend>
        <div className="grid sm:grid-cols-2 gap-4 mt-2">
          <TextField label="Street" required error={errors.registeredAddress?.street?.message} {...register("registeredAddress.street")} />
          <TextField label="City" required error={errors.registeredAddress?.city?.message} {...register("registeredAddress.city")} />
        </div>
        <div className="mt-4">
          <Controller
            control={control}
            name="registeredAddress.state"
            render={({ field }) => <StateSelect label="State" value={field.value} onChange={field.onChange} error={errors.registeredAddress?.state?.message} />}
          />
        </div>
      </fieldset>

      <CheckboxField label="Operating address is the same as the registered address" {...register("sameAsRegisteredAddress")} />

      {!sameAsRegistered && (
        <fieldset className="border border-[var(--border)] rounded-lg p-4">
          <legend className="text-sm font-semibold px-1">Operating address</legend>
          <div className="grid sm:grid-cols-2 gap-4 mt-2">
            <TextField label="Street" required error={errors.operatingAddress?.street?.message} {...register("operatingAddress.street")} />
            <TextField label="City" required error={errors.operatingAddress?.city?.message} {...register("operatingAddress.city")} />
          </div>
          <div className="mt-4">
            <Controller
              control={control}
              name="operatingAddress.state"
              render={({ field }) => <StateSelect label="State" value={field.value} onChange={field.onChange} error={errors.operatingAddress?.state?.message} />}
            />
          </div>
        </fieldset>
      )}

      <Controller
        control={control}
        name="statesOfOperation"
        render={({ field }) => (
          <MultiStateSelect label="States of operation" values={field.value} onChange={field.onChange} error={errors.statesOfOperation?.message as string | undefined} />
        )}
      />
    </div>
  );
}
