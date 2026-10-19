// A row of toggle chips that narrows a list already on screen — "All 3 · Paid 1
// · Failed 1" — used where a second tab row would be one too many (payout
// history inside the Payouts page). Real buttons with aria-pressed.

import { cx } from "./cx";

export default function FilterChips<T extends string>({ options, value, onChange, ariaLabel }: {
  options: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.id)}
            className={cx("px-3 py-1.5 rounded-full border text-xs font-medium transition-colors",
              on ? "bg-[var(--primary)] border-[var(--primary)] text-[var(--primary-foreground)]" : "bg-[var(--card)] border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]")}
          >
            {o.label}{o.count !== undefined && <span className={cx("ml-1.5", on ? "opacity-80" : "")}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
