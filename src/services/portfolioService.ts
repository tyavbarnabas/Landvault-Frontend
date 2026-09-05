// Backend integration seam for owned plots, payments & installment
// schedules. See INTEGRATION.md.

import { OWNED_PLOTS, type Currency, type OwnedPlot, type PaymentRecord } from "../data/mockData";
import { apiClient } from "../lib/apiClient";

export type { PaymentRecord };

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

// Used when a marketplace checkout's finance verification lands (or rejects)
// — flips a pending-verification record to its final status without
// replacing the whole record. See marketplaceCheckoutService.ts.
export async function updateOwnedPlotStatus(id: string, status: OwnedPlot["status"], patch: Partial<OwnedPlot> = {}): Promise<OwnedPlot | undefined> {
  if (apiClient.isMockMode) {
    mockOwnedPlots = mockOwnedPlots.map((p) => (p.id === id ? { ...p, ...patch, status } : p));
    return mockOwnedPlots.find((p) => p.id === id);
  }
  return apiClient.put<OwnedPlot>(`/api/portfolio/plots/${id}`, { status, ...patch });
}

// ─── Installment schedule ───────────────────────────────────────────────────
//
// TODO (backend): a real schedule is Spring Boot-owned — varying period
// amounts, penalties, partial payments, and restructured terms all live
// server-side. This mock generates a plausible schedule ONCE per plot (from
// the plot's own installmentMonths/installmentsPaid/paidAmount/arrears) and
// then mutates it in place as payments verify, rather than ever re-deriving
// dates/amounts in a component.

export interface InstallmentPeriod {
  id: string;
  sequence: number; // 1-based
  dueDate: string;
  amount: number; // this period's own amount — never assumed equal across periods
  currency: Currency;
  status: "paid" | "pending_verification" | "due_soon" | "due_today" | "overdue" | "upcoming";
  paidAmount?: number; // supports partial payment
  penaltyAmount?: number;
  penaltyReason?: string;
  receiptId?: string;
}

export interface InstallmentSchedule {
  plotId: string;
  periods: InstallmentPeriod[];
}

function classifyDueDate(dueDate: string): "due_soon" | "due_today" | "overdue" | "upcoming" {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate); due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (diffDays < 0) return "overdue";
  if (diffDays === 0) return "due_today";
  if (diffDays <= 7) return "due_soon";
  return "upcoming";
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split("T")[0];
}

function generateSchedule(plot: OwnedPlot): InstallmentSchedule | undefined {
  if (plot.plan === "outright" || !plot.installmentMonths) return undefined;

  const paid = plot.installmentsPaid ?? 0;
  const total = plot.installmentMonths;
  const remaining = plot.totalPrice - (plot.payments.find((p) => p.type === "deposit")?.amount ?? plot.totalPrice * 0.2);
  const perPeriodAmount = plot.nextDueAmount ?? Math.round(remaining / total);

  const periods: InstallmentPeriod[] = [];
  const confirmedInstallments = plot.payments.filter((p) => p.type === "installment" && p.status === "confirmed");

  for (let seq = 1; seq <= total; seq++) {
    if (seq <= paid) {
      const record = confirmedInstallments[seq - 1];
      periods.push({
        id: `${plot.id}-period-${seq}`,
        sequence: seq,
        dueDate: record?.date ?? addMonths(plot.acquiredDate, seq),
        amount: record?.amount ?? perPeriodAmount,
        currency: plot.currency,
        status: "paid",
        paidAmount: record?.amount ?? perPeriodAmount,
        receiptId: record?.receiptId,
      });
      continue;
    }

    const dueDate = plot.nextDueDate && seq === paid + 1 ? plot.nextDueDate : addMonths(plot.nextDueDate ?? plot.acquiredDate, seq - paid - 1);
    const isTheOverdueOne = plot.status === "in_arrears" && seq === paid + 1;
    periods.push({
      id: `${plot.id}-period-${seq}`,
      sequence: seq,
      dueDate,
      amount: seq === paid + 1 ? perPeriodAmount : perPeriodAmount,
      currency: plot.currency,
      status: isTheOverdueOne ? "overdue" : classifyDueDate(dueDate),
      penaltyAmount: isTheOverdueOne ? plot.arrears?.penaltyAmount : undefined,
      penaltyReason: isTheOverdueOne ? plot.arrears?.penaltyReason : undefined,
    });
  }

  return { plotId: plot.id, periods };
}

const scheduleCache = new Map<string, InstallmentSchedule>();

export async function fetchInstallmentSchedule(plotId: string): Promise<InstallmentSchedule | undefined> {
  if (!apiClient.isMockMode) {
    try { return await apiClient.get<InstallmentSchedule>(`/api/portfolio/plots/${plotId}/schedule`); } catch { return undefined; }
  }
  if (scheduleCache.has(plotId)) return scheduleCache.get(plotId);
  const plot = mockOwnedPlots.find((p) => p.id === plotId);
  if (!plot) return undefined;
  const schedule = generateSchedule(plot);
  if (schedule) scheduleCache.set(plotId, schedule);
  return schedule;
}

