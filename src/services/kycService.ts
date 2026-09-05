// Backend integration seam for purchase-time KYC. Part 5 of the buyer flow.
//
// CRITICAL, resolved decisions (see landvault-buyer-purchase-flow in project
// memory): KYC never appears before this point in the product (not at
// signup, not in the marketplace) — it only gates the first reservation, and
// it runs BEFORE the 45-minute plot lock starts, not inside it. Local buyers
// verify with NIN only — never a utility bill. Diaspora buyers verify with
// passport + proof of address. Routed by the buyer's country of residence
// captured at registration (AuthUser.country) — never asked again.

import { apiClient } from "../lib/apiClient";
import type { AuthUser } from "./authService";

export type KycBuyerType = "local" | "diaspora";
export type KycDocType = "nin" | "passport" | "proof_of_address";
export type KycStatus = "unsubmitted" | "submitted" | "under_review" | "approved" | "rejected";

export interface KycDocumentState {
  type: KycDocType;
  fileName?: string;
  status: "missing" | "submitted" | "approved" | "rejected";
  rejectionReason?: string;
}

export interface KycRecord {
  buyerType: KycBuyerType;
  status: KycStatus;
  ninNumber?: string;
  documents: KycDocumentState[];
  submittedAt?: string;
  decidedAt?: string;
}

export function buyerTypeForCountry(country: string): KycBuyerType {
  return country === "NG" ? "local" : "diaspora";
}

function docsForBuyerType(buyerType: KycBuyerType): KycDocumentState[] {
  return buyerType === "local"
    ? [{ type: "nin", status: "missing" }]
    : [{ type: "passport", status: "missing" }, { type: "proof_of_address", status: "missing" }];
}

// Seeded from the signed-in user's existing kycStatus/kycType (AuthUser) on
// first read, so the already-approved seed account (MOCK_CLIENT_USER) skips
// this gate entirely on its first purchase, matching "never asked before
// this point" and "first purchase only." A fresh/unverified account would
// see the full submit → review → approve flow below.
const mockKycRecords = new Map<string, KycRecord>();

function seedRecord(user: AuthUser): KycRecord {
  const buyerType = buyerTypeForCountry(user.country);
  if (user.kycStatus === "approved") {
    return { buyerType, status: "approved", documents: docsForBuyerType(buyerType).map((d) => ({ ...d, status: "approved" })), decidedAt: new Date().toISOString() };
  }
  return { buyerType, status: "unsubmitted", documents: docsForBuyerType(buyerType) };
}

export async function fetchKycStatus(user: AuthUser): Promise<KycRecord> {
  if (!apiClient.isMockMode) return apiClient.get<KycRecord>("/api/kyc");
  if (!mockKycRecords.has(user.email)) mockKycRecords.set(user.email, seedRecord(user));
  return mockKycRecords.get(user.email)!;
}

export interface SubmitKycInput {
  ninNumber?: string;
  ninFile?: File | null;
  passportFile?: File | null;
  proofOfAddressFile?: File | null;
}

// Demo-only rejection trigger — entering this exact NIN exercises the
// rejected → targeted re-upload path (see KycFlow.tsx) without a real
// verification backend. Everything else in the mock happy path approves.
const DEMO_REJECT_NIN = "00000000000";

export async function submitKyc(user: AuthUser, input: SubmitKycInput): Promise<KycRecord> {
  if (!apiClient.isMockMode) return apiClient.post<KycRecord>("/api/kyc", input);

  const existing = mockKycRecords.get(user.email) ?? seedRecord(user);
  const buyerType = existing.buyerType;
  const submittedAt = new Date().toISOString();

  const documents: KycDocumentState[] = buyerType === "local"
    ? [{ type: "nin", fileName: input.ninFile?.name, status: "submitted" }]
    : [
        { type: "passport", fileName: input.passportFile?.name, status: "submitted" },
        { type: "proof_of_address", fileName: input.proofOfAddressFile?.name, status: "submitted" },
      ];

  let record: KycRecord = { buyerType, status: "submitted", ninNumber: input.ninNumber, documents, submittedAt };
  mockKycRecords.set(user.email, record);

  // Simulate NIMC/passport verification turnaround — brief in mock mode so
  // the checkout flow isn't blocked for the real 1–2 business days.
  await new Promise((resolve) => setTimeout(resolve, 1600));

  const rejected = buyerType === "local" && input.ninNumber === DEMO_REJECT_NIN;
  record = rejected
    ? {
        ...record,
        status: "rejected",
        decidedAt: new Date().toISOString(),
        documents: documents.map((d) => (d.type === "nin" ? { ...d, status: "rejected", rejectionReason: "NIN could not be verified against NIMC records. Please re-check the number and re-upload a clear photo of your NIN slip." } : d)),
      }
    : { ...record, status: "approved", decidedAt: new Date().toISOString(), documents: documents.map((d) => ({ ...d, status: "approved" })) };

  mockKycRecords.set(user.email, record);
  return record;
}
