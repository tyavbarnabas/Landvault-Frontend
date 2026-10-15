// Wire values for payments, payouts, refunds and payout accounts, exactly as
// the backend serialises them (payments/internal/enums, via each enum's
// wire(): lowercase — and for refunds, dashes, like Paystack's own words).
// Kept apart from the services so screens and tests can share them.
//
// Read the backend enum before adding a value; the odd ones out are exactly
// where a bug hides (refunds use a HYPHEN, everything else underscores).

// One attempt to collect money through Paystack.
export type PaymentStatus = "initialized" | "succeeded" | "failed" | "abandoned" | "mismatched";

// One transfer of a sale's proceeds to a developer. A sale over Paystack's
// ₦10,000,000 single-transfer cap is paid in parts, each its own payout.
export type PayoutStatus = "sending" | "awaiting_otp" | "pending" | "success" | "failed" | "reversed" | "cancelled";

// A full refund to a buyer. `sending` is in the backend enum though not in
// the integration brief: it can reach the buyer, and reads like `processing`.
export type RefundStatus = "pending" | "sending" | "processing" | "needs-attention" | "processed" | "failed";

// A developer's payout bank account, approved by LandVault before use.
export type SettlementAccountStatus = "pending" | "approved" | "rejected" | "withdrawn" | "superseded";

// Why a verified sale can't be paid out yet (ReadyPayoutDto.blockers).
export type PayoutBlocker = "NO_APPROVED_PAYOUT_ACCOUNT" | "COMPANY_NOT_ACTIVE" | "CURRENCY_NOT_SUPPORTED";
