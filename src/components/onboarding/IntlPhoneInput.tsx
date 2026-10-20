// A phone number in the onboarding wizard, held as one international number
// (+2348054443322) — the same field and the same format as buyers' sign-up,
// from the Figma onboarding proposal. The form value is the international
// number; the dial code and the digits typed are this field's own state.

import { useEffect, useState } from "react";
import PhoneField from "../auth/PhoneField";
import { splitInternational, toInternational } from "../../lib/phone";

export default function IntlPhoneInput({ id, label, value, onChange, error, purpose }: {
  id: string;
  label: string;
  value: string;
  onChange: (international: string) => void;
  error?: string;
  purpose: string;
}) {
  const [{ iso, number }, setParts] = useState(() => splitInternational(value));

  // A number that arrived in another shape (a request's "0805 444 3322", an
  // old draft's "+234 805…") is stored in the one format straight away.
  useEffect(() => {
    if (number.trim()) {
      const normal = toInternational(iso, number);
      if (normal !== value) onChange(normal);
    }
  }, []);

  const update = (next: { iso: string; number: string }) => {
    setParts(next);
    onChange(next.number.trim() ? toInternational(next.iso, next.number) : "");
  };

  return (
    <PhoneField id={id} label={label} dialIso={iso} number={number} error={error} purpose={purpose}
      onDialIso={(nextIso) => update({ iso: nextIso, number })}
      onNumber={(nextNumber) => update({ iso, number: nextNumber })} />
  );
}
