// Backend integration seam for checkout & payment. See INTEGRATION.md.
//
// IMPORTANT: this models the *shape* of a real gateway integration (reserve →
// initiate payment → confirm) so wiring in a real Paystack/Opay/wire flow
// later means filling in these three functions — it does NOT itself talk to
// any real payment gateway. There are no real credentials or webhook handling
// here; mock mode simulates the same outcomes the UI already assumed.

import { getPlotBlockLabel, type Currency, type Estate, type OwnedPlot, type PaymentPlan, type Plot } from "../data/mockData";
import { apiClient } from "../lib/apiClient";
import { addOwnedPlot } from "./portfolioService";

export type PaymentMethod = "paystack" | "wire" | "virtual";

export interface ReservationResult {
  reservationId: string;
  expiresInSeconds: number;
}

// A real backend would take out a short-lived lock (the architecture doc
// specs Redis for this) so two buyers can't reserve the same plot at once.
export async function reservePlot(estateId: string, plotId: string): Promise<ReservationResult> {
  if (apiClient.isMockMode) {
    return { reservationId: `res-${Date.now()}`, expiresInSeconds: 2700 }; // 45 min
  }
  return apiClient.post<ReservationResult>("/api/checkout/reserve", { estateId, plotId });
}

export interface InitiatePaymentInput {
  reservationId: string;
  amount: number;
  currency: Currency;
  method: PaymentMethod;
}

export interface VirtualAccountDetails {
  bankName: string;
  accountNumber: string;
  accountName: string;
}

export interface InitiatePaymentResult {
  paymentId: string;
  /** paystack: redirect the buyer to redirectUrl. virtual/wire: show the returned account details and wait for confirmation. */
  status: "requires_redirect" | "requires_transfer";
  redirectUrl?: string;
  account?: VirtualAccountDetails;
}

export async function initiatePayment(input: InitiatePaymentInput): Promise<InitiatePaymentResult> {
  if (apiClient.isMockMode) {
    const paymentId = `pay-${Date.now()}`;
    if (input.method === "paystack") {
      // A real integration redirects the buyer to Paystack's hosted checkout
      // here, then the backend confirms via webhook/verify after they return.
      return { paymentId, status: "requires_redirect", redirectUrl: "https://checkout.paystack.com/mock" };
    }
    return {
      paymentId,
      status: "requires_transfer",
      account: {
        bankName: "Providus Bank",
        accountNumber: "5901 2847 3301",
        accountName: `LandVault — ${input.reservationId} Escrow`,
      },
    };
  }
  return apiClient.post<InitiatePaymentResult>("/api/checkout/payments", input);
}

// Polls/confirms a payment's outcome. In mock mode this simulates the gateway
// (or bank transfer) settling successfully after a short delay — same delay
// the UI previously hardcoded, just moved behind the service boundary.
export async function confirmPayment(paymentId: string): Promise<{ confirmed: boolean }> {
  if (apiClient.isMockMode) {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    return { confirmed: true };
  }
  return apiClient.get<{ confirmed: boolean }>(`/api/checkout/payments/${paymentId}`);
}

export interface FinalizePurchaseInput {
  estate: Estate;
  plot: Plot;
  intent: "development" | "investment";
  plan: PaymentPlan;
  installmentMonths: number;
  depositAmount: number;
  currency: Currency;
}

// Turns a confirmed payment into a real owned-plot record, same as a backend
// would after its webhook/verify step succeeds.
export async function finalizePurchase(input: FinalizePurchaseInput): Promise<OwnedPlot> {
  const { estate, plot, intent, plan, installmentMonths, depositAmount, currency } = input;
  const isOutright = plan === "outright";
  const remaining = plot.price - depositAmount;
  const installmentAmount = !isOutright && installmentMonths > 0 ? remaining / installmentMonths : undefined;

  const ownedPlot: OwnedPlot = {
    id: `op-${Date.now()}`,
    estateId: estate.id,
    plotId: plot.id,
    plotLabel: getPlotBlockLabel(estate, plot).label,
    estate: estate.name,
    location: estate.location,
    sqm: plot.sqm,
    intent,
    plan,
    totalPrice: plot.price,
    paidAmount: depositAmount,
    currency,
    acquiredDate: new Date().toISOString().split("T")[0],
    status: isOutright ? "completed" : "active",
    nextDueDate: isOutright ? undefined : addDays(30),
    nextDueAmount: isOutright ? undefined : installmentAmount,
    installmentMonths: isOutright ? undefined : installmentMonths,
    installmentsPaid: isOutright ? undefined : 0,
    payments: [
      {
        id: `p-${Date.now()}`,
        date: new Date().toISOString().split("T")[0],
        amount: depositAmount,
        currency,
        type: isOutright ? "outright" : "deposit",
        status: "confirmed",
        receiptId: `RCP-${Date.now()}`,
      },
    ],
  };

  return addOwnedPlot(ownedPlot);
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0];
}
