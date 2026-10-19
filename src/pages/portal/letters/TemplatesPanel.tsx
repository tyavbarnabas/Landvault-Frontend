// Letter wording: the company's, and any branch's own. The opening, an
// optional closing, the sign-off and standard conditions printed before every
// estate's own. Fill-in fields come only from HomeTrue's list, and the opening
// must name the plot and the estate. HomeTrue reviews every saved version;
// letters use the newest approved one (a branch's, else the company's, else
// HomeTrue's standard wording).

import { useRef, useState } from "react";
import { useFetch } from "../../../lib/useFetch";
import { formatDay } from "../../../lib/formatDate";
import {
  CLOSING_MAX, CLAUSE_MAX, MAX_CLAUSES, OPENING_MAX, SIGN_OFF_MAX,
  errorCode, errorMessage, fetchLetterTemplateVersions, fetchLetterTemplates, fieldErrorsOf, missingOpeningFields, saveLetterTemplate, unknownFields,
  type LetterTemplate, type LetterTemplateVersion, type LetterTemplatesOverview,
} from "../../../services/lettersService";
import type { PortalScope } from "../../../services/portalEstatesService";
import LoadError from "../../../components/LoadError";
import Card from "../../../components/ui/Card";
import Alert from "../../../components/ui/Alert";
import Button from "../../../components/ui/Button";
import { Loading } from "../../../components/ui/Page";
import { ErrorText, Field, Input, Textarea, describedBy } from "../../../components/ui/Field";
import ClauseListEditor, { indexedErrors } from "../../../components/letters/ClauseListEditor";
import ReviewState from "../../../components/letters/ReviewState";

const FIELD_LABELS: Record<string, string> = {
  buyerName: "Buyer's name",
  plot: "Plot",
  estate: "Estate",
  location: "Location",
  applicationDate: "Reservation date",
  allocationDate: "Allocation date",
};

const IN_USE: Record<LetterTemplate["inUse"], string> = {
  branch: "this branch's own wording",
  company: "the company's wording",
  default: "HomeTrue's standard wording",
};

export default function TemplatesPanel({ scope, canManage }: { scope: PortalScope; canManage: boolean }) {
  const loaded = useFetch(() => fetchLetterTemplates(scope), [scope.tenantId, scope.branchId]);
  if (loaded.loading && !loaded.data) return <Loading label="Loading letter wording…" />;
  if (loaded.error) return <LoadError error={loaded.errorValue} what="the letter wording" onRetry={loaded.refetch} />;
  const overview = loaded.data!;

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--muted-foreground)]">
        The words around each letter's conditions. The title, the salutation, "Yours faithfully", HomeTrue's fee and payment conditions and the QR code are fixed.
        A branch's own wording replaces the company's for that branch's estates.
      </p>
      <ul className="space-y-6">
        <TemplateCard template={overview.company} target="company" overview={overview} scope={scope} canManage={canManage} onChanged={loaded.refetch} />
        {overview.branches.map((b) => (
          <TemplateCard key={b.branchId} template={b} target={b.branchId!} overview={overview} scope={scope} canManage={canManage} onChanged={loaded.refetch} />
        ))}
      </ul>
    </div>
  );
}

