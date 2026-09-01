import { useState, useEffect } from "react";
import type { Document } from "../../data/mockData";
import { fetchDocuments } from "../../services/documentsService";

const TYPE_LABELS: Record<string, string> = {
  receipt: "Receipt",
  offer_letter: "Offer Letter",
  allocation_letter: "Allocation Letter",
  deed_of_assignment: "Deed of Assignment",
  poa_draft: "POA Draft",
};

const TYPE_ICONS: Record<string, string> = {
  receipt: "🧾",
  offer_letter: "📝",
  allocation_letter: "📄",
  deed_of_assignment: "📜",
  poa_draft: "🔏",
};

export default function Vault() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [verifying, setVerifying] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDocuments().then((data) => { if (!cancelled) { setDocuments(data); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const types = ["all", ...Array.from(new Set(documents.map((d) => d.type)))];
  const filtered = filter === "all" ? documents : documents.filter((d) => d.type === filter);

  if (loading) return <div className="p-8 text-[var(--muted-foreground)] text-sm">Loading vault…</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">Document vault</h1>
        <p className="text-sm text-[var(--muted-foreground)]">All your receipts, letters, and deeds — each with a cryptographic QR code verifiable by third parties.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        {types.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors capitalize ${filter === t ? "bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]" : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
          >
            {t === "all" ? "All documents" : TYPE_LABELS[t] || t}
          </button>
        ))}
      </div>

      {/* Document list */}
      <div className="space-y-3">
        {filtered.map((doc) => (
          <div key={doc.id} className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-[var(--muted)] flex items-center justify-center text-xl shrink-0">
              {TYPE_ICONS[doc.type]}
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
              <button
                onClick={() => setVerifying(doc.id)}
                className="text-xs px-3 py-1.5 border border-[var(--border)] hover:border-[var(--accent)] text-[var(--muted-foreground)] hover:text-[var(--accent)] rounded-md transition-colors"
              >
                Verify QR
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* QR Verify Modal */}
      {verifying && (
        <QRVerifyModal
          doc={documents.find((d) => d.id === verifying)!}
          onClose={() => setVerifying(null)}
        />
      )}
    </div>
  );
}

function QRVerifyModal({ doc, onClose }: { doc: Document; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-6 max-w-sm w-full shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold">Document verification</h3>
          <button onClick={onClose} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-xl leading-none">×</button>
        </div>

        {/* Fake QR code */}
        <div className="w-32 h-32 mx-auto bg-[var(--foreground)] rounded-lg mb-4 grid grid-cols-8 gap-px p-2">
          {Array.from({ length: 64 }, (_, i) => (
            <div key={i} className={`rounded-sm ${Math.random() > 0.5 ? "bg-[var(--background)]" : "bg-[var(--foreground)]"}`} />
          ))}
        </div>

        <div className="text-center mb-4">
          <div className="text-xs font-mono-data text-[var(--muted-foreground)] mb-1">{doc.qrCode}</div>
        </div>

        <div className={`rounded-lg p-3 mb-4 flex items-start gap-2.5 ${doc.status === "valid" ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
          <span className="text-lg mt-0.5">{doc.status === "valid" ? "✅" : "❌"}</span>
          <div>
            <div className={`text-sm font-semibold ${doc.status === "valid" ? "text-emerald-900" : "text-red-900"}`}>
              {doc.status === "valid" ? "Document verified" : "Document invalid"}
            </div>
            <div className={`text-xs mt-0.5 ${doc.status === "valid" ? "text-emerald-700" : "text-red-700"}`}>
              {doc.status === "valid"
                ? "This document is authentic and has not been altered. Issued by LandVault Ltd."
                : "This document has been voided or superseded. Do not accept as valid."}
            </div>
          </div>
        </div>

        <div className="text-xs text-[var(--muted-foreground)] space-y-1">
          <div className="flex justify-between"><span>Document</span><span className="font-medium text-[var(--foreground)]">{TYPE_LABELS[doc.type] || doc.type}</span></div>
          <div className="flex justify-between"><span>Issued</span><span className="font-mono-data">{doc.date}</span></div>
          <div className="flex justify-between"><span>Status</span><span className={`capitalize font-medium ${doc.status === "valid" ? "text-emerald-700" : "text-red-600"}`}>{doc.status}</span></div>
        </div>

        <button onClick={onClose} className="mt-5 w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
          Close
        </button>
      </div>
    </div>
  );
}
