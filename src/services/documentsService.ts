// Backend integration seam for the document vault. See INTEGRATION.md.
// NOTE: the real backend serves documents from an S3/MinIO-backed vault with
// signed URLs — this mock-mode implementation only returns metadata, there's
// no actual file behind "Download".

import { DOCUMENTS, type Document } from "../data/mockData";
import { apiClient } from "../lib/apiClient";
import { paginateMock, type Page, type PageParams } from "../lib/pagination";

// In-memory mock store so documents issued during a session (e.g. by the
// marketplace checkout flow — see marketplaceCheckoutService.ts) show up
// here and in Vault.tsx/PlotView.tsx, same idiom as portfolioService.ts.
let mockDocuments: Document[] = [...DOCUMENTS];

// Sorted newest-first before paginating — a stable order pagination can
// actually page through, rather than trusting insertion order.
export async function fetchDocuments(params: PageParams = {}): Promise<Page<Document>> {
  if (apiClient.isMockMode) {
    const sorted = [...mockDocuments].sort((a, b) => (a.date < b.date ? 1 : -1));
    return paginateMock(sorted, params);
  }
  return apiClient.get<Page<Document>>(`/api/documents?${new URLSearchParams(params as Record<string, string>)}`);
}

export async function fetchDocumentsByPlotId(plotId: string): Promise<Document[]> {
  if (apiClient.isMockMode) return mockDocuments.filter((d) => d.plotId === plotId);
  return apiClient.get<Document[]>(`/api/portfolio/plots/${plotId}/documents`);
}

// Used when a resale's title transfer executes — the seller's old deed is
// never deleted, just flagged void in place (its own record, its own history)
// while the new deed issued to the buyer carries `supersedes` pointing back
// to it. See resaleService.ts's executeTitleTransfer.
export async function voidDocument(id: string): Promise<void> {
  if (apiClient.isMockMode) {
    mockDocuments = mockDocuments.map((d) => (d.id === id ? { ...d, status: "void" } : d));
    return;
  }
  await apiClient.post(`/api/documents/${id}/void`);
}

// Used when a checkout's finance verification completes — issues the
// document set atomically alongside allocation (see the atomicity TODO in
// marketplaceCheckoutService.ts).
export async function addDocuments(docs: Document[]): Promise<Document[]> {
  if (apiClient.isMockMode) {
    mockDocuments = [...docs, ...mockDocuments];
    return docs;
  }
  return apiClient.post<Document[]>("/api/documents", docs);
}
