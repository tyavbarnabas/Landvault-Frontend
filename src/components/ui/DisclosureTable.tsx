// A table of review items whose rows open in place, from the Super Admin
// review-queue proposal (title reviews, boundary changes, letter reviews):
// the queue scans as a table, and the full item — documents, compare view,
// the decision — opens under its own row instead of every item being a tall card.
//
// `grid` is the columns from lg up, plus one last unlabelled column: the
// chevron for a DisclosureRow, or the action for a plain TableRow (a queue
// whose rows carry a button, like payouts ready to send). Below lg each row
// stacks. Pass it as one literal class string so Tailwind sees it.

import { useState } from "react";
import Card from "./Card";
import { cx } from "./cx";
import { ChevronDownIcon } from "../icons";

export default function DisclosureTable({ columns, grid, label, children }: {
  columns: string[];
  grid: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Card padding="none" className="overflow-hidden">
      <div aria-hidden="true" className={cx("hidden lg:grid lg:gap-4 bg-[var(--muted)] px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]", grid)}>
        {columns.map((c) => <span key={c}>{c}</span>)}
        <span />
      </div>
      <ul aria-label={label} className="divide-y divide-[var(--border)]">{children}</ul>
    </Card>
  );
}

export function DisclosureRow({ id, grid, cells, defaultOpen = false, children }: {
  id: string;
  grid: string;
  // One node per column, in the header's order.
  cells: React.ReactNode[];
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const detailId = `${id}-detail`;
  return (
    <li>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={() => setOpen((o) => !o)}
        className={cx("w-full text-left px-4 sm:px-5 py-3.5 flex flex-col gap-1 lg:grid lg:gap-4 lg:items-center transition-colors hover:bg-[var(--muted)]/50", open && "bg-[var(--muted)]/40", grid)}
      >
        {cells.map((c, i) => <div key={i} className="min-w-0">{c}</div>)}
        <ChevronDownIcon size={16} className={cx("hidden lg:block text-[var(--muted-foreground)] transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div id={detailId} className="px-4 sm:px-5 pb-5 pt-4 border-t border-[var(--border)] space-y-4">
          {children}
        </div>
      )}
    </li>
  );
}

// A row that doesn't open: its cells, an action in the last column, and
// anything that needs the full width underneath (a blocker, Paystack's words).
export function TableRow({ grid, cells, action, below }: {
  grid: string;
  cells: React.ReactNode[];
  action?: React.ReactNode;
  below?: React.ReactNode;
}) {
  return (
    <li>
      <div className={cx("px-4 sm:px-5 py-3.5 flex flex-col gap-1 lg:grid lg:gap-4 lg:items-center", grid)}>
        {cells.map((c, i) => <div key={i} className="min-w-0">{c}</div>)}
        <div className="mt-2 lg:mt-0 lg:justify-self-end">{action}</div>
      </div>
      {below && <div className="px-4 sm:px-5 pb-4 space-y-2">{below}</div>}
    </li>
  );
}
