// The mobile number at sign-up, from the Figma phone proposal: a dial code
// beside the number, so a buyer abroad never has to guess the format. The
// hint says exactly what will be saved.
//
// The dial code is a native <select> under a compact "+44 GB" face: on a
// phone it opens the system picker, and typing a country's first letters
// jumps to it — the search the proposal shows, without a custom listbox.

import { COMMON_DIAL_ISOS, DIAL_COUNTRIES, dialCountry } from "../../data/dialCodes";
import { displayInternational } from "../../lib/phone";
import { ChevronDownIcon } from "../icons";
import { Field, Input } from "../ui/Field";
import { cx } from "../ui/cx";

const COMMON = COMMON_DIAL_ISOS.map((iso) => DIAL_COUNTRIES.find((c) => c.iso === iso)!);

export default function PhoneField({ id, label, dialIso, onDialIso, number, onNumber, error }: {
  id: string;
  label: string;
  dialIso: string;
  onDialIso: (iso: string) => void;
  number: string;
  onNumber: (value: string) => void;
  error?: string;
}) {
  const country = dialCountry(dialIso);
  const hint = number.trim()
    ? `Saved as ${displayInternational(dialIso, number)}. Used only about your purchases — and printed on your allocation letter.`
    : "Used only about your purchases — and printed on your allocation letter.";
  return (
    <Field id={id} label={label} hint={error ? undefined : hint} error={error}>
      <div className="flex gap-2">
        {/* The select is invisible, so the face shows its focus ring. */}
        <label className="relative shrink-0 flex items-center gap-1.5 px-3 rounded-md border border-[var(--border)] bg-[var(--card)] focus-within:shadow-[0_0_0_2px_var(--ring)]">
          <span className="sr-only">Dialling code</span>
          <span className="font-mono-data font-medium text-sm text-[var(--foreground)]">{country?.dial ?? "+"}</span>
          <span className="text-xs text-[var(--muted-foreground)]">{dialIso}</span>
          <span className="text-[var(--muted-foreground)]"><ChevronDownIcon size={14} /></span>
          <select value={dialIso} onChange={(e) => onDialIso(e.target.value)} className="absolute inset-0 w-full opacity-0 cursor-pointer">
            <optgroup label="Where most buyers live">
              {COMMON.map((c) => <option key={c.iso} value={c.iso}>{c.name} ({c.dial})</option>)}
            </optgroup>
            <optgroup label="All countries, A–Z">
              {DIAL_COUNTRIES.map((c) => <option key={`all-${c.iso}`} value={c.iso}>{c.name} ({c.dial})</option>)}
            </optgroup>
          </select>
        </label>
        <Input id={id} type="tel" inputMode="tel" autoComplete="tel-national" value={number} onChange={(e) => onNumber(e.target.value)}
          placeholder={dialIso === "NG" ? "0803 000 0000" : "Your mobile number"}
          aria-invalid={error ? true : undefined}
          aria-describedby={`${id}-${error ? "error" : "hint"}`}
          className={cx("font-mono-data", error && "border-[var(--error-border)]")} />
      </div>
    </Field>
  );
}
