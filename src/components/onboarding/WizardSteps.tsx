// The onboarding wizard's steps, from the Figma onboarding proposal: a list
// beside the form on a desktop — done, where you are, or to fix — and
// "Step 2 of 8" with the list on tap on a phone. A step can be opened once
// it's been reached.

import { CheckIcon } from "../icons";
import { cx } from "../ui/cx";

export type WizardStepState = "done" | "current" | "fix" | "todo";

export default function WizardSteps({ steps, states, currentIndex, furthestIndex, onStepClick, aside }: {
  steps: string[];
  states: WizardStepState[];
  currentIndex: number;
  furthestIndex: number;
  onStepClick: (index: number) => void;
  // Under the list on a desktop (the draft line).
  aside?: React.ReactNode;
}) {
  const item = (label: string, i: number) => {
    const state = states[i];
    const reachable = i <= furthestIndex;
    return (
      <li key={label}>
        <button type="button" disabled={!reachable} onClick={() => onStepClick(i)} aria-current={i === currentIndex ? "step" : undefined}
          className={cx("w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-left",
            i === currentIndex ? "bg-[var(--secondary)]" : reachable ? "hover:bg-[var(--muted)]" : "cursor-not-allowed")}>
          <span aria-hidden="true" className={cx("w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-semibold",
            state === "current" ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
              : state === "done" ? "bg-[var(--success-surface)] text-[var(--success-text)]"
                : state === "fix" ? "bg-[var(--error-surface)] text-[var(--error-text)]"
                  : "bg-[var(--muted)] text-[var(--muted-foreground)]")}>
            {state === "done" ? <CheckIcon size={12} /> : state === "fix" ? "!" : i + 1}
          </span>
          <span className="min-w-0">
            <span className={cx("block text-sm", i === currentIndex ? "font-semibold text-[var(--foreground)]" : reachable ? "font-medium text-[var(--foreground)]" : "text-[var(--muted-foreground)]")}>{label}</span>
            {state === "fix" && <span className="block text-xs text-[var(--error-text)]">Something to fix</span>}
          </span>
        </button>
      </li>
    );
  };
  return (
    <nav aria-label="Onboarding steps">
      <div className="hidden lg:block bg-[var(--card)] border border-[var(--border)] rounded-xl p-3 lg:sticky lg:top-6">
        <p className="font-mono-data text-[11px] tracking-wide text-[var(--muted-foreground)] px-2 mb-1">{steps.length} STEPS</p>
        <ol className="space-y-0.5">{steps.map(item)}</ol>
        {aside && <div className="border-t border-[var(--border)] mt-2 pt-3 px-2">{aside}</div>}
      </div>
      <details className="lg:hidden bg-[var(--card)] border border-[var(--border)] rounded-xl p-3.5 mb-4">
        <summary className="block cursor-pointer list-none">
          <span className="flex items-center justify-between gap-3">
            <span>
              <span className="block font-mono-data text-xs text-[var(--muted-foreground)]">Step {currentIndex + 1} of {steps.length}</span>
              <span className="block font-semibold text-[var(--foreground)]">{steps[currentIndex]}</span>
            </span>
            <span className="text-sm font-medium text-[var(--accent)]">All steps</span>
          </span>
          <span className="flex gap-1 mt-3" aria-hidden="true">
            {states.map((s, i) => (
              <span key={i} className={cx("h-1 flex-1 rounded-full", s === "current" ? "bg-[var(--primary)]" : s === "done" ? "bg-[var(--success)]" : s === "fix" ? "bg-[var(--error)]" : "bg-[var(--border)]")} />
            ))}
          </span>
        </summary>
        <ol className="mt-3 space-y-0.5">{steps.map(item)}</ol>
      </details>
    </nav>
  );
}
