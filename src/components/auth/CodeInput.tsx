// A six-digit one-time code as six boxes, from the Figma sign-in proposal.
// Each box is a real input — not one invisible field laid over drawn boxes,
// which some browsers, extensions and high-contrast modes wouldn't let anyone
// type into. Typing moves to the next box, Backspace goes back, the arrow
// keys move between boxes, the code fills left to right, and pasting (or the phone's "from Messages"
// autofill, which lands the whole code in one box) fills them all.

import { useRef } from "react";
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
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  // The code as last written — focus moves before React re-renders, so the
  // box receiving it must not judge by the previous render's value.
  const latest = useRef(value);
  latest.current = value;
  const digits = Array.from({ length }, (_, i) => value[i] ?? "");
  const focus = (i: number) => boxes.current[Math.max(0, Math.min(length - 1, i))]?.focus();

  // Writes digits from box `at` onwards, then moves to the box after them.
  const fill = (at: number, typed: string) => {
    const incoming = typed.replace(/\D/g, "");
    if (!incoming) return;
    const next = digits.slice();
    // A whole code pasted or autofilled into any box fills from the start.
    const start = incoming.length >= length ? 0 : at;
    incoming.slice(0, length - start).split("").forEach((d, k) => { next[start + k] = d; });
    const joined = next.join("").slice(0, length);
    latest.current = joined;
    onChange(joined);
    focus(joined.length);
  };

  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      const next = digits.slice();
      if (next[i]) { next[i] = ""; latest.current = next.join(""); onChange(latest.current); }
      else if (i > 0) { next[i - 1] = ""; latest.current = next.join(""); onChange(latest.current); focus(i - 1); }
    } else if (e.key === "ArrowLeft") { e.preventDefault(); focus(i - 1); }
    else if (e.key === "ArrowRight") { e.preventDefault(); focus(i + 1); }
  };

  return (
    <div role="group" aria-describedby={describedBy}
      className="grid gap-2" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { boxes.current[i] = el; }}
          // The first box carries the field's id, so its <label> points here.
          id={i === 0 ? id : `${id}-${i}`}
          value={d}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) { const next = digits.slice(); next[i] = ""; onChange(next.join("")); return; }
            // The new character is whichever one isn't the box's old digit.
            fill(i, d && v.length === 2 && v.startsWith(d) ? v.slice(1) : v);
          }}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={(e) => { e.preventDefault(); fill(i, e.clipboardData.getData("text")); }}
          // The code fills left to right: an empty box further along hands
          // focus to the next one to fill.
          onFocus={(e) => { if (i > latest.current.length) focus(latest.current.length); else e.target.select(); }}
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          // Room for a whole autofilled code; fill() spreads it out.
          maxLength={i === 0 ? length : 2}
          aria-label={`Digit ${i + 1} of ${length}`}
          aria-invalid={invalid || undefined}
          autoFocus={autoFocus && i === 0}
          className={cx(
            "h-14 w-full min-w-0 rounded-md border bg-[var(--card)] text-center font-mono-data text-2xl text-[var(--foreground)]",
            invalid ? "border-[var(--error-border)]" : "border-[var(--border)]",
          )}
        />
      ))}
    </div>
  );
}
