// Backend integration seam for owned plots, payments & installment
// schedules. See INTEGRATION.md.
//
// Live (GET /api/portfolio/plots, /plots/{id}, /summary): every plot the
// buyer owns, plus paid purchases finance hasn't verified yet (their id is
// the transaction id). Only outright purchases exist on the backend today, so
// live mode never calls the installment, payment or restructure routes, and a
// client never creates or changes ownership: only finance verification does.

import { OWNED_PLOTS, type Currency, type OwnedPlot, type PaymentRecord } from "../data/mockData";
import { apiClient, ApiError } from "../lib/apiClient";
import { isMock } from "../lib/backends";
import { paginateMock, type Page, type PageParams } from "../lib/pagination";

export type { PaymentRecord };

// In-memory mock store so a mock payment updates paidAmount/payments for the
// rest of the session, even without a backend.
let mockOwnedPlots: OwnedPlot[] = [...OWNED_PLOTS];

// Lower = more urgent. Arrears first, then anything due within a week, then
// ordinary in-progress plans, then anything already settled last. Lives here
// (not in Portfolio.tsx, which re-exports it) so fetchOwnedPlots' own
// `sort: "urgency"` can apply it server-side, before pagination — sorting
// only the plots already loaded into a page would silently break ordering
// once a second page arrives.
export function urgencyRank(plot: OwnedPlot): number {
  if (plot.status === "in_arrears") return 0;
  if (plot.nextDueDate) {
    const daysUntilDue = Math.round((new Date(plot.nextDueDate).getTime() - Date.now()) / 86_400_000);
    if (daysUntilDue <= 7) return 1;
  }
  if (plot.status === "completed") return 3;
  return 2;
}

export interface FetchOwnedPlotsParams extends PageParams {
  sort?: "urgency";
}

// The backend sends null for "not set"; this app's optional fields mean the
// same with undefined (`nextDueAmount !== undefined` and the like).
type Nullable<T> = { [K in keyof T]: T[K] | null };
type OwnedPlotDto = Nullable<OwnedPlot>;

function fromOwnedPlotDto(dto: OwnedPlotDto): OwnedPlot {
  const u = <T,>(v: T | null | undefined): T | undefined => v ?? undefined;
  return {
    ...(dto as OwnedPlot),
    sqm: dto.sqm ?? null,
    acquiredDate: dto.acquiredDate ?? null,
    titleStatus: dto.titleStatus ?? null,
    titleType: u(dto.titleType),
    actualSqm: u(dto.actualSqm),
    cornerPremiumPct: u(dto.cornerPremiumPct),
    basePrice: u(dto.basePrice),
    transactionId: u(dto.transactionId),
    nextDueDate: u(dto.nextDueDate),
    nextDueAmount: u(dto.nextDueAmount),
    installmentMonths: u(dto.installmentMonths),
    installmentsPaid: u(dto.installmentsPaid),
    arrears: u(dto.arrears),
    restructureStatus: u(dto.restructureStatus),
    supersedes: u(dto.supersedes),
    payments: (dto.payments ?? []).map((p) => ({ ...p, rejectionReason: u(p.rejectionReason), verifiedAt: u(p.verifiedAt) })),
  };
}

export async function fetchOwnedPlots(params: FetchOwnedPlotsParams = {}): Promise<Page<OwnedPlot>> {
  if (isMock("portfolio")) {
    const source = params.sort === "urgency" ? [...mockOwnedPlots].sort((a, b) => urgencyRank(a) - urgencyRank(b)) : mockOwnedPlots;
    return paginateMock(source, params);
  }
  const query = new URLSearchParams();
  if (params.sort) query.set("sort", params.sort);
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.limit) query.set("limit", String(Math.min(params.limit, PORTFOLIO_MAX_PAGE)));
  const page = await apiClient.get<Page<OwnedPlotDto> & { cursor?: string | null }>(`/api/portfolio/plots?${query}`);
  return { ...page, items: page.items.map(fromOwnedPlotDto), cursor: page.cursor ?? undefined };
}

// "250 sqm", or null for a built unit with no land area of its own. Never
// falls back to actualSqm: that is the surveyed area, shown on its own.
export function sizeText(plot: Pick<OwnedPlot, "sqm">): string | null {
  return plot.sqm === null ? null : `${plot.sqm} sqm`;
}

// The backend's largest page.
export const PORTFOLIO_MAX_PAGE = 100;

// A plot's id, or the transaction id of the purchase it came from (that link
// keeps working after finance verifies it). Undefined when it isn't this
// buyer's plot; anything else is a real failure and throws.
export async function fetchOwnedPlotById(id: string): Promise<OwnedPlot | undefined> {
  if (isMock("portfolio")) return mockOwnedPlots.find((p) => p.id === id || p.transactionId === id);
  try {
    return fromOwnedPlotDto(await apiClient.get<OwnedPlotDto>(`/api/portfolio/plots/${encodeURIComponent(id)}`));
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || (err.status === 400 && err.body?.code === "INVALID_PARAMETER"))) return undefined;
    throw err;
  }
}

