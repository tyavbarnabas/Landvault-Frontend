import { useState, useEffect } from "react";
import type { Document } from "../../data/mockData";
import { fetchDocuments } from "../../services/documentsService";
import DocumentCard, { DOCUMENT_TYPE_LABELS } from "../../components/documents/DocumentCard";
import QRVerifyModal from "../../components/documents/QRVerifyModal";

export default function Vault() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [verifying, setVerifying] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDocuments().then((page) => {
      if (cancelled) return;
      setDocuments(page.items);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    const page = await fetchDocuments({ cursor });
    setDocuments((prev) => [...prev, ...page.items]);
    setCursor(page.cursor);
    setHasMore(page.hasMore);
    setLoadingMore(false);
  };

  // Type filter applies to what's loaded so far, same trade-off as the rest
  // of this pass's "Load more" lists — a vault with more documents than one
  // page holds may need "Load more" pressed before an older type appears.
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

      {hasMore && (
        <button onClick={loadMore} disabled={loadingMore} className="mt-4 w-full py-2.5 border border-[var(--border)] rounded-md text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors disabled:opacity-60">
          {loadingMore ? "Loading…" : "Load more"}
        </button>
      )}

      {verifying && (
        <QRVerifyModal doc={documents.find((d) => d.id === verifying)!} onClose={() => setVerifying(null)} />
      )}
    </div>
  );
}
