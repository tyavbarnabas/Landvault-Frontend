// Card: the white bordered box every list item and section sits in.
// InfoBox: the tinted label-and-value box inside a card ("Agreed price",
// "Paystack's record", an account being reviewed).

import { Link } from "react-router-dom";
import { cx } from "./cx";
import { TONE_FILL, type Tone } from "./tones";

const PADDING = { sm: "p-3", md: "p-4", lg: "p-5" } as const;

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  as?: "div" | "li" | "section" | "article" | "dl";
  padding?: keyof typeof PADDING;
  // Flags a card that needs attention (e.g. a payout under review).
  alert?: boolean;
}

function cardClass(padding: keyof typeof PADDING, alert: boolean | undefined, className?: string): string {
  return cx("bg-[var(--card)] border rounded-xl", alert ? "border-[var(--error-border)]" : "border-[var(--border)]", PADDING[padding], className);
}

export default function Card({ as: Tag = "div", padding = "lg", alert, className, ...rest }: CardProps) {
  return <Tag className={cardClass(padding, alert, className)} {...rest} />;
}

// A row in a page-level list: branches, staff, estates, histories, a
// buyer's purchases and documents. Use inside <ul className="space-y-3">.
//   density "regular"  roomy rows with a minimum height, so short and long
//                      rows line up (portal lists, portfolio plots).
//   density "compact"  tighter rows for lists people scan (documents,
//                      tickets, inspections, purchases) — no minimum height.
// With `to`, the whole row is a link and its border lights up on hover.
const DENSITY = { regular: { padding: "lg", size: "min-h-28" }, compact: { padding: "md", size: "" } } as const;

export function ListCard({ to, alert, density = "regular", className, children, ...rest }: Omit<CardProps, "as" | "padding"> & {
  to?: string;
  density?: keyof typeof DENSITY;
}) {
  const { padding, size } = DENSITY[density];
  if (to) {
    return (
      <li {...rest}>
        <Link to={to} className={cardClass(padding, alert, cx("block hover:border-[var(--accent)]/50 transition-colors", size, className))}>{children}</Link>
      </li>
    );
  }
  return <Card as="li" padding={padding} alert={alert} className={cx(size, className)} {...rest}>{children}</Card>;
}

export function InfoBox({ label, tone = "neutral", className, children }: { label: string; tone?: Tone; className?: string; children: React.ReactNode }) {
  return (
    <div className={cx("rounded-lg p-3", TONE_FILL[tone], className)}>
      <div className="text-xs text-[var(--muted-foreground)] mb-1">{label}</div>
      {children}
    </div>
  );
}
