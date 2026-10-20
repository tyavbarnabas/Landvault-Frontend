// An estate's allocation letter — /portal/estates/:estateId/letter. Its own
// conditions (HomeTrue reviews every version), HomeTrue's clauses from the
// cost disclosure underneath, and the director's preview-and-approve. An
// approved letter is what lets the estate be listed and finance allocate
// plots; any change to what it's drawn from asks for approval again.

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useApp } from "../../../contexts/AppContext";
import { useFetch } from "../../../lib/useFetch";
import { formatDay } from "../../../lib/formatDate";
import { DOCUMENTS_MANAGE_PERMISSION } from "../../../services/authService";
import { fetchPortalEstateById, type PortalScope } from "../../../services/portalEstatesService";
import {
  CLAUSE_MAX, MAX_CLAUSES,
  approveLetter, errorCode, errorMessage, fetchLetterApproval, fetchLetterPreview, fetchLetterTerms, fetchLetterTermsVersions, fieldErrorsOf, saveLetterTerms, withdrawLetterApproval,
  type DisclosurePart, type EstateLetterTerms, type LetterApproval, type LetterBlocker, type LetterChange, type LetterVersions,
} from "../../../services/lettersService";
import { saveFile } from "../../../services/documentsService";
import LoadError from "../../../components/LoadError";
import StatusBadge, { letterApprovalBadge } from "../../../components/StatusBadge";
import Page, { Loading } from "../../../components/ui/Page";
import Card from "../../../components/ui/Card";
import Alert from "../../../components/ui/Alert";
import Button from "../../../components/ui/Button";
import Dialog, { DialogActions } from "../../../components/ui/Dialog";
import { ErrorText } from "../../../components/ui/Field";
import ClauseListEditor, { indexedErrors } from "../../../components/letters/ClauseListEditor";
import ReviewState from "../../../components/letters/ReviewState";
import { usePortalScope } from "../usePortalScope";
import EstateSetupPage from "../../../components/portal/EstateSetupPage";

const CHANGE_LABELS: Record<LetterChange, string> = {
  terms: "the estate's conditions (HomeTrue approved a new version)",
  company_letterhead: "the company letterhead",
  branch_letterhead: "the branch letterhead",
  fees: "the fees",
  refund_terms: "the refund terms",
  default_terms: "the default terms",
  template: "the letter wording",
};

const DISCLOSURE_LABELS: Record<DisclosurePart, string> = { fees: "fees", refund_terms: "refund terms", default_terms: "default terms" };

