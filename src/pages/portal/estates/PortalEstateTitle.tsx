// An estate's land title: the developer declares it and uploads the documents
// behind it; HomeTrue checks them. Nothing here can mark a title verified.
//
// Submitting (first time or a change) always sends the title to "Waiting for
// review", and buyers see "C of O (declared)" until a HomeTrue reviewer
// decides. Documents are private: each "View" fetches a fresh short-lived
// link, which is never kept.
//
// GET needs portal.estates.view; the form needs .manage, and branch staff on
// a company-level estate get the read-only view (EB-2).

import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import LoadError from "../../../components/LoadError";
import StatusBadge, { titleStatusBadge } from "../../../components/StatusBadge";
import { useFetch } from "../../../lib/useFetch";
import { useApp } from "../../../contexts/AppContext";
import { canManageEstates } from "../../../services/authService";
import { fetchPortalEstateById, isReadOnlyForScope, type PortalScope } from "../../../services/portalEstatesService";
import type { TitleType } from "../../../services/marketplaceService";
import {
  DOCUMENT_KINDS, TITLE_DOCUMENT_MAX_BYTES, TITLE_DOCUMENT_TYPES, TITLE_NUMBER_MAX, TITLE_TYPES, TitleError,
  checkSubmission, fetchEstateTitle, sourceLabel, submitEstateTitle, titleDocumentLink, uploadTitleDocument,
  type EstateTitle, type TitleDocument, type TitleDocumentKind,
} from "../../../services/estateTitleService";
import { acceptAttribute } from "../../../lib/uploadFile";
import TitleDocumentList, { formatDate, formatSize } from "../../../components/TitleDocumentList";
import Page, { Loading } from "../../../components/ui/Page";
import Card, { InfoBox } from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import Alert from "../../../components/ui/Alert";
import { ErrorText, Field, Input, Select, describedBy } from "../../../components/ui/Field";
import { usePortalScope } from "../usePortalScope";
import EstateSetupPage from "../../../components/portal/EstateSetupPage";
import { ReadOnlyNotice } from "./PortalEstateInventory";

const MAX_MB = TITLE_DOCUMENT_MAX_BYTES / 1024 / 1024;

export default function PortalEstateTitle() {
  const { estateId } = useParams<{ estateId: string }>();
  const scope = usePortalScope();
  const { user } = useApp();
  const mayManage = canManageEstates(user);

  const estate = useFetch(async () => (scope && estateId ? fetchPortalEstateById(estateId, scope) : null), [scope?.tenantId, scope?.branchId, estateId]);
  const title = useFetch(async () => (scope && estateId ? fetchEstateTitle(estateId, scope) : null), [scope?.tenantId, scope?.branchId, estateId]);
  const [editing, setEditing] = useState(false);
  const [justSent, setJustSent] = useState(false);

  if ((estate.loading && !estate.data) || (title.loading && title.data === undefined)) {
    return <Page title="Land title" width="lg"><Loading label="Loading title…" /></Page>;
  }
  if (estate.error) return <LoadError error={estate.errorValue} what="this estate" onRetry={estate.refetch} />;
  if (!estate.data || !scope || !estateId) {
    return <Page title="Estate not found" width="lg" back={{ to: "/portal/estates", label: "Estates" }}>{null}</Page>;
  }
  if (title.error) return <LoadError error={title.errorValue} what="this estate's title" onRetry={title.refetch} />;

  const current = title.data ?? null;
  const readOnly = isReadOnlyForScope(estate.data, scope);
  const canManage = mayManage && !readOnly;
  const showForm = canManage && (editing || !current);

  return (
    <EstateSetupPage
      estate={estate.data}
      step="title"
      title="Land title"
      description="Record the estate's title and upload its documents. HomeTrue checks them before buyers see the title as verified."
    >
      <div className="max-w-3xl">
      {readOnly && <ReadOnlyNotice />}

      {justSent && !editing && (
        <Alert tone="success" className="mb-4" role="status">
          Sent for review. Buyers see the title as declared until HomeTrue has checked it.
        </Alert>
      )}

      {current && !editing && (
        <TitleCard
          title={current}
          estateId={estateId}
          scope={scope}
          canManage={canManage}
          onChange={() => { setEditing(true); setJustSent(false); }}
        />
      )}

      {!current && !canManage && (
        <Card><p className="text-sm text-[var(--muted-foreground)]">No title has been recorded for this estate.</p></Card>
      )}

      {showForm && (
        <TitleForm
          estateId={estateId}
          scope={scope}
          current={current}
          onCancel={current ? () => setEditing(false) : undefined}
          onSent={(saved) => { title.setData(saved); setEditing(false); setJustSent(true); estate.refetch(); }}
        />
      )}
      </div>
    </EstateSetupPage>
  );
}

