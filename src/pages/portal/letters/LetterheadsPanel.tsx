// Letterheads: the company's, and one per branch. Each shows what a letter
// would print today, what still blocks letters (a signatory's name, title and
// signature), and — for the Executive Director — the signatory and images to
// set. A branch inherits the company's until it sets its own; a branch that
// names its own signer prints only its own signature.

import { useRef, useState } from "react";
import { useFetch } from "../../../lib/useFetch";
import { acceptAttribute } from "../../../lib/uploadFile";
import {
  IMAGE_KIND_LABELS, LETTERHEAD_IMAGE_MAX_BYTES, LETTERHEAD_IMAGE_TYPES, SIGNATORY_MAX,
  clearSignatory, errorMessage, fetchLetterheads, fieldErrorsOf, letterheadImageLink, removeLetterheadImage, setSignatory, uploadLetterheadImage,
  type ImageKind, type Letterhead, type LetterheadImage, type LetterheadMissing,
} from "../../../services/lettersService";
import type { PortalScope } from "../../../services/portalEstatesService";
import LoadError from "../../../components/LoadError";
import Card from "../../../components/ui/Card";
import Alert from "../../../components/ui/Alert";
import Button from "../../../components/ui/Button";
import StatusBadge from "../../../components/StatusBadge";
import { Loading } from "../../../components/ui/Page";
import Dialog, { DialogActions } from "../../../components/ui/Dialog";
import { ErrorText, Field, Input } from "../../../components/ui/Field";

export const MISSING_LABELS: Record<LetterheadMissing, string> = {
  signatory_name: "the signatory's name",
  signatory_title: "the signatory's title",
  signature: "a signature",
};

