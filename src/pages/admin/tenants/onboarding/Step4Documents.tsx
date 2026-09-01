import { Controller, useFormContext } from "react-hook-form";
import type { TenantOnboardingValues } from "../../../../lib/onboarding/schema";
import { TextField } from "./FormField";
import FileUpload from "../../../../components/onboarding/FileUpload";

export default function Step4Documents() {
  const { register, control, formState: { errors } } = useFormContext<TenantOnboardingValues>();

  return (
    <div className="space-y-6">
      <Controller
        control={control}
        name="cacCertificate"
        render={({ field }) => (
          <FileUpload
            label="CAC Certificate of Incorporation"
            required
            helperText="Confirms the company legally exists — the foundation of everything else we verify."
            file={field.value}
            onChange={field.onChange}
            error={errors.cacCertificate?.message as string | undefined}
          />
        )}
      />

      <Controller
        control={control}
        name="cacStatusReport"
        render={({ field }) => (
          <FileUpload
            label="CAC Status Report or Memart"
            required
            helperText="Shows current directors and shareholding — cross-checked against what you enter in Step 6."
            file={field.value}
            onChange={field.onChange}
            error={errors.cacStatusReport?.message as string | undefined}
          />
        )}
      />

      <div className="grid sm:grid-cols-2 gap-4 items-end">
        <TextField label="TIN (Tax Identification Number)" required error={errors.tinNumber?.message} {...register("tinNumber")} />
      </div>
      <Controller
        control={control}
        name="tinDocument"
        render={({ field }) => (
          <FileUpload
            label="TIN document"
            required
            helperText="Your Tax Identification Number certificate."
            file={field.value}
            onChange={field.onChange}
            error={errors.tinDocument?.message as string | undefined}
          />
        )}
      />

      <Controller
        control={control}
        name="proofOfAddress"
        render={({ field }) => (
          <FileUpload
            label="Proof of registered address"
            required
            helperText="A recent utility bill or tenancy agreement for the registered address."
            file={field.value}
            onChange={field.onChange}
            error={errors.proofOfAddress?.message as string | undefined}
          />
        )}
      />
    </div>
  );
}
