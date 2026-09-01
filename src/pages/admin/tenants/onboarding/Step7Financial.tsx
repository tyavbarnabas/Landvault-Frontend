import { useFormContext, useWatch } from "react-hook-form";
import type { TenantOnboardingValues } from "../../../../lib/onboarding/schema";
import { GATEWAY_NAMES, accountNameLooksMismatched } from "../../../../lib/onboarding/schema";
import { NIGERIAN_BANKS } from "../../../../data/nigerianBanks";
import { TextField, SelectField } from "./FormField";

export default function Step7Financial() {
  const { register, control, setValue, formState: { errors } } = useFormContext<TenantOnboardingValues>();
  const registeredName = useWatch({ control, name: "registeredName" });
  const accountName = useWatch({ control, name: "accountName" });
  const gateways = useWatch({ control, name: "gateways" }) ?? {};

  const mismatch = accountName && registeredName && accountNameLooksMismatched(registeredName, accountName);

  return (
    <div className="space-y-6">
      <fieldset className="border border-[var(--border)] rounded-lg p-4">
        <legend className="text-sm font-semibold px-1">Corporate bank account</legend>
        <div className="grid sm:grid-cols-2 gap-4 mt-2">
          <SelectField label="Bank" required {...register("bankName")}>
            {NIGERIAN_BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
          </SelectField>
          <TextField label="Account number" required maxLength={10} error={errors.accountNumber?.message} {...register("accountNumber")} />
        </div>
        <div className="mt-4">
          <TextField label="Account name" required error={errors.accountName?.message} {...register("accountName")} />
        </div>
        {mismatch && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
            The account name doesn't closely match the registered company name ("{registeredName}"). This isn't a blocker, but it's a compliance red flag worth a closer look during review.
          </div>
        )}
      </fieldset>

      <SelectField label="Preferred settlement currency" required {...register("settlementCurrency")}>
        <option value="NGN">NGN</option>
        <option value="USD">USD</option>
        <option value="GBP">GBP</option>
        <option value="EUR">EUR</option>
      </SelectField>

      <div>
        <div className="text-sm font-semibold mb-2">Payment gateway connections</div>
        <p className="text-xs text-[var(--muted-foreground)] mb-3">Connect now, or mark for "connect later" — this doesn't block onboarding.</p>
        <div className="space-y-2">
          {GATEWAY_NAMES.map((name) => (
            <label key={name} className="flex items-center justify-between px-3 py-2.5 bg-[var(--muted)] rounded-lg text-sm">
              <span>{name}</span>
              <select
                value={gateways[name] ?? "pending"}
                onChange={(e) => setValue(`gateways.${name}`, e.target.value as "connected" | "pending")}
                className="text-xs bg-[var(--card)] border border-[var(--border)] rounded px-2 py-1 cursor-pointer"
              >
                <option value="pending">Connect later</option>
                <option value="connected">Connected</option>
              </select>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
