// An estate's photos (storage step 2): upload, caption, order, cover, delete.
// Laid out from the Figma "Portal estate setup" proposal: inside the setup
// frame, a drop zone and a grid of photo cards, the cover outlined.
//
// Everything on screen is what the server last returned. Confirm stores a
// metadata-stripped copy at a new address, so a local preview would show a
// file that no longer exists; and the server owns the cover rule (first photo
// becomes it, reordering never moves it, deleting it passes it on), so the
// list is re-read or replaced from each response rather than patched here.
//
// GET needs portal.estates.view; every control below needs .manage, and
// branch staff on a company-level estate get the read-only view (EB-2).

import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import LoadError from "../../../components/LoadError";
import { useFetch } from "../../../lib/useFetch";
import { useApp } from "../../../contexts/AppContext";
import { canManageEstates } from "../../../services/authService";
import { fetchPortalEstateById, isReadOnlyForScope, type PortalEstate, type PortalScope } from "../../../services/portalEstatesService";
import {
  CAPTION_MAX, PHOTO_LIMIT, PHOTO_MAX_BYTES, PHOTO_TYPES, PhotoError, checkPhoto, deleteEstatePhoto, fetchEstatePhotos,
  reorderPhotos, setCoverPhoto, updatePhotoCaption, uploadEstatePhoto, type EstatePhoto,
} from "../../../services/estatePhotosService";
import { acceptAttribute } from "../../../lib/uploadFile";
import Page, { Loading } from "../../../components/ui/Page";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import Alert from "../../../components/ui/Alert";
import Badge from "../../../components/ui/Badge";
import EmptyState from "../../../components/ui/EmptyState";
import Dialog, { DialogActions } from "../../../components/ui/Dialog";
import { ErrorText, Field, Textarea, describedBy } from "../../../components/ui/Field";
import { usePortalScope } from "../usePortalScope";
import EstateSetupPage from "../../../components/portal/EstateSetupPage";
import { cx } from "../../../components/ui/cx";
import { ArrowLeftIcon, ChevronRightIcon, ImageIcon } from "../../../components/icons";
import { ReadOnlyNotice } from "./PortalEstateInventory";

const MAX_MB = PHOTO_MAX_BYTES / 1024 / 1024;