// ─── The recorded title ──────────────────────────────────────────────────────

function TitleCard({ title, estateId, scope, canManage, onChange }: {
  title: EstateTitle;
  estateId: string;
  scope: PortalScope;
  canManage: boolean;
  onChange: () => void;
}) {
  return (
    <Card className="space-y-4 mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-[var(--foreground)]">{title.titleType}</div>
          <div className="text-sm text-[var(--muted-foreground)] font-mono-data">{title.titleNumber || "No title number on file"}</div>
        </div>
        <StatusBadge {...titleStatusBadge(title.status)} />
      </div>

      {title.status === "pending" && (
        <p className="text-sm text-[var(--muted-foreground)]">
          Sent {formatDate(title.submittedAt)}. HomeTrue is checking the documents. Buyers see "{title.titleType} (declared)" until then.
        </p>
      )}
      {title.status === "verified" && (
        <p className="text-sm text-[var(--muted-foreground)]">
          Verified {formatDate(title.decidedAt)} by {sourceLabel(title.verificationSource).toLowerCase()}. Buyers see "{title.titleType}, verified by HomeTrue".
        </p>
      )}
      {title.status === "rejected" && (
        <Alert tone="error" title="HomeTrue couldn't confirm this title">
          <p>{title.decisionNote}</p>
          <p className="mt-1">Buyers see "{title.titleType} (declared, not confirmed)". Fix what the note says and send it again.</p>
        </Alert>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <InfoBox label="Issued">{title.issuedDate ? formatDate(title.issuedDate) : "Not given"}</InfoBox>
        <InfoBox label="Sent for review">{formatDate(title.submittedAt)}</InfoBox>
      </div>

      <TitleDocumentList documents={title.documents} open={(fileId) => titleDocumentLink(estateId, fileId, scope)} />

      {canManage && (
        <div className="pt-1">
          <Button variant="secondary" onClick={onChange}>Change title or documents</Button>
          {title.status === "verified" && (
            <p className="text-xs text-[var(--muted-foreground)] mt-2">
              Changing a verified title sends it back for review, because HomeTrue checked the old documents.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

// ─── Declaring ───────────────────────────────────────────────────────────────

function TitleForm({ estateId, scope, current, onCancel, onSent }: {
  estateId: string;
  scope: PortalScope;
  current: EstateTitle | null;
  onCancel?: () => void;
  onSent: (title: EstateTitle) => void;
}) {
  const [titleType, setTitleType] = useState<TitleType>(current?.titleType ?? "C of O");
  const [titleNumber, setTitleNumber] = useState(current?.titleNumber ?? "");
  const [issuedDate, setIssuedDate] = useState(current?.issuedDate ?? "");
  const [documents, setDocuments] = useState<Partial<Record<TitleDocumentKind, TitleDocument>>>(
    Object.fromEntries((current?.documents ?? []).map((d) => [d.kind, d])),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(0);

  const submit = async () => {
    setFormError("");
    const found = checkSubmission({ titleNumber, issuedDate, documents: Object.fromEntries(Object.entries(documents).map(([k, d]) => [k, d?.fileId])) });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    setSending(true);
    try {
      onSent(await submitEstateTitle(estateId, {
        titleType, titleNumber, issuedDate: issuedDate || null,
        titleDocumentFileId: documents.title_document!.fileId,
        surveyPlanFileId: documents.survey_plan!.fileId,
        deedFileId: documents.deed?.fileId ?? null,
      }, scope));
    } catch (err) {
      if (err instanceof TitleError && err.field) setErrors({ [err.field]: err.message });
      else setFormError(err instanceof Error ? err.message : "That didn't go through. Try again.");
    } finally {
      setSending(false);
    }
  };

  const numberHint = "Exactly as printed on the document, e.g. FCT/ABU/2019/1234.";
  const dateHint = "Optional. The date on the document.";

  return (
    <Card className="space-y-5">
      <h2 className="text-sm font-semibold text-[var(--foreground)]">{current ? "Change the title" : "Record the title"}</h2>
      {current?.status === "verified" && (
        <Alert>This title is verified. Sending a change puts it back to "Waiting for review", and buyers see it as declared until HomeTrue checks again.</Alert>
      )}

      <Field id="title-type" label="Title type">
        <Select id="title-type" value={titleType} onChange={(e) => setTitleType(e.target.value as TitleType)}>
          {TITLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
      </Field>

      <Field id="title-number" label="Title number" hint={numberHint} error={errors.titleNumber}>
        <Input
          id="title-number"
          value={titleNumber}
          maxLength={TITLE_NUMBER_MAX}
          onChange={(e) => setTitleNumber(e.target.value)}
          aria-invalid={!!errors.titleNumber}
          aria-describedby={describedBy("title-number", { hint: numberHint, error: errors.titleNumber })}
          className="font-mono-data"
        />
      </Field>

      <Field id="title-issued" label="Issue date" hint={dateHint} error={errors.issuedDate}>
        <Input
          id="title-issued"
          type="date"
          value={issuedDate}
          max={new Date().toISOString().slice(0, 10)}
          onChange={(e) => setIssuedDate(e.target.value)}
          aria-invalid={!!errors.issuedDate}
          aria-describedby={describedBy("title-issued", { hint: dateHint, error: errors.issuedDate })}
        />
      </Field>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Documents</h3>
          <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
            PDF, JPG or PNG, up to {MAX_MB} MB each. Only you and HomeTrue reviewers can see them, never buyers.
          </p>
        </div>
        {DOCUMENT_KINDS.map((slot) => (
          <DocumentSlot
            key={slot.kind}
            estateId={estateId}
            scope={scope}
            {...slot}
            document={documents[slot.kind]}
            error={errors[slot.kind]}
            onBusy={(busy) => setUploading((n) => n + (busy ? 1 : -1))}
            onUploaded={(doc) => { setDocuments((d) => ({ ...d, [slot.kind]: doc })); setErrors(({ [slot.kind]: _, ...rest }) => rest); }}
            onRemove={() => setDocuments(({ [slot.kind]: _, ...rest }) => rest)}
          />
        ))}
      </div>

      {formError && <ErrorText>{formError}</ErrorText>}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={submit} disabled={sending || uploading > 0}>
          {sending ? "Sending…" : uploading > 0 ? "Waiting for uploads…" : "Send for review"}
        </Button>
        {onCancel && <Button variant="secondary" onClick={onCancel} disabled={sending}>Cancel</Button>}
      </div>
    </Card>
  );
}

function DocumentSlot({ estateId, scope, kind, label, hint, required, document, error, onBusy, onUploaded, onRemove }: {
  estateId: string;
  scope: PortalScope;
  kind: TitleDocumentKind;
  label: string;
  hint: string;
  required: boolean;
  document?: TitleDocument;
  error?: string;
  onBusy: (busy: boolean) => void;
  onUploaded: (doc: TitleDocument) => void;
  onRemove: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState("");
  const id = `doc-${kind}`;
  const shownError = uploadError || error;

  const choose = async (file: File | undefined) => {
    if (input.current) input.current.value = "";
    if (!file) return;
    setUploadError("");
    setProgress(0);
    onBusy(true);
    try {
      onUploaded(await uploadTitleDocument(estateId, kind, file, scope, { onProgress: setProgress }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "The upload didn't go through.");
    } finally {
      setProgress(null);
      onBusy(false);
    }
  };

  return (
    <div className={`rounded-md border p-3 ${shownError ? "border-[var(--error-border)]" : "border-[var(--border)]"}`}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 min-w-[12rem]">
          <div className="text-sm font-medium text-[var(--foreground)]">
            {label}{required ? "" : <span className="font-normal text-[var(--muted-foreground)]"> (optional)</span>}
          </div>
          <p id={`${id}-hint`} className="text-xs text-[var(--muted-foreground)] mt-0.5">{hint}</p>
          {document && (
            <p className="text-xs text-[var(--foreground)] mt-1.5">
              {document.fileName} · {formatSize(document.sizeBytes)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {document && !required && progress === null && <Button variant="linkMuted" onClick={onRemove} aria-label={`Remove ${label}`}>Remove</Button>}
          <Button variant="secondary" disabled={progress !== null} onClick={() => input.current?.click()}>
            {progress !== null ? `Uploading ${Math.round(progress * 100)}%` : document ? "Replace" : "Upload"}
          </Button>
        </div>
        <input
          ref={input}
          id={id}
          type="file"
          accept={acceptAttribute(TITLE_DOCUMENT_TYPES)}
          onChange={(e) => choose(e.target.files?.[0])}
          aria-label={`Upload ${label}`}
          aria-describedby={describedBy(id, { hint, error: shownError })}
          className="sr-only"
          tabIndex={-1}
        />
      </div>
      {shownError && <p id={`${id}-error`} className="text-xs text-[var(--error-text)] mt-2" role="alert">{shownError}</p>}
    </div>
  );
}