function TemplateCard({ template, target, overview, scope, canManage, onChanged }: {
  template: LetterTemplate; target: string; overview: LetterTemplatesOverview; scope: PortalScope; canManage: boolean; onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [saved, setSaved] = useState(false);
  const isBranch = template.source === "branch";
  const { current, approved } = template;
  const awaiting = current && approved && current.version !== approved.version && current.reviewStatus === "pending";

  // What to start editing from: this one's newest, else what its letters use now.
  const startFrom = current ?? approved ?? (isBranch ? overview.company.approved ?? overview.company.current : null);

  return (
    <Card as="li" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-[var(--foreground)]">{isBranch ? template.branchName : "Company wording"}</h2>
          <p className="text-xs text-[var(--muted-foreground)]">Letters use {IN_USE[template.inUse]}.</p>
        </div>
        {canManage && !editing && (
          <Button variant="secondary" onClick={() => { setEditing(true); setSaved(false); }}>
            {current ? "Edit wording" : isBranch ? "Write this branch's own" : "Write the company's wording"}
          </Button>
        )}
      </div>

      {saved && !editing && (
        <Alert tone="success" role="status">Saved and sent to HomeTrue for review. Letters keep their current wording until it's approved.</Alert>
      )}

      {current && <ReviewState status={current.reviewStatus} note={current.reviewNote} reviewedAt={current.reviewedAt} version={current.version} />}
      {awaiting && <p className="text-sm text-[var(--muted-foreground)]">Letters keep using version {approved!.version} until HomeTrue approves version {current!.version}.</p>}

      {editing ? (
        <TemplateEditor
          target={target} scope={scope} fields={overview.fields}
          initial={startFrom ? { opening: startFrom.opening, closing: startFrom.closing ?? "", signOff: startFrom.signOff, standardClauses: startFrom.standardClauses } : { opening: overview.defaultWording.opening, closing: "", signOff: overview.defaultWording.signOff, standardClauses: [] }}
          onCancel={() => setEditing(false)}
          onSaved={() => { setEditing(false); setSaved(true); onChanged(); }}
        />
      ) : current ? (
        <WordingView version={current} />
      ) : (
        <p className="text-sm text-[var(--muted-foreground)]">
          {isBranch ? "No wording of its own." : "No wording saved. Letters use HomeTrue's standard wording:"}
          {!isBranch && <span className="block mt-1 text-[var(--foreground)]">"{overview.defaultWording.opening}"</span>}
        </p>
      )}

      {current && (
        <div>
          <Button variant="linkMuted" onClick={() => setShowHistory((s) => !s)} aria-expanded={showHistory}>
            {showHistory ? "Hide earlier versions" : "Earlier versions"}
          </Button>
          {showHistory && <TemplateHistory target={target} scope={scope} />}
        </div>
      )}
    </Card>
  );
}

export function WordingView({ version }: { version: Pick<LetterTemplateVersion, "opening" | "closing" | "signOff" | "standardClauses"> }) {
  return (
    <dl className="text-sm space-y-3">
      <div><dt className="text-xs font-medium text-[var(--muted-foreground)]">Opening</dt><dd className="mt-0.5 whitespace-pre-line">{version.opening}</dd></div>
      {version.standardClauses.length > 0 && (
        <div>
          <dt className="text-xs font-medium text-[var(--muted-foreground)]">Standard conditions</dt>
          <dd><ol className="list-decimal pl-5 mt-0.5 space-y-1">{version.standardClauses.map((c, i) => <li key={i}>{c}</li>)}</ol></dd>
        </div>
      )}
      {version.closing && <div><dt className="text-xs font-medium text-[var(--muted-foreground)]">Closing</dt><dd className="mt-0.5 whitespace-pre-line">{version.closing}</dd></div>}
      <div><dt className="text-xs font-medium text-[var(--muted-foreground)]">Sign-off</dt><dd className="mt-0.5">{version.signOff}</dd></div>
    </dl>
  );
}

function TemplateHistory({ target, scope }: { target: string; scope: PortalScope }) {
  const versions = useFetch(() => fetchLetterTemplateVersions(target, scope), [target]);
  if (versions.loading && !versions.data) return <Loading />;
  if (versions.error) return <LoadError error={versions.errorValue} what="the earlier versions" onRetry={versions.refetch} />;
  return (
    <ul className="mt-3 space-y-4">
      {versions.data!.map((v) => (
        <li key={v.version} className="border-l-2 border-[var(--border)] pl-4 space-y-2">
          <div className="text-xs text-[var(--muted-foreground)]">Saved {formatDay(v.savedAt)}</div>
          <ReviewState status={v.reviewStatus} note={v.reviewNote} reviewedAt={v.reviewedAt} version={v.version} />
          <WordingView version={v} />
        </li>
      ))}
    </ul>
  );
}

interface Draft { opening: string; closing: string; signOff: string; standardClauses: string[] }

function TemplateEditor({ target, scope, fields, initial, onCancel, onSaved }: {
  target: string; scope: PortalScope; fields: string[]; initial: Draft; onCancel: () => void; onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const opening = useRef<HTMLTextAreaElement>(null);
  const closing = useRef<HTMLTextAreaElement>(null);
  // The chips insert into whichever paragraph was last in focus.
  const [into, setInto] = useState<"opening" | "closing">("opening");

  const insert = (field: string) => {
    const el = into === "opening" ? opening.current : closing.current;
    const text = `{${field}}`;
    const value = draft[into];
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    setDraft({ ...draft, [into]: value.slice(0, start) + text + value.slice(end) });
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + text.length, start + text.length); });
  };

  // Checked here first for a quicker answer; the server checks again (and for amounts and bank details).
  const localErrors = (): Record<string, string> => {
    const fe: Record<string, string> = {};
    const missing = missingOpeningFields(draft.opening);
    if (!draft.opening.trim()) fe.opening = "Write the opening paragraph.";
    else if (missing.length) fe.opening = `The opening must include ${missing.map((f) => `{${f}}`).join(" and ")}.`;
    else if (draft.opening.length > OPENING_MAX) fe.opening = `Keep the opening under ${OPENING_MAX.toLocaleString()} characters.`;
    for (const key of ["opening", "closing"] as const) {
      const bad = unknownFields(draft[key]);
      if (bad.length && !fe[key]) fe[key] = `${bad.map((f) => `{${f}}`).join(", ")} isn't a field HomeTrue fills in. Use the buttons above.`;
    }
    if (draft.closing.length > CLOSING_MAX) fe.closing = `Keep the closing under ${CLOSING_MAX.toLocaleString()} characters.`;
    if (!draft.signOff.trim()) fe.signOff = "Write the sign-off line.";
    else if (draft.signOff.includes("{")) fe.signOff = "The sign-off can't use fill-in fields.";
    draft.standardClauses.forEach((c, i) => {
      if (!c.trim()) fe[`standardClauses[${i}]`] = "Write the condition, or remove it.";
      else if (c.length > CLAUSE_MAX) fe[`standardClauses[${i}]`] = `Keep it under ${CLAUSE_MAX} characters.`;
    });
    return fe;
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const fe = localErrors();
    setFieldErrors(fe);
    if (Object.keys(fe).length) { setError("Fix the highlighted parts, then save."); return; }
    setBusy(true);
    setError(null);
    try {
      await saveLetterTemplate(target, {
        opening: draft.opening.trim(), closing: draft.closing.trim() || null, signOff: draft.signOff.trim(),
        standardClauses: draft.standardClauses.map((c) => c.trim()),
      }, scope);
      onSaved();
    } catch (err) {
      setFieldErrors(fieldErrorsOf(err));
      setError(errorCode(err) === "LETTER_TEMPLATE_CHANGED"
        ? "Someone saved this wording at the same moment. Cancel, check the newest version, and try again."
        : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const openingHint = "Must include {plot} and {estate}. No amounts or bank details: fees come from the cost disclosure.";
  return (
    <form onSubmit={save} noValidate className="space-y-4">
      <div>
        <div className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Fill-in fields (added where the cursor is, in the {into})</div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Insert a fill-in field">
          {fields.map((f) => (
            <button key={f} type="button" onClick={() => insert(f)}
              className="text-xs px-2.5 py-1 rounded-full border border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)] hover:border-[var(--accent)] font-mono-data"
              aria-label={`Insert ${FIELD_LABELS[f] ?? f}`} title={FIELD_LABELS[f]}>
              {`{${f}}`}
            </button>
          ))}
        </div>
      </div>
      <Field id={`${target}-opening`} label="Opening paragraph" hint={openingHint} error={fieldErrors.opening}>
        <Textarea id={`${target}-opening`} ref={opening} rows={4} value={draft.opening} onFocus={() => setInto("opening")}
          onChange={(e) => setDraft({ ...draft, opening: e.target.value })} aria-invalid={!!fieldErrors.opening}
          aria-describedby={describedBy(`${target}-opening`, { hint: openingHint, error: fieldErrors.opening })} />
      </Field>
      <div>
        <div className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Standard conditions <span className="font-normal">(optional; printed before each estate's own)</span></div>
        <ClauseListEditor idPrefix={`${target}-std`} clauses={draft.standardClauses} onChange={(c) => setDraft({ ...draft, standardClauses: c })}
          errors={indexedErrors(fieldErrors, "standardClauses")} max={MAX_CLAUSES} maxLength={CLAUSE_MAX} addLabel="Add a standard condition" />
      </div>
      <Field id={`${target}-closing`} label="Closing paragraph (optional)" error={fieldErrors.closing}>
        <Textarea id={`${target}-closing`} ref={closing} rows={2} value={draft.closing} onFocus={() => setInto("closing")}
          onChange={(e) => setDraft({ ...draft, closing: e.target.value })} aria-invalid={!!fieldErrors.closing}
          aria-describedby={describedBy(`${target}-closing`, { error: fieldErrors.closing })} />
      </Field>
      <Field id={`${target}-signoff`} label={`Sign-off (above "Yours faithfully")`} error={fieldErrors.signOff}>
        <Input id={`${target}-signoff`} value={draft.signOff} maxLength={SIGN_OFF_MAX} onChange={(e) => setDraft({ ...draft, signOff: e.target.value })}
          aria-invalid={!!fieldErrors.signOff} aria-describedby={describedBy(`${target}-signoff`, { error: fieldErrors.signOff })} />
      </Field>
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save and send for review"}</Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
    </form>
  );
}
