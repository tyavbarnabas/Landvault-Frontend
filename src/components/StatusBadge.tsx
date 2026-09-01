// Generic status pill, promoted out of the copy-pasted badge styling that
// used to live separately in TenantDirectory.tsx and TenantDetail.tsx.

import type { TenantStatus, VerificationState } from "../services/tenantsService";

export type BadgeVariant = "neutral" | "info" | "warning" | "success" | "error";

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  neutral: "bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]",
  info: "bg-blue-50 text-blue-700 border-blue-200",
  warning: "bg-amber-50 text-amber-700 border-amber-200",
  success: "bg-emerald-50 text-emerald-700 border-emerald-200",
  error: "bg-red-50 text-red-700 border-red-200",
};

export default function StatusBadge({ label, variant }: { label: string; variant: BadgeVariant }) {
  return (
    <span className={`inline-flex items-center shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border ${VARIANT_STYLES[variant]}`}>
      {label}
    </span>
  );
}

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
