// The wizard's own field components (react-hook-form registers into them),
// on the shared tokens, and its action bar.

import Button from "../../../../components/ui/Button";
import { forwardRef } from "react";

type TextFieldProps = { label: string; error?: string; required?: boolean } & React.InputHTMLAttributes<HTMLInputElement>;

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField({ label, error, required, className, ...rest }, ref) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">
        {label}
        {required && <span className="text-[var(--error-text)]" aria-hidden="true"> *</span>}
      </label>
      <input
        ref={ref}
        {...rest}
        aria-invalid={error ? true : undefined}
        className={`w-full px-3 py-2.5 bg-[var(--card)] border rounded-md text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] ${error ? "border-[var(--error-border)]" : "border-[var(--border)]"} ${className ?? ""}`}
      />
      {error && <p role="alert" className="text-[var(--error-text)] text-xs mt-1.5">{error}</p>}
    </div>
  );
});

type SelectFieldProps = { label: string; error?: string; required?: boolean; children: React.ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>;

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField({ label, error, required, children, ...rest }, ref) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">
        {label}
        {required && <span className="text-[var(--error-text)]" aria-hidden="true"> *</span>}
      </label>
      <select ref={ref} {...rest} className="w-full px-3 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] cursor-pointer">
        {children}
      </select>
      {error && <p role="alert" className="text-[var(--error-text)] text-xs mt-1.5">{error}</p>}
    </div>
  );
});

type CheckboxFieldProps = { label: React.ReactNode; error?: string } & React.InputHTMLAttributes<HTMLInputElement>;

export const CheckboxField = forwardRef<HTMLInputElement, CheckboxFieldProps>(function CheckboxField({ label, error, ...rest }, ref) {
  return (
    <div>
      <label className="flex items-start gap-2.5 text-sm text-[var(--foreground)] cursor-pointer">
        <input ref={ref} type="checkbox" {...rest} className="w-4 h-4 mt-0.5 accent-[var(--accent)] shrink-0" />
        <span>{label}</span>
      </label>
      {error && <p role="alert" className="text-[var(--error-text)] text-xs mt-1.5">{error}</p>}
    </div>
  );
});

// The wizard's action bar: back to the previous step, save the draft, and
// on to the next step by name. Sticky, so it's in reach on a long step.
export function StepActions({
  onBack, onNext, onSaveForLater, nextLabel = "Continue", backLabel, isFirst, isSubmitting, nextDisabled, savedNotice,
}: {
  onBack?: () => void; onNext: () => void; onSaveForLater: () => void; nextLabel?: string; backLabel?: string;
  isFirst?: boolean; isSubmitting?: boolean; nextDisabled?: boolean; savedNotice?: boolean;
}) {
  return (
    <div className="sm:sticky sm:bottom-4 z-10 mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 shadow-sm">
      <div>
        {!isFirst && (
          <Button variant="linkMuted" onClick={onBack} className="font-medium">← {backLabel ?? "Back"}</Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {savedNotice && <span role="status" className="text-xs text-[var(--success-text)]">Draft saved on this device</span>}
        <Button variant="secondary" onClick={onSaveForLater}>Save draft</Button>
        <Button onClick={onNext} disabled={isSubmitting || nextDisabled}>{isSubmitting ? "Submitting…" : nextLabel}</Button>
      </div>
    </div>
  );
}
