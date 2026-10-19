// Accessible tab bar (formerly components/TabBar) — one copy of the
// role="tablist"/"tab" wiring and arrow-key navigation for every tabbed page. Real ARIA tab pattern: one roving tabIndex,
// aria-selected, aria-controls pointing at the matching panel id.

import { useRef } from "react";

export interface TabBarProps<T extends string> {
  tabs: { id: T; label: string }[];
  active: T;
  onActivate: (id: T) => void;
  ariaLabel: string;
  // Underline the whole row and space it from the content below: the page-level look.
  divider?: boolean;
}

export default function TabBar<T extends string>({ tabs, active, onActivate, ariaLabel, divider }: TabBarProps<T>) {
  return (
    <div className={`flex gap-0 overflow-x-auto${divider ? " border-b border-[var(--border)] mb-5" : ""}`} role="tablist" aria-label={ariaLabel}>
      {tabs.map((t, i) => (
        <TabButton key={t.id} id={t.id} label={t.label} active={active === t.id} index={i} tabs={tabs} onActivate={onActivate} />
      ))}
    </div>
  );
}

function TabButton<T extends string>({ id, label, active, index, tabs, onActivate }: { id: T; label: string; active: boolean; index: number; tabs: { id: T; label: string }[]; onActivate: (id: T) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const nextIndex = e.key === "ArrowRight" ? (index + 1) % tabs.length : (index - 1 + tabs.length) % tabs.length;
    onActivate(tabs[nextIndex].id);
    const siblings = ref.current?.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    siblings?.[nextIndex]?.focus();
  };
  return (
    <button
      ref={ref}
      id={`tab-${id}`}
      role="tab"
      aria-selected={active}
      aria-controls={`panel-${id}`}
      tabIndex={active ? 0 : -1}
      onClick={() => onActivate(id)}
      onKeyDown={handleKeyDown}
      className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${active ? "border-[var(--primary)] text-[var(--foreground)]" : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
    >
      {label}
    </button>
  );
}
