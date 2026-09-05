import { useState, useEffect } from "react";
import type { Document } from "../../data/mockData";
import { fetchDocuments } from "../../services/documentsService";
import DocumentCard, { DOCUMENT_TYPE_LABELS } from "../../components/documents/DocumentCard";
import QRVerifyModal from "../../components/documents/QRVerifyModal";

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
            {t === "all" ? "All documents" : DOCUMENT_TYPE_LABELS[t as Document["type"]] || t}
          </button>
        ))}
      </div>

      {/* Document list */}
      <div className="space-y-3">
        {filtered.map((doc) => (
          <DocumentCard key={doc.id} doc={doc} onVerify={() => setVerifying(doc.id)} />
        ))}
      </div>

      {verifying && (
        <QRVerifyModal doc={documents.find((d) => d.id === verifying)!} onClose={() => setVerifying(null)} />
      )}
    </div>
  );
}
