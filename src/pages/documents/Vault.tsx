// The buyer's document vault — /documents. Redesigned from the Figma "Vault —
// Proposed": a summary, type tabs and search, then one table of documents on
// a wide screen (cards on a phone). Live: the receipts HomeTrue issued when
// Paystack confirmed each payment, and the allocation letters issued when the
// developer's finance verified each sale, newest first.

import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Document } from "../../data/mockData";
import { fetchDocuments } from "../../services/documentsService";
import { useFetch } from "../../lib/useFetch";
import DocumentCard, { plotLine } from "../../components/documents/DocumentCard";
import DocumentTable from "../../components/documents/DocumentTable";
import LoadError from "../../components/LoadError";
import Page, { Loading } from "../../components/ui/Page";
import Button from "../../components/ui/Button";
import EmptyState from "../../components/ui/EmptyState";
import { ErrorText } from "../../components/ui/Field";
import { FileCheckIcon, InfoIcon, ReceiptIcon, SearchIcon, ShieldCheckIcon } from "../../components/icons";

type Tab = "all" | "receipt" | "allocation_letter";

// A buyer has a handful of documents: one page of the API's maximum (100)
// holds them all, so the counts below are the whole vault. "Load more" is
// there for anyone with more.
const PAGE = 100;

export default function Vault() {
  const first = useFetch(() => fetchDocuments({ limit: PAGE }), []);
  const [more, setMore] = useState<{ items: Document[]; cursor?: string; hasMore: boolean } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");

  const documents = useMemo(() => [...(first.data?.items ?? []), ...(more?.items ?? [])], [first.data, more]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter((d) => (tab === "all" || d.type === tab) && (!q || [d.number, d.title, d.qrCode, plotLine(d)].some((s) => s?.toLowerCase().includes(q))));
  }, [documents, tab, query]);

  if (first.loading && !first.data) return <Page title="Document vault"><Loading label="Loading your documents…" /></Page>;
  if (first.error) return <LoadError error={first.errorValue} what="your documents" onRetry={first.refetch} />;

  const cursor = more ? more.cursor : first.data!.cursor;
  const hasMore = more ? more.hasMore : first.data!.hasMore;
  const loadMore = async () => {
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await fetchDocuments({ cursor, limit: PAGE });
      setMore({ items: [...(more?.items ?? []), ...page.items], cursor: page.cursor, hasMore: page.hasMore });
    } catch (err) {
      setMoreError(err instanceof Error ? err.message : "Couldn't load more documents.");
    } finally {
      setLoadingMore(false);
    }
  };

  const receipts = documents.filter((d) => d.type === "receipt").length;
  const letters = documents.filter((d) => d.type === "allocation_letter").length;
  const refunded = documents.filter((d) => d.refundedAt).length;
  const TABS: { id: Tab; label: string; count: number }[] = [
    { id: "all", label: "All", count: documents.length },
    { id: "receipt", label: "Receipts", count: receipts },
    { id: "allocation_letter", label: "Allocation letters", count: letters },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="font-display text-[26px] sm:text-3xl text-[var(--foreground)]">Document vault</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1 hidden sm:block">Receipts and allocation letters HomeTrue issued for your purchases.</p>
        </div>
        <Link to="/verify" className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md border border-[var(--border)] bg-[var(--card)] text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]">
          <ShieldCheckIcon />Check a document
        </Link>
      </div>

      {documents.length === 0 ? (
        <EmptyState
          title="No documents yet"
          description="A receipt arrives as soon as your payment is confirmed, and your allocation letter once the developer verifies the sale."
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:gap-4 mb-6">
            <Stat icon={<ReceiptIcon size={20} />} count={receipts} label="Receipts" sub="Issued when Paystack confirms a payment" />
            <Stat icon={<FileCheckIcon size={20} />} count={letters} label="Allocation letters" short="Letters" sub="Issued when the developer verifies a sale" />
            <Stat icon={<InfoIcon size={20} />} count={refunded} label="Refunded" sub="The receipt stays valid; the money was returned" />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex self-start overflow-x-auto max-w-full rounded-full bg-[var(--muted)] p-[3px]" role="tablist" aria-label="Document type">
              {TABS.map((t) => {
                const on = tab === t.id;
                return (
                  <button key={t.id} type="button" role="tab" aria-selected={on} onClick={() => setTab(t.id)}
                    className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm whitespace-nowrap ${on ? "bg-[var(--card)] font-semibold text-[var(--foreground)] shadow-sm" : "font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}>
                    {t.label}<span className="font-mono-data text-xs text-[var(--muted-foreground)]">{t.count}</span>
                  </button>
                );
              })}
            </div>
            <label className="flex items-center gap-2 sm:w-80 px-3 py-2 rounded-md border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]">
              <SearchIcon />
              <span className="sr-only">Search documents</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by number or plot" className="flex-1 min-w-0 bg-transparent text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]" />
            </label>
          </div>

          {shown.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)] py-10 text-center">No documents match{query ? ` "${query}"` : ""}.</p>
          ) : (
            <>
              <div className="hidden md:block"><DocumentTable documents={shown} /></div>
              <ul className="md:hidden space-y-3">{shown.map((doc) => <DocumentCard key={doc.id} doc={doc} />)}</ul>
            </>
          )}

          {hasMore && (
            <div className="mt-4">
              <Button variant="secondary" fullWidth onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more"}</Button>
              {moreError && <ErrorText className="mt-2">{moreError}</ErrorText>}
            </div>
          )}

          <p className="flex items-center gap-2 text-xs text-[var(--muted-foreground)] mt-5">
            <InfoIcon size={14} />Every document carries a verification code. Anyone can check it on HomeTrue's verify page — no account needed.
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ icon, count, label, short, sub }: { icon: React.ReactNode; count: number; label: string; short?: string; sub: string }) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl px-3 py-2.5 sm:px-5 sm:py-4 flex items-center gap-3.5">
      <span className="hidden sm:flex w-10 h-10 shrink-0 items-center justify-center rounded-[10px] bg-[var(--secondary)] text-[var(--secondary-foreground)]">{icon}</span>
      <div className="min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-2">
          <span className="font-mono-data font-medium text-lg sm:text-[22px] text-[var(--foreground)]">{count}</span>
          <span className="text-xs sm:text-sm text-[var(--muted-foreground)] sm:font-semibold sm:text-[var(--foreground)]">
            <span className="sm:hidden">{short ?? label}</span><span className="hidden sm:inline">{label}</span>
          </span>
        </div>
        <p className="hidden sm:block text-xs text-[var(--muted-foreground)]">{sub}</p>
      </div>
    </div>
  );
}
