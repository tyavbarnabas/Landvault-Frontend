import type { MetricsPeriod } from "../../services/platformMetricsService";

const OPTIONS: { value: MetricsPeriod; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
];

export default function PeriodSelector({ value, onChange }: { value: MetricsPeriod; onChange: (p: MetricsPeriod) => void }) {
  return (
    <div className="inline-flex bg-[var(--muted)] rounded-lg p-0.5 text-xs" role="group" aria-label="Time period">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
            value === o.value ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
