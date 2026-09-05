// Reusable document row — extracted from what used to be duplicated between
// Vault.tsx and PlotView.tsx's documents tab. Part 8 deliverable. Centralizes
// the type labels/icons so a new document type only needs to be added here.

import type { Document } from "../../data/mockData";

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

interface DocumentCardProps {
  doc: Document;
  onVerify?: () => void;
}

export default function DocumentCard({ doc, onVerify }: DocumentCardProps) {
  return (
    <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg bg-[var(--muted)] flex items-center justify-center text-xl shrink-0">
        {DOCUMENT_TYPE_ICONS[doc.type]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm text-[var(--foreground)] mb-0.5">{doc.title}</div>
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs text-[var(--muted-foreground)] font-mono-data">{doc.date}</span>
          <span className="text-[var(--muted-foreground)]">·</span>
          <span className="text-xs text-[var(--muted-foreground)]">{doc.size}</span>
          <span className="text-[var(--muted-foreground)]">·</span>
          <span className={`text-xs font-medium ${doc.status === "valid" ? "text-emerald-700" : "text-red-600"}`}>
            {doc.status === "valid" ? "✓ Valid" : "✗ " + doc.status}
          </span>
        </div>
        <div className="text-xs text-[var(--muted-foreground)] font-mono-data mt-0.5">QR: {doc.qrCode}</div>
      </div>
      <div className="flex flex-col gap-2 shrink-0">
        <button className="text-xs px-3 py-1.5 bg-[var(--muted)] hover:bg-[var(--secondary)] text-[var(--foreground)] rounded-md transition-colors">
          ↓ Download
        </button>
        {onVerify && (
          <button onClick={onVerify} className="text-xs px-3 py-1.5 border border-[var(--border)] hover:border-[var(--accent)] text-[var(--muted-foreground)] hover:text-[var(--accent)] rounded-md transition-colors">
            Verify QR
          </button>
        )}
      </div>
    </div>
  );
}
