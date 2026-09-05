export default function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-[var(--secondary)] text-[var(--secondary-foreground)] hover:opacity-80 transition-opacity"
    >
      {label}
      <span aria-hidden="true">×</span>
      <span className="sr-only">Remove filter</span>
    </button>
  );
}