export function listMissing(missing: string[]): string {
  const labels = missing.map((m) => MISSING_LABELS[m as LetterheadMissing] ?? m);
  return labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}` : labels[0] ?? "";
}

export default function LetterheadsPanel({ scope, canManage }: { scope: PortalScope; canManage: boolean }) {
  const loaded = useFetch(() => fetchLetterheads(scope), [scope.tenantId, scope.branchId]);
  if (loaded.loading && !loaded.data) return <Loading label="Loading letterheads…" />;
  if (loaded.error) return <LoadError error={loaded.errorValue} what="the letterheads" onRetry={loaded.refetch} />;
  const { company, branches } = loaded.data!;

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--muted-foreground)]">
        Every allocation letter is printed under the letterhead of the branch that sells the estate, or the company's for a company-level estate.
        A branch uses the company's logo, seal and signatory until it sets its own.
      </p>
      <LetterheadCard head={company} target="company" scope={scope} canManage={canManage} onChanged={loaded.refetch} />
      {branches.length > 0 && <BranchLetterheads branches={branches} company={company} scope={scope} canManage={canManage} onChanged={loaded.refetch} />}
    </div>
  );
}

// The branches as rows — what each prints with and who signs — with one
// branch's full editor opened at a time, rather than every editor open at once.
function BranchLetterheads({ branches, company, scope, canManage, onChanged }: {
  branches: Letterhead[]; company: Letterhead; scope: PortalScope; canManage: boolean; onChanged: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Card as="section" padding="none" className="overflow-hidden" aria-labelledby="branch-letterheads-heading">
      <div className="px-4 sm:px-5 py-3.5">
        <h2 id="branch-letterheads-heading" className="font-semibold text-[var(--foreground)]">Branch letterheads</h2>
        <p className="text-xs text-[var(--muted-foreground)]">A branch uses the company's logo, seal and signatory until it sets its own.</p>
      </div>
      <div aria-hidden="true" className="hidden md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_minmax(0,1.4fr)_8rem_7rem] gap-4 bg-[var(--muted)] px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)] border-t border-[var(--border)]">
        <span>Branch</span><span>Prints with</span><span>Signed by</span><span>Status</span><span />
      </div>
      <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)] md:border-t-0">
        {branches.map((b) => {
          const p = b.printed;
          const ownOffice = p.address !== company.printed.address;
          const ownImages = (["logo", "signature", "seal"] as ImageKind[]).filter((k) => b[k]).map((k) => IMAGE_KIND_LABELS[k].toLowerCase());
          const isOpen = open === b.branchId;
          return (
            <li key={b.branchId}>
              <div className="px-4 sm:px-5 py-3 md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_minmax(0,1.4fr)_8rem_7rem] md:items-center md:gap-4 space-y-1.5 md:space-y-0">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[var(--foreground)]">{b.branchName}</div>
                  <div className="text-xs text-[var(--muted-foreground)]">{b.version > 0 ? `version ${b.version}` : "never customised"}</div>
                </div>
                <div className="text-sm text-[var(--foreground)] min-w-0">
                  {ownOffice ? <>Its own office{p.address ? `: ${p.address}` : ""}</> : "The company's details"}
                  {ownImages.length > 0 && <span className="block text-xs text-[var(--muted-foreground)]">Own {ownImages.join(", ")}</span>}
                </div>
                <div className="text-sm min-w-0">
                  <span className="text-[var(--foreground)]">{p.signatoryName ?? "No one yet"}</span>
                  {p.signatorySource && <span className="block text-xs text-[var(--muted-foreground)]">{p.signatorySource === "company" ? "the company's signatory" : "this branch's own"}</span>}
                </div>
                <div>{b.missing.length === 0 ? <StatusBadge label="Ready" variant="success" /> : <StatusBadge label="Not ready" variant="warning" />}</div>
                <div className="md:justify-self-end">
                  <Button variant="link" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : b.branchId)}>{isOpen ? "Close" : canManage ? "Customise" : "View"}</Button>
                </div>
              </div>
              {isOpen && (
                <div className="px-4 sm:px-5 pb-4">
                  <LetterheadCard head={b} target={b.branchId!} scope={scope} canManage={canManage} onChanged={onChanged} as="div" />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function LetterheadCard({ head, target, scope, canManage, onChanged, as = "section" }: { head: Letterhead; target: string; scope: PortalScope; canManage: boolean; onChanged: () => void; as?: "section" | "div" }) {
  const isBranch = head.scope === "branch";
  const p = head.printed;
  const ownSigner = !!(head.signatoryName || head.signatoryTitle || head.signature);

  return (
    <Card as={as} className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-[var(--foreground)]">{isBranch ? head.branchName : "Company letterhead"}</h2>
          <p className="text-xs text-[var(--muted-foreground)]">{isBranch ? "Branch letterhead" : "Used by company-level estates, and by any branch that sets nothing of its own"}</p>
        </div>
        {head.missing.length === 0 ? <StatusBadge label="Ready for letters" variant="success" /> : <StatusBadge label="Not ready" variant="warning" />}
      </div>

      {head.missing.length > 0 && (
        <Alert role="status">
          Letters can't be issued under this letterhead until it has {listMissing(head.missing)}.
          {isBranch && ownSigner && head.missing.includes("signature") && " This branch names its own signer, so it needs their signature too: the company's signature is never printed under another name."}
        </Alert>
      )}

      {/* What a letter prints today */}
      <div className="rounded-lg bg-[var(--muted)] p-4 text-sm space-y-1">
        <div className="text-xs font-medium text-[var(--muted-foreground)] mb-1">Prints as</div>
        {p.companyName && <div className="font-semibold text-[var(--foreground)]">{p.companyName}{p.rcNumber && <span className="font-normal text-[var(--muted-foreground)]"> · {p.rcNumber}</span>}</div>}
        {[p.address, p.phone, p.email, p.website].filter(Boolean).length > 0 && (
          <div className="text-[var(--muted-foreground)]">{[p.address, p.phone, p.email, p.website].filter(Boolean).join(" · ")}</div>
        )}
        <div className="pt-1">
          Signed by{" "}
          {p.signatoryName || p.signatoryTitle ? (
            <span className="text-[var(--foreground)]">{[p.signatoryName, p.signatoryTitle].filter(Boolean).join(", ")}</span>
          ) : (
            <span className="text-[var(--muted-foreground)]">no one yet</span>
          )}
          {isBranch && p.signatorySource === "company" && <span className="text-[var(--muted-foreground)]"> (the company's signatory)</span>}
        </div>
      </div>

      <SignatorySection head={head} target={target} scope={scope} canManage={canManage} onChanged={onChanged} />

      <div>
        <h3 className="text-sm font-semibold mb-3">Images</h3>
        <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(["logo", "signature", "seal"] as ImageKind[]).map((kind) => (
            <ImageSlot key={kind} kind={kind} own={head[kind]} printed={p[kind]} isBranch={isBranch} target={target} scope={scope} canManage={canManage} onChanged={onChanged} />
          ))}
        </ul>
        <p className="text-xs text-[var(--muted-foreground)] mt-2">PNG or JPEG, up to {LETTERHEAD_IMAGE_MAX_BYTES / 1024 / 1024} MB. The logo and seal are optional; a signature is needed.</p>
      </div>

      {head.version > 0 && head.updatedAt && (
        <p className="text-xs text-[var(--muted-foreground)]">Version {head.version}. Changing anything here asks for the letter of every estate using it to be approved again.</p>
      )}
    </Card>
  );
}

function SignatorySection({ head, target, scope, canManage, onChanged }: { head: Letterhead; target: string; scope: PortalScope; canManage: boolean; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(head.signatoryName ?? "");
  const [title, setTitle] = useState(head.signatoryTitle ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const isBranch = head.scope === "branch";
  const hasOwn = !!(head.signatoryName || head.signatoryTitle);

  const start = () => { setName(head.signatoryName ?? ""); setTitle(head.signatoryTitle ?? ""); setError(null); setFieldErrors({}); setEditing(true); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const fe: Record<string, string> = {};
    if (!name.trim()) fe.name = "Enter the signatory's name.";
    if (!title.trim()) fe.title = "Enter their title, e.g. Managing Director.";
    setFieldErrors(fe);
    if (Object.keys(fe).length) return;
    setBusy(true);
    setError(null);
    try {
      await setSignatory(target, name.trim(), title.trim(), scope);
      setEditing(false);
      onChanged();
    } catch (err) {
      setFieldErrors(fieldErrorsOf(err));
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    setBusy(true);
    setError(null);
    try {
      await clearSignatory(target, scope);
      setConfirming(false);
      onChanged();
    } catch (err) {
      setConfirming(false);
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <h3 className="text-sm font-semibold">Signatory</h3>
        {canManage && !editing && (
          <div className="flex gap-4">
            <Button variant="link" onClick={start}>{hasOwn ? "Change" : isBranch ? "Set this branch's own signer" : "Set signatory"}</Button>
            {hasOwn && <Button variant="linkDanger" onClick={() => setConfirming(true)} disabled={busy}>{isBranch ? "Use the company's signer" : "Remove"}</Button>}
          </div>
        )}
      </div>
      {!editing && (
        <p className="text-sm text-[var(--muted-foreground)]">
          {hasOwn ? <><span className="text-[var(--foreground)]">{[head.signatoryName, head.signatoryTitle].filter(Boolean).join(", ")}</span>. Removing them removes their signature too.</>
            : isBranch ? "This branch uses the company's signatory and signature." : "No signatory set."}
        </p>
      )}
      {editing && (
        <form onSubmit={save} noValidate className="space-y-3">
          {isBranch && !hasOwn && (
            <Alert tone="info">A branch that names its own signer prints only its own: upload their signature below too, or letters stop until you do.</Alert>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field id={`${target}-sig-name`} label="Name" error={fieldErrors.name}>
              <Input id={`${target}-sig-name`} value={name} maxLength={SIGNATORY_MAX} onChange={(e) => setName(e.target.value)} aria-invalid={!!fieldErrors.name} autoComplete="off" />
            </Field>
            <Field id={`${target}-sig-title`} label="Title" error={fieldErrors.title}>
              <Input id={`${target}-sig-title`} value={title} maxLength={SIGNATORY_MAX} onChange={(e) => setTitle(e.target.value)} aria-invalid={!!fieldErrors.title} placeholder="Managing Director" autoComplete="off" />
            </Field>
          </div>
          <div className="flex gap-3">
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save signatory"}</Button>
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
          </div>
        </form>
      )}
      {error && <ErrorText className="mt-2">{error}</ErrorText>}
      {confirming && (
        <Dialog title={isBranch ? "Go back to the company's signer?" : "Remove the signatory?"} onClose={() => setConfirming(false)}>
          <p className="text-sm mb-3">
            {isBranch
              ? `${head.branchName}'s own signer, title and signature are removed, and its letters are signed by the company's signatory.`
              : "Their name, title and signature are removed. Letters can't be issued until a new signatory is set."}
            {" "}Every estate whose letter uses this letterhead will need its letter approved again.
          </p>
          <DialogActions onCancel={() => setConfirming(false)} onConfirm={clear} confirmLabel={isBranch ? "Use the company's signer" : "Remove signatory"} busy={busy} variant="danger" />
        </Dialog>
      )}
    </div>
  );
}

function ImageSlot({ kind, own, printed, isBranch, target, scope, canManage, onChanged }: {
  kind: ImageKind; own: LetterheadImage | null; printed: LetterheadImage | null; isBranch: boolean;
  target: string; scope: PortalScope; canManage: boolean; onChanged: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const shown = own ?? printed;
  const inherited = !own && !!printed;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setProgress(0);
    try {
      await uploadLetterheadImage(target, kind, file, scope, setProgress);
      onChanged();
    } catch (err) {
      setError(errorMessage(err, "The upload didn't go through. Try again."));
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async () => {
    setError(null);
    setRemoving(true);
    try {
      await removeLetterheadImage(target, kind, scope);
      setConfirming(false);
      onChanged();
    } catch (err) {
      setConfirming(false);
      setError(errorMessage(err));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <li className="rounded-lg border border-[var(--border)] p-3 flex flex-col gap-2">
      <div className="text-xs font-medium text-[var(--muted-foreground)]">{IMAGE_KIND_LABELS[kind]}{inherited && " (the company's)"}</div>
      <div className="h-20 rounded-md bg-[var(--muted)] flex items-center justify-center overflow-hidden">
        {shown ? <StoredImage key={shown.fileId} image={shown} label={IMAGE_KIND_LABELS[kind]} /> : <span className="text-xs text-[var(--muted-foreground)]">None</span>}
      </div>
      {canManage && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <input ref={input} type="file" accept={acceptAttribute(LETTERHEAD_IMAGE_TYPES)} className="sr-only" id={`${target}-${kind}-file`}
            onChange={(e) => upload(e.target.files?.[0])} />
          <Button variant="link" onClick={() => input.current?.click()} disabled={progress !== null}>
            {progress !== null ? `Uploading… ${Math.round(progress * 100)}%` : own ? "Replace" : isBranch ? "Use this branch's own" : "Upload"}
          </Button>
          {own && <Button variant="linkDanger" onClick={() => setConfirming(true)} disabled={progress !== null}>Remove</Button>}
        </div>
      )}
      {error && <span role="alert" className="text-xs text-[var(--error-text)]">{error}</span>}
      {confirming && (
        <Dialog title={`Remove the ${IMAGE_KIND_LABELS[kind].toLowerCase()}?`} onClose={() => setConfirming(false)}>
          <p className="text-sm mb-3">
            {kind === "signature" && !(isBranch && printed?.source === "company")
              ? "Letters can't be issued under this letterhead until a signature is uploaded again. "
              : isBranch ? "This letterhead goes back to the company's. " : ""}
            Every estate whose letter uses this letterhead will need its letter approved again. Letters already issued keep theirs.
          </p>
          <DialogActions onCancel={() => setConfirming(false)} onConfirm={remove} confirmLabel="Remove" busy={removing} variant="danger" />
        </Dialog>
      )}
    </li>
  );
}

// A private image, through a five-minute link fetched when shown.
function StoredImage({ image, label }: { image: LetterheadImage; label: string }) {
  const link = useFetch(() => letterheadImageLink(image.fileId), [image.fileId]);
  if (link.error) return <span className="text-xs text-[var(--muted-foreground)]">Couldn't load {image.fileName}</span>;
  if (!link.data?.url) return <span className="text-xs text-[var(--muted-foreground)]">Loading…</span>;
  return <img src={link.data.url} alt={`${label}: ${image.fileName}`} className="max-h-full max-w-full object-contain" />;
}
