// The purchase page's allocation letter card: the provisional letter issued
// when a plan's deposit is verified, or the final letter once the plot is the
// buyer's. Downloads go through the document's own API paths.

import type { Document } from "../../data/mockData";
import { formatDayTime } from "../../lib/formatDate";
import Card from "../ui/Card";
import { DocumentActions } from "../documents/DocumentCard";

export default function LetterCard({ letter }: { letter: Document }) {
  const provisional = letter.type === "provisional_allocation_letter";
  return (
    <Card as="section" aria-labelledby="letter-heading" className="space-y-3">
      <h2 id="letter-heading" className="font-semibold text-[var(--foreground)]">{provisional ? "Provisional allocation letter" : "Allocation letter"}</h2>
      <dl className="space-y-2 text-sm">
        {letter.number && (
          <div className="flex justify-between gap-4"><dt className="text-[var(--muted-foreground)]">Number</dt><dd className="font-mono-data text-xs text-[var(--foreground)]">{letter.number}</dd></div>
        )}
        <div className="flex justify-between gap-4"><dt className="text-[var(--muted-foreground)]">Issued</dt><dd className="text-[var(--foreground)]">{formatDayTime(letter.issuedAt ?? letter.date)}</dd></div>
      </dl>
      {provisional && <p className="text-xs text-[var(--muted-foreground)]">Your final allocation letter is issued when the plan is paid in full.</p>}
      <DocumentActions doc={letter} />
    </Card>
  );
}
