// The company's payout bank account (portal.settlement.manage — Executive
// Directors, company-wide). LandVault pays sale proceeds into the APPROVED
// account only. A new one is `pending` until a LandVault Super Admin approves
// it; until then payouts keep going to the approved one.
//
// There's no name field: LandVault asks the bank whose account it is and shows
// the answer, so a director can spot a wrong number before anyone approves it.

import { apiClient } from "../lib/apiClient";
import { isMock } from "../lib/backends";
import type { Bank } from "./paymentsService";
import type { SettlementAccountStatus } from "./paymentTypes";

export interface SettlementAccount {
  id: string;
  bankCode: string;
  bankName: string;
  accountNumber: string;
  // What the BANK says the account is called.
  accountName: string;
  currency: string;
  status: SettlementAccountStatus;
  submittedAt: string;
  decidedAt: string | null;
  // A Super Admin's reason, e.g. on a rejection.
  decisionNote: string | null;
}

export interface CompanySettlement {
  approved: SettlementAccount | null;
  pending: SettlementAccount | null;
  history: SettlementAccount[];
}

export async function fetchCompanySettlement(): Promise<CompanySettlement> {
  if (!isMock("settlement")) return apiClient.get<CompanySettlement>("/api/portal/settlement/account");
  return { approved: mock.find((a) => a.status === "approved") ?? null, pending: mock.find((a) => a.status === "pending") ?? null, history: [...mock] };
}

export async function fetchSettlementBanks(): Promise<Bank[]> {
  if (!isMock("settlement")) return apiClient.get<Bank[]>("/api/portal/settlement/banks");
  return MOCK_BANKS;
}

// 201: saved as `pending`; every Executive Director is emailed.
export async function submitSettlementAccount(account: { bankCode: string; accountNumber: string }): Promise<SettlementAccount> {
  if (!isMock("settlement")) return apiClient.post<SettlementAccount>("/api/portal/settlement/account", account);
  if (mock.some((a) => a.status === "pending")) throw mockError("SETTLEMENT_ACCOUNT_PENDING", "An account is already waiting for approval. Withdraw it first.");
  const current = mock.find((a) => a.status === "approved");
  if (current && current.bankCode === account.bankCode && current.accountNumber === account.accountNumber) {
    throw mockError("SETTLEMENT_ACCOUNT_UNCHANGED", "That's already your approved payout account.");
  }
  const bank = MOCK_BANKS.find((b) => b.code === account.bankCode);
  if (!bank) throw mockError("UNKNOWN_BANK", "We don't recognise that bank.");
  const created: SettlementAccount = {
    id: `sa-${Date.now()}`, bankCode: bank.code, bankName: bank.name, accountNumber: account.accountNumber,
    accountName: "ESTINTIN GROUP LIMITED", currency: "NGN", status: "pending", submittedAt: new Date().toISOString(), decidedAt: null, decisionNote: null,
  };
  mock.unshift(created);
  return { ...created };
}

export async function withdrawSettlementAccount(id: string): Promise<SettlementAccount> {
  if (!isMock("settlement")) return apiClient.post<SettlementAccount>(`/api/portal/settlement/account/${id}/withdraw`);
  const account = mock.find((a) => a.id === id);
  if (!account) throw mockError("SETTLEMENT_ACCOUNT_NOT_FOUND", "We couldn't find that account.");
  if (account.status !== "pending") throw mockError("SETTLEMENT_ACCOUNT_NOT_PENDING", "Only an account waiting for approval can be withdrawn.");
  account.status = "withdrawn";
  account.decidedAt = new Date().toISOString();
  return { ...account };
}

// ─── Super Admin review (admin.payouts.manage) ───────────────────────────────
//
// A submitted account beside what's known about the company. The two checks
// are WARNINGS, never blockers — a person decides.

export interface SettlementAccountReview {
  tenantId: string;
  registeredName: string | null;
  tradingName: string | null;
  account: SettlementAccount;
  // False: the bank's name for the account doesn't match the company's.
  nameMatchesCompany: boolean;
  // The account declared at onboarding, if any.
  onboardingBankName: string | null;
  onboardingAccountNumber: string | null;
  onboardingAccountName: string | null;
  // Null when nothing was declared at onboarding — then nothing to compare.
  matchesOnboardingAccount: boolean | null;
  // What payouts go to today; approving replaces it (it becomes `superseded`).
  currentApproved: SettlementAccount | null;
}

export type ReviewFilter = "pending" | "all";

