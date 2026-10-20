// Live guidance under a new-password field: a three-step meter and the
// checklist, each item ticking as it's met — so the user learns the rule while
// typing, not from an error after submitting.

import type { PasswordAssessment } from "../../lib/passwordPolicy";
import { CheckIcon } from "../icons";

const METER = {
  weak: { label: "Weak", filled: 1, color: "bg-[var(--error)]", text: "text-[var(--error-text)]" },
  fair: { label: "Fair", filled: 2, color: "bg-[var(--warning)]", text: "text-[var(--warning-text)]" },
  strong: { label: "Strong", filled: 3, color: "bg-[var(--success)]", text: "text-[var(--success-text)]" },
} as const;

export default function PasswordStrength({ id, assessment, started }: { id: string; assessment: PasswordAssessment; started: boolean }) {
  const meter = METER[assessment.strength];
  return (
    <div id={id} className="mt-2 space-y-2">
      {started && (
        <div className="flex items-center gap-2" aria-live="polite">
          <div className="flex gap-1 flex-1" aria-hidden="true">
            {[1, 2, 3].map((n) => (
              <div key={n} className={`h-1 flex-1 rounded-full ${n <= meter.filled ? meter.color : "bg-[var(--border)]"}`} />
            ))}
          </div>
          <span className={`text-xs font-medium ${meter.text}`}>{meter.label} password</span>
        </div>
      )}
      <ul className="space-y-0.5">
        {assessment.checks.map((c) => (
          <li key={c.id} className={`text-xs flex items-center gap-1.5 ${c.met ? "text-[var(--success-text)]" : "text-[var(--muted-foreground)]"}`}>
            <span aria-hidden="true" className="w-3 flex justify-center">{c.met ? <CheckIcon size={12} /> : "•"}</span>
            {c.label}
            <span className="sr-only">{c.met ? " — done" : " — not yet"}</span>
          </li>
        ))}
      </ul>
      {started && assessment.acceptable && assessment.strength !== "strong" && (
        <p className="text-xs text-[var(--muted-foreground)]">Stronger: make it 12+ characters, or add a symbol or capital letter.</p>
      )}
    </div>
  );
}
