import { Controller, useFormContext } from "react-hook-form";
import type { TenantOnboardingValues } from "../../../../lib/onboarding/schema";
import { GOV_ID_TYPES } from "../../../../lib/onboarding/schema";
import { TextField, SelectField } from "./FormField";
import PhoneInput from "../../../../components/onboarding/PhoneInput";

export default function Step2PrimaryContact() {
  const { register, control, formState: { errors } } = useFormContext<TenantOnboardingValues>();

  return (
    <div className="space-y-6">
      <div className="bg-[var(--secondary)] rounded-lg p-4 text-sm text-[var(--muted-foreground)]">
        This person becomes the tenant's Executive Director account. They'll receive an invitation email and hold the highest permissions inside their company.
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <TextField label="Full name" required error={errors.fullName?.message} {...register("fullName")} />
        <TextField label="Role / job title" required placeholder="e.g. Managing Director" error={errors.roleTitle?.message} {...register("roleTitle")} />
      </div>

      <TextField label="Work email" type="email" required placeholder="name@company.com" error={errors.workEmail?.message} {...register("workEmail")} />

      <div>
        <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Phone <span className="text-red-600">*</span></label>
        <Controller control={control} name="phone" render={({ field }) => <PhoneInput value={field.value} onChange={field.onChange} error={errors.phone?.message} />} />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <SelectField label="Government ID type" required error={errors.govIdType?.message} {...register("govIdType")}>
          {GOV_ID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </SelectField>
        <TextField label="ID number" required error={errors.govIdNumber?.message} {...register("govIdNumber")} />
      </div>
    </div>
  );
}
