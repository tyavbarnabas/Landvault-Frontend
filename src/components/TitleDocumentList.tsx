// A title's private documents, for the developer's title page and HomeTrue's
// review. Each "View" fetches a fresh short-lived link and opens it; the link
// is never kept, because a stored one would stop working within minutes.

import { useState } from "react";
import { DOCUMENT_KINDS, type TitleDocument } from "../services/estateTitleService";
import Button from "./ui/Button";
import { ErrorText } from "./ui/Field";

export function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
}

export function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function TitleDocumentList({ documents, open }: { documents: TitleDocument[]; open: (fileId: string) => Promise<{ url: string }> }) {
  const [error, setError] = useState("");
  const [opening, setOpening] = useState<string | null>(null);

  const view = async (fileId: string) => {
    setError("");
    setOpening(fileId);
    // Opened before the await so the browser doesn't treat it as a pop-up.
    const tab = window.open("", "_blank");
    try {
      const link = await open(fileId);
      if (tab) tab.location.href = link.url;
      else window.location.href = link.url;
    } catch (err) {
      tab?.close();
      setError(err instanceof Error ? err.message : "The document couldn't be opened.");
    } finally {
      setOpening(null);
    }
  };

  if (documents.length === 0) {
    return <p className="text-sm text-[var(--muted-foreground)]">No documents on file. This title was recorded before documents were required.</p>;
  }
  return (
    <div>
      <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">Documents</h3>
      <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-md">
        {DOCUMENT_KINDS.map(({ kind, label }) => {
          const doc = documents.find((d) => d.kind === kind);
          if (!doc) return null;
          return (
            <li key={kind} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
              <span className="font-medium text-[var(--foreground)]">{label}</span>
              <span className="text-xs text-[var(--muted-foreground)] truncate max-w-[14rem]">{doc.fileName} · {formatSize(doc.sizeBytes)}</span>
              <Button variant="link" className="ml-auto" disabled={opening === doc.fileId} onClick={() => view(doc.fileId)} aria-label={`View ${label}`}>
                {opening === doc.fileId ? "Opening…" : "View"}
              </Button>
            </li>
          );
        })}
      </ul>
      {error && <ErrorText className="mt-2">{error}</ErrorText>}
    </div>
  );
}

