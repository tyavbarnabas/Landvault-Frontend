// Backend integration seam for the document vault. See INTEGRATION.md.
// Live: receipts (issued when Paystack confirms a payment) and allocation
// letters (issued when the developer's finance verifies the sale). Documents
// are issued by the backend at the moment the event happens — a client never
// creates, voids or reissues one. The files are drawn on demand and need the
// bearer token, so they're fetched as blobs, never linked.

import { DOCUMENTS, type Document } from "../data/mockData";
import { apiClient } from "../lib/apiClient";
import { isMock } from "../lib/backends";
import { paginateMock, type Page, type PageParams } from "../lib/pagination";

// In-memory mock store so documents issued during a session (e.g. by the
// marketplace checkout flow — see marketplaceCheckoutService.ts) show up
// here and in Vault.tsx/PlotView.tsx, same idiom as portfolioService.ts.
let mockDocuments: Document[] = [...DOCUMENTS];

function query(params: PageParams): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

// Newest first. Mock: sorted before paginating, so pages are stable.
export async function fetchDocuments(params: PageParams = {}): Promise<Page<Document>> {
  if (isMock("documents")) {
    const sorted = [...mockDocuments].sort((a, b) => (a.date < b.date ? 1 : -1));
    return paginateMock(sorted, params);
  }
  return apiClient.get<Page<Document>>(`/api/documents${query(params)}`);
}

// One portfolio entry's documents: the owned-plot id or the transaction id
// (the same ids /api/portfolio/plots/{id} takes). Live, the allocation letter
// comes first, then the receipts — keep that order.
export async function fetchDocumentsByPlotId(plotId: string): Promise<Document[]> {
  if (isMock("documents")) return mockDocuments.filter((d) => d.plotId === plotId);
  return apiClient.get<Document[]>(`/api/portfolio/plots/${plotId}/documents`);
}

export type DocumentFormat = "pdf" | "jpeg";

// Named the way the server names its attachments (HomeTrue-<number>.pdf). The
// server's Content-Disposition isn't exposed to the browser across origins.
function fileName(number: string, format: DocumentFormat): string {
  return `HomeTrue-${number}.${format === "pdf" ? "pdf" : "jpg"}`;
}

/** The document's file, ready to save or share. */
export async function fetchDocumentFile(doc: Document, format: DocumentFormat): Promise<File> {
  const path = format === "pdf" ? doc.pdfUrl : doc.jpegUrl;
  if (!path || !doc.number) throw new Error("This document has no file to download.");
  const blob = await apiClient.getBlob(path);
  return new File([blob], fileName(doc.number, format), { type: format === "pdf" ? "application/pdf" : "image/jpeg" });
}

/** A receipt named by a purchase's payment (`receiptId`, `receiptNumber`). */
export async function fetchReceiptFile(receiptId: string, receiptNumber: string): Promise<File> {
  const blob = await apiClient.getBlob(`/api/documents/receipts/${receiptId}/pdf`);
  return new File([blob], fileName(receiptNumber, "pdf"), { type: "application/pdf" });
}

/** Saves a file the browser holds — the download a plain link can't do with a token. */
export function saveFile(file: File): void {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the download a moment to start before the URL goes.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** True where the share sheet takes files (phones, mostly) — WhatsApp and the like. */
export function canShareFiles(): boolean {
  if (typeof navigator === "undefined" || !navigator.canShare) return false;
  try {
    return navigator.canShare({ files: [new File([""], "x.jpg", { type: "image/jpeg" })] });
  } catch {
    return false;
  }
}

/** Opens the share sheet; resolves false if the person closed it. */
export async function shareFile(file: File, title: string): Promise<boolean> {
  try {
    await navigator.share({ files: [file], title });
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return false;
    throw err;
  }
}

// ─── Mock only ───────────────────────────────────────────────────────────────
// The demo resale, upgrade and checkout flows issue and void documents in the
// mock store. The backend has no route for either and never will: it issues
// documents itself, and a reissue will be a new document pointing at the old
// one. These touch the mock store only, whatever the backend mode.

// Used when a resale's title transfer executes — the seller's old deed is
// never deleted, just flagged void in place (its own record, its own history)
// while the new deed issued to the buyer carries `supersedes` pointing back
// to it. See resaleService.ts's executeTitleTransfer.
export async function voidDocument(id: string): Promise<void> {
  mockDocuments = mockDocuments.map((d) => (d.id === id ? { ...d, status: "void" } : d));
}

// Used when a mock checkout's finance verification completes — issues the
// document set alongside allocation (see marketplaceCheckoutService.ts).
export async function addDocuments(docs: Document[]): Promise<Document[]> {
  mockDocuments = [...docs, ...mockDocuments];
  return docs;
}
