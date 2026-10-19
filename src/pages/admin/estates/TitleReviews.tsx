// HomeTrue's review of the land titles developers declare. Only reviewers
// (admin.titles.review) can verify a title; the developer can't, so
// "verified by HomeTrue" on the marketplace means someone here checked it.
//
// Verifying records HOW it was checked: a document review, or an official
// search at the land registry. Rejecting needs a note, which the developer
// sees. A developer who changes a title sends it back here as pending.
//
// Laid out from the Figma review-queue proposal: counted tabs and a table,
// each title opening under its row with its documents and the decision.

import { useState } from "react";
import LoadError from "../../../components/LoadError";
import StatusBadge, { titleStatusBadge } from "../../../components/StatusBadge";
import TitleDocumentList, { formatDate } from "../../../components/TitleDocumentList";
import { useFetch } from "../../../lib/useFetch";
import { useTabCounts, withCount } from "../../../lib/useTabCounts";
import {
  TitleError, VERIFICATION_SOURCES, fetchTitleReviews, rejectTitle, reviewDocumentLink, sourceLabel, verifyTitle,
  type TitleReview, type TitleStatus, type VerificationSource,
} from "../../../services/estateTitleService";
import Page, { Loading } from "../../../components/ui/Page";
import Card, { InfoBox } from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import Alert from "../../../components/ui/Alert";
import EmptyState from "../../../components/ui/EmptyState";
import TabBar from "../../../components/ui/Tabs";
import DisclosureTable, { DisclosureRow } from "../../../components/ui/DisclosureTable";
import { ErrorText, Field, Textarea, describedBy } from "../../../components/ui/Field";

const TABS: { id: TitleStatus; label: string }[] = [
  { id: "pending", label: "Waiting for review" },
  { id: "verified", label: "Verified" },
  { id: "rejected", label: "Not confirmed" },
];
const TAB_IDS = TABS.map((t) => t.id);

const COLUMNS = ["Estate", "Company · state", "Title", "Number", "Sent", "Status"];
const GRID = "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)_minmax(0,0.8fr)_minmax(0,1fr)_7rem_minmax(0,1.3fr)_16px]";

export default function TitleReviews() {
  const [status, setStatus] = useState<TitleStatus>("pending");
  const list = useFetch(() => fetchTitleReviews(status), [status]);
  const { counts, refetch: recount } = useTabCounts(TAB_IDS, async (s) => (await fetchTitleReviews(s)).length);
  const tabs = TABS.map((t) => ({ id: t.id, label: withCount(t.label, counts[t.id]) }));
  const reload = () => { list.refetch(); recount(); };

  return (
    <Page title="Title reviews" description="Land titles developers have declared. Buyers see a title as verified only after you verify it here.">
      <TabBar tabs={tabs} active={status} onActivate={setStatus} ariaLabel="Titles by status" divider />

      <div id={`panel-${status}`} role="tabpanel" aria-labelledby={`tab-${status}`}>
        {list.loading && !list.data && <Loading label="Loading titles…" />}
        {!list.loading && list.error && <LoadError error={list.errorValue} what="titles" onRetry={list.refetch} />}
        {list.data && list.data.length === 0 && (
          <Card padding="sm">
            <EmptyState
              title={status === "pending" ? "Nothing waiting" : "None"}
              description={status === "pending" ? "Titles developers send for review appear here, oldest first." : "No titles with this status yet."}
            />
          </Card>
        )}
        {list.data && list.data.length > 0 && (
          <DisclosureTable columns={COLUMNS} grid={GRID} label="Titles">
            {list.data.map((title) => (
              <TitleRow key={`${title.id}-${title.submittedAt}`} title={title} onlyOne={list.data!.length === 1} onDecided={reload} />
            ))}
          </DisclosureTable>
        )}
      </div>
    </Page>
  );
}

