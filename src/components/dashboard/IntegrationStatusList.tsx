type IntegrationStatus = "healthy" | "degraded" | "down";

const DOT_COLOR: Record<IntegrationStatus, string> = {
  healthy: "bg-[var(--success)]",
  degraded: "bg-[var(--warning)]",
  down: "bg-[var(--error)]",
};
const STATUS_LABEL: Record<IntegrationStatus, string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  down: "Down",
};
const STATUS_TEXT_COLOR: Record<IntegrationStatus, string> = {
  healthy: "text-[var(--success-text)]",
  degraded: "text-[var(--warning-text)]",
  down: "text-[var(--error-text)]",
};

// The dot is decorative only — status is always paired with a text label so
// it never depends on color perception alone.
export function StatusDot({ status }: { status: IntegrationStatus }) {
  return <span aria-hidden="true" className={`inline-block w-2 h-2 rounded-full ${DOT_COLOR[status]}`} />;
}

export default function IntegrationStatusList({ integrations }: { integrations: { name: string; status: IntegrationStatus }[] }) {
  return (
    <div className="grid sm:grid-cols-2 gap-2">
      {integrations.map((i) => (
        <div key={i.name} className="flex items-center justify-between px-3 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-lg text-sm">
          <span className="text-[var(--foreground)]">{i.name}</span>
          <span className={`flex items-center gap-1.5 text-xs font-medium ${STATUS_TEXT_COLOR[i.status]}`}>
            <StatusDot status={i.status} /> {STATUS_LABEL[i.status]}
          </span>
        </div>
      ))}
    </div>
  );
}
