import { Controller, useFormContext } from "react-hook-form";
import type { TenantOnboardingValues } from "../../../../lib/onboarding/schema";
import { TextField } from "./FormField";
import IntlPhoneInput from "../../../../components/onboarding/IntlPhoneInput";

export default function Step3ContactPresence() {
  const { register, control, formState: { errors } } = useFormContext<TenantOnboardingValues>();

  return (
    <div className="space-y-6">
      <TextField label="Company email" type="email" required error={errors.companyEmail?.message} {...register("companyEmail")} />

      <Controller control={control} name="companyPhone" render={({ field }) => (
        <IntlPhoneInput id="company-phone" label="Company phone" value={field.value} onChange={field.onChange} error={errors.companyPhone?.message}
          purpose="The company's main line." />
      )} />

      <TextField label="Website" placeholder="https://example.com" error={errors.website?.message} {...register("website")} />

      <fieldset className="border border-[var(--border)] rounded-lg p-4">
        <legend className="text-sm font-semibold px-1">Social handles (optional)</legend>
        <div className="grid sm:grid-cols-2 gap-4 mt-2">
          <TextField label="Instagram" placeholder="@handle" {...register("socials.instagram")} />
          <TextField label="X / Twitter" placeholder="@handle" {...register("socials.twitter")} />
          <TextField label="Facebook" placeholder="Page name or URL" {...register("socials.facebook")} />
          <TextField label="LinkedIn" placeholder="Company page URL" {...register("socials.linkedin")} />
        </div>
      </fieldset>
    </div>
  );
}
