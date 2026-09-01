// Backend integration seam for owned plots & payments. See INTEGRATION.md.

import { OWNED_PLOTS, type OwnedPlot, type Payment } from "../data/mockData";
import { apiClient } from "../lib/apiClient";

// In-memory mock store so a mock payment updates paidAmount/payments for the
// rest of the session, even without a backend.
let mockOwnedPlots: OwnedPlot[] = [...OWNED_PLOTS];

export async function fetchOwnedPlots(): Promise<OwnedPlot[]> {
  if (apiClient.isMockMode) return mockOwnedPlots;
  return apiClient.get<OwnedPlot[]>("/api/portfolio/plots");
}

export async function fetchOwnedPlotById(id: string): Promise<OwnedPlot | undefined> {
  if (apiClient.isMockMode) return mockOwnedPlots.find((p) => p.id === id);
  try {
    return await apiClient.get<OwnedPlot>(`/api/portfolio/plots/${id}`);
  } catch {
    return undefined;
  }
}

// Used when a checkout completes — turns a fresh purchase into a real owned-plot
// record in the mock store, rather than just a cosmetic "success" screen.
export async function addOwnedPlot(plot: OwnedPlot): Promise<OwnedPlot> {
  if (apiClient.isMockMode) {
    mockOwnedPlots = [plot, ...mockOwnedPlots];
    return plot;
  }
  return apiClient.post<OwnedPlot>("/api/portfolio/plots", plot);
}

export async function recordPayment(plotId: string, amount: number): Promise<Payment> {
  if (apiClient.isMockMode) {
    const payment: Payment = {
      id: `p-${Date.now()}`,
      date: new Date().toISOString().split("T")[0],
      amount,
      currency: "NGN",
      type: "installment",
      status: "confirmed",
      receiptId: `RCP-${Date.now()}`,
    };
    mockOwnedPlots = mockOwnedPlots.map((p) =>
      p.id === plotId ? { ...p, paidAmount: p.paidAmount + amount, payments: [...p.payments, payment] } : p
    );
    return payment;
  }
  return apiClient.post<Payment>(`/api/portfolio/plots/${plotId}/payments`, { amount });
}
