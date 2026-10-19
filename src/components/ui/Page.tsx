// A page's container and header: width, padding, the serif title and the
// one-line description under it.

import { cx } from "./cx";
import TextLink from "./TextLink";

const WIDTH = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" } as const;

export default function Page({ title, description, eyebrow, back, actions, width = "xl", titleSize = "lg", className, children }: {
  title: React.ReactNode;
  description?: React.ReactNode;
  // Small line above the title, e.g. a reference number.
  eyebrow?: React.ReactNode;
  // "← Parent page" link above the title, for sub-pages.
  back?: { to: string; label: string };
  // Buttons on the title's right (wrapping under it on a phone).
  actions?: React.ReactNode;
  width?: keyof typeof WIDTH;
  titleSize?: "md" | "lg";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cx("p-6 mx-auto", WIDTH[width], className)}>
      <header className="mb-6">
        {back && <TextLink to={back.to} muted className="inline-block text-sm mb-2">← {back.label}</TextLink>}
        {eyebrow && <div className="text-xs text-[var(--muted-foreground)] mb-1 font-mono-data">{eyebrow}</div>}
        <div className={actions ? "flex flex-wrap items-end justify-between gap-4" : undefined}>
          <div>
            <h1 className={cx("font-display text-[var(--foreground)]", titleSize === "lg" ? "text-3xl mb-1" : "text-2xl")}>{title}</h1>
            {description && <p className="text-sm text-[var(--muted-foreground)]">{description}</p>}
          </div>
          {actions}
        </div>
      </header>
      {children}
    </div>
  );
}

// Inline "Loading…" for a section of a page (PageLoading is the route-level one).
export function Loading({ label = "Loading…" }: { label?: string }) {
  return <p className="text-sm text-[var(--muted-foreground)]">{label}</p>;
}
