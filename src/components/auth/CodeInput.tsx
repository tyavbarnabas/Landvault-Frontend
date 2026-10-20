// A six-digit one-time code shown as six boxes, from the Figma sign-in
// proposal. It is ONE real input laid over the boxes, so pasting a whole
// code, the phone's "from Messages" autofill and screen readers all work as
// they would on a plain field; the boxes only draw what's typed.

import { cx } from "../ui/cx";

export default function CodeInput({ id, value, onChange, length = 6, describedBy, invalid, autoFocus }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  length?: number;
  describedBy?: string;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const digits = value.slice(0, length);
  return (
    <div className="relative">
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }} aria-hidden="true">
        {Array.from({ length }, (_, i) => (
          <div key={i}
            className={cx(
              "h-14 rounded-md border bg-[var(--card)] flex items-center justify-center font-mono-data text-2xl text-[var(--foreground)]",
              invalid ? "border-[var(--error-border)]" : i === digits.length ? "border-[var(--ring)]" : "border-[var(--border)]",
            )}>
            {digits[i] ?? ""}
          </div>
        ))}
      </div>
      <input
        id={id}
        value={digits}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, length))}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={length}
        placeholder={"0".repeat(length)}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        autoFocus={autoFocus}
        // Drawn by the boxes underneath; the field itself is invisible but
        // takes the taps, the typing and the focus ring.
        className="absolute inset-0 w-full h-full rounded-md bg-transparent text-transparent caret-transparent placeholder:text-transparent cursor-text"
      />
    </div>
  );
}
