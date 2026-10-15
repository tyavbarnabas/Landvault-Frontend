// Previous / Next with "11–20 of 54". Page numbers are 1-based. Renders
// nothing when everything fits on one page.

import Button from "./Button";

export default function Pagination({ page, pageSize, total, onPage, label }: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  // What's being paged, for screen readers: "Payout account history pages".
  label: string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return (
    <nav className="flex items-center justify-between gap-3 pt-2" aria-label={label}>
      <Button variant="secondary" onClick={() => onPage(page - 1)} disabled={page <= 1}>← Previous</Button>
      <span className="text-sm text-[var(--muted-foreground)]" aria-live="polite">{first}–{last} of {total}</span>
      <Button variant="secondary" onClick={() => onPage(page + 1)} disabled={page >= pages}>Next →</Button>
    </nav>
  );
}