/** "The fees and the letter wording" — for the start of a sentence. */
export function describeChanges(changes: string[]): string {
  const labels = changes.map((c) => CHANGE_LABELS[c as LetterChange] ?? c);
  const text = labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}` : labels[0] ?? "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export default function PortalEstateLetter() {
  const { estateId } = useParams<{ estateId: string }>();
  const scope = usePortalScope();
  const { user } = useApp();
  const holdsManage = !!user?.permissions?.includes(DOCUMENTS_MANAGE_PERMISSION);
  const canManage = holdsManage && !scope?.branchId;

  const estate = useFetch(async () => (scope && estateId ? fetchPortalEstateById(estateId, scope) : null), [scope?.tenantId, scope?.branchId, estateId]);
  const approval = useFetch(async () => (scope && estateId ? fetchLetterApproval(estateId, scope) : null), [scope?.tenantId, scope?.branchId, estateId]);
  const terms = useFetch(async () => (scope && estateId ? fetchLetterTerms(estateId, scope) : null), [scope?.tenantId, scope?.branchId, estateId]);

  if ((estate.loading && !estate.data) || (approval.loading && !approval.data) || (terms.loading && !terms.data)) {
    return <Page title="Allocation letter" width="lg"><Loading label="Loading the letter…" /></Page>;
  }
  if (estate.error) return <LoadError error={estate.errorValue} what="this estate" onRetry={estate.refetch} />;
  if (!estate.data || !scope || !estateId) return <Page title="Estate not found" width="lg" back={{ to: "/portal/estates", label: "Estates" }}>{null}</Page>;
  if (approval.error) return <LoadError error={approval.errorValue} what="this estate's letter" onRetry={approval.refetch} />;
  if (terms.error) return <LoadError error={terms.errorValue} what="this estate's conditions" onRetry={terms.refetch} />;

  // The estate too: approving the letter changes its setup and publishing state.
  const refresh = () => { approval.refetch(); terms.refetch(); estate.refetch(); };
  return (
    <EstateSetupPage
      estate={estate.data}
      step="letter"
      title="Allocation letter"
      description="HomeTrue issues each buyer's letter the moment finance verifies the sale. Until this estate's letter is approved, it can't be listed and finance can't allocate its plots."
    >
      <div className="max-w-3xl">
      <div className="space-y-8">
        {holdsManage && !canManage && <Alert role="status">You're working inside one branch. Letters can only be changed or approved with a company-wide view.</Alert>}
        <ApprovalSection estateId={estateId} approval={approval.data!} terms={terms.data!} scope={scope} canManage={canManage} onChanged={refresh} />
        <ConditionsSection estateId={estateId} terms={terms.data!} scope={scope} canManage={canManage} onSaved={refresh} />
      </div>
      </div>
    </EstateSetupPage>
  );
}

// ─── Preview and approve ─────────────────────────────────────────────────────

function BlockerTask({ blocker, estateId }: { blocker: LetterBlocker; estateId: string }) {
  switch (blocker) {
    case "no_approved_terms":
      return <>HomeTrue hasn't approved this estate's conditions yet. <a href="#conditions" className="text-[var(--accent)] hover:underline">See the conditions</a></>;
    case "signatory_name":
      return <>Add the signatory's name to the letterhead. <Link to="/portal/letters" className="text-[var(--accent)] hover:underline">Letterheads</Link></>;
    case "signatory_title":
      return <>Add the signatory's title to the letterhead. <Link to="/portal/letters" className="text-[var(--accent)] hover:underline">Letterheads</Link></>;
    case "signature":
      return <>Upload the signatory's signature. <Link to="/portal/letters" className="text-[var(--accent)] hover:underline">Letterheads</Link></>;
    default:
      return <>{String(blocker)} <Link to={`/portal/estates/${estateId}`} className="text-[var(--accent)] hover:underline">Estate</Link></>;
  }
}

function ApprovalSection({ estateId, approval, terms, scope, canManage, onChanged }: {
  estateId: string; approval: LetterApproval; terms: EstateLetterTerms; scope: PortalScope; canManage: boolean; onChanged: () => void;
}) {
  // Conditions awaiting HomeTrue can be previewed, but only the approved ones can be approved.
  const canPreviewLatest = approval.newerTermsAwaitingReview || (terms.approvedVersion === null && terms.version > 0);
  const [which, setWhich] = useState<"approved" | "latest">(terms.approvedVersion === null ? "latest" : "approved");
  const [image, setImage] = useState<{ url: string; which: "approved" | "latest"; versions: LetterVersions } | null>(null);
  const [busy, setBusy] = useState<"preview" | "pdf" | "approve" | "withdraw" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);

  // A new status means the preview may be out of date: show it again.
  useEffect(() => () => { if (image) URL.revokeObjectURL(image.url); }, [image]);
  useEffect(() => { setImage(null); }, [approval]);

  const preview = async () => {
    setBusy("preview");
    setError(null);
    try {
      const file = await fetchLetterPreview(estateId, "jpeg", which);
      setImage({ url: URL.createObjectURL(file), which, versions: approval.currentVersions });
    } catch (err) {
      setError(errorMessage(err, "The preview couldn't be drawn. Try again."));
    } finally {
      setBusy(null);
    }
  };

  const downloadPdf = async () => {
    setBusy("pdf");
    setError(null);
    try {
      saveFile(await fetchLetterPreview(estateId, "pdf", which));
    } catch (err) {
      setError(errorMessage(err, "The preview couldn't be drawn. Try again."));
    } finally {
      setBusy(null);
    }
  };

  const approve = async () => {
    if (!image) return;
    setBusy("approve");
    setError(null);
    setNotice(null);
    try {
      await approveLetter(estateId, image.versions, scope);
      setNotice("Approved. Finance can allocate this estate's plots, and buyers get this letter when they do.");
      onChanged();
    } catch (err) {
      const code = errorCode(err);
      if (code === "LETTER_SETUP_CHANGED") {
        setError("Something in the letter changed since this preview was drawn. It's been reloaded: preview it again before approving.");
        onChanged();
      } else if (code === "LETTER_NOT_READY") {
        setError("The letter isn't ready to approve. The list above says what's missing.");
        onChanged();
      } else setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const withdraw = async () => {
    setBusy("withdraw");
    setError(null);
    setNotice(null);
    try {
      await withdrawLetterApproval(estateId, scope);
      setConfirmWithdraw(false);
      setNotice("Approval withdrawn. The estate is off the marketplace and finance can't allocate its plots until it's approved again.");
      onChanged();
    } catch (err) {
      setConfirmWithdraw(false);
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const approvable = !approval.approved && approval.blockers.length === 0;
  const previewMatches = image?.which === "approved";

  return (
    <Card as="section" className="space-y-4" aria-labelledby="approval-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="approval-heading" className="font-semibold">Preview and approve</h2>
        <StatusBadge {...letterApprovalBadge(approval)} />
      </div>

      {approval.approved && approval.approvedAt && (
        <p className="text-sm text-[var(--muted-foreground)]">Approved on {formatDay(approval.approvedAt)}. Finance can allocate plots, and the estate can be listed.</p>
      )}
      {!approval.approved && approval.changedSinceApproval.length > 0 && (
        <Alert title="Needs approving again" role="status">
          {describeChanges(approval.changedSinceApproval)} changed since the letter was approved, so the letter buyers would get has changed too.
          Until it's approved again the estate is off the marketplace and finance can't allocate its plots.
        </Alert>
      )}
      {!approval.approved && approval.changedSinceApproval.length === 0 && (
        <p className="text-sm text-[var(--muted-foreground)]">Not approved yet. Preview the letter as buyers will get it, then approve it.</p>
      )}

      {approval.blockers.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Before it can be approved</h3>
          <ul className="list-disc pl-5 text-sm space-y-1">
            {approval.blockers.map((b) => <li key={b}><BlockerTask blocker={b} estateId={estateId} /></li>)}
          </ul>
          <p className="text-xs text-[var(--muted-foreground)] mt-2">You can still preview the letter meanwhile.</p>
        </div>
      )}

      {approval.newerTermsAwaitingReview && (
        <Alert tone="info" role="status">A newer version of the conditions is with HomeTrue for review. Letters use the approved one meanwhile.</Alert>
      )}

      <div className="space-y-3">
        {canPreviewLatest && terms.approvedVersion !== null && (
          <fieldset className="flex flex-wrap gap-4 text-sm">
            <legend className="sr-only">Which conditions to preview</legend>
            <label className="flex items-center gap-2"><input type="radio" name="which" checked={which === "approved"} onChange={() => setWhich("approved")} />Approved conditions (what buyers get now)</label>
            <label className="flex items-center gap-2"><input type="radio" name="which" checked={which === "latest"} onChange={() => setWhich("latest")} />Conditions awaiting review</label>
          </fieldset>
        )}
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={preview} disabled={busy !== null}>{busy === "preview" ? "Drawing…" : image ? "Preview again" : "Show preview"}</Button>
          <Button variant="secondary" onClick={downloadPdf} disabled={busy !== null}>{busy === "pdf" ? "Downloading…" : "Download PDF"}</Button>
          {canManage && approvable && (
            <Button onClick={approve} disabled={busy !== null || !previewMatches} aria-describedby="approve-hint">
              {busy === "approve" ? "Approving…" : "Approve this letter"}
            </Button>
          )}
          {canManage && approval.approved && (
            <Button variant="linkDanger" onClick={() => setConfirmWithdraw(true)} disabled={busy !== null}>Withdraw approval</Button>
          )}
        </div>
        {canManage && approvable && !previewMatches && (
          <p id="approve-hint" className="text-xs text-[var(--muted-foreground)]">
            {which === "latest" ? "Preview the approved conditions to approve: conditions awaiting review can't be approved yet." : "Show the preview first: you approve the letter you've seen."}
          </p>
        )}
      </div>

      {notice && <Alert tone="success" role="status">{notice}</Alert>}
      {error && <ErrorText>{error}</ErrorText>}

      {image && (
        <figure className="space-y-2">
          <img src={image.url} alt="Sample allocation letter, every page" className="w-full rounded-lg border border-[var(--border)]" />
          <figcaption className="text-xs text-[var(--muted-foreground)]">
            A sample: the buyer's name and plot are placeholders, and it's stamped as not valid.
            {image.which === "latest" && " It shows conditions HomeTrue hasn't approved yet."}
          </figcaption>
        </figure>
      )}

      {confirmWithdraw && (
        <Dialog title="Withdraw this letter's approval?" onClose={() => setConfirmWithdraw(false)}>
          <p className="text-sm mb-3">The estate comes off the marketplace and finance can't allocate any of its plots until the letter is approved again. Buyers who already paid keep their place.</p>
          <DialogActions onCancel={() => setConfirmWithdraw(false)} onConfirm={withdraw} confirmLabel="Withdraw approval" busy={busy === "withdraw"} variant="danger" />
        </Dialog>
      )}
    </Card>
  );
}

// ─── The estate's conditions ─────────────────────────────────────────────────

function ConditionsSection({ estateId, terms, scope, canManage, onSaved }: { estateId: string; terms: EstateLetterTerms; scope: PortalScope; canManage: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const clauses = editing ? draft : terms.clauses;

  const start = () => { setDraft(terms.clauses.length ? [...terms.clauses] : [""]); setFieldErrors({}); setError(null); setSaved(false); setEditing(true); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const fe: Record<string, string> = {};
    draft.forEach((c, i) => {
      if (!c.trim()) fe[`clauses[${i}]`] = "Write the condition, or remove it.";
      else if (c.length > CLAUSE_MAX) fe[`clauses[${i}]`] = `Keep it under ${CLAUSE_MAX} characters.`;
    });
    setFieldErrors(fe);
    if (Object.keys(fe).length) { setError("Fix the highlighted conditions, then save."); return; }
    setBusy(true);
    setError(null);
    try {
      await saveLetterTerms(estateId, draft.map((c) => c.trim()), scope);
      setEditing(false);
      setSaved(true);
      onSaved();
    } catch (err) {
      setFieldErrors(fieldErrorsOf(err));
      setError(errorCode(err) === "LETTER_TERMS_CHANGED"
        ? "Someone saved this estate's conditions at the same moment. Cancel to see the newest, then try again."
        : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card as="section" id="conditions" className="space-y-4 scroll-mt-6" aria-labelledby="conditions-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="conditions-heading" className="font-semibold">Conditions</h2>
        {canManage && !editing && <Button variant="secondary" onClick={start}>{terms.version ? "Edit conditions" : "Write conditions"}</Button>}
      </div>
      <p className="text-sm text-[var(--muted-foreground)]">
        What the land is for and the building rules. No amounts or bank details: HomeTrue writes the fee and payment conditions from the cost disclosure, underneath yours.
        HomeTrue reviews every version before a letter uses it.
      </p>

      {saved && !editing && <Alert tone="success" role="status">Saved and sent to HomeTrue for review.</Alert>}
      {terms.reviewStatus && <ReviewState status={terms.reviewStatus} note={terms.reviewNote} reviewedAt={terms.reviewedAt} version={terms.version} />}
      {terms.version > 0 && (
        <p className="text-sm text-[var(--muted-foreground)]">
          {terms.approvedVersion === null
            ? "No version is approved yet, so this estate can't issue letters."
            : terms.approvedVersion === terms.version ? "Letters use this version." : `Letters use version ${terms.approvedVersion} until HomeTrue approves this one.`}
        </p>
      )}

      {editing ? (
        <form onSubmit={save} noValidate className="space-y-3">
          <ClauseListEditor idPrefix="clause" clauses={draft} onChange={setDraft} errors={indexedErrors(fieldErrors, "clauses")} min={1} max={MAX_CLAUSES} maxLength={CLAUSE_MAX} />
          {error && <ErrorText>{error}</ErrorText>}
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save and send for review"}</Button>
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
          </div>
        </form>
      ) : clauses.length ? (
        <ol className="list-decimal pl-5 text-sm space-y-1.5">{clauses.map((c, i) => <li key={i}>{c}</li>)}</ol>
      ) : (
        <p className="text-sm text-[var(--muted-foreground)]">No conditions written yet. An estate needs at least one, approved by HomeTrue, before its letter can be approved.</p>
      )}

      <div className="border-t border-[var(--border)] pt-4">
        <h3 className="text-sm font-semibold mb-1">HomeTrue's conditions</h3>
        <p className="text-xs text-[var(--muted-foreground)] mb-2">
          Written from this estate's cost disclosure and printed after yours. To change one, <Link to={`/portal/estates/${estateId}/disclosure`} className="text-[var(--accent)] hover:underline">change the disclosure</Link>.
        </p>
        {terms.missingDisclosure.length > 0 && (
          <Alert className="mb-3" role="status">
            Not declared yet, so the letter says nothing about them: {terms.missingDisclosure.map((m) => DISCLOSURE_LABELS[m] ?? m).join(", ")}.{" "}
            <Link to={`/portal/estates/${estateId}/disclosure`} className="font-semibold hover:underline">Declare them</Link>
          </Alert>
        )}
        {terms.generatedClauses.length > 0 ? (
          <ol start={clauses.length + 1} className="list-decimal pl-5 text-sm space-y-1.5 text-[var(--muted-foreground)]">
            {terms.generatedClauses.map((c, i) => <li key={i}>{c}</li>)}
          </ol>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">None yet.</p>
        )}
      </div>

      {terms.version > 0 && (
        <div>
          <Button variant="linkMuted" onClick={() => setShowHistory((s) => !s)} aria-expanded={showHistory}>{showHistory ? "Hide earlier versions" : "Earlier versions"}</Button>
          {showHistory && <TermsHistory estateId={estateId} scope={scope} />}
        </div>
      )}
    </Card>
  );
}

function TermsHistory({ estateId, scope }: { estateId: string; scope: PortalScope }) {
  const versions = useFetch(() => fetchLetterTermsVersions(estateId, scope), [estateId]);
  if (versions.loading && !versions.data) return <Loading />;
  if (versions.error) return <LoadError error={versions.errorValue} what="the earlier versions" onRetry={versions.refetch} />;
  return (
    <ul className="mt-3 space-y-4">
      {versions.data!.map((v) => (
        <li key={v.version} className="border-l-2 border-[var(--border)] pl-4 space-y-2">
          <div className="text-xs text-[var(--muted-foreground)]">Saved {formatDay(v.savedAt)}</div>
          <ReviewState status={v.reviewStatus} note={v.reviewNote} reviewedAt={v.reviewedAt} version={v.version} />
          <ol className="list-decimal pl-5 text-sm space-y-1">{v.clauses.map((c, i) => <li key={i}>{c}</li>)}</ol>
        </li>
      ))}
    </ul>
  );
}
