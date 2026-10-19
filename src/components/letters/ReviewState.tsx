// Where HomeTrue's review of a saved version stands, with its note — always
// present on a rejection, saying what to change.

import StatusBadge, { letterReviewBadge } from "../StatusBadge";
import Alert from "../ui/Alert";
import { formatDay } from "../../lib/formatDate";
import type { VersionReviewStatus } from "../../services/lettersService";

export default function ReviewState({ status, note, reviewedAt, version }: { status: VersionReviewStatus; note: string | null; reviewedAt: string | null; version?: number }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {version !== undefined && <span className="text-[var(--muted-foreground)]">Version {version}</span>}
        <StatusBadge {...letterReviewBadge(status)} />
        {reviewedAt && <span className="text-xs text-[var(--muted-foreground)]">{formatDay(reviewedAt)}</span>}
      </div>
      {status === "rejected" && note && (
        <Alert tone="error" title="HomeTrue's note" role="status">{note}</Alert>
      )}
      {status !== "rejected" && note && (
        <p className="text-sm text-[var(--muted-foreground)]">HomeTrue's note: {note}</p>
      )}
    </div>
  );
}
