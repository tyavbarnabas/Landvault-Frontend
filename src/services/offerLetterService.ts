// The developer's offer letter (backend changeset 098). The backend issues it
// when a buyer opens a purchase ("Get my offer letter"), before any money, on
// the developer's letterhead with HomeTrue's fixed wording. The buyer accepts
// it before paying; acceptance is recorded with who, when and the browser.
// It gives no right to the plot and doesn't extend the 45-minute hold.
//
// Never build or send the letter's content from the browser — it is drawn by
// the backend from what the developer declared and HomeTrue approved.
//
//   GET  /api/documents/offer-letters/{id}          Document
//   GET  /api/documents/offer-letters/{id}/pdf      the letter
//   GET  /api/documents/offer-letters/{id}/jpeg     every page stacked, for sharing
//   POST /api/documents/offer-letters/{id}/accept   200 Document (safe to retry)

import type { Document } from "../data/mockData";
import { apiClient, ApiError } from "../lib/apiClient";
import { isMock } from "../lib/backends";
import { updateMockDocument, type DocumentFormat } from "./documentsService";
import { mockTransactionStore, type OfferSummary, type TransactionStatus } from "./marketplaceCheckoutService";

export type OfferState = "waiting" | "accepted" | "lapsed";

// Where an offer stands, from its purchase: one that was abandoned or
// rejected has lapsed — history, whether or not it was accepted.
export function offerState(offer: Pick<OfferSummary, "acceptedAt">, purchaseStatus: TransactionStatus): OfferState {
  if (purchaseStatus === "abandoned" || purchaseStatus === "rejected") return "lapsed";
  return offer.acceptedAt ? "accepted" : "waiting";
}

export async function acceptOffer(offerId: string): Promise<Document> {
  if (!isMock("checkout")) return apiClient.post<Document>(`/api/documents/offer-letters/${encodeURIComponent(offerId)}/accept`);
  const txn = [...mockTransactionStore().values()].find((t) => t.offer?.id === offerId);
  if (!txn?.offer) throw new ApiError(404, "Document not found.", { code: "DOCUMENT_NOT_FOUND" });
  if (txn.status !== "pending_payment") throw new ApiError(409, "This purchase is no longer waiting for payment.", { code: "OFFER_NOT_OPEN" });
  txn.offer.acceptedAt ??= new Date().toISOString();
  const doc = updateMockDocument(offerId, { status: "accepted", acceptedAt: txn.offer.acceptedAt });
  return doc ?? { id: offerId, type: "offer_letter", title: `Offer letter ${txn.offer.number}`, date: txn.offer.issuedAt, status: "accepted", acceptedAt: txn.offer.acceptedAt, qrCode: "", size: null, number: txn.offer.number };
}

// Demo documents have no file behind them.
export function offerHasFile(): boolean {
  return !isMock("checkout");
}

export async function fetchOfferFile(offer: Pick<OfferSummary, "id" | "number">, format: DocumentFormat): Promise<File> {
  const blob = await apiClient.getBlob(`/api/documents/offer-letters/${encodeURIComponent(offer.id)}/${format}`);
  const ext = format === "pdf" ? "pdf" : "jpg";
  return new File([blob], `HomeTrue-${offer.number}.${ext}`, { type: format === "pdf" ? "application/pdf" : "image/jpeg" });
}

export function offerErrorCode(err: unknown): string | undefined {
  return err instanceof ApiError ? err.body?.code : undefined;
}
