// A button that opens a small panel under it — the marketplace's Price,
// Plot size and Title filters. Closes on an outside click or Escape and
// returns focus to the button; the panel is labelled by the button.

import { useEffect, useId, useRef, useState } from "react";
import { cx } from "./cx";

interface PopoverProps {
  label: React.ReactNode;
  // Shown on the button instead of the label once a value is chosen.
  active?: boolean;
  icon?: React.ReactNode;
  align?: "start" | "end";
  children: (close: () => void) => React.ReactNode;
}

export default function Popover({ label, active, icon, align = "start", children }: PopoverProps) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const close = () => { setOpen(false); button.current?.focus(); };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          "inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-sm font-medium transition-colors",
          active ? "border-[var(--primary)] bg-[var(--secondary)] text-[var(--secondary-foreground)]" : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]",
        )}
      >
        {icon}
        {label}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className={cx("transition-transform", open && "rotate-180")}><path d="m6 9 6 6 6-6" /></svg>
      </button>
      {open && (
        <div id={panelId} role="dialog" aria-label={typeof label === "string" ? label : undefined}
          className={cx("absolute z-40 mt-2 w-72 rounded-xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-lg", align === "end" ? "right-0" : "left-0")}>
          {children(close)}
        </div>
      )}
    </div>
  );
}
