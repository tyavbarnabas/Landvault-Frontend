// The Super Admin dashboard's work queues: what is waiting in each review
// screen, counted from that screen's own API — no metrics endpoint, nothing
// illustrative. A queue appears only for a role that can open its screen; one
// whose list can't be read says so rather than showing zero.

import { formatInCurrency } from "../data/mockData";
import { ADMIN_PAYOUTS_PERMISSION, DOCUMENTS_REVIEW_PERMISSION, TITLE_REVIEW_PERMISSION } from "./authService";
import { fetchReadyPayouts, fetchRefunds, fetchRefundsDue, refundStage } from "./adminPayoutsService";
import { fetchSettlementReviews } from "./settlementService";
import { fetchOnboardingRequests } from "./onboardingRequestsService";
import { fetchTenants } from "./tenantsService";
import { fetchConflicts } from "./listingConflictsService";
import { fetchBoundaryChangesForReview } from "./portalEstatesService";
import { fetchTitleReviews } from "./estateTitleService";
import { fetchTemplateReviews, fetchTermsReviews } from "./letterReviewsService";

export type QueueGroup = "money" | "companies" | "listings";
export type QueueKind = "payouts" | "refunds" | "payout_accounts" | "onboarding" | "tenants" | "conflicts" | "boundaries" | "titles" | "letters";

export interface WorkQueue {
  kind: QueueKind;
  group: QueueGroup;
  label: string;
  // Null: the list couldn't be read just now.
  count: number | null;
  detail: string;
  href: string;
  // A cross-company overlap is a scam risk, not just a to-do.
  urgent?: boolean;
}

export const QUEUE_GROUPS: { id: QueueGroup; label: string }[] = [
  { id: "money", label: "Money" },
  { id: "companies", label: "Companies" },
  { id: "listings", label: "Listings & documents" },
];

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

// Totals per currency, never added across currencies.
function totals(items: { amount: number; currency: string }[]): string {
  const by = new Map<string, number>();
  for (const i of items) by.set(i.currency, (by.get(i.currency) ?? 0) + i.amount);
  return [...by].map(([c, n]) => formatInCurrency(n, c)).join(" + ");
}

type Loader = () => Promise<Omit<WorkQueue, "kind" | "group" | "label" | "href">>;

export async function fetchWorkQueues(permissions: string[]): Promise<WorkQueue[]> {
  const has = (p: string) => permissions.includes(p);
  const defs: (Omit<WorkQueue, "count" | "detail"> & { on: boolean; load: Loader })[] = [
    {
      kind: "payouts", group: "money", label: "Payouts ready", href: "/admin/payouts", on: has(ADMIN_PAYOUTS_PERMISSION),
      load: async () => {
        const list = await fetchReadyPayouts();
        const owed = list.map((p) => ({ amount: p.amountOwed ?? p.amount, currency: p.currency }));
        const oldest = list.map((p) => p.verifiedAt).sort()[0];
        return { count: list.length, detail: list.length ? `${totals(owed)} to send · oldest verified ${day(oldest)}` : "Nothing to send" };
      },
    },
    {
      kind: "refunds", group: "money", label: "Refunds to do", href: "/admin/refunds", on: has(ADMIN_PAYOUTS_PERMISSION),
      load: async () => {
        // Not started, plus accounts buyers have given that need checking and sending.
        const [due, started] = await Promise.all([fetchRefundsDue(), fetchRefunds("needs-attention")]);
        const send = started.filter((r) => refundStage(r) === "ready_to_send");
        const all = [...due, ...send];
        const who = all.length === 1 ? ` to ${all[0].buyerName ?? all[0].buyerEmail ?? "the buyer"}` : "";
        return { count: all.length, detail: all.length ? `${totals(all)}${who}${send.length ? ` · ${send.length} ready to send` : ""}` : "Nothing owed" };
      },
    },
    {
      kind: "payout_accounts", group: "money", label: "Payout accounts", href: "/admin/payout-accounts", on: has(ADMIN_PAYOUTS_PERMISSION),
      load: async () => {
        const list = await fetchSettlementReviews("pending");
        return { count: list.length, detail: list.length ? `${list.map((r) => r.tradingName ?? r.registeredName ?? "A company").slice(0, 2).join(", ")}${list.length > 2 ? ` and ${list.length - 2} more` : ""} to approve` : "Nothing waiting" };
      },
    },
    {
      kind: "onboarding", group: "companies", label: "Onboarding requests", href: "/admin/onboarding-requests", on: has("admin.tenants.view"),
      load: async () => {
        const page = await fetchOnboardingRequests(null, { limit: 1 }, true);
        return { count: page.total, detail: page.total ? "Waiting on a first contact or a decision" : "Nothing waiting" };
      },
    },
    {
      kind: "tenants", group: "companies", label: "Tenants to verify", href: "/admin/tenants?status=under_review", on: has("admin.tenants.view"),
      load: async () => {
        const page = await fetchTenants({ verificationState: ["documents_submitted", "under_review"] }, { limit: 2 });
        const names = page.items.map((t) => t.displayName).filter(Boolean);
        return { count: page.total, detail: page.total ? `${names.join(", ")}${page.total > names.length ? ` and ${page.total - names.length} more` : ""}` : "Nothing waiting" };
      },
    },
    {
      kind: "conflicts", group: "listings", label: "Listing conflicts", href: "/admin/listing-conflicts", on: has("admin.marketplace.conflicts"),
      load: async () => {
        // Cross-company (high) and unresolved: the ones that are a live scam risk.
        const page = await fetchConflicts({ status: ["open", "investigating"], severity: ["high"] }, { limit: 1 });
        const first = page.items[0];
        return { count: page.total, urgent: page.total > 0, detail: first ? `Cross-company overlap · ${first.estateAName} and ${first.estateBName}${page.total > 1 ? ` and ${page.total - 1} more` : ""}` : "No overlaps open" };
      },
    },
    {
      kind: "boundaries", group: "listings", label: "Boundary changes", href: "/admin/boundary-changes", on: has("admin.marketplace.conflicts"),
      load: async () => { const list = await fetchBoundaryChangesForReview("pending"); return { count: list.length, detail: list.length ? "Corrections over 5% of an estate's land" : "Nothing waiting" }; },
    },
    {
      kind: "titles", group: "listings", label: "Title reviews", href: "/admin/title-reviews", on: has(TITLE_REVIEW_PERMISSION),
      load: async () => { const list = await fetchTitleReviews("pending"); return { count: list.length, detail: list.length ? "Land titles developers have declared" : "Nothing waiting" }; },
    },
    {
      kind: "letters", group: "listings", label: "Letter reviews", href: "/admin/letter-reviews", on: has(DOCUMENTS_REVIEW_PERMISSION),
      load: async () => {
        const [terms, wording] = await Promise.all([fetchTermsReviews("pending"), fetchTemplateReviews("pending")]);
        const parts = [terms.length ? `${terms.length} estate condition${terms.length === 1 ? "" : "s"}` : null, wording.length ? `${wording.length} wording` : null].filter(Boolean);
        return { count: terms.length + wording.length, detail: parts.length ? parts.join(" · ") : "Nothing waiting" };
      },
    },
  ];

  return Promise.all(defs.filter((d) => d.on).map(async ({ on: _on, load, ...queue }) => {
    try {
      return { ...queue, ...(await load()) };
    } catch {
      return { ...queue, count: null, detail: "Couldn't check this queue just now." };
    }
  }));
}
