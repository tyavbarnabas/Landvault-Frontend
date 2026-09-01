import type { AuditLogEntry } from "../../services/tenantsService";
import { describeAuditEntry } from "../../services/platformMetricsService";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

function ActivityItem({ entry }: { entry: AuditLogEntry }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-[var(--border)] last:border-0">
      <div className="min-w-0">
        <div className="text-sm text-[var(--foreground)]">
          <span className="font-medium">{entry.actor}</span> {describeAuditEntry(entry)}
          {entry.privileged && (
            <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 align-middle">Privileged</span>
          )}
        </div>
        {entry.detail && <div className="text-xs text-[var(--muted-foreground)] mt-0.5 truncate">{entry.detail}</div>}
      </div>
      <span className="text-xs text-[var(--muted-foreground)] font-mono-data shrink-0" title={new Date(entry.timestamp).toLocaleString()}>
        {relativeTime(entry.timestamp)}
      </span>
    </div>
  );
}

export default function ActivityStream({ entries, loading, error }: { entries: AuditLogEntry[]; loading: boolean; error: boolean }) {
  if (loading) return <div className="text-sm text-[var(--muted-foreground)]">Loading activity…</div>;
  if (error) return <div className="text-sm text-[var(--muted-foreground)]">Couldn't load recent activity right now.</div>;
  if (entries.length === 0) return <div className="text-sm text-[var(--muted-foreground)]">No activity yet.</div>;

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl px-4">
      {entries.map((e) => <ActivityItem key={e.id} entry={e} />)}
    </div>
  );
}
