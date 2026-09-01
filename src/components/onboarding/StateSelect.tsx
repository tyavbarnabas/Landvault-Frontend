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
        className="w-full px-3 py-2.5 bg-[var(--background)] border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] cursor-pointer"
      >
        <option value="" disabled>Select a state…</option>
        {NIGERIAN_STATES.map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      {error && <p role="alert" className="text-red-600 text-xs mt-1.5">{error}</p>}
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

  return (
    <div>
      <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">{label}</label>
      <div className="max-h-48 overflow-y-auto border border-[var(--border)] rounded-md p-2 grid grid-cols-2 sm:grid-cols-3 gap-1 bg-[var(--background)]">
        {NIGERIAN_STATES.map((s) => (
          <label key={s} className="flex items-center gap-1.5 text-xs text-[var(--foreground)] px-1.5 py-1 rounded hover:bg-[var(--muted)] cursor-pointer">
            <input type="checkbox" checked={values.includes(s)} onChange={() => toggle(s)} className="w-3.5 h-3.5 accent-[var(--accent)]" />
            {s}
          </label>
        ))}
      </div>
      {values.length > 0 && (
        <p className="text-xs text-[var(--muted-foreground)] mt-1.5">{values.join(", ")}</p>
      )}
      {error && <p role="alert" className="text-red-600 text-xs mt-1.5">{error}</p>}
    </div>
  );
}
