// /admin/letter-reviews — HomeTrue reads every version of what developers put
// into allocation letters before a letter may use it: each estate's own
// conditions, and each company's or branch's wording. The automatic check
// catches most amounts and bank details; this is where a person catches the
// rest ("five hundred k", an account in words). Shown beside what letters use
// today, so the change is what gets read.
//
// Laid out from the Figma review-queue proposal: the two kinds as tabs with
// what's waiting counted, and each version a row that opens to the compare
// view and the decision.

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useFetch } from "../../../lib/useFetch";
import { useTabCounts, withCount } from "../../../lib/useTabCounts";
import { formatDay } from "../../../lib/formatDate";
import {
  REVIEW_NOTE_MAX, approveTemplate, approveTerms, fetchTemplateReviews, fetchTermsReviews, isStaleReview, rejectTemplate, rejectTerms,
  type LetterTemplateReview, type LetterTermsReview,
} from "../../../services/letterReviewsService";
import { fieldErrorsOf, type ReviewStatus } from "../../../services/lettersService";
import { WordingView } from "../../portal/letters/TemplatesPanel";
import LoadError from "../../../components/LoadError";
import StatusBadge, { letterReviewBadge } from "../../../components/StatusBadge";
import Page, { Loading } from "../../../components/ui/Page";
import Card from "../../../components/ui/Card";
import Alert from "../../../components/ui/Alert";
import Button from "../../../components/ui/Button";
import EmptyState from "../../../components/ui/EmptyState";
import TabBar from "../../../components/ui/Tabs";
import DisclosureTable, { DisclosureRow } from "../../../components/ui/DisclosureTable";
import { ErrorText, Field, Select, Textarea, describedBy } from "../../../components/ui/Field";

type Kind = "terms" | "templates";
const KINDS: { id: Kind; label: string }[] = [
  { id: "terms", label: "Estate conditions" },
  { id: "templates", label: "Letter wording" },
];
const STATUSES: { value: ReviewStatus; label: string }[] = [
  { value: "pending", label: "Waiting for review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Changes asked for" },
];
const KIND_IDS = KINDS.map((k) => k.id);
const STATUS_IDS = STATUSES.map((s) => s.value);
const countOf = async (kind: Kind, status: ReviewStatus) => (await (kind === "terms" ? fetchTermsReviews(status) : fetchTemplateReviews(status))).length;

const TERMS_COLUMNS = ["Estate", "Company · state", "Version", "Saved", "Status"];
const TEMPLATE_COLUMNS = ["Company", "Wording", "Version", "Saved", "Status"];
const GRID = "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)_6rem_7rem_minmax(0,1.2fr)_16px]";

export default function LetterReviews() {
  const [params, setParams] = useSearchParams();
  const kind: Kind = params.get("kind") === "templates" ? "templates" : "terms";
  const status = (STATUSES.find((s) => s.value === params.get("status"))?.value ?? "pending") as ReviewStatus;
  const set = (next: { kind?: Kind; status?: ReviewStatus }) => {
    const k = next.kind ?? kind;
    const s = next.status ?? status;
    setParams({ ...(k !== "terms" ? { kind: k } : {}), ...(s !== "pending" ? { status: s } : {}) }, { replace: true });
  };

  // What's waiting, on the kind tabs; every status of this kind, in the menu.
  const waiting = useTabCounts(KIND_IDS, (k) => countOf(k, "pending"));
  const byStatus = useTabCounts(STATUS_IDS, (st) => countOf(kind, st), [kind]);
  const kinds = KINDS.map((k) => ({ id: k.id, label: withCount(k.label, waiting.counts[k.id]) }));
  const reload = () => { waiting.refetch(); byStatus.refetch(); };

  return (
    <Page title="Letter reviews" description="What developers write into allocation letters. No letter uses a version until you approve it. Look for amounts and bank details: every figure must come from the estate's cost disclosure, and buyers pay only through HomeTrue.">
      <TabBar tabs={kinds} active={kind} onActivate={(k) => set({ kind: k })} ariaLabel="What to review" divider />
      <div id={`panel-${kind}`} role="tabpanel" aria-labelledby={`tab-${kind}`} className="space-y-4">
        <Field id="review-status" label="Show" className="max-w-xs">
          <Select id="review-status" inputSize="md" value={status} onChange={(e) => set({ status: e.target.value as ReviewStatus })}>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{withCount(s.label, byStatus.counts[s.value])}</option>)}
          </Select>
        </Field>
        {kind === "terms" ? <TermsQueue key={status} status={status} onDecided={reload} /> : <TemplatesQueue key={status} status={status} onDecided={reload} />}
      </div>
    </Page>
  );
}