function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export default function PortalEstatePhotos() {
  const { estateId } = useParams<{ estateId: string }>();
  const scope = usePortalScope();
  const { user } = useApp();
  const mayManage = canManageEstates(user);

  const estate = useFetch(async () => (scope && estateId ? fetchPortalEstateById(estateId, scope) : null), [scope?.tenantId, scope?.branchId, estateId]);
  const photos = useFetch(async () => (scope && estateId ? fetchEstatePhotos(estateId, scope) : []), [scope?.tenantId, scope?.branchId, estateId]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; reload: boolean } | null>(null);
  const [deleting, setDeleting] = useState<EstatePhoto | null>(null);

  if ((estate.loading && !estate.data) || (photos.loading && !photos.data)) {
    return <Page title="Photos" width="lg"><Loading label="Loading photos…" /></Page>;
  }
  if (estate.error) return <LoadError error={estate.errorValue} what="this estate" onRetry={estate.refetch} />;
  if (!estate.data || !scope || !estateId) {
    return <Page title="Estate not found" width="lg" back={{ to: "/portal/estates", label: "Estates" }}>{null}</Page>;
  }
  if (photos.error) return <LoadError error={photos.errorValue} what="this estate's photos" onRetry={photos.refetch} />;

  const current = estate.data;
  const list = photos.data ?? [];
  const readOnly = isReadOnlyForScope(current, scope);
  const canManage = mayManage && !readOnly;

  // One change at a time; the list shown is always the server's answer.
  const run = async (change: () => Promise<EstatePhoto[] | void>) => {
    setBusy(true);
    setError(null);
    try {
      const result = await change();
      if (result) photos.setData(result);
      else photos.refetch();
      // A photo can change readiness (hasPhoto), so the estate is re-read too.
      estate.refetch();
    } catch (err) {
      const stale = err instanceof PhotoError && err.action === "reload";
      setError({ message: messageOf(err, "That didn't go through. Try again."), reload: stale });
      if (stale) photos.refetch();
    } finally {
      setBusy(false);
    }
  };

  // PUT /order needs every id exactly once. A stale list is refused with
  // PHOTO_ORDER_MISMATCH: reload, then make the same move on the fresh list once.
  const move = (photoId: string, delta: -1 | 1) => run(async () => {
    const swapped = (from: EstatePhoto[]) => {
      const ids = from.map((p) => p.id);
      const i = ids.indexOf(photoId);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= ids.length) return null;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      return ids;
    };
    const ids = swapped(list);
    if (!ids) return list;
    try {
      return await reorderPhotos(estateId, ids, scope);
    } catch (err) {
      if (!(err instanceof PhotoError && err.code === "PHOTO_ORDER_MISMATCH")) throw err;
      const fresh = await fetchEstatePhotos(estateId, scope);
      const retried = swapped(fresh);
      return retried ? reorderPhotos(estateId, retried, scope) : fresh;
    }
  });

  const confirmDelete = async () => {
    if (!deleting) return;
    const photo = deleting;
    await run(() => deleteEstatePhoto(estateId, photo.id, scope));
    setDeleting(null);
  };

  return (
    <EstateSetupPage
      estate={current}
      step="photos"
      title="Photos"
      description={`Buyers see them in this order, cover first.${list.length ? ` ${list.length} of ${PHOTO_LIMIT} used.` : ""}`}
    >
      {readOnly && <ReadOnlyNotice />}

      {canManage && (
        <Uploader
          estateId={estateId}
          scope={scope}
          count={list.length}
          onUploaded={() => { photos.refetch(); estate.refetch(); }}
        />
      )}

      {error && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <ErrorText>{error.message}</ErrorText>
          {error.reload && <span className="text-xs text-[var(--muted-foreground)]">The list has been reloaded.</span>}
        </div>
      )}

      {list.length === 0 ? (
        <Card>
          <EmptyState
            title="No photos yet"
            description={canManage
              ? "Add at least one photo of the estate itself (the gate, the roads, the land) before it can be published."
              : "Nobody has added a photo of this estate yet."}
          />
        </Card>
      ) : (
        <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {list.map((photo, index) => (
            <PhotoCard
              key={photo.id}
              photo={photo}
              position={index + 1}
              estateName={current.name}
              canManage={canManage}
              busy={busy}
              first={index === 0}
              last={index === list.length - 1}
              onMove={(delta) => move(photo.id, delta)}
              onCover={() => run(() => setCoverPhoto(estateId, photo.id, scope))}
              onDelete={() => setDeleting(photo)}
              onCaption={async (caption) => {
                const saved = await updatePhotoCaption(estateId, photo.id, caption, scope);
                photos.setData((prev) => (prev ?? []).map((p) => (p.id === saved.id ? saved : p)));
              }}
            />
          ))}
        </ul>
      )}

      {deleting && (
        <DeletePhotoDialog
          photo={deleting}
          estate={current}
          onlyPhoto={list.length === 1}
          busy={busy}
          onCancel={() => setDeleting(null)}
          onConfirm={confirmDelete}
        />
      )}
    </EstateSetupPage>
  );
}

// ─── Uploading ───────────────────────────────────────────────────────────────

interface QueuedFile {
  key: string;
  file: File;
  status: "waiting" | "uploading" | "failed";
  progress: number;
  error?: PhotoError | Error;
}

