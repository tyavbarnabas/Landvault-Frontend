// The buyer dashboard's "what should I do?" strip. Every row has a verb and
// one destination; nothing here is a statistic.
//
// Distinct from AttentionPanel.tsx, which is the Super Admin console's
// equivalent (counts of queued platform work, not a single person's to-do
// list). Both share the same discipline: when there's nothing to do, say so
// plainly rather than padding the space with numbers.

import { Link } from "react-router-dom";
import type { AttentionItem, AttentionType } from "../../services/attentionService";

const ACTION_LABEL: Record<AttentionType, string> = {
  arrears: "View options",
  payment_due: "Pay now",
  upgrade_delta_due: "Complete payment",
  document_issued: "Open vault",
  price_change: "View listing",
};

// Urgent = money is owed or a deadline is running. Normal = worth knowing,
// nothing is at stake today.
const SEVERITY_STYLES = {
  urgent: "bg-amber-50 border-amber-200",
  normal: "bg-[var(--card)] border-[var(--border)]",
};

function AttentionRow({ item }: { item: AttentionItem }) {
  return (
    <Link
      to={item.targetRoute}
      className={`flex items-center justify-between gap-4 px-4 py-3 rounded-lg border hover:border-[var(--accent)]/50 transition-colors ${SEVERITY_STYLES[item.severity]}`}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium text-[var(--foreground)]">{item.title}</div>
        <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{item.detail}</div>
      </div>
      <span className="shrink-0 text-xs font-semibold text-[var(--accent)]">{ACTION_LABEL[item.type]} →</span>
    </Link>
  );
}

export default function AttentionStrip({ items, loading, error }: { items: AttentionItem[]; loading: boolean; error: boolean }) {
  return (
    <section aria-labelledby="attention-heading" className="mb-8">
      <h2 id="attention-heading" className="text-sm font-semibold text-[var(--foreground)] mb-3">Needs your attention</h2>

      {loading && <div className="text-sm text-[var(--muted-foreground)]">Checking…</div>}

      {!loading && error && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-lg p-4 text-sm text-[var(--muted-foreground)]">
          Couldn't check what needs your attention right now.
        </div>
      )}

      {/* An empty dashboard is the correct result, not a gap to fill with
          statistics — see the rule at the top of Dashboard.tsx. */}
      {!loading && !error && items.length === 0 && (
        <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-emerald-600 shrink-0" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span className="text-sm text-emerald-800 font-medium">You're all caught up.</span>
          <Link to="/portfolio" className="ml-auto text-xs font-semibold text-emerald-800 hover:underline">View your portfolio →</Link>
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
