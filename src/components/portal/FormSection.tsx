// One numbered part of a long portal form (New estate, Edit details), from
// the Figma "Portal estate setup" proposal: a heading that says what the
// part is for, then its fields.

import Card from "../ui/Card";

export default function FormSection({ n, title, description, children }: {
  n?: number;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const id = `section-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <Card as="section" aria-labelledby={id} className="space-y-4 sm:p-6">
      <div className="flex items-start gap-3">
        {n !== undefined && (
          <span aria-hidden="true" className="w-7 h-7 shrink-0 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-xs font-semibold flex items-center justify-center">{n}</span>
        )}
        <div>
          <h2 id={id} className="font-semibold text-[var(--foreground)]">{title}</h2>
          {description && <p className="text-sm text-[var(--muted-foreground)] mt-0.5">{description}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}
