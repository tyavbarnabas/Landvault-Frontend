// Backend integration seam for support disputes/tickets. See INTEGRATION.md.
// The live-chat panel on the Support page stays local component state — it's
// a scripted demo bot, not real backend data, so there's nothing to migrate
// there until a real chat/messaging backend exists.

import { apiClient } from "../lib/apiClient";

export interface DisputeTicket {
  id: string;
  plotId: string;
  subject: string;
  category: string;
  description: string;
  status: "open" | "in_review" | "resolved";
  createdAt: string;
}

export interface CreateDisputeInput {
  plotId: string;
  subject: string;
  category: string;
  description: string;
}

const MOCK_TICKETS: DisputeTicket[] = [
  {
    id: "DSP-001",
    plotId: "op-001",
    subject: "Installment payment not reflected",
    category: "payment",
    description: "I made a bank transfer on 2 Aug 2026 but it hasn't appeared in my payment history.",
    status: "in_review",
    createdAt: "2026-08-05",
  },
];

// In-memory mock store so a submitted dispute stays visible for the rest of
// the session, even without a backend.
let mockTickets: DisputeTicket[] = [...MOCK_TICKETS];

export async function fetchDisputes(): Promise<DisputeTicket[]> {
  if (apiClient.isMockMode) return mockTickets;
  return apiClient.get<DisputeTicket[]>("/api/disputes");
}

export async function createDispute(input: CreateDisputeInput): Promise<DisputeTicket> {
  if (apiClient.isMockMode) {
    const ticket: DisputeTicket = {
      id: `DSP-${String(mockTickets.length + 1).padStart(3, "0")}`,
      plotId: input.plotId,
      subject: input.subject,
      category: input.category,
      description: input.description,
      status: "open",
      createdAt: new Date().toISOString().split("T")[0],
    };
    mockTickets = [ticket, ...mockTickets];
    return ticket;
  }
  return apiClient.post<DisputeTicket>("/api/disputes", input);
}
