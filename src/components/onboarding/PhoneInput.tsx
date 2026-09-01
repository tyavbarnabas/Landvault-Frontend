// A small custom country-code + number combo, defaulting to +234. Not worth
// a new npm dependency for one field type — kept consistent with the rest of
// the codebase's hand-rolled-input style.

const COUNTRY_CODES = [
  { code: "+234", label: "🇳🇬 +234" },
  { code: "+44", label: "🇬🇧 +44" },
  { code: "+1", label: "🇺🇸 +1" },
  { code: "+27", label: "🇿🇦 +27" },
];

function splitValue(value: string): { code: string; number: string } {
  const match = COUNTRY_CODES.find((c) => value.startsWith(c.code));
  if (match) return { code: match.code, number: value.slice(match.code.length).trim() };
  return { code: "+234", number: value.trim() };
}

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
}

export default function PhoneInput({ value, onChange, error }: PhoneInputProps) {
  const { code, number } = splitValue(value);

  return (
    <div>
      <div className="flex gap-2">
        <select
          value={code}
          onChange={(e) => onChange(`${e.target.value} ${number}`.trim())}
          className="w-24 px-2 py-2.5 bg-[var(--background)] border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] cursor-pointer"
        >
          {COUNTRY_CODES.map((c) => (
            <option key={c.code} value={c.code}>{c.label}</option>
          ))}
        </select>
        <input
          type="tel"
          value={number}
          onChange={(e) => onChange(`${code} ${e.target.value}`.trim())}
          placeholder="8012345678"
          className="flex-1 px-3 py-2.5 bg-[var(--background)] border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]"
        />
      </div>
      {error && <p role="alert" className="text-red-600 text-xs mt-1.5">{error}</p>}
    </div>
  );
}