// ─── Totals ─────────────────────────────────────────────────────────────────
//
// Computed by the server over every plot, not the loaded page. One entry per
// currency, never summed across currencies. Only plots still owned count
// (transferred and superseded records are history), and paid purchases
// awaiting finance are counted separately, not in the totals.

export interface CurrencyTotals {
  currency: Currency;
  totalValue: number;
  totalPaid: number;
  count: number;
}

export interface PortfolioSummary {
  byCurrency: CurrencyTotals[];
  awaitingVerification: number;
}

export async function fetchPortfolioSummary(): Promise<PortfolioSummary> {
  if (!isMock("portfolio")) return apiClient.get<PortfolioSummary>("/api/portfolio/summary");
  return summarize(mockOwnedPlots);
}

// Mock mode's /summary, by the backend's rules.
export function summarize(plots: OwnedPlot[]): PortfolioSummary {
  const byCurrency = new Map<Currency, CurrencyTotals>();
  let awaitingVerification = 0;
  for (const p of plots) {
    if (p.status === "transferred" || p.status === "superseded") continue;
    if (p.status === "pending_verification") { awaitingVerification += 1; continue; }
    const g = byCurrency.get(p.currency) ?? { currency: p.currency, totalValue: 0, totalPaid: 0, count: 0 };
    g.totalValue += p.totalPrice;
    g.totalPaid += p.paidAmount;
    g.count += 1;
    byCurrency.set(p.currency, g);
  }
  return { byCurrency: [...byCurrency.values()], awaitingVerification };
}

// Installment plans, their payments and restructuring exist only in mock
// mode: the backend sells outright today. Live, their controls stay hidden
// and these calls never reach the network.
export function installmentsAvailable(): boolean {
  return isMock("portfolio");
}

function notOnBackend(what: string): never {
  throw new Error(`${what} isn't available yet.`);
}

// Used when a checkout completes — turns a fresh purchase into a real owned-plot
// record in the mock store, rather than just a cosmetic "success" screen.
// Mock only: live, a client can't create ownership; finance verification does.
export async function addOwnedPlot(plot: OwnedPlot): Promise<OwnedPlot> {
  if (!isMock("portfolio")) notOnBackend("Recording a plot from the browser");
  mockOwnedPlots = [plot, ...mockOwnedPlots];
  return plot;
}

// Used when a marketplace checkout's finance verification lands (or rejects)
// — flips a pending-verification record to its final status without
// replacing the whole record. See marketplaceCheckoutService.ts.
// Mock only, like addOwnedPlot.
export async function updateOwnedPlotStatus(id: string, status: OwnedPlot["status"], patch: Partial<OwnedPlot> = {}): Promise<OwnedPlot | undefined> {
  if (!isMock("portfolio")) notOnBackend("Changing a plot's status from the browser");
  mockOwnedPlots = mockOwnedPlots.map((p) => (p.id === id ? { ...p, ...patch, status } : p));
  return mockOwnedPlots.find((p) => p.id === id);
}

// Demo mode: a plan payment Paystack confirmed, on the record awaiting finance.
export async function recordOwnedPayment(id: string, payment: PaymentRecord): Promise<void> {
  if (!isMock("portfolio")) notOnBackend("Recording a payment from the browser");
  mockOwnedPlots = mockOwnedPlots.map((p) => (p.id === id ? { ...p, payments: [...p.payments, payment] } : p));
}

// Demo mode: finance verified what was paid, so every pending payment on the
// record is confirmed.
export async function confirmOwnedPayments(id: string): Promise<void> {
  if (!isMock("portfolio")) notOnBackend("Changing a payment from the browser");
  const at = new Date().toISOString();
  mockOwnedPlots = mockOwnedPlots.map((p) => (p.id === id
    ? { ...p, payments: p.payments.map((pay) => (pay.status === "pending_verification" ? { ...pay, status: "confirmed", verifiedAt: at } : pay)) }
    : p));
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
        dueDate: record?.date ?? addMonths(plot.acquiredDate ?? plot.payments[0]?.date ?? new Date().toISOString(), seq),
        amount: record?.amount ?? perPeriodAmount,
        currency: plot.currency,
        status: "paid",
        paidAmount: record?.amount ?? perPeriodAmount,
        receiptId: record?.receiptId ?? undefined,
      });
      continue;
    }

    const dueDate = plot.nextDueDate && seq === paid + 1 ? plot.nextDueDate : addMonths(plot.nextDueDate ?? plot.acquiredDate ?? new Date().toISOString(), seq - paid - 1);
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
  // Live: every plot is outright today, so there is no schedule to ask for.
  if (!installmentsAvailable()) return undefined;
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
  if (!installmentsAvailable()) notOnBackend("Paying an installment");

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
  if (!installmentsAvailable()) notOnBackend("Paying an installment");

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
    period.receiptId = payment.receiptId ?? undefined;
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
  if (!installmentsAvailable()) notOnBackend("Restructuring");
  void note;
  return updateOwnedPlotStatus(plotId, "in_arrears", { restructureStatus: "pending" });
}
