// The developer portal's Overview (/portal), from the Figma portal proposal:
// what needs the team, the company in four numbers, and its live estates.
// There's no overview endpoint; it's put together from the lists the portal
// already reads, and each part only for a role allowed to read it. A part
// whose list fails is left out rather than shown as zero.

import { fetchPortalEstates, type PortalEstate, type PortalScope } from "./portalEstatesService";
import { failedPayouts, fetchCompanyPayouts, fetchFinanceQueue, fetchLatePayments, type Payout } from "./financeService";
export { failedPayouts };
import { fetchStaff, type StaffMember } from "./staffService";
import { fetchBranches } from "./branchesService";
import { formatInCurrency } from "../data/mockData";

export interface OverviewAccess {
  estates: boolean;
  finance: boolean;
  staff: boolean;
  branches: boolean;
}

export type OverviewTone = "warning" | "error" | "info" | "neutral";

export interface OverviewItem {
  id: string;
  kind: "estate" | "verify" | "late" | "payout_failed" | "payout_waiting";
  tone: OverviewTone;
  badge: string;
  title: string;
  detail: string;
  action: string;
  to: string;
  // Something only this team can move: a solid button.
  urgent: boolean;
}

export interface PortalOverview {
  items: OverviewItem[];
  // Finance was checked and nothing is waiting (null when not checked).
  financeClear: boolean | null;
  estates: PortalEstate[] | null;
  staff: StaffMember[] | null;
  branchCount: number | null;
  payouts: Payout[] | null;
}

// The portal's own list page size; a company with more estates sees the
// first 100 counted, which the page says.
const ESTATE_SCAN = 100;

const optional = <T,>(on: boolean, load: () => Promise<T>): Promise<T | null> => (on ? load().catch(() => null) : Promise.resolve(null));

export async function fetchPortalOverview(scope: PortalScope, access: OverviewAccess, caller: { email: string; permissions?: string[] }): Promise<PortalOverview> {
  const [estatesPage, queue, late, payouts, staff, branches] = await Promise.all([
    optional(access.estates, () => fetchPortalEstates(scope, {}, { limit: ESTATE_SCAN })),
    optional(access.finance, fetchFinanceQueue),
    optional(access.finance, fetchLatePayments),
    optional(access.finance, fetchCompanyPayouts),
    optional(access.staff, () => fetchStaff({ tenantId: scope.tenantId, branchId: scope.branchId ?? null, email: caller.email, permissions: caller.permissions })),
    optional(access.branches, () => fetchBranches(scope)),
  ]);
  const estates = estatesPage?.items ?? null;
  return {
    items: overviewItems({ estates, queue: queue?.length ?? null, late: late?.length ?? null, payouts }),
    financeClear: queue && late ? queue.length === 0 && late.length === 0 : null,
    estates,
    staff,
    branchCount: branches?.length ?? null,
    payouts,
  };
}

// The attention list, in the order a director would deal with it: money
// stuck, buyers waiting, then the listings and payouts waiting on HomeTrue. Exported for tests.
export function overviewItems({ estates, queue, late, payouts }: {
  estates: PortalEstate[] | null; queue: number | null; late: number | null; payouts: Payout[] | null;
}): OverviewItem[] {
  const items: OverviewItem[] = [];

  for (const p of failedPayouts(payouts ?? [])) {
    items.push({
      id: `payout-failed:${p.id}`, kind: "payout_failed", tone: "error", badge: "Failed",
      title: `A ${formatInCurrency(p.amount, p.currency)} payout didn't go through`,
      detail: p.gatewayMessage ?? "HomeTrue will retry it or contact you.", action: "View payouts", to: "/portal/finance?tab=payouts", urgent: false,
    });
  }
  if (queue) {
    items.push({
      id: "verify", kind: "verify", tone: "warning", badge: "To verify",
      title: `${queue} payment${queue === 1 ? "" : "s"} waiting for verification`,
      detail: "Buyers have paid. Check each against Paystack's record so the plot can be allocated.", action: "Verify payments", to: "/portal/finance", urgent: true,
    });
  }
  if (late) {
    items.push({
      id: "late", kind: "late", tone: "warning", badge: "Late",
      title: `${late} late payment${late === 1 ? "" : "s"} to settle`,
      detail: "Money arrived after a reservation ended. Allocate the plot or refund the buyer.", action: "Settle", to: "/portal/finance?tab=late", urgent: true,
    });
  }
  const notLive = (estates ?? []).filter((e) => e.status === "published_not_live");
  for (const e of notLive.slice(0, 3)) {
    items.push({
      id: `estate:${e.id}`, kind: "estate", tone: "warning", badge: "Not live",
      title: `${e.name} is published but not on the marketplace`,
      detail: "At least one condition for listing isn't met. Open it to see which.",
      action: "Open estate", to: `/portal/estates/${e.id}`, urgent: true,
    });
  }
  if (notLive.length > 3) {
    items.push({
      id: "estates-more", kind: "estate", tone: "warning", badge: "Not live",
      title: `${notLive.length - 3} more estates are published but not on the marketplace`,
      detail: "Each one's page says which condition is missing.", action: "View estates", to: "/portal/estates", urgent: false,
    });
  }
  // Staff whose email or phone isn't confirmed are not listed: the backend
  // has no confirmation step yet, so there is nothing for anyone to do.
  for (const p of (payouts ?? []).filter((x) => x.status === "awaiting_otp")) {
    items.push({
      id: `payout-waiting:${p.id}`, kind: "payout_waiting", tone: "info", badge: "Waiting",
      title: `${formatInCurrency(p.amount, p.currency)} payout is waiting on HomeTrue`,
      detail: `${p.partCount > 1 ? `Part ${p.partNumber} of ${p.partCount}` : "The transfer"}${p.bankName ? ` to ${p.bankName}${p.accountLast4 ? ` ••${p.accountLast4}` : ""}` : ""}. HomeTrue confirms the transfer; nothing to do on your side.`,
      action: "View payouts", to: "/portal/finance?tab=payouts", urgent: false,
    });
  }
  return items;
}


