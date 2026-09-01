// Backend integration seam for the document vault. See INTEGRATION.md.
// NOTE: the real backend serves documents from an S3/MinIO-backed vault with
// signed URLs — this mock-mode implementation only returns metadata, there's
// no actual file behind "Download".

import { DOCUMENTS, type Document } from "../data/mockData";
import { apiClient } from "../lib/apiClient";

export async function fetchDocuments(): Promise<Document[]> {
  if (apiClient.isMockMode) return DOCUMENTS;
  return apiClient.get<Document[]>("/api/documents");
}

export async function fetchDocumentsByPlotId(plotId: string): Promise<Document[]> {
  if (apiClient.isMockMode) return DOCUMENTS.filter((d) => d.plotId === plotId);
  return apiClient.get<Document[]>(`/api/portfolio/plots/${plotId}/documents`);
}
