// DEV ONLY (/admin/dev/storage): tries src/lib/uploadFile.ts end to end
// against the backend's dev storage routes, which need the backend's dev
// profile and a Super Admin. Not a feature: estate photos will be the first
// real upload screen. Run this page from http://localhost:8443 — the bucket's
// CORS allows only FRONTEND_ORIGIN.

import { useRef, useState } from "react";
import { DEV_MAX_BYTES, devDeleteFile, devDownloadLink, devUpload, type DevVisibility } from "../../services/devStorageService";
import { acceptAttribute, isPublicFile, type StoredFile } from "../../lib/uploadFile";
import { isLive } from "../../lib/backends";
import Page from "../../components/ui/Page";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import Alert from "../../components/ui/Alert";
import { ErrorText } from "../../components/ui/Field";

export default function StorageTest() {
  const [visibility, setVisibility] = useState<DevVisibility>("PRIVATE");
  const [progress, setProgress] = useState<number | null>(null);
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  if (!import.meta.env.DEV) return null;
  if (!isLive("devStorage")) {
    return <Page title="Storage test" width="lg"><Alert>Needs a backend: set VITE_API_BASE_URL and run the backend with the dev profile.</Alert></Page>;
  }

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setError("");
    setProgress(0);
    try {
      const stored = await devUpload(file, visibility, { onProgress: setProgress });
      setFiles((all) => [stored, ...all]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The upload didn't go through.");
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  };

  // A fresh 5-minute link each time — never kept.
  const open = async (file: StoredFile) => {
    try {
      window.open(isPublicFile(file) && file.publicUrl ? file.publicUrl : (await devDownloadLink(file.id)).url, "_blank", "noopener");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't get a link.");
    }
  };

  const remove = async (file: StoredFile) => {
    try {
      await devDeleteFile(file.id);
      setFiles((all) => all.filter((f) => f.id !== file.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete it.");
    }
  };

  return (
    <Page title="Storage test" width="lg" eyebrow="Dev only"
      description={`Request → PUT to storage → confirm, through the dev routes. JPG, PNG, WebP or PDF, up to ${DEV_MAX_BYTES / 1024 / 1024} MB.`}>
      <Card className="space-y-4 mb-6">
        <fieldset className="flex gap-4 text-sm">
          <legend className="text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Visibility</legend>
          {(["PRIVATE", "PUBLIC"] as const).map((v) => (
            <label key={v} className="flex items-center gap-2">
              <input type="radio" name="visibility" checked={visibility === v} onChange={() => setVisibility(v)} /> {v.toLowerCase()}
            </label>
          ))}
        </fieldset>
        <input ref={input} type="file" accept={acceptAttribute()} disabled={progress !== null} onChange={(e) => upload(e.target.files?.[0])}
          aria-label="Choose a file to upload" className="text-sm" />
        {progress !== null && (
          <div role="status" className="text-xs text-[var(--muted-foreground)]">
            Uploading… {Math.round(progress * 100)}%
            <div className="h-1.5 mt-1 rounded-full bg-[var(--muted)] overflow-hidden">
              <div className="h-full bg-[var(--primary)]" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
        )}
        {error && <ErrorText>{error}</ErrorText>}
      </Card>

      <ul className="space-y-3">
        {files.map((f) => (
          <Card as="li" padding="md" key={f.id} className="flex flex-wrap items-center gap-3 text-sm">
            <div className="flex-1 min-w-[200px]">
              <div className="font-semibold">{f.fileName}</div>
              <div className="text-xs text-[var(--muted-foreground)] font-mono-data">{f.fileType.toLowerCase()} · {f.visibility.toLowerCase()} · {f.sizeBytes} bytes · {f.status}</div>
            </div>
            <Button variant="link" onClick={() => open(f)}>Open</Button>
            <Button variant="linkDanger" onClick={() => remove(f)}>Delete</Button>
          </Card>
        ))}
      </ul>
    </Page>
  );
}
