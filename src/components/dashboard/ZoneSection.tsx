import { CAPABILITIES, type Capabilities } from "../../lib/capabilities";

// Wraps a dashboard zone and renders nothing at all — not a placeholder,
// not a skeleton — when its capability flag is off.
export default function ZoneSection({
  capability, title, badge, action, children,
}: { capability: keyof Capabilities; title: string; badge?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  if (!CAPABILITIES[capability]) return null;
  return (
    <section aria-labelledby={`zone-${capability}`} className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h2 id={`zone-${capability}`} className="text-sm font-semibold text-[var(--foreground)]">{title}</h2>
          {badge}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

// A small pill flagging a zone's numbers as illustrative, not real —
// used on every mock-backed zone so they're never mistaken for live data.
export function PreviewDataBadge() {
  return (
    <span
      title="Illustrative data — the real backend isn't connected yet."
      className="text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200"
    >
      Preview data
    </span>
  );
}
