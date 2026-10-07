// Live guidance under a new-password field: a three-step meter and the
// checklist, each item ticking as it's met — so the user learns the rule while
// typing, not from an error after submitting.

import type { PasswordAssessment } from "../../lib/passwordPolicy";

const METER = {
  weak: { label: "Weak", filled: 1, color: "bg-red-500", text: "text-red-700" },
  fair: { label: "Fair", filled: 2, color: "bg-amber-500", text: "text-amber-800" },
  strong: { label: "Strong", filled: 3, color: "bg-emerald-600", text: "text-emerald-700" },
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
          <li key={c.id} className={`text-xs flex items-center gap-1.5 ${c.met ? "text-emerald-700" : "text-[var(--muted-foreground)]"}`}>
            <span aria-hidden="true" className="w-3 text-center">{c.met ? "✓" : "•"}</span>
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
