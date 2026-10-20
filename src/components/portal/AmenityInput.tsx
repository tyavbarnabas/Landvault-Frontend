// An estate's amenities as chips, from the Figma "Portal estate setup"
// proposal — instead of one comma-separated line. Enter or a comma adds what's
// typed; Backspace in an empty box removes the last chip. The suggestions are
// only shortcuts for common ones; anything can be typed.

import { useState } from "react";
import { XIcon } from "../icons";

const SUGGESTIONS = ["Perimeter fencing", "Motorable roads", "Drainage", "Gate house", "Street lights", "Water supply", "Electricity", "Security"];

export default function AmenityInput({ id, value, onChange, describedBy }: {
  id: string;
  value: string[];
  onChange: (next: string[]) => void;
  describedBy?: string;
}) {
  const [draft, setDraft] = useState("");
  const has = (a: string) => value.some((v) => v.toLowerCase() === a.toLowerCase());
  const addAll = (text: string) => {
    const fresh = text.split(",").map((a) => a.trim()).filter((a) => a && !has(a));
    if (fresh.length) onChange([...value, ...new Set(fresh)]);
    setDraft("");
  };
  const remove = (a: string) => onChange(value.filter((v) => v !== a));
  const offered = SUGGESTIONS.filter((a) => !has(a));

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-2.5 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md focus-within:shadow-[0_0_0_2px_var(--ring)]">
        {value.map((a) => (
          <span key={a} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--secondary)] text-[var(--secondary-foreground)] pl-2.5 pr-1.5 py-0.5 text-sm">
            {a}
            <button type="button" onClick={() => remove(a)} aria-label={`Remove ${a}`} className="p-0.5 rounded-full hover:bg-[var(--muted)]"><XIcon size={12} /></button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => (e.target.value.includes(",") ? addAll(e.target.value) : setDraft(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); addAll(draft); }
            else if (e.key === "Backspace" && !draft && value.length) remove(value[value.length - 1]);
          }}
          onBlur={() => draft.trim() && addAll(draft)}
          aria-describedby={describedBy}
          placeholder={value.length ? "Add another" : "Type one and press Enter"}
          // The chip box draws the field and its focus ring.
          className="flex-1 min-w-[10rem] bg-transparent text-sm py-0.5 outline-none [box-shadow:none!important]"
        />
      </div>
      {offered.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1.5 text-xs text-[var(--muted-foreground)]">
          <span>Suggestions:</span>
          {offered.map((a) => (
            <button key={a} type="button" onClick={() => onChange([...value, a])}
              className="rounded-full border border-[var(--border)] px-2 py-0.5 hover:text-[var(--foreground)] hover:bg-[var(--muted)]">+ {a}</button>
          ))}
        </div>
      )}
    </div>
  );
}
