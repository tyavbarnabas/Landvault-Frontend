// The buyer's document vault — /documents. Live: the receipts HomeTrue issued
// when Paystack confirmed each payment, and the allocation letters issued when
// the developer's finance verified each sale, newest first.

import { useState } from "react";
import type { Document } from "../../data/mockData";
import { fetchDocuments } from "../../services/documentsService";
import { useFetch } from "../../lib/useFetch";
import DocumentCard, { DOCUMENT_TYPE_LABELS } from "../../components/documents/DocumentCard";
import LoadError from "../../components/LoadError";
import Page, { Loading } from "../../components/ui/Page";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import { ErrorText } from "../../components/ui/Field";

export default function Vault() {
  const first = useFetch(() => fetchDocuments(), []);
  // Pages loaded with "Load more", after the first.
  const [more, setMore] = useState<{ items: Document[]; cursor?: string; hasMore: boolean } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  if (first.loading && !first.data) return <Page title="Document vault"><Loading label="Loading your documents…" /></Page>;
  if (first.error) return <LoadError error={first.errorValue} what="your documents" onRetry={first.refetch} />;

  const documents = [...first.data!.items, ...(more?.items ?? [])];
  const cursor = more ? more.cursor : first.data!.cursor;
  const hasMore = more ? more.hasMore : first.data!.hasMore;

  const loadMore = async () => {
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await fetchDocuments({ cursor });
      setMore({ items: [...(more?.items ?? []), ...page.items], cursor: page.cursor, hasMore: page.hasMore });
    } catch (err) {
      setMoreError(err instanceof Error ? err.message : "Couldn't load more documents.");
    } finally {
      setLoadingMore(false);
    }
  };

  // The type filter applies to what's loaded so far — a vault with more than
  // one page may need "Load more" pressed before an older type appears.
  const types = ["all", ...Array.from(new Set(documents.map((d) => d.type)))];
  const filtered = filter === "all" ? documents : documents.filter((d) => d.type === filter);

  return (
    <Page
      title="Document vault"
      description="Your receipts and allocation letters, issued by HomeTrue. Each one carries a verification code anyone can check."
    >
      {documents.length === 0 ? (
        <EmptyState
          title="No documents yet"
          description="A receipt arrives as soon as your payment is confirmed, and your allocation letter once the developer verifies the sale."
        />
      ) : (
        <>
          {types.length > 2 && (
            <div className="flex flex-wrap gap-2 mb-6" role="group" aria-label="Filter by type">
              {types.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={filter === t}
                  onClick={() => setFilter(t)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${filter === t ? "bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]" : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
                >
                  {t === "all" ? "All documents" : DOCUMENT_TYPE_LABELS[t as Document["type"]] || t}
                </button>
              ))}
            </div>
          )}

          <ul className="space-y-3">
            {filtered.map((doc) => <DocumentCard key={doc.id} doc={doc} />)}
          </ul>

          {hasMore && (
            <div className="mt-4">
              <Button variant="secondary" fullWidth onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "Loading…" : "Load more"}
              </Button>
              {moreError && <ErrorText className="mt-2">{moreError}</ErrorText>}
            </div>
          )}
        </>
      )}
    </Page>
  );
}