// One title: a row in the table, opening to its documents and the decision.
function TitleRow({ title, onlyOne, onDecided }: { title: TitleReview; onlyOne: boolean; onDecided: () => void }) {
  const [decided, setDecided] = useState<TitleReview | null>(null);
  const shown = decided ?? title;
  const docs = shown.documents.length;

  const cells = [
    <span className="font-semibold text-[var(--foreground)]">{shown.estateName}</span>,
    <>
      <div className="text-sm text-[var(--foreground)]">{shown.companyName ?? "Company not shown"}</div>
      {shown.estateState && <div className="text-xs text-[var(--muted-foreground)]">{shown.estateState}</div>}
    </>,
    <span className="text-sm text-[var(--foreground)]"><span className="lg:hidden text-[var(--muted-foreground)]">Title: </span>{shown.titleType}</span>,
    <span className="text-sm"><span className="lg:hidden text-[var(--muted-foreground)]">Number: </span><span className={shown.titleNumber ? "font-mono-data text-[var(--foreground)] break-all" : "text-[var(--muted-foreground)]"}>{shown.titleNumber || "Not on file"}</span></span>,
    <span className="text-sm text-[var(--muted-foreground)]"><span className="lg:hidden">Sent </span>{formatDate(shown.submittedAt)}</span>,
    <>
      <StatusBadge {...titleStatusBadge(shown.status)} />
      <div className="text-[11px] text-[var(--muted-foreground)] mt-1">
        {shown.status === "verified" ? `${sourceLabel(shown.verificationSource)} · ` : ""}{docs ? `${docs} document${docs === 1 ? "" : "s"}` : "no documents"}
      </div>
    </>,
  ];

  return (
    <DisclosureRow id={`title-${shown.id}`} grid={GRID} cells={cells} defaultOpen={onlyOne && title.status === "pending"}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InfoBox label="Title type">{shown.titleType}</InfoBox>
        <InfoBox label="Title number">{shown.titleNumber ? <span className="font-mono-data break-all">{shown.titleNumber}</span> : "Not on file"}</InfoBox>
        <InfoBox label="Issued">{shown.issuedDate ? formatDate(shown.issuedDate) : "Not given"}</InfoBox>
      </div>

      <TitleDocumentList documents={shown.documents} open={(fileId) => reviewDocumentLink(shown.id, fileId)} />

      {shown.status === "verified" && (
        <p className="text-sm text-[var(--muted-foreground)]">
          Verified {formatDate(shown.decidedAt)} by {sourceLabel(shown.verificationSource).toLowerCase()}.{shown.decisionNote ? ` Note: ${shown.decisionNote}` : ""}
        </p>
      )}
      {shown.status === "rejected" && (
        <p className="text-sm text-[var(--muted-foreground)]">Not confirmed {formatDate(shown.decidedAt)}. Note to the developer: {shown.decisionNote}</p>
      )}

      {title.status === "pending" && !decided && <Decision title={title} onDecided={setDecided} onReload={onDecided} />}

      {decided && (
        <div role="status" className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-[var(--foreground)]">
            {decided.status === "verified"
              ? `Verified. Buyers now see "${decided.titleType}, verified by HomeTrue".`
              : "Sent back to the developer with your note. Buyers see the title as declared, not confirmed."}
          </p>
          <Button variant="link" onClick={onDecided}>Refresh the list</Button>
        </div>
      )}
    </DisclosureRow>
  );
}

function Decision({ title, onDecided, onReload }: { title: TitleReview; onDecided: (t: TitleReview) => void; onReload: () => void }) {
  const [source, setSource] = useState<VerificationSource>("manual_review");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"verify" | "reject" | null>(null);
  const [error, setError] = useState("");
  // The developer resubmitted, or someone else decided: what's on screen is stale.
  const [stale, setStale] = useState(false);
  const [noteError, setNoteError] = useState("");
  const noteId = `note-${title.id}`;
  const noteHint = "Optional when verifying, e.g. the search report's reference. Required when rejecting: the developer sees it.";

  const decide = async (decision: "verify" | "reject") => {
    setBusy(decision);
    setError("");
    setNoteError("");
    setStale(false);
    try {
      onDecided(decision === "verify" ? await verifyTitle(title, source, note) : await rejectTitle(title, note));
    } catch (err) {
      if (err instanceof TitleError && err.field === "note") setNoteError(err.message);
      else setError(err instanceof Error ? err.message : "That didn't go through.");
      if (err instanceof TitleError && (err.code === "TITLE_CHANGED" || err.code === "TITLE_NOT_PENDING")) setStale(true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4 pt-4 border-t border-[var(--border)]">
      <Alert tone="info">
        Before verifying, check that the title number on the document matches the one declared, that the holder is this company (or
        the deed links them), and that the survey plan describes this estate's land.
      </Alert>
      {title.documents.length === 0 && <Alert>There are no documents to check. Reject it and ask the developer to upload them.</Alert>}

      <fieldset>
        <legend className="text-sm font-medium text-[var(--foreground)] mb-2">How was it checked?</legend>
        <div className="space-y-2">
          {VERIFICATION_SOURCES.map((s) => (
            <label key={s.value} className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name={`source-${title.id}`}
                value={s.value}
                checked={source === s.value}
                onChange={() => setSource(s.value)}
                className="mt-1"
              />
              <span>
                <span className="text-[var(--foreground)]">{s.label}</span>
                <span className="block text-xs text-[var(--muted-foreground)]">{s.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <Field id={noteId} label="Note" hint={noteHint} error={noteError || undefined}>
        <Textarea
          id={noteId}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-invalid={!!noteError}
          aria-describedby={describedBy(noteId, { hint: noteHint, error: noteError })}
        />
      </Field>

      {error && (
        <div className="flex flex-wrap items-center gap-3">
          <ErrorText>{error}</ErrorText>
          {stale && <Button variant="link" onClick={onReload}>Reload</Button>}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => decide("verify")} disabled={busy !== null || title.documents.length === 0}>
          {busy === "verify" ? "Verifying…" : "Verify title"}
        </Button>
        <Button variant="danger" onClick={() => decide("reject")} disabled={busy !== null}>
          {busy === "reject" ? "Sending back…" : "Can't confirm"}
        </Button>
      </div>
    </div>
  );
}
