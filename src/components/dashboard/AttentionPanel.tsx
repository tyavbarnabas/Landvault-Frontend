import { Link } from "react-router-dom";
import type { AttentionItem } from "../../services/platformMetricsService";

const SEVERITY_STYLES = {
  amber: "bg-amber-50 border-amber-200 text-amber-900",
  red: "bg-red-50 border-red-200 text-red-900",
};
const SEVERITY_BADGE = {
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800",
};

function AttentionRow({ item }: { item: AttentionItem }) {
  return (
    <Link
      to={item.href}
      className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg border transition-opacity hover:opacity-90 ${SEVERITY_STYLES[item.severity]}`}
    >
      <span className="text-sm font-medium">{item.label}</span>
      <span className={`text-xs font-semibold font-mono-data px-2 py-0.5 rounded-full ${SEVERITY_BADGE[item.severity]}`}>{item.count}</span>
    </Link>
  );
}

export default function AttentionPanel({ items, loading, error }: { items: AttentionItem[]; loading: boolean; error: boolean }) {
  return (
    <section aria-labelledby="zone-attention" className="mb-6">
      <h2 id="zone-attention" className="text-sm font-semibold text-[var(--foreground)] mb-3">Needs attention</h2>

      {loading && <div className="text-sm text-[var(--muted-foreground)]">Checking…</div>}

      {!loading && error && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4 text-sm text-[var(--muted-foreground)]">
          Couldn't load the attention queue right now.
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-600 shrink-0">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span className="text-sm text-emerald-800 font-medium">Nothing needs your attention.</span>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => <AttentionRow key={item.id} item={item} />)}
        </div>
      )}
    </section>
  );
}
