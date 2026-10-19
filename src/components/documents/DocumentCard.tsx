// Reusable document row — shared by Vault.tsx and PlotView.tsx's documents
// tab. Centralizes the type labels/icons so a new document type only needs to
// be added here. Live documents come with their files (PDF, and the same pages
// as one JPEG for WhatsApp); the demo ones have none, so they show no buttons.

import { useState } from "react";
import { Link } from "react-router-dom";
import type { Document } from "../../data/mockData";
import { ListCard } from "../ui/Card";
import Button from "../ui/Button";
import { ErrorText } from "../ui/Field";
import { formatDay } from "../../lib/formatDate";
import { canShareFiles, fetchDocumentFile, saveFile, shareFile, type DocumentFormat } from "../../services/documentsService";

export const DOCUMENT_TYPE_LABELS: Record<Document["type"], string> = {
  receipt: "Receipt",
  offer_letter: "Offer Letter",
  allocation_letter: "Allocation Letter",
  deed_of_assignment: "Deed of Assignment",
  poa_draft: "POA Draft",
};

export const DOCUMENT_TYPE_ICONS: Record<Document["type"], string> = {
  receipt: "🧾",
  offer_letter: "📝",
  allocation_letter: "📄",
  deed_of_assignment: "📜",
  poa_draft: "🔏",
};

// The printed code without its dashes — the form the verify page's URL uses.
export function verifyPath(qrCode: string): string {
  return `/verify/${qrCode.replace(/-/g, "")}`;
}

interface DocumentCardProps {
  doc: Document;
}

export default function DocumentCard({ doc }: DocumentCardProps) {
  const [busy, setBusy] = useState<DocumentFormat | "share" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasFiles = !!doc.pdfUrl && !!doc.number;

  const run = async (kind: DocumentFormat | "share") => {
    setBusy(kind);
    setError(null);
    try {
      const file = await fetchDocumentFile(doc, kind === "share" ? "jpeg" : kind);
      if (kind === "share") await shareFile(file, doc.title);
      else saveFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The download didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <ListCard density="compact" className="flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex items-start gap-4 flex-1 min-w-0">
        <div className="w-10 h-10 rounded-lg bg-[var(--muted)] flex items-center justify-center text-xl shrink-0" aria-hidden="true">
          {DOCUMENT_TYPE_ICONS[doc.type]}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm text-[var(--foreground)] mb-0.5">{doc.title}</div>
          <div className="flex flex-wrap gap-x-2 gap-y-0.5 items-center text-xs text-[var(--muted-foreground)]">
            {doc.number && <span className="font-mono-data">{doc.number}</span>}
            {doc.number && <span aria-hidden="true">·</span>}
            <span>Issued {formatDay(doc.date)}</span>
            {doc.size && <><span aria-hidden="true">·</span><span>{doc.size}</span></>}
            {doc.status !== "valid" && <><span aria-hidden="true">·</span><span className="font-medium text-[var(--error-text)] capitalize">{doc.status}</span></>}
          </div>
          <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
            Verification code <span className="font-mono-data text-[var(--foreground)]">{doc.qrCode}</span>
            {" · "}
            <Link to={verifyPath(doc.qrCode)} className="text-[var(--accent)] hover:underline">Check it's genuine</Link>
          </div>
          {/* The money did arrive, so the receipt stays valid — this is a note, not an error. */}
          {doc.refundedAt && (
            <div className="text-xs text-[var(--muted-foreground)] mt-1">Refunded on {formatDay(doc.refundedAt)}. The receipt still shows the payment was made.</div>
          )}
          {error && <ErrorText className="mt-1">{error}</ErrorText>}
        </div>
      </div>
      {hasFiles && (
        <div className="flex flex-wrap sm:flex-col gap-2 shrink-0">
          <Button variant="secondary" onClick={() => run("pdf")} disabled={busy !== null}>
            {busy === "pdf" ? "Downloading…" : "Download PDF"}
          </Button>
          {doc.jpegUrl && (
            <Button variant="secondary" onClick={() => run("jpeg")} disabled={busy !== null}>
              {busy === "jpeg" ? "Downloading…" : "Download image"}
            </Button>
          )}
          {doc.jpegUrl && canShareFiles() && (
            <Button variant="secondary" onClick={() => run("share")} disabled={busy !== null}>
              {busy === "share" ? "Opening…" : "Share"}
            </Button>
          )}
        </div>
      )}
    </ListCard>
  );
}