function emptyText(status: ReviewStatus, what: string): { title: string; description: string } {
  return status === "pending"
    ? { title: "Nothing waiting", description: `New ${what} appear here as developers save them, oldest first.` }
    : { title: "None", description: `No ${what} with this status yet.` };
}

// ─── Estate conditions ───────────────────────────────────────────────────────

function TermsQueue({ status, onDecided }: { status: ReviewStatus; onDecided: () => void }) {
  const list = useFetch(() => fetchTermsReviews(status), [status]);
  const reload = () => { list.refetch(); onDecided(); };
  if (list.loading && !list.data) return <Loading label="Loading…" />;
  if (list.error) return <LoadError error={list.errorValue} what="the conditions to review" onRetry={list.refetch} />;
  if (!list.data!.length) return <Card padding="sm"><EmptyState {...emptyText(status, "estate conditions")} /></Card>;
  return (
    <DisclosureTable columns={TERMS_COLUMNS} grid={GRID} label="Estate conditions">
      {list.data!.map((r) => <TermsRow key={r.termsId} review={r} onlyOne={list.data!.length === 1} onReload={reload} />)}
    </DisclosureTable>
  );
}

function TermsRow({ review, onlyOne, onReload }: { review: LetterTermsReview; onlyOne: boolean; onReload: () => void }) {
  const [decided, setDecided] = useState<LetterTermsReview | null>(null);
  const [showGenerated, setShowGenerated] = useState(false);
  const r = decided ?? review;
  const approvedSet = new Set(r.approvedClauses ?? []);
  const cells = [
    <span className="font-semibold text-[var(--foreground)]">{r.estateName}</span>,
    <>
      <div className="text-sm text-[var(--foreground)]">{r.companyName ?? "Company not shown"}</div>
      {r.estateState && <div className="text-xs text-[var(--muted-foreground)]">{r.estateState}</div>}
    </>,
    <span className="text-sm text-[var(--foreground)]"><span className="lg:hidden">Version </span><span className="font-mono-data">{r.version}</span></span>,
    <span className="text-sm text-[var(--muted-foreground)]"><span className="lg:hidden">Saved </span>{formatDay(r.savedAt)}</span>,
    <StatusBadge {...letterReviewBadge(r.status)} />,
  ];

  return (
    <DisclosureRow id={`terms-${r.termsId}`} grid={GRID} cells={cells} defaultOpen={onlyOne && review.status === "pending"}>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <h3 className="text-xs font-medium text-[var(--muted-foreground)] mb-2">Under review (version {r.version})</h3>
          <ol className="list-decimal pl-5 text-sm space-y-1.5">
            {r.clauses.map((c, i) => (
              <li key={i}>
                {c}
                {r.approvedClauses && !approvedSet.has(c) && <span className="ml-2"><StatusBadge label="New or changed" variant="info" /></span>}
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h3 className="text-xs font-medium text-[var(--muted-foreground)] mb-2">
            {r.approvedVersion ? `Letters use now (version ${r.approvedVersion})` : "Letters use now"}
          </h3>
          {r.approvedClauses ? (
            <ol className="list-decimal pl-5 text-sm space-y-1.5 text-[var(--muted-foreground)]">{r.approvedClauses.map((c, i) => <li key={i}>{c}</li>)}</ol>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">Nothing approved yet: this estate can't issue letters until a version is.</p>
          )}
        </div>
      </div>

      {r.generatedClauses.length > 0 && (
        <div>
          <Button variant="linkMuted" onClick={() => setShowGenerated((s) => !s)} aria-expanded={showGenerated}>
            {showGenerated ? "Hide HomeTrue's clauses" : `HomeTrue's clauses from the cost disclosure (${r.generatedClauses.length}, for context)`}
          </Button>
          {showGenerated && (
            <ol start={r.clauses.length + 1} className="list-decimal pl-5 text-sm space-y-1 mt-2 text-[var(--muted-foreground)]">
              {r.generatedClauses.map((c, i) => <li key={i}>{c}</li>)}
            </ol>
          )}
        </div>
      )}

      <DecisionOutcome status={r.status} note={r.note} reviewedAt={r.reviewedAt} />

      {review.status === "pending" && !decided && (
        <Decision id={r.termsId} onApprove={(note) => approveTerms(r.termsId, note)} onReject={(note) => rejectTerms(r.termsId, note)} onDecided={setDecided} onReload={onReload} />
      )}
      {decided && <DecidedNote approved={decided.status === "approved"} onReload={onReload} />}
    </DisclosureRow>
  );
}

// ─── Letter wording ──────────────────────────────────────────────────────────

function TemplatesQueue({ status, onDecided }: { status: ReviewStatus; onDecided: () => void }) {
  const list = useFetch(() => fetchTemplateReviews(status), [status]);
  const reload = () => { list.refetch(); onDecided(); };
  if (list.loading && !list.data) return <Loading label="Loading…" />;
  if (list.error) return <LoadError error={list.errorValue} what="the wording to review" onRetry={list.refetch} />;
  if (!list.data!.length) return <Card padding="sm"><EmptyState {...emptyText(status, "letter wordings")} /></Card>;
  return (
    <DisclosureTable columns={TEMPLATE_COLUMNS} grid={GRID} label="Letter wording">
      {list.data!.map((r) => <TemplateRow key={r.templateId} review={r} onlyOne={list.data!.length === 1} onReload={reload} />)}
    </DisclosureTable>
  );
}

function TemplateRow({ review, onlyOne, onReload }: { review: LetterTemplateReview; onlyOne: boolean; onReload: () => void }) {
  const [decided, setDecided] = useState<LetterTemplateReview | null>(null);
  const r = decided ?? review;
  const cells = [
    <span className="font-semibold text-[var(--foreground)]">{r.companyName ?? "Company not shown"}</span>,
    <span className="text-sm text-[var(--foreground)]">{r.source === "branch" ? `${r.branchName ?? "A branch"}'s own wording` : "Company wording"}</span>,
    <span className="text-sm text-[var(--foreground)]"><span className="lg:hidden">Version </span><span className="font-mono-data">{r.version}</span></span>,
    <span className="text-sm text-[var(--muted-foreground)]"><span className="lg:hidden">Saved </span>{formatDay(r.savedAt)}</span>,
    <StatusBadge {...letterReviewBadge(r.status)} />,
  ];
  return (
    <DisclosureRow id={`template-${r.templateId}`} grid={GRID} cells={cells} defaultOpen={onlyOne && review.status === "pending"}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <h3 className="text-xs font-medium text-[var(--muted-foreground)] mb-2">Under review (version {r.version})</h3>
          <WordingView version={r} />
        </div>
        <div>
          <h3 className="text-xs font-medium text-[var(--muted-foreground)] mb-2">{r.approved ? `Letters use now (version ${r.approved.version})` : "Letters use now"}</h3>
          {r.approved ? (
            <div className="text-[var(--muted-foreground)]"><WordingView version={r.approved} /></div>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">
              {r.source === "branch" ? "This branch has no approved wording: its letters use the company's, or HomeTrue's standard wording." : "Nothing approved: letters use HomeTrue's standard wording."}
            </p>
          )}
        </div>
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">
        Fill-in fields like {"{plot}"} are HomeTrue's: filled in from the sale. Approving lapses the letter approval of every estate using the old wording, so their director approves again.
      </p>

      <DecisionOutcome status={r.status} note={r.note} reviewedAt={r.reviewedAt} />

      {review.status === "pending" && !decided && (
        <Decision id={r.templateId} onApprove={(note) => approveTemplate(r.templateId, note)} onReject={(note) => rejectTemplate(r.templateId, note)} onDecided={setDecided} onReload={onReload} />
      )}
      {decided && <DecidedNote approved={decided.status === "approved"} onReload={onReload} />}
    </DisclosureRow>
  );
}

// ─── Deciding ────────────────────────────────────────────────────────────────

function DecisionOutcome({ status, note, reviewedAt }: { status: ReviewStatus; note: string | null; reviewedAt: string | null }) {
  if (status === "pending") return null;
  return (
    <p className="text-sm text-[var(--muted-foreground)]">
      {status === "approved" ? "Approved" : "Changes asked for"}{reviewedAt ? ` ${formatDay(reviewedAt)}` : ""}.{note ? ` Note to the developer: ${note}` : ""}
    </p>
  );
}

function DecidedNote({ approved, onReload }: { approved: boolean; onReload: () => void }) {
  return (
    <div role="status" className="flex flex-wrap items-center gap-3">
      <p className="text-sm text-[var(--foreground)]">
        {approved ? "Approved. Letters use this version from now on." : "Sent back to the developer with your note. Letters keep the last approved version."}
      </p>
      <Button variant="link" onClick={onReload}>Refresh the list</Button>
    </div>
  );
}

function Decision<T>({ id, onApprove, onReject, onDecided, onReload }: {
  id: string; onApprove: (note: string) => Promise<T>; onReject: (note: string) => Promise<T>; onDecided: (result: T) => void; onReload: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState("");
  const [noteError, setNoteError] = useState("");
  const [stale, setStale] = useState(false);
  const noteId = `note-${id}`;
  const hint = `Optional when approving. Required when asking for changes: the developer sees it, so say what to change. ${note.length}/${REVIEW_NOTE_MAX}`;

  const decide = async (decision: "approve" | "reject") => {
    setError("");
    setNoteError("");
    setStale(false);
    if (decision === "reject" && !note.trim()) { setNoteError("Say what to change: the developer sees this note."); return; }
    setBusy(decision);
    try {
      onDecided(await (decision === "approve" ? onApprove(note) : onReject(note)));
    } catch (err) {
      const fe = fieldErrorsOf(err);
      if (fe.note) setNoteError(fe.note);
      else setError(err instanceof Error ? err.message : "That didn't go through.");
      if (isStaleReview(err)) { setStale(true); onReload(); }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-3 pt-4 border-t border-[var(--border)]">
      <Field id={noteId} label="Note" hint={hint} error={noteError || undefined}>
        <Textarea id={noteId} rows={2} value={note} maxLength={REVIEW_NOTE_MAX} onChange={(e) => setNote(e.target.value)}
          aria-invalid={!!noteError} aria-describedby={describedBy(noteId, { hint, error: noteError })} />
      </Field>
      {error && (
        stale
          ? <Alert role="status">{error} The queue has been reloaded.</Alert>
          : <ErrorText>{error}</ErrorText>
      )}
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => decide("approve")} disabled={busy !== null}>{busy === "approve" ? "Approving…" : "Approve"}</Button>
        <Button variant="danger" onClick={() => decide("reject")} disabled={busy !== null}>{busy === "reject" ? "Sending back…" : "Ask for changes"}</Button>
      </div>
    </div>
  );
}
