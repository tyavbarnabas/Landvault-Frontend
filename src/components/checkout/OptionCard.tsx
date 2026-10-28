// One choice in a checkout radio group (purchase intent, payment plan): icon,
// title, a line on what it means, and a radio mark. A real radio input under
// the card, so arrow keys and screen readers treat the group as one.

import { cx } from "../ui/cx";

interface OptionCardProps {
  name: string;
  value: string;
  checked: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: React.ReactNode;
  description: React.ReactNode;
  disabled?: boolean;
  // A figure on the right (a plan's total), above the radio mark.
  aside?: React.ReactNode;
}

export default function OptionCard({ name, value, checked, onSelect, icon, title, description, disabled, aside }: OptionCardProps) {
  return (
    <label className={cx(
      "flex gap-3.5 rounded-xl p-4 transition-colors outline-offset-2 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--ring)]",
      disabled ? "bg-[var(--muted)] cursor-not-allowed"
        : checked ? "border-2 border-[var(--primary)] bg-[var(--secondary)] cursor-pointer"
          : "border border-[var(--border)] bg-[var(--card)] hover:border-[var(--muted-foreground)] cursor-pointer",
      // Keep the content still when the border thickens.
      !disabled && !checked && "m-px",
    )}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onSelect} disabled={disabled} className="sr-only" />
      <span className={cx("w-10 h-10 shrink-0 rounded-lg flex items-center justify-center", checked ? "bg-[var(--card)] text-[var(--primary)]" : disabled ? "bg-[var(--card)] text-[var(--muted-foreground)]" : "bg-[var(--muted)] text-[var(--muted-foreground)]")}>
        {icon}
      </span>
      <span className="flex-1 min-w-0">
        <span className={cx("block font-semibold", disabled ? "text-[var(--muted-foreground)]" : "text-[var(--foreground)]")}>{title}</span>
        <span className="block text-sm text-[var(--muted-foreground)] mt-0.5 leading-relaxed">{description}</span>
      </span>
      {aside && <span className="shrink-0 text-right max-sm:hidden">{aside}</span>}
      {!disabled && (
        <span aria-hidden="true" className={cx("w-5 h-5 shrink-0 rounded-full", checked ? "border-[6px] border-[var(--primary)]" : "border-[1.5px] border-[var(--border)]")} />
      )}
    </label>
  );
}
