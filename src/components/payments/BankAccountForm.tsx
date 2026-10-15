// Bank + 10-digit account number — the one form for giving LandVault an
// account (a buyer's refund, a company's payouts). Deliberately NO name field:
// the bank supplies the name, so it can't be typed to look right.

import { useState } from "react";
import { ApiError, ApiTransportError } from "../../lib/apiClient";
import { useFetch } from "../../lib/useFetch";
import LoadError from "../LoadError";
import type { Bank } from "../../services/paymentsService";
import Button from "../ui/Button";
import { ErrorText, Field, Input, Select, describedBy } from "../ui/Field";

export interface BankAccountErrors {
  bankCode?: string;
  accountNumber?: string;
  form?: string;
}

// The refusals every bank-account endpoint shares. `specific` handles the
// codes only one endpoint sends; return undefined to fall through.
export function bankAccountErrors(err: unknown, specific?: (code: string, message: string) => BankAccountErrors | undefined): BankAccountErrors {
  if (err instanceof ApiTransportError) return { form: "We couldn't reach HomeTrue. Check your connection and try again." };
  const code = (err instanceof ApiError ? err.body?.code : (err as { code?: string } | null)?.code) ?? "";
  const message = err instanceof Error ? err.message : "";
  const own = specific?.(code, message);
  if (own) return own;
  switch (code) {
    case "VALIDATION_ERROR": {
      // No message on this one — the fields say what's wrong.
      const fields = (err as ApiError).body?.fieldErrors ?? {};
      return { bankCode: fields.bankCode, accountNumber: fields.accountNumber, form: fields.bankCode || fields.accountNumber ? undefined : "Check the bank and account number." };
    }
    case "UNKNOWN_BANK": return { bankCode: "We don't recognise that bank. Choose it from the list." };
    case "ACCOUNT_NOT_RESOLVED": return { accountNumber: "Your bank couldn't find this account. Check the number and the bank." };
    case "PAYMENT_PROVIDER_UNAVAILABLE":
    case "PAYMENT_PROVIDER_REFUSED": return { form: "We couldn't check the account with your bank just now. Please try again in a moment." };
    default: return { form: message || "We couldn't save that account. Please try again." };
  }
}

export default function BankAccountForm({ idPrefix, loadBanks, submitLabel, busyLabel = "Checking the account with your bank…", onSubmit, onCancel }: {
  idPrefix: string;
  loadBanks: () => Promise<Bank[]>;
  submitLabel: string;
  busyLabel?: string;
  // Resolves on success; throws BankAccountErrors-shaped trouble via `errors`.
  onSubmit: (account: { bankCode: string; accountNumber: string }) => Promise<BankAccountErrors | void>;
  onCancel?: () => void;
}) {
  const banks = useFetch(loadBanks, []);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [errors, setErrors] = useState<BankAccountErrors>({});
  const [saving, setSaving] = useState(false);
  const bankId = `${idPrefix}-bank`;
  const numberId = `${idPrefix}-account`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const local: BankAccountErrors = {};
    if (!bankCode) local.bankCode = "Choose the bank.";
    if (!/^\d{10}$/.test(accountNumber)) local.accountNumber = "Enter the 10-digit account number.";
    setErrors(local);
    if (Object.keys(local).length) return;
    setSaving(true);
    const problem = await onSubmit({ bankCode, accountNumber });
    setSaving(false);
    if (problem) setErrors(problem);
  };

  if (banks.error) return <LoadError error={banks.errorValue} what="the list of banks" onRetry={banks.refetch} />;

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <Field id={bankId} label="Bank" error={errors.bankCode}>
        <Select id={bankId} value={bankCode} onChange={(e) => setBankCode(e.target.value)} disabled={!banks.data}
          aria-invalid={!!errors.bankCode} aria-describedby={describedBy(bankId, { error: errors.bankCode })}>
          <option value="">{banks.data ? "Choose the bank" : "Loading banks…"}</option>
          {(banks.data ?? []).map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}
        </Select>
      </Field>
      <Field id={numberId} label="Account number" error={errors.accountNumber}>
        <Input id={numberId} value={accountNumber} inputMode="numeric" autoComplete="off" maxLength={10} placeholder="10 digits"
          onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
          aria-invalid={!!errors.accountNumber} aria-describedby={describedBy(numberId, { error: errors.accountNumber })}
          className="font-mono-data tracking-wider" />
      </Field>
      {errors.form && <ErrorText>{errors.form}</ErrorText>}
      <div className="flex gap-2">
        {onCancel && <Button variant="secondary" size="lg" onClick={onCancel} className="flex-1">Cancel</Button>}
        <Button type="submit" size="lg" disabled={saving} className="flex-[2]">{saving ? busyLabel : submitLabel}</Button>
      </div>
    </form>
  );
}
