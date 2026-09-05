// Backend integration seam for co-ownership syndicates. See INTEGRATION.md.

import { apiClient } from "../lib/apiClient";

export interface SyndicateMember {
  id: string;
  name: string;
  email: string;
  pct: number;
  contributed: number;
  status: "joined" | "invited" | "pending";
}

export interface Syndicate {
  id: string;
  name: string;
  estateId: string;
  plotLabel: string;
  sqm: number;
  totalPrice: number;
  members: SyndicateMember[];
  status: "forming" | "active" | "completed";
  plotId: string;
}

export interface CreateSyndicateInput {
  name: string;
  estateId: string;
  plotId: string;
  plotLabel: string;
  sqm: number;
  totalPrice: number;
  ownerPct: number;
  invitedMembers: { email: string; pct: number }[];
}

const MOCK_SYNDICATES: Syndicate[] = [
  {
    id: "syn-001",
    name: "Abuja Diaspora Group",
    estateId: "peaceland",
    plotLabel: "Block E, Plot 3",
    sqm: 500,
    totalPrice: 65_000_000,
    plotId: "5-6",
    status: "active",
    members: [
      { id: "m1", name: "Emeka Okonkwo", email: "emeka@example.com", pct: 40, contributed: 26_000_000, status: "joined" },
      { id: "m2", name: "Ngozi Eze", email: "ngozi@example.com", pct: 35, contributed: 22_750_000, status: "joined" },
      { id: "m3", name: "Chidi Nwachukwu", email: "chidi@example.com", pct: 25, contributed: 16_250_000, status: "invited" },
    ],
  },
];

// In-memory mock store so a created syndicate shows up in the list and its
// own dashboard for the rest of the session, even without a backend.
let mockSyndicates: Syndicate[] = [...MOCK_SYNDICATES];

export async function fetchSyndicates(): Promise<Syndicate[]> {
  if (apiClient.isMockMode) return mockSyndicates;
  return apiClient.get<Syndicate[]>("/api/syndicates");
}

export async function fetchSyndicateById(id: string): Promise<Syndicate | undefined> {
  if (apiClient.isMockMode) return mockSyndicates.find((s) => s.id === id);
  try {
    return await apiClient.get<Syndicate>(`/api/syndicates/${id}`);
  } catch {
    return undefined;
  }
}

export async function createSyndicate(input: CreateSyndicateInput): Promise<Syndicate> {
  if (apiClient.isMockMode) {
    const syndicate: Syndicate = {
      id: `syn-${Date.now()}`,
      name: input.name,
      estateId: input.estateId,
      plotId: input.plotId,
      plotLabel: input.plotLabel,
      sqm: input.sqm,
      totalPrice: input.totalPrice,
      status: "forming",
      members: [
        { id: "me", name: "You", email: "", pct: input.ownerPct, contributed: 0, status: "joined" },
        ...input.invitedMembers.map((m, i) => ({
          id: `invite-${i}`,
          name: m.email,
          email: m.email,
          pct: m.pct,
          contributed: 0,
          status: "invited" as const,
        })),
      ],
    };
    mockSyndicates = [syndicate, ...mockSyndicates];
    return syndicate;
  }
  return apiClient.post<Syndicate>("/api/syndicates", input);
}
