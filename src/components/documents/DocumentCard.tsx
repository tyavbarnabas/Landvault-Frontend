// A document's pieces — type, plot, downloads — shared by the vault (table on
// desktop, cards on a phone, from the Figma "Vault — Proposed") and the plot
// page's documents tab. Live documents come with their files (PDF, and every
// page stacked into one JPEG for WhatsApp); the demo ones have none, so they
// show no buttons.

import { useState } from "react";
import { Link } from "react-router-dom";
import type { Document } from "../../data/mockData";
import { formatDay } from "../../lib/formatDate";
import Badge from "../ui/Badge";
import { canShareFiles, fetchDocumentFile, saveFile, shareFile, type DocumentFormat } from "../../services/documentsService";
import { DownloadIcon, FileCheckIcon, FileTextIcon, ImageIcon, ReceiptIcon, ShareIcon, ShieldCheckIcon } from "../icons";

export const DOCUMENT_TYPE_LABELS: Record<Document["type"], string> = {
  receipt: "Payment receipt",
  offer_letter: "Offer letter",
  allocation_letter: "Allocation letter",
  deed_of_assignment: "Deed of assignment",
  poa_draft: "POA draft",
};

export function DocTypeIcon({ type, size = 18 }: { type: Document["type"]; size?: number }) {
  if (type === "receipt") return <ReceiptIcon size={size} />;
  if (type === "allocation_letter") return <FileCheckIcon size={size} />;
  return <FileTextIcon size={size} />;
}

export function DocTypeChip({ type, size = "md" }: { type: Document["type"]; size?: "sm" | "md" }) {
  return (
    <span className={`shrink-0 flex items-center justify-center rounded-lg bg-[var(--secondary)] text-[var(--secondary-foreground)] ${size === "sm" ? "w-8 h-8" : "w-9 h-9"}`}>
      <DocTypeIcon type={type} size={size === "sm" ? 16 : 18} />
    </span>
  );
}

// The code without its dashes — the form the verify page's URL uses.
export function verifyPath(qrCode: string): string {
  return `/verify/${qrCode.replace(/-/g, "")}`;
}

// What the document is about. The backend titles every document
// "<Type> <number> — <plot>, <estate>"; the part after the dash is the plot.
export function plotLine(doc: Pick<Document, "title">): string | null {
  const i = doc.title.indexOf(" — ");
  return i >= 0 ? doc.title.slice(i + 3) : null;
}

// The portfolio entry it belongs to: the transaction id opens it live (it
// keeps working after finance verifies); demo documents carry the plot id.
export function plotHref(doc: Pick<Document, "transactionId" | "plotId">): string | null {
  const id = doc.transactionId ?? doc.plotId;
  return id ? `/portfolio/${id}` : null;
}

export function DocStatus({ doc }: { doc: Document }) {
  if (doc.status !== "valid") return <Badge label={doc.status === "void" ? "Void" : "Superseded"} variant="error" />;
  return <Badge label="Valid" variant="success" />;
}

export function VerifyLink({ code, short }: { code: string; short?: boolean }) {
  return (
    <Link to={verifyPath(code)} className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline">
      <ShieldCheckIcon size={13} />{short ? "Check" : "Check it's genuine"}
    </Link>
  );
}

// Downloads (and the share sheet) with the bearer token — never a plain link.
export function DocumentActions({ doc, share, stretch }: { doc: Document; share?: boolean; stretch?: boolean }) {
  const [busy, setBusy] = useState<DocumentFormat | "share" | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!doc.pdfUrl || !doc.number) return null;

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
  const btn = `inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50 ${stretch ? "flex-1" : ""}`;
  return (
    <div className={stretch ? "w-full" : ""}>
      <div className={`flex gap-2 ${stretch ? "" : "justify-end"}`}>
        <button type="button" className={btn} disabled={busy !== null} onClick={() => run("pdf")} aria-label={`Download ${doc.number} as PDF`}>
          <DownloadIcon size={14} />{busy === "pdf" ? "…" : "PDF"}
        </button>
        {doc.jpegUrl && (
          <button type="button" className={btn} disabled={busy !== null} onClick={() => run("jpeg")} aria-label={`Download ${doc.number} as an image`}>
            <ImageIcon size={14} />{busy === "jpeg" ? "…" : "Image"}
          </button>
        )}
        {share && doc.jpegUrl && canShareFiles() && (
          <button type="button" className={btn} disabled={busy !== null} onClick={() => run("share")} aria-label={`Share ${doc.number}`}>
            <ShareIcon size={14} />{busy === "share" ? "…" : "Share"}
          </button>
        )}
      </div>
      {error && <p role="alert" className="text-xs text-[var(--error-text)] mt-1.5">{error}</p>}
    </div>
  );
}

// One document as a card: the phone vault and the plot page's documents tab.
export default function DocumentCard({ doc }: { doc: Document }) {
  const plot = plotLine(doc);
  const href = plotHref(doc);
  return (
    <li className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <DocTypeChip type={doc.type} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[var(--foreground)]">{DOCUMENT_TYPE_LABELS[doc.type]}</div>
          {doc.number && <div className="text-xs font-mono-data text-[var(--muted-foreground)]">{doc.number}</div>}
        </div>
        <DocStatus doc={doc} />
      </div>
      <div className="space-y-1">
        {plot ? (
          href ? <Link to={href} className="block text-sm text-[var(--foreground)] hover:underline">{plot}</Link> : <div className="text-sm text-[var(--foreground)]">{plot}</div>
        ) : (
          <div className="text-sm text-[var(--foreground)]">{doc.title}</div>
        )}
        <div className="text-xs text-[var(--muted-foreground)]">
          Issued {formatDay(doc.date)}
          {/* The money did arrive, so the receipt stays valid — a note, not an error. */}
          {doc.refundedAt && ` · Refunded ${formatDay(doc.refundedAt)}`}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono-data text-xs text-[var(--foreground)]">{doc.qrCode}</span>
          <VerifyLink code={doc.qrCode} short />
        </div>
      </div>
      <DocumentActions doc={doc} share stretch />
    </li>
  );
}
