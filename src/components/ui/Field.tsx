// Form controls and their label / hint / error wrapper. The controls share
// one look; `inputSize` and `kind` cover the variations pages used to
// hand-roll (compact filter selects, the big centred one-time-code box).

import { cx } from "./cx";

export type InputSize = "sm" | "md" | "lg";

const CONTROL = "px-3 bg-[var(--card)] border border-[var(--border)] rounded-md";
const SIZE: Record<InputSize, string> = { sm: "py-1.5 text-sm", md: "w-full py-2 text-sm", lg: "w-full py-2.5 text-sm" };
// A short numeric code typed in one go: large, spaced, centred.
const CODE = "w-full py-2.5 text-lg font-mono-data tracking-widest text-center";

// The ids a control should point aria-describedby at, given what's showing.
export function describedBy(id: string, { hint, error }: { hint?: React.ReactNode; error?: React.ReactNode }): string | undefined {
  return [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
}

export function Field({ id, label, hint, error, className, children }: {
  id: string; label: React.ReactNode; hint?: React.ReactNode; error?: React.ReactNode; className?: string; children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">{label}</label>
      {children}
      {hint && <p id={`${id}-hint`} className="text-xs text-[var(--muted-foreground)] mt-1">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-xs text-[var(--error-text)] mt-1">{error}</p>}
    </div>
  );
}

export function Input({ inputSize = "lg", kind = "text", className, ...rest }: React.InputHTMLAttributes<HTMLInputElement> & { inputSize?: InputSize; kind?: "text" | "code" }) {
  return <input className={cx(CONTROL, kind === "code" ? CODE : SIZE[inputSize], className)} {...rest} />;
}

export function Select({ inputSize = "lg", className, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & { inputSize?: InputSize }) {
  return <select className={cx(CONTROL, SIZE[inputSize], className)} {...rest} />;
}

export function Textarea({ inputSize = "md", className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { inputSize?: InputSize }) {
  return <textarea className={cx(CONTROL, SIZE[inputSize], className)} {...rest} />;
}

// A form-level or action-level error: "That didn't go through…".
export function ErrorText({ className, children }: { className?: string; children: React.ReactNode }) {
  return <p className={cx("text-sm text-[var(--error-text)]", className)} role="alert">{children}</p>;
}