// ─── Two-step installment payment (mirrors marketplaceCheckoutService.ts) ──
//
// CRITICAL: a payment is never marked "confirmed" — and paidAmount,
// installmentsPaid, and the schedule period are never advanced — until
// verifyInstallmentPayment reports finance has actually verified it. The
// gateway webhook (submitInstallmentPayment) only proves the charge landed.

export interface SubmitInstallmentPaymentInput {
  plotId: string;
  periodId?: string;
  amount: number;
  currency: Currency;
  method: string;
}

// Demo-only rejection trigger (same convention as kycService.ts's
// DEMO_REJECT_NIN) — paying exactly this amount exercises the rejected path.
const DEMO_REJECT_AMOUNT = 1;

export async function submitInstallmentPayment(input: SubmitInstallmentPaymentInput): Promise<PaymentRecord> {
  if (!apiClient.isMockMode) return apiClient.post<PaymentRecord>(`/api/portfolio/plots/${input.plotId}/payments`, input);

  await new Promise((resolve) => setTimeout(resolve, 1000)); // gateway webhook

  const payment: PaymentRecord = {
    id: `p-${Date.now()}`,
    date: new Date().toISOString().split("T")[0],
    amount: input.amount,
    currency: input.currency,
    type: "installment",
    status: "pending_verification",
    receiptId: `RCP-${Date.now()}`,
  };

  mockOwnedPlots = mockOwnedPlots.map((p) => (p.id === input.plotId ? { ...p, payments: [...p.payments, payment] } : p));

  const schedule = scheduleCache.get(input.plotId);
  const period = schedule?.periods.find((pr) => pr.id === input.periodId) ?? schedule?.periods.find((pr) => pr.status === "overdue" || pr.status === "due_soon" || pr.status === "due_today");
  if (period) period.status = "pending_verification";

  return payment;
}

export interface VerifyInstallmentPaymentResult {
  payment: PaymentRecord;
  plot: OwnedPlot;
}

export async function verifyInstallmentPayment(plotId: string, paymentId: string): Promise<VerifyInstallmentPaymentResult> {
  if (!apiClient.isMockMode) return apiClient.post<VerifyInstallmentPaymentResult>(`/api/portfolio/plots/${plotId}/payments/${paymentId}/verify`);

  await new Promise((resolve) => setTimeout(resolve, 2000)); // Finance Officer review

  const plot = mockOwnedPlots.find((p) => p.id === plotId);
  if (!plot) throw new Error("Plot not found.");
  const payment = plot.payments.find((p) => p.id === paymentId);
  if (!payment) throw new Error("Payment not found.");

  const rejected = payment.amount === DEMO_REJECT_AMOUNT;
  const schedule = scheduleCache.get(plotId);
  const period = schedule?.periods.find((pr) => pr.status === "pending_verification");

  if (rejected) {
    payment.status = "rejected";
    payment.rejectionReason = "The payment gateway flagged this transaction for manual review and it could not be verified. No funds were lost — please try again or contact support with your reference.";
    if (period) period.status = period.dueDate < new Date().toISOString().split("T")[0] ? "overdue" : "due_soon";
    return { payment, plot };
  }

  payment.status = "confirmed";
  payment.verifiedAt = new Date().toISOString();

  const wasInArrears = plot.status === "in_arrears";
  plot.paidAmount += payment.amount;
  plot.installmentsPaid = (plot.installmentsPaid ?? 0) + 1;

  if (period) {
    period.status = "paid";
    period.paidAmount = payment.amount;
    period.receiptId = payment.receiptId;
  }

  // Advance to the next period's due date, and clear arrears if this payment
  // resolved the overdue one.
  const nextPeriod = schedule?.periods.find((pr) => pr.sequence === (period?.sequence ?? 0) + 1);
  plot.nextDueDate = nextPeriod?.dueDate;
  plot.nextDueAmount = nextPeriod?.amount;
  if (wasInArrears) {
    plot.status = plot.paidAmount >= plot.totalPrice ? "completed" : "installment_active";
    plot.arrears = undefined;
  } else if (plot.paidAmount >= plot.totalPrice) {
    plot.status = "completed";
  }

  return { payment, plot };
}

// Request restructuring (extend term / adjust amounts) — approval logic
// lives in the developer portal, not built in this repo yet.
export async function requestRestructure(plotId: string, note: string): Promise<OwnedPlot | undefined> {
  if (!apiClient.isMockMode) {
    // TODO (backend): POST to the developer portal's restructuring queue
    // (DP-* story, not yet built) once it exists.
    return apiClient.post<OwnedPlot>(`/api/portfolio/plots/${plotId}/restructure-requests`, { note });
  }
  void note;
  return updateOwnedPlotStatus(plotId, "in_arrears", { restructureStatus: "pending" });
}
