// Backend integration seam for estates. Components should call these functions
// (never import ESTATES from data/mockData directly) so the mock-mode branch
// here is the only place that needs to change once the real API exists.
// See INTEGRATION.md.

import { ESTATES, type Estate } from "../data/mockData";
import { apiClient } from "../lib/apiClient";

export async function fetchEstates(): Promise<Estate[]> {
  if (apiClient.isMockMode) return ESTATES;
  return apiClient.get<Estate[]>("/api/estates");
}

export async function fetchEstateById(id: string): Promise<Estate | undefined> {
  if (apiClient.isMockMode) return ESTATES.find((e) => e.id === id);
  try {
    return await apiClient.get<Estate>(`/api/estates/${id}`);
  } catch {
    return undefined;
  }
}
