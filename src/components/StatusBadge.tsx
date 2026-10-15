// Generic status pill, promoted out of the copy-pasted badge styling that
// used to live separately in TenantDirectory.tsx and TenantDetail.tsx.

import type { TenantStatus, VerificationState } from "../services/tenantsService";
import type { ConflictStatus } from "../services/listingConflictsService";
import type { PortalEstateStatus } from "../services/portalEstatesService";
import type { InvitationStatus, StaffStatus } from "../services/staffService";
import type { OnboardingRequestStatus } from "../services/onboardingRequestsService";
import type { BoundaryChangeStatus } from "../services/portalEstatesService";
import Badge, { type BadgeVariant } from "./ui/Badge";
import type { PayoutStatus, RefundStatus, SettlementAccountStatus } from "../services/paymentTypes";

// The pill itself lives in ui/Badge; this file maps each domain's statuses to
// a label and a tone.
export type { BadgeVariant };
export default Badge;

export function tenantStatusBadge(status: TenantStatus): { label: string; variant: BadgeVariant } {
  switch (status) {
    case "active": return { label: "Active", variant: "success" };
    case "suspended": return { label: "Suspended", variant: "error" };
    case "offboarded": return { label: "Offboarded", variant: "neutral" };
  }
}

export function verificationStateBadge(state: VerificationState): { label: string; variant: BadgeVariant } {
  switch (state) {
    case "created": return { label: "Created", variant: "neutral" };
    case "documents_submitted": return { label: "Documents submitted", variant: "info" };
    case "under_review": return { label: "Under review", variant: "warning" };
    case "verified": return { label: "Verified", variant: "success" };
    case "rejected": return { label: "Rejected", variant: "error" };
    case "suspended": return { label: "Verification suspended", variant: "error" };
  }
}

export function conflictStatusBadge(status: ConflictStatus): { label: string; variant: BadgeVariant } {
  switch (status) {
    case "open": return { label: "Open", variant: "error" };
    case "investigating": return { label: "Investigating", variant: "warning" };
    case "confirmed_duplicate": return { label: "Confirmed duplicate", variant: "error" };
    case "dismissed": return { label: "Dismissed", variant: "neutral" };
    // The system closed it because the geometry no longer overlaps — a fixed
    // survey error, not a decision anyone had to make.
    case "auto_resolved": return { label: "Auto-resolved", variant: "success" };
  }
}

export function portalEstateStatusBadge(status: PortalEstateStatus): { label: string; variant: BadgeVariant } {
  switch (status) {
    case "draft": return { label: "Draft", variant: "neutral" };
    case "ready_to_publish": return { label: "Ready to publish", variant: "info" };
    case "published": return { label: "Live", variant: "success" };
    // Published by the developer, but a condition has lapsed since, so the
    // marketplace isn't showing it. Not "unpublished" — the flag is intact
    // and the listing returns by itself when the condition clears.
    case "published_not_live": return { label: "Published · not live", variant: "warning" };
    case "blocked": return { label: "Blocked", variant: "warning" };
    // A list row: EstateSummaryDto carries no eligibility, so readiness is
    // genuinely unknown there. Neutral, never positive — an unknown condition
    // is not a met one.
    case "unknown": return { label: "Readiness unknown", variant: "neutral" };
  }
}

// "Awaiting approval" must read as PENDING, never as sent: a branch request
// sends nothing to the person until head office approves it.
export function invitationStatusBadge(status: InvitationStatus): { label: string; variant: BadgeVariant } {
  switch (status) {
    case "awaiting_approval": return { label: "Awaiting approval — not sent", variant: "warning" };
    case "pending": return { label: "Invitation sent", variant: "info" };
    case "accepted": return { label: "Accepted", variant: "success" };
    case "expired": return { label: "Expired", variant: "neutral" };
    case "revoked": return { label: "Revoked", variant: "neutral" };
    case "rejected": return { label: "Rejected", variant: "error" };
  }
}

export function staffStatusBadge(status: StaffStatus): { label: string; variant: BadgeVariant } {
  switch (status) {
    case "active": return { label: "Active", variant: "success" };
    case "pending_verification": return { label: "Pending verification", variant: "warning" };
    case "suspended": return { label: "Suspended", variant: "error" };
    case "deactivated": return { label: "Deactivated", variant: "neutral" };
  }
}

export function boundaryChangeBadge(status: BoundaryChangeStatus): { label: string; variant: BadgeVariant } {
  switch (status) {
    case "applied": return { label: "Applied", variant: "success" };
    case "pending": return { label: "Waiting for review", variant: "warning" };
    case "approved": return { label: "Approved", variant: "success" };
    case "rejected": return { label: "Rejected", variant: "error" };
    case "withdrawn": return { label: "Withdrawn", variant: "neutral" };
  }
}

export function payoutStatusBadge(status: PayoutStatus): { label: string; variant: BadgeVariant } {
  switch (status) {
    case "success": return { label: "Paid", variant: "success" };
    case "pending": return { label: "With the bank", variant: "info" };
    case "sending": return { label: "Sending", variant: "info" };
    case "awaiting_otp": return { label: "Awaiting approval code", variant: "warning" };
    case "failed": return { label: "Failed", variant: "error" };
    case "reversed": return { label: "Reversed", variant: "error" };
    case "cancelled": return { label: "Cancelled", variant: "neutral" };
  }
}

export function settlementAccountBadge(status: SettlementAccountStatus): { label: string; variant: BadgeVariant } {
  switch (status) {
    case "approved": return { label: "Approved", variant: "success" };
    case "pending": return { label: "Waiting for HomeTrue", variant: "warning" };
    case "rejected": return { label: "Rejected", variant: "error" };
    case "withdrawn": return { label: "Withdrawn", variant: "neutral" };
    case "superseded": return { label: "Replaced", variant: "neutral" };
  }
}

export function refundStatusBadge(status: RefundStatus): { label: string; variant: BadgeVariant } {
  switch (status) {
    case "pending": return { label: "Pending", variant: "info" };
    case "sending": return { label: "Sending", variant: "info" };
    case "processing": return { label: "Processing", variant: "info" };
    case "needs-attention": return { label: "Needs an account", variant: "warning" };
    case "processed": return { label: "Refunded", variant: "success" };
    case "failed": return { label: "Failed", variant: "error" };
  }
}

// A role the company made itself, or one of HomeTrue's standard roles.
export function roleKindBadge(custom: boolean): { label: string; variant: BadgeVariant } {
  return custom ? { label: "Your company's", variant: "info" } : { label: "HomeTrue standard", variant: "neutral" };
}

export function onboardingRequestStatusBadge(status: OnboardingRequestStatus): { label: string; variant: BadgeVariant } {
  switch (status) {
    case "new": return { label: "New", variant: "info" };
    case "contacted": return { label: "Contacted", variant: "warning" };
    case "converted": return { label: "Converted", variant: "success" };
    case "declined": return { label: "Declined", variant: "neutral" };
  }
}
