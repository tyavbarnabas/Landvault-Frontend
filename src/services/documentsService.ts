// Backend integration seam for the document vault. See INTEGRATION.md.
// Live: receipts (issued when Paystack confirms a payment) and allocation
// letters (issued when the developer's finance verifies the sale). Documents
// are issued by the backend at the moment the event happens — a client never
// creates, voids or reissues one. The files are drawn on demand and need the
// bearer token, so they're fetched as blobs, never linked.

import { DOCUMENTS, type Document } from "../data/mockData";
import { apiClient, ApiError } from "../lib/apiClient";
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
// comes first, then the receipts, then the offer — keep that order.
export async function fetchDocumentsByPlotId(plotId: string): Promise<Document[]> {
  if (isMock("documents")) {
    // The offer belongs to the purchase (its transaction id) and comes last.
    const mine = mockDocuments.filter((d) => d.plotId === plotId || d.transactionId === plotId || (d.type === "offer_letter" && mockDocuments.some((o) => o.plotId === plotId && o.transactionId === d.transactionId)));
    return [...mine.filter((d) => d.type !== "offer_letter"), ...mine.filter((d) => d.type === "offer_letter")];
  }
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

// ─── Public verification ─────────────────────────────────────────────────────
// What the QR code opens. No login: anyone holding a copy can check it, so it
// deliberately carries no amount and no name — initials only.

export interface DocumentVerification {
  // refunded: the payment was later returned; still genuine. Offer letters
  // are issued (not accepted yet), accepted, or lapsed with their purchase.
  status: "valid" | "refunded" | "issued" | "accepted" | "lapsed";
  documentType: "receipt" | "allocation_letter" | "provisional_allocation_letter" | "offer_letter";
  number: string;
  issuedAt: string;
  issuedBy: string; // always "HomeTrue"
  developer: string | null;
  estate: string | null;
  location: string | null;
  plot: string | null;
  holderInitials: string | null;
  refundedAt: string | null;
}

/** A code as people type or paste it — dashes, spaces, lower case, even the
 * whole verify link — as the 16 characters the URL uses. */
export function normalizeVerifyCode(input: string): string {
  const trimmed = input.trim();
  const fromLink = /\/verify\/([^/?#\s]+)/i.exec(trimmed);
  return (fromLink ? fromLink[1] : trimmed).replace(/[\s-]/g, "").toUpperCase();
}

/** 404 NOT_A_HOMETRUE_DOCUMENT for an unknown or malformed code (one answer
 * for both); 429 when this connection has checked too many (30 a minute). */
export async function verifyDocument(code: string): Promise<DocumentVerification> {
  const normalized = normalizeVerifyCode(code);
  if (isMock("documents")) {
    const doc = mockDocuments.find((d) => normalizeVerifyCode(d.qrCode) === normalized);
    if (!doc || (doc.type !== "receipt" && doc.type !== "allocation_letter" && doc.type !== "provisional_allocation_letter" && doc.type !== "offer_letter")) {
      throw new ApiError(404, "This is not a HomeTrue document.", { code: "NOT_A_HOMETRUE_DOCUMENT" });
    }
    // Demo documents carry only a type, a date and a code — nothing else is shown.
    return {
      status: doc.type === "offer_letter" ? (doc.status === "accepted" || doc.status === "lapsed" ? doc.status : "issued") : doc.refundedAt ? "refunded" : "valid",
      documentType: doc.type, number: doc.number ?? doc.qrCode,
      issuedAt: doc.issuedAt ?? doc.date, issuedBy: "HomeTrue", developer: null, estate: null, location: null, plot: null,
      holderInitials: null, refundedAt: doc.refundedAt ?? null,
    };
  }
  return apiClient.get<DocumentVerification>(`/api/documents/verify/${encodeURIComponent(normalized)}`);
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

// Demo mode's accept route: the offer document's status, in the mock store.
export function updateMockDocument(id: string, patch: Partial<Document>): Document | null {
  let updated: Document | null = null;
  mockDocuments = mockDocuments.map((d) => (d.id === id ? (updated = { ...d, ...patch }) : d));
  return updated;
}
