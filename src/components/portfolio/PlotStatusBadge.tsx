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
  installment_active: { label: "Active plan", variant: "info" },
  completed: { label: "Paid off", variant: "success" },
  in_arrears: { label: "In arrears", variant: "error" },
  upgrade_pending: { label: "Upgrade pending", variant: "warning" },
  transferred: { label: "Transferred", variant: "neutral" },
};

export default function PlotStatusBadge({ status }: { status: string }) {
  const info = STATUS_INFO[status as PlotAccountStatus];
  return <StatusBadge label={info?.label ?? status} variant={info?.variant ?? "neutral"} />;
}
