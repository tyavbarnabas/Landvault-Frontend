// The buyer's postal address form (backend changeset 097), used in Settings
// and inline at checkout. Country first: for Nigeria the state is one of the
// 36 states or the FCT, from a list; anywhere else it's free text (county,
// province, region). The backend checks everything again and its field errors
// land under the field they're about.

import { useState } from "react";
import { useApp } from "../../contexts/AppContext";
import { COMMON_DIAL_ISOS, DIAL_COUNTRIES, dialCountry } from "../../data/dialCodes";
import { NIGERIAN_STATES } from "../../data/nigerianStates";
import { ADDRESS_LIMITS, addressErrors, nigerianStateFor, saveAddress, type Address, type AddressInput } from "../../services/addressService";
import Button from "../ui/Button";
import { ErrorText, Field, Input, Select, describedBy } from "../ui/Field";

type Values = Required<AddressInput>;
type Errors = Partial<Record<keyof AddressInput, string>>;

const COMMON = COMMON_DIAL_ISOS.map(dialCountry).filter((c) => !!c);
const OTHERS = DIAL_COUNTRIES.filter((c) => !COMMON_DIAL_ISOS.includes(c.iso)).sort((a, b) => a.name.localeCompare(b.name));

export default function AddressForm({ id, initial, onSaved, onCancel, submitLabel = "Save address" }: {
  id: string;
  initial: Address | null | undefined;
  onSaved: (address: Address) => void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const { user, addressChanged } = useApp();
  const [values, setValues] = useState<Values>(() => ({
    country: initial?.country ?? (dialCountry(user?.country ?? "") ? user!.country : "NG"),
    line1: initial?.line1 ?? "",
    line2: initial?.line2 ?? "",
    city: initial?.city ?? "",
    state: initial?.state ?? "",
    postalCode: initial?.postalCode ?? "",
  }));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const nigeria = values.country === "NG";

  const set = (field: keyof Values) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const value = e.target.value;
    setValues((v) => ({ ...v, [field]: value }));
    setErrors((er) => ({ ...er, [field]: undefined }));
  };

  const setCountry = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const country = e.target.value;
    // Into Nigeria, a typed state that names one carries over; otherwise it's
    // chosen again from the list.
    setValues((v) => ({ ...v, country, state: country === "NG" ? nigerianStateFor(v.state) ?? "" : v.state }));
    setErrors((er) => ({ ...er, country: undefined, state: undefined }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || busy) return;
    const missing: Errors = {};
    if (!values.line1.trim()) missing.line1 = "Enter your house number and street.";
    if (!values.city.trim()) missing.city = "Enter your town or city.";
    if (!values.state.trim()) missing.state = nigeria ? "Choose your state." : "Enter your state, county or region.";
    setErrors(missing);
    setFormError("");
    if (Object.keys(missing).length) return;
    setBusy(true);
    try {
      const saved = await saveAddress(user, values);
      addressChanged(saved);
      onSaved(saved);
    } catch (err) {
      const { fields, message } = addressErrors(err);
      setErrors(fields);
      setFormError(message);
    } finally {
      setBusy(false);
    }
  };

  const f = (name: keyof Values) => `${id}-${name}`;

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <Field id={f("country")} label="Country" error={errors.country}>
        <Select id={f("country")} autoComplete="country" value={values.country} onChange={setCountry}
          aria-invalid={!!errors.country || undefined} aria-describedby={describedBy(f("country"), { error: errors.country })}>
          <optgroup label="Common">
            {COMMON.map((c) => <option key={c!.iso} value={c!.iso}>{c!.name}</option>)}
          </optgroup>
          <optgroup label="All countries">
            {OTHERS.map((c) => <option key={c.iso} value={c.iso}>{c.name}</option>)}
          </optgroup>
        </Select>
      </Field>

      <Field id={f("line1")} label="Address line 1" hint="House number and street." error={errors.line1}>
        <Input id={f("line1")} autoComplete="address-line1" value={values.line1} onChange={set("line1")} maxLength={ADDRESS_LIMITS.line1}
          aria-invalid={!!errors.line1 || undefined} aria-describedby={describedBy(f("line1"), { hint: true, error: errors.line1 })} />
      </Field>

      <Field id={f("line2")} label="Address line 2" hint="Estate, area, or flat number. Optional." error={errors.line2}>
        <Input id={f("line2")} autoComplete="address-line2" value={values.line2} onChange={set("line2")} maxLength={ADDRESS_LIMITS.line2}
          aria-invalid={!!errors.line2 || undefined} aria-describedby={describedBy(f("line2"), { hint: true, error: errors.line2 })} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={f("city")} label="Town or city" error={errors.city}>
          <Input id={f("city")} autoComplete="address-level2" value={values.city} onChange={set("city")} maxLength={ADDRESS_LIMITS.city}
            aria-invalid={!!errors.city || undefined} aria-describedby={describedBy(f("city"), { error: errors.city })} />
        </Field>
        <Field id={f("state")} label={nigeria ? "State" : "State, county or region"} error={errors.state}>
          {nigeria ? (
            <Select id={f("state")} autoComplete="address-level1" value={values.state} onChange={set("state")}
              aria-invalid={!!errors.state || undefined} aria-describedby={describedBy(f("state"), { error: errors.state })}>
              <option value="">Choose a state</option>
              {NIGERIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          ) : (
            <Input id={f("state")} autoComplete="address-level1" value={values.state} onChange={set("state")} maxLength={ADDRESS_LIMITS.state}
              aria-invalid={!!errors.state || undefined} aria-describedby={describedBy(f("state"), { error: errors.state })} />
          )}
        </Field>
      </div>

      <Field id={f("postalCode")} label="Postal code" hint="Optional." error={errors.postalCode} className="sm:max-w-[50%] sm:pr-2">
        <Input id={f("postalCode")} autoComplete="postal-code" value={values.postalCode} onChange={set("postalCode")} maxLength={ADDRESS_LIMITS.postalCode}
          aria-invalid={!!errors.postalCode || undefined} aria-describedby={describedBy(f("postalCode"), { hint: true, error: errors.postalCode })} />
      </Field>

      {formError && <ErrorText>{formError}</ErrorText>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : submitLabel}</Button>
        {onCancel && <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>}
      </div>
    </form>
  );
}
