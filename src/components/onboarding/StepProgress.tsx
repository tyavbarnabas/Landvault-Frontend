// Extends the segmented-progress-bar idiom already used in
// pages/auth/Register.tsx, generalized to N labeled, clickable steps.

interface StepProgressProps {
  steps: string[];
  currentIndex: number;
  furthestIndex: number;
  onStepClick: (index: number) => void;
}

export default function StepProgress({ steps, currentIndex, furthestIndex, onStepClick }: StepProgressProps) {
  return (
    <div className="mb-8">
      <div className="flex gap-1.5 mb-3" role="progressbar" aria-valuenow={currentIndex + 1} aria-valuemin={1} aria-valuemax={steps.length}>
        {steps.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${i <= currentIndex ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`}
          />
        ))}
      </div>
      <span className="text-xs text-[var(--muted-foreground)]">
        Step {currentIndex + 1} of {steps.length}
      </span>
      <h2 aria-current="step" className="font-display text-2xl text-[var(--foreground)] mt-1">
        {steps[currentIndex]}
      </h2>
      <nav aria-label="Onboarding steps" className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {steps.map((label, i) => {
          const clickable = i <= furthestIndex;
          return (
            <button
              key={label}
              type="button"
              disabled={!clickable}
              onClick={() => onStepClick(i)}
              className={`text-xs transition-colors ${
                i === currentIndex
                  ? "text-[var(--accent)] font-medium"
                  : clickable
                    ? "text-[var(--muted-foreground)] hover:text-[var(--foreground)] underline underline-offset-2"
                    : "text-[var(--muted-foreground)]/40 cursor-not-allowed"
              }`}
            >
              {i + 1}. {label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
