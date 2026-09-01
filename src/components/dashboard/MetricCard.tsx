interface MetricCardProps {
  label: string;
  value: string;
  trendPct?: number; // omit for a metric with no meaningful trend (e.g. a plain rate)
  sub?: string;
}

// Trend direction is shown as both a symbol and a color — never color alone,
// so it still reads for anyone who can't distinguish red from green.
export default function MetricCard({ label, value, trendPct, sub }: MetricCardProps) {
  const trendUp = trendPct !== undefined && trendPct >= 0;
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
      <div className="text-xs text-[var(--muted-foreground)] mb-1">{label}</div>
      <div className="font-semibold font-mono-data text-xl text-[var(--foreground)]" title={value}>{value}</div>
      {trendPct !== undefined && (
        <div className={`text-xs font-medium mt-1 ${trendUp ? "text-emerald-600" : "text-red-600"}`}>
          {trendUp ? "▲" : "▼"} {Math.abs(trendPct).toFixed(0)}% vs last period
        </div>
      )}
      {sub && <div className="text-xs text-[var(--muted-foreground)] mt-1">{sub}</div>}
    </div>
  );
}
