// Which overlaps a boundary change raised, cleared, left awaiting review, or
// left open — the developer's own side only. A correction that quietly
// created a conflict would otherwise only surface at publication.

import StatusBadge from "../StatusBadge";
import { hasAnyChange, type ConflictChanges, type ConflictItem } from "../../services/conflictChanges";

const SECTIONS: { key: keyof ConflictChanges; title: string; tone: "error" | "success" | "warning" | "neutral"; intro: string }[] = [
  { key: "raised", title: "New overlaps", tone: "error", intro: "This change created these." },
  { key: "resolved", title: "Cleared", tone: "success", intro: "This change ended these." },
  { key: "awaitingReview", title: "Cleared, awaiting review", tone: "warning",
    intro: "The overlap is gone, but because it involved another company's land it keeps blocking publication until our team closes it." },
  { key: "stillOpen", title: "Still open", tone: "neutral", intro: "These were there before and still are." },
];

export default function ConflictChangesView({ changes }: { changes: ConflictChanges | null | undefined }) {
  if (!changes) return null;
  if (!hasAnyChange(changes)) {
    return <p className="text-xs text-[var(--muted-foreground)]">No overlaps were raised or cleared, and none are open.</p>;
  }
  return (
    <div className="space-y-3" aria-label="Overlaps this change affected">
      {SECTIONS.filter((s) => changes[s.key].length > 0).map((section) => (
        <div key={section.key}>
          <div className="flex items-center gap-2 mb-1">
            <StatusBadge label={`${section.title} · ${changes[section.key].length}`} variant={section.tone} />
          </div>
          <p className="text-xs text-[var(--muted-foreground)] mb-1.5">{section.intro}</p>
          <ul className="space-y-1.5">
            {changes[section.key].map((item) => <ConflictLine key={item.id} item={item} />)}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ConflictLine({ item }: { item: ConflictItem }) {
  return (
    <li className="text-xs rounded-md border border-[var(--border)] px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-medium text-[var(--foreground)]">{item.yourEntityLabel}</span>
        <span className="text-[var(--muted-foreground)]">{item.conflictType === "estate_overlap" ? "estate boundary" : "plot boundary"}</span>
        {item.overlapAreaSqm !== null && <span className="text-[var(--muted-foreground)] font-mono-data">{item.overlapAreaSqm.toLocaleString()} sqm overlap</span>}
        {item.blocksPublication && <span className="text-red-700 font-medium">Blocks publication</span>}
      </div>
      {/* The backend's own guidance — it never names the other party. */}
      {item.guidance && <p className="text-[var(--muted-foreground)] mt-1">{item.guidance}</p>}
    </li>
  );
}
