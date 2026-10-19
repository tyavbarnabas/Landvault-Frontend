// The accessible dialog shell every modal uses (formerly resale/ModalShell):
// real focus trap, Escape-to-close, first field focused on open, and focus
// restored to whatever opened it. DialogActions is the Cancel + confirm row
// at the bottom of a confirmation.

import { useEffect, useRef, useId } from "react";
import Button, { type ButtonVariant } from "./Button";

// `size="md"` for a dialog with a form of its own (the marketplace filters).
export default function Dialog({ title, children, onClose, size = "sm" }: { title: string; children: React.ReactNode; onClose: () => void; size?: "sm" | "md" }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // The latest onClose, read at key-press time. Callers usually pass a fresh
  // function every render; if the setup below depended on it, it would re-run
  // on every keystroke — and each re-run moved focus off the field being typed in.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Once, when the dialog opens: focus its first field (or the dialog), trap
  // Tab, close on Escape; on close, hand focus back to what opened it.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const firstField = dialogRef.current?.querySelector<HTMLElement>("input, textarea, select");
    (firstField ?? dialogRef.current)?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onCloseRef.current(); return; }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={`bg-[var(--card)] rounded-2xl border border-[var(--border)] p-6 ${size === "md" ? "max-w-md max-h-[90vh] overflow-y-auto" : "max-w-sm"} w-full shadow-2xl outline-none`}>
        <div className="flex items-center justify-between mb-3">
          <h3 id={titleId} className="font-semibold">{title}</h3>
          <button onClick={() => onCloseRef.current()} aria-label="Close dialog" className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function DialogActions({ onCancel, onConfirm, confirmLabel, cancelLabel = "Cancel", busy = false, busyLabel = "Working…", variant = "primary" }: {
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel: React.ReactNode;
  cancelLabel?: string;
  busy?: boolean;
  busyLabel?: string;
  variant?: Extract<ButtonVariant, "primary" | "danger">;
}) {
  return (
    <div className="flex gap-2">
      <Button variant="secondary" onClick={onCancel} disabled={busy} className="flex-1">{cancelLabel}</Button>
      <Button variant={variant} onClick={onConfirm} disabled={busy} className="flex-[2]">{busy ? busyLabel : confirmLabel}</Button>
    </div>
  );
}
