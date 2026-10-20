// State pickers for the onboarding wizard: one state, or several as pills.

import { CheckIcon } from "../icons";
import { NIGERIAN_STATES, type NigerianState } from "../../data/nigerianStates";

interface StateSelectProps {
  value: NigerianState | "";
  onChange: (value: NigerianState) => void;
  label: string;
  error?: string;
}

export function StateSelect({ value, onChange, label, error }: StateSelectProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as NigerianState)}
        className="w-full px-3 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] cursor-pointer"
      >
        <option value="" disabled>Select a state…</option>
        {NIGERIAN_STATES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      {error && <p role="alert" className="text-[var(--error-text)] text-xs mt-1.5">{error}</p>}
    </div>
  );
}

interface MultiStateSelectProps {
  values: NigerianState[];
  onChange: (values: NigerianState[]) => void;
  label: string;
  error?: string;
}

export function MultiStateSelect({ values, onChange, label, error }: MultiStateSelectProps) {
  const toggle = (state: NigerianState) => {
    onChange(values.includes(state) ? values.filter((s) => s !== state) : [...values, state]);
  };

  // Tappable pills, from the Figma onboarding proposal — every state in view
  // at once instead of a scrolling box of checkboxes.
  return (
    <fieldset>
      <legend className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {NIGERIAN_STATES.map((s) => {
          const on = values.includes(s);
          return (
            <button key={s} type="button" aria-pressed={on} onClick={() => toggle(s)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors ${on
                ? "bg-[var(--primary)] text-[var(--primary-foreground)] font-medium"
                : "border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]"}`}>
              {on && <CheckIcon size={12} />}{s}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-[var(--muted-foreground)] mt-2">
        {values.length ? `${values.length} selected: ${values.join(", ")}.` : "None selected yet."} Tap a state to add or remove it.
      </p>
      {error && <p role="alert" className="text-[var(--error-text)] text-xs mt-1.5">{error}</p>}
    </fieldset>
  );
}
