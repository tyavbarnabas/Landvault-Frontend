// Shared between Portfolio.tsx, PlotView.tsx, and Dashboard.tsx so the three
// screens can't drift into showing different labels/colors for the same
// plot. Reuses the generic StatusBadge component (same idiom as
// tenantStatusBadge/verificationStateBadge in StatusBadge.tsx) rather than
// each screen inventing its own pill styling. An unrecognized status always
// falls back to neutral — never rendered as healthy by accident, which was
// the original bug (arrears silently fell into the "else = Active plan" branch).

import type { PlotAccountStatus } from "../../data/mockData";
import StatusBadge, { type BadgeVariant } from "../StatusBadge";

const STATUS_INFO: Record<PlotAccountStatus, { label: string; variant: BadgeVariant }> = {
  reserved: { label: "Reserved", variant: "info" },
  pending_verification: { label: "Pending verification", variant: "warning" },
  allocated: { label: "Allocated", variant: "info" },
  installment_active: { label: "On instalment plan", variant: "info" },
  completed: { label: "Paid off", variant: "success" },
  // Calm, not alarming: a person in difficulty, not an error.
  in_arrears: { label: "In arrears", variant: "warning" },
  withdrawn: { label: "Withdrawn", variant: "neutral" },
  revoked: { label: "Revoked", variant: "neutral" },
  upgrade_pending: { label: "Upgrade pending", variant: "warning" },
  transferred: { label: "Transferred", variant: "neutral" },
  superseded: { label: "Superseded by upgrade", variant: "neutral" },
};

// A flexible plan is never "on an instalment plan".
export default function PlotStatusBadge({ status, plan }: { status: string; plan?: string }) {
  const flexible: Partial<Record<string, string>> = { installment_active: "On flexible plan", withdrawn: "Left the plan", revoked: "Plan ended" };
  const info = plan === "flexible" && flexible[status]
    ? { label: flexible[status]!, variant: (status === "installment_active" ? "info" : "neutral") as BadgeVariant }
    : STATUS_INFO[status as PlotAccountStatus];
  return <StatusBadge label={info?.label ?? status} variant={info?.variant ?? "neutral"} />;
}
