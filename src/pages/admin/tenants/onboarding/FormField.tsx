import { forwardRef } from "react";

type TextFieldProps = { label: string; error?: string; required?: boolean } & React.InputHTMLAttributes<HTMLInputElement>;

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField({ label, error, required, className, ...rest }, ref) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      <input
        ref={ref}
        {...rest}
        className={`w-full px-3 py-2.5 bg-[var(--background)] border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] ${className ?? ""}`}
      />
      {error && <p role="alert" className="text-red-600 text-xs mt-1.5">{error}</p>}
    </div>
  );
});

type SelectFieldProps = { label: string; error?: string; required?: boolean; children: React.ReactNode } & React.SelectHTMLAttributes<HTMLSelectElement>;

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField({ label, error, required, children, ...rest }, ref) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </label>
      <select ref={ref} {...rest} className="w-full px-3 py-2.5 bg-[var(--background)] border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] cursor-pointer">
        {children}
      </select>
      {error && <p role="alert" className="text-red-600 text-xs mt-1.5">{error}</p>}
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
      {error && <p role="alert" className="text-red-600 text-xs mt-1.5">{error}</p>}
    </div>
  );
});

export function StepActions({
  onBack, onNext, onSaveForLater, nextLabel = "Continue", isFirst, isSubmitting,
}: { onBack?: () => void; onNext: () => void; onSaveForLater: () => void; nextLabel?: string; isFirst?: boolean; isSubmitting?: boolean }) {
  return (
    <div className="flex items-center justify-between mt-8 pt-6 border-t border-[var(--border)]">
      <div>
        {!isFirst && (
          <button type="button" onClick={onBack} className="px-4 py-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            ← Back
          </button>
        )}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={onSaveForLater} className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] underline">
          Save &amp; continue later
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={isSubmitting}
          className="px-5 py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-60 transition-opacity"
        >
          {isSubmitting ? "Submitting…" : nextLabel}
        </button>
      </div>
    </div>
  );
}
