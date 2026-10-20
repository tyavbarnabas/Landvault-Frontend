// An empty list or a step with nothing in it yet. `icon` replaces the default
// magnifier where a more specific one says what's missing.
export default function EmptyState({ title, description, action, icon }: { title: string; description: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="text-center py-16 px-6">
      <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[var(--muted)] flex items-center justify-center text-[var(--muted-foreground)]">
        {icon ?? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-[var(--muted-foreground)]">
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
        </svg>}
      </div>
      <div className="text-sm font-medium text-[var(--foreground)] mb-1">{title}</div>
      <p className="text-sm text-[var(--muted-foreground)] mb-4 max-w-sm mx-auto">{description}</p>
      {action}
    </div>
  );
}
