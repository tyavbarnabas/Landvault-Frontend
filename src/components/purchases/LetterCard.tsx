// The purchase page's allocation letter card: the provisional letter issued
// when a plan's deposit is verified, or the final letter once the plot is the
// buyer's. Downloads go through the document's own API paths.

import type { Document } from "../../data/mockData";
import { formatDayTime } from "../../lib/formatDate";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import { DocumentActions } from "../documents/DocumentCard";

// A provisional letter stops counting when its plan ends.
const ENDED: Partial<Record<Document["status"], string>> = { withdrawn: "Withdrawn", revoked: "Revoked" };

export default function LetterCard({ letter }: { letter: Document }) {
  const provisional = letter.type === "provisional_allocation_letter";
  const ended = ENDED[letter.status];
  return (
    <Card as="section" aria-labelledby="letter-heading" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <h2 id="letter-heading" className="font-semibold text-[var(--foreground)]">{provisional ? "Provisional allocation letter" : "Allocation letter"}</h2>
        {ended && <Badge label={ended} variant="neutral" />}
      </div>
      <dl className="space-y-2 text-sm">
        {letter.number && (
          <div className="flex justify-between gap-4"><dt className="text-[var(--muted-foreground)]">Number</dt><dd className="font-mono-data text-xs text-[var(--foreground)]">{letter.number}</dd></div>
        )}
        <div className="flex justify-between gap-4"><dt className="text-[var(--muted-foreground)]">Issued</dt><dd className="text-[var(--foreground)]">{formatDayTime(letter.issuedAt ?? letter.date)}</dd></div>
      </dl>
      {provisional && (
        <p className="text-xs text-[var(--muted-foreground)]">
          {ended ? "The plan ended, so this letter no longer allocates the plot. Anyone checking its code is told so." : "Your final allocation letter is issued when the plan is paid in full."}
        </p>
      )}
      <DocumentActions doc={letter} />
    </Card>
  );
}