function Uploader({ estateId, scope, count, onUploaded }: { estateId: string; scope: PortalScope; count: number; onUploaded: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [working, setWorking] = useState(false);
  const [over, setOver] = useState(false);
  const full = count >= PHOTO_LIMIT;

  const update = (key: string, patch: Partial<QueuedFile>) => setQueue((q) => q.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  const drop = (key: string) => setQueue((q) => q.filter((f) => f.key !== key));

  // One at a time, so the 20-photo count is checked against what's really
  // there. Each success re-reads the list from the server.
  const send = async (items: QueuedFile[], startCount: number) => {
    setWorking(true);
    let photosNow = startCount;
    for (const item of items) {
      const problem = checkPhoto(item.file, photosNow);
      if (problem) { update(item.key, { status: "failed", error: problem }); continue; }
      update(item.key, { status: "uploading", progress: 0, error: undefined });
      try {
        await uploadEstatePhoto(estateId, item.file, scope, { onProgress: (progress) => update(item.key, { progress }) });
        photosNow++;
        drop(item.key);
        onUploaded();
      } catch (err) {
        update(item.key, { status: "failed", error: err instanceof Error ? err : new Error("The upload didn't go through.") });
      }
    }
    setWorking(false);
  };

  const choose = (files: FileList | null) => {
    if (!files?.length) return;
    const items: QueuedFile[] = [...files].map((file, i) => ({ key: `${Date.now()}-${i}-${file.name}`, file, status: "waiting", progress: 0 }));
    setQueue((q) => [...q.filter((f) => f.status === "failed"), ...items]);
    if (input.current) input.current.value = "";
    send(items, count);
  };

  return (
    <div
      onDragOver={(e) => { if (!working && !full) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!working && !full) choose(e.dataTransfer.files); }}
      className={cx("mb-6 rounded-xl border-2 border-dashed p-5 space-y-3 transition-colors", over ? "border-[var(--primary)] bg-[var(--secondary)]" : "border-[var(--border)]")}
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <span className="w-11 h-11 shrink-0 rounded-lg bg-[var(--secondary)] text-[var(--primary)] flex items-center justify-center"><ImageIcon size={22} /></span>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Drop photos here, or choose them</h2>
          <p id="photo-upload-hint" className="text-xs text-[var(--muted-foreground)] mt-0.5">
            JPG, PNG or WebP, up to {MAX_MB} MB each, {PHOTO_LIMIT} per estate. Location data, camera details and dates are removed
            from each photo when it's saved; only its orientation is kept, so phone photos stay upright.
          </p>
        </div>
        <Button onClick={() => input.current?.click()} disabled={working || full} className="shrink-0">
          {working ? "Uploading…" : "Choose photos"}
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          accept={acceptAttribute(PHOTO_TYPES)}
          onChange={(e) => choose(e.target.files)}
          aria-label="Choose photos to upload"
          aria-describedby="photo-upload-hint"
          className="sr-only"
          tabIndex={-1}
        />
      </div>

      {full && <Alert tone="info">This estate has {PHOTO_LIMIT} photos, the most allowed. Delete one to add another.</Alert>}

      {queue.length > 0 && (
        <ul className="space-y-2" aria-live="polite">
          {queue.map((item) => (
            <li key={item.key} className="text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate max-w-[16rem] text-[var(--foreground)]">{item.file.name}</span>
                <span className="text-xs text-[var(--muted-foreground)]">
                  {item.status === "waiting" ? "Waiting" : item.status === "uploading" ? `Uploading ${Math.round(item.progress * 100)}%` : "Not added"}
                </span>
                {item.status === "failed" && (
                  <span className="ml-auto flex gap-3">
                    {/* Retry only where sending the same file again can work:
                        a mismatch, an expired link or a dropped connection. */}
                    {item.error instanceof PhotoError && item.error.action === "reupload" && (
                      <Button variant="link" disabled={working} onClick={() => send([item], count)}>Upload again</Button>
                    )}
                    <Button variant="linkMuted" onClick={() => drop(item.key)}>Dismiss</Button>
                  </span>
                )}
              </div>
              {item.status === "uploading" && (
                <div className="h-1.5 mt-1 rounded-full bg-[var(--muted)] overflow-hidden">
                  <div className="h-full bg-[var(--primary)]" style={{ width: `${item.progress * 100}%` }} />
                </div>
              )}
              {item.status === "failed" && item.error && <ErrorText className="text-xs mt-1">{item.error.message}</ErrorText>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── One photo ───────────────────────────────────────────────────────────────

function PhotoCard({ photo, position, estateName, canManage, busy, first, last, onMove, onCover, onDelete, onCaption }: {
  photo: EstatePhoto;
  position: number;
  estateName: string;
  canManage: boolean;
  busy: boolean;
  first: boolean;
  last: boolean;
  onMove: (delta: -1 | 1) => void;
  onCover: () => void;
  onDelete: () => void;
  onCaption: (caption: string) => Promise<void>;
}) {
  const label = photo.caption ?? `${estateName}, photo ${photo.position + 1}`;
  return (
    <Card as="li" padding="sm" className={cx("flex flex-col gap-3", photo.cover && "border-2 border-[var(--ring)]")}>
      <div className="relative">
        {/* The server's url: the cleaned copy, never the file as uploaded. */}
        <img src={photo.url} alt={photo.caption ?? estateName} loading="lazy" className="w-full aspect-[3/2] object-cover rounded-md bg-[var(--muted)]" />
        <span className="absolute top-2 left-2">
          {photo.cover ? <Badge label="Cover" variant="success" /> : <Badge label={String(position)} variant="neutral" />}
        </span>
      </div>

      {canManage ? (
        <CaptionEditor photo={photo} onSave={onCaption} />
      ) : (
        <p className={`text-sm ${photo.caption ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]"}`}>{photo.caption ?? "No caption"}</p>
      )}

      {canManage && (
        <div className="flex items-center gap-2 mt-auto">
          <Button variant="secondary" disabled={busy || first} onClick={() => onMove(-1)} aria-label={`Move earlier: ${label}`}><ArrowLeftIcon size={14} /></Button>
          <Button variant="secondary" disabled={busy || last} onClick={() => onMove(1)} aria-label={`Move later: ${label}`}><ChevronRightIcon size={14} /></Button>
          <span className="flex-1" />
          {!photo.cover && <Button variant="link" className="font-medium" disabled={busy} onClick={onCover} aria-label={`Make cover: ${label}`}>Make cover</Button>}
          <Button variant="linkDanger" disabled={busy} onClick={onDelete} aria-label={`Delete: ${label}`}>Delete</Button>
        </div>
      )}
    </Card>
  );
}

function CaptionEditor({ photo, onSave }: { photo: EstatePhoto; onSave: (caption: string) => Promise<void> }) {
  const [draft, setDraft] = useState(photo.caption ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const id = `caption-${photo.id}`;
  const dirty = draft.trim() !== (photo.caption ?? "");
  // A missing caption is called out: without one, screen readers hear only
  // the estate's name.
  const hint = photo.caption || draft ? `${draft.length}/${CAPTION_MAX}` : undefined;
  const missing = !photo.caption && !draft;

  const save = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      await onSave(draft);
      setSaved(true);
    } catch (err) {
      setError(messageOf(err, "Couldn't save the caption."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Field id={id} label="Caption" hint={hint} error={error || undefined}>
        <Textarea
          id={id}
          rows={2}
          value={draft}
          maxLength={CAPTION_MAX}
          placeholder="What the photo shows, e.g. the main gate and the paved access road"
          onChange={(e) => { setDraft(e.target.value); setSaved(false); }}
          aria-describedby={describedBy(id, { hint, error })}
        />
      </Field>
      {missing && <p className="text-xs text-[var(--warning-text)] mt-1">Without a caption, buyers' screen readers only hear the estate's name.</p>}
      {(dirty || saved) && (
        <div className="flex items-center gap-3 mt-2">
          {dirty && (
            <Button variant="secondary" disabled={saving} onClick={save}>
              {saving ? "Saving…" : !draft.trim() && photo.caption ? "Clear caption" : "Save caption"}
            </Button>
          )}
          {saved && !dirty && <span role="status" className="text-xs text-[var(--muted-foreground)]">Saved</span>}
        </div>
      )}
    </div>
  );
}

// ─── Deleting ────────────────────────────────────────────────────────────────

function DeletePhotoDialog({ photo, estate, onlyPhoto, busy, onCancel, onConfirm }: {
  photo: EstatePhoto;
  estate: PortalEstate;
  onlyPhoto: boolean;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // The server doesn't say whether this estate is exempt (listed before photos
  // were required), so a listed estate's last photo gets the warning either way.
  const listed = !!estate.eligibility?.published;
  return (
    <Dialog title="Delete this photo?" onClose={onCancel}>
      <img src={photo.url} alt={photo.caption ?? estate.name} className="w-full aspect-[4/3] object-cover rounded-md bg-[var(--muted)] mb-3" />
      <p className="text-sm text-[var(--foreground)] mb-3">
        This is permanent: the file is removed from storage and can't be restored.
        {photo.cover && !onlyPhoto ? " The next photo in order becomes the cover." : ""}
      </p>
      {onlyPhoto && listed && (
        <Alert className="mb-3">
          This is the estate's only photo. Unless it was listed before photos were required, it will leave the marketplace until a photo
          is added. It comes back by itself then, with nothing to republish.
        </Alert>
      )}
      {onlyPhoto && !listed && (
        <p className="text-xs text-[var(--muted-foreground)] mb-3">The estate needs at least one photo before it can be published.</p>
      )}
      <DialogActions onCancel={onCancel} onConfirm={onConfirm} confirmLabel="Delete photo" busy={busy} busyLabel="Deleting…" variant="danger" />
    </Dialog>
  );
}
