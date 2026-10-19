// Checkout's own frame, from the Figma checkout proposal: a pared-down header
// (logo, "Secure checkout", help) instead of the marketplace navigation, so
// nothing pulls a buyer away mid-purchase, and the labelled step indicator.

import { Link } from "react-router-dom";
import { CheckIcon, LockIcon, MessageIcon } from "../icons";

export function CheckoutHeader() {
  return (
    <header className="bg-[var(--card)] border-b border-[var(--border)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link to="/marketplace" className="font-display text-xl sm:text-2xl text-[var(--primary)]">HomeTrue</Link>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--success-surface)] text-[var(--success-text)] px-2.5 py-1 text-xs font-medium">
            <LockIcon size={12} />Secure checkout
          </span>
        </div>
        <Link to="/support" className="hidden sm:inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
          <MessageIcon size={16} />Need help? Contact support
        </Link>
      </div>
    </header>
  );
}

// Steps as the buyer sees them: done ones get a tick, the current one is
// announced as the current step. On a phone, "Step 2 of 3" and a bar.
export function CheckoutSteps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <>
      <ol className="hidden sm:flex items-center gap-3" aria-label="Checkout steps">
        {steps.map((label, i) => (
          <li key={label} className="flex items-center gap-3" aria-current={i === current ? "step" : undefined}>
            <span className="flex items-center gap-2">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[13px] ${
                i < current ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : i === current ? "border-2 border-[var(--primary)] text-[var(--primary)] font-semibold"
                    : "border border-[var(--border)] text-[var(--muted-foreground)]"}`}>
                {i < current ? <CheckIcon size={14} /> : i + 1}
              </span>
              <span className={`text-sm ${i === current ? "font-semibold text-[var(--foreground)]" : i < current ? "font-medium text-[var(--foreground)]" : "font-medium text-[var(--muted-foreground)]"}`}>{label}</span>
            </span>
            {i < steps.length - 1 && <span aria-hidden="true" className={`w-12 h-px ${i < current ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`} />}
          </li>
        ))}
      </ol>
      <div className="sm:hidden">
        <p className="text-sm font-medium text-[var(--muted-foreground)] mb-2">Step {current + 1} of {steps.length} · {steps[current]}</p>
        <div className="flex gap-1" aria-hidden="true">
          {steps.map((label, i) => <span key={label} className={`h-1 flex-1 rounded-full ${i <= current ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`} />)}
        </div>
      </div>
    </>
  );
}
