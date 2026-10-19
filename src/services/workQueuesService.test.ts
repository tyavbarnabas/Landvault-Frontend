// The Super Admin dashboard's queues, in demo mode: every count comes from
// that screen's own service, and a role only sees the queues it can open.

import { describe, expect, it } from "vitest";
import { fetchWorkQueues } from "./workQueuesService";
import { ADMIN_PAYOUTS_PERMISSION, DOCUMENTS_REVIEW_PERMISSION, TITLE_REVIEW_PERMISSION } from "./authService";

const ALL = ["admin.dashboard.view", "admin.tenants.view", "admin.marketplace.conflicts", ADMIN_PAYOUTS_PERMISSION, TITLE_REVIEW_PERMISSION, DOCUMENTS_REVIEW_PERMISSION];

describe("work queues", () => {
  it("lists money, then companies, then listings — counted from each screen's own list", async () => {
    const queues = await fetchWorkQueues(ALL);
    expect(queues.map((q) => q.kind)).toEqual(["payouts", "refunds", "payout_accounts", "onboarding", "tenants", "conflicts", "boundaries", "titles", "letters"]);
    for (const q of queues) expect(typeof q.count).toBe("number");
    const conflicts = queues.find((q) => q.kind === "conflicts")!;
    expect(conflicts.urgent).toBe(conflicts.count! > 0);
  });

  it("shows a role only the queues it can open", async () => {
    const queues = await fetchWorkQueues(["admin.dashboard.view", ADMIN_PAYOUTS_PERMISSION]);
    expect(queues.map((q) => q.group)).toEqual(["money", "money", "money"]);
  });
});
