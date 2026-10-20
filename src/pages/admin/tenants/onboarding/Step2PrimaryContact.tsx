import { Controller, useFormContext } from "react-hook-form";
import type { TenantOnboardingValues } from "../../../../lib/onboarding/schema";
import { GOV_ID_TYPES } from "../../../../lib/onboarding/schema";
import { TextField, SelectField } from "./FormField";
import IntlPhoneInput from "../../../../components/onboarding/IntlPhoneInput";
import Alert from "../../../../components/ui/Alert";

export default function Step2PrimaryContact() {
  const { register, control, formState: { errors } } = useFormContext<TenantOnboardingValues>();

  return (
    <div className="space-y-6">
      <Alert tone="info">
        They'll receive an invitation email to set their own password — the link works once, for 72 hours. Use an email that has no
        HomeTrue account yet (a work address, not a personal buyer account), or creating the tenant is refused.
      </Alert>

      <div className="grid sm:grid-cols-2 gap-4">
        <TextField label="First name" required error={errors.firstName?.message} {...register("firstName")} />
        <TextField label="Last name" required error={errors.lastName?.message} {...register("lastName")} />
      </div>

      <TextField label="Role / job title" required placeholder="e.g. Managing Director" error={errors.roleTitle?.message} {...register("roleTitle")} />

      <TextField label="Work email" type="email" required placeholder="name@company.com" error={errors.workEmail?.message} {...register("workEmail")} />

      <Controller control={control} name="phone" render={({ field }) => (
        <IntlPhoneInput id="contact-phone" label="Mobile number" value={field.value} onChange={field.onChange} error={errors.phone?.message}
          purpose="It becomes the first Executive Director's phone." />
      )} />

      <div className="grid sm:grid-cols-2 gap-4">
        <SelectField label="Government ID type" required error={errors.govIdType?.message} {...register("govIdType")}>
          {GOV_ID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </SelectField>
        <TextField label="ID number" required error={errors.govIdNumber?.message} {...register("govIdNumber")} />
      </div>
    </div>
  );
}
