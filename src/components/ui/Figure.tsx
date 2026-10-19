// A headline figure above a list — "Owed to developers ₦21,000,000, 2 verified
// sales" — from the Figma money-screen proposal. Money in DM Mono, counts in
// the display serif. `tone` colours the icon when the figure needs someone
// (something blocked, something failed); the value stays quiet.

import { cx } from "./cx";

type FigureTone = "neutral" | "warning" | "error";
const TONE_TEXT: Record<FigureTone, string> = {
  neutral: "text-[var(--muted-foreground)]",
  warning: "text-[var(--warning-text)]",
  error: "text-[var(--error-text)]",
};

export default function Figure({ label, value, sub, icon, mono, tone = "neutral" }: {
  label: string;
  value: string;
  sub: React.ReactNode;
  icon?: React.ReactNode;
  mono?: boolean;
  tone?: FigureTone;
}) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
      <dt className="flex items-center gap-2 text-xs font-medium text-[var(--muted-foreground)]">
        {icon && <span aria-hidden="true" className={TONE_TEXT[tone]}>{icon}</span>}
        {label}
      </dt>
      <dd className={cx(mono ? "font-mono-data font-medium text-lg sm:text-xl mt-1.5" : "font-display text-3xl mt-1", "text-[var(--foreground)] truncate")}>{value}</dd>
      <dd className="text-xs text-[var(--muted-foreground)] mt-1">{sub}</dd>
    </div>
  );
}

// The row of figures: two across on a phone, four from lg.
export function Figures({ children }: { children: React.ReactNode }) {
  return <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">{children}</dl>;
}