// Pending: oldest first (first come, first reviewed). All: newest first.
export async function fetchSettlementReviews(status: ReviewFilter = "pending"): Promise<SettlementAccountReview[]> {
  if (!isMock("settlement")) return apiClient.get<SettlementAccountReview[]>(`/api/admin/settlement-accounts?status=${status}`);
  return mockReviews().filter((r) => status === "all" || r.account.status === "pending");
}

// Registers the account with Paystack; the company's previous one is superseded.
export async function approveSettlementAccount(id: string): Promise<SettlementAccountReview> {
  if (!isMock("settlement")) return apiClient.post<SettlementAccountReview>(`/api/admin/settlement-accounts/${id}/approve`);
  const account = mockPendingAccount(id);
  for (const a of mock) if (a.status === "approved") { a.status = "superseded"; a.decidedAt = new Date().toISOString(); }
  account.status = "approved";
  account.decidedAt = new Date().toISOString();
  return mockReviews().find((r) => r.account.id === id)!;
}

export async function rejectSettlementAccount(id: string, reason: string): Promise<SettlementAccountReview> {
  if (!isMock("settlement")) return apiClient.post<SettlementAccountReview>(`/api/admin/settlement-accounts/${id}/reject`, { reason });
  const account = mockPendingAccount(id);
  account.status = "rejected";
  account.decidedAt = new Date().toISOString();
  account.decisionNote = reason;
  return mockReviews().find((r) => r.account.id === id)!;
}

function mockPendingAccount(id: string): SettlementAccount {
  const account = mock.find((a) => a.id === id);
  if (!account) throw mockError("SETTLEMENT_ACCOUNT_NOT_FOUND", "We couldn't find that account.");
  if (account.status !== "pending") throw mockError("SETTLEMENT_ACCOUNT_NOT_PENDING", "This account has already been decided.");
  return account;
}

function mockReviews(): SettlementAccountReview[] {
  const approved = mock.find((a) => a.status === "approved") ?? null;
  return mock.map((account) => ({
    tenantId: "estintin-group", registeredName: "Estintin Group Limited", tradingName: "Estintin Group", account: { ...account },
    nameMatchesCompany: account.accountName.toUpperCase().includes("ESTINTIN"),
    onboardingBankName: "Guaranty Trust Bank", onboardingAccountNumber: "0123451234", onboardingAccountName: "ESTINTIN GROUP LIMITED",
    matchesOnboardingAccount: account.bankCode === "058" && account.accountNumber === "0123451234",
    currentApproved: approved && approved.id !== account.id ? { ...approved } : null,
  })).sort((a, b) => a.account.submittedAt.localeCompare(b.account.submittedAt));
}

// ─── Mock mode ───────────────────────────────────────────────────────────────

function mockError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

const MOCK_BANKS: Bank[] = [
  { code: "044", name: "Access Bank" }, { code: "058", name: "Guaranty Trust Bank" }, { code: "011", name: "First Bank of Nigeria" },
  { code: "033", name: "United Bank For Africa" }, { code: "057", name: "Zenith Bank" },
];

const mock: SettlementAccount[] = [
  { id: "sa-2", bankCode: "058", bankName: "Guaranty Trust Bank", accountNumber: "0123451234", accountName: "ESTINTIN GROUP LIMITED", currency: "NGN",
    status: "approved", submittedAt: "2026-09-20T09:00:00Z", decidedAt: "2026-09-21T11:00:00Z", decisionNote: null },
  { id: "sa-1", bankCode: "044", bankName: "Access Bank", accountNumber: "0987650000", accountName: "CHIDI OKEKE", currency: "NGN",
    status: "rejected", submittedAt: "2026-09-18T15:00:00Z", decidedAt: "2026-09-19T10:00:00Z", decisionNote: "The account is in a person's name, not the company's." },
  // Older submissions, so the history page has more than one page in mock mode.
  ...Array.from({ length: 12 }, (_, i): SettlementAccount => {
    const status = (["superseded", "rejected", "withdrawn"] as const)[i % 3];
    const bank = MOCK_BANKS[i % MOCK_BANKS.length];
    return {
      id: `sa-old-${i}`, bankCode: bank.code, bankName: bank.name, accountNumber: `01${String(10000000 + i * 7919).slice(0, 8)}`,
      accountName: "ESTINTIN GROUP LIMITED", currency: "NGN", status,
      submittedAt: new Date(Date.UTC(2026, 7, 28 - i * 2, 9)).toISOString(),
      decidedAt: status === "withdrawn" ? null : new Date(Date.UTC(2026, 7, 29 - i * 2, 11)).toISOString(),
      decisionNote: status === "rejected" ? "The account number didn't match the bank's records for the company." : null,
    };
  }),
];
