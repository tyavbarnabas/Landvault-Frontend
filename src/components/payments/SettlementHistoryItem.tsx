// One past or present payout account in a company's history
// (/portal/payout-account/history). Laid out like a branch row: what it is
// on the left, its status on the right.

import StatusBadge, { settlementAccountBadge } from "../StatusBadge";
import { ListCard } from "../ui/Card";
import type { SettlementAccount } from "../../services/settlementService";

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null);

export default function SettlementHistoryItem({ account: a }: { account: SettlementAccount }) {
  return (
    <ListCard>
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[var(--foreground)]">
            {a.bankName} · <span className="font-mono-data font-normal">{a.accountNumber}</span>
          </div>
          <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
            {a.accountName} · submitted {day(a.submittedAt)}{a.decidedAt ? ` · decided ${day(a.decidedAt)}` : ""}
          </div>
          {a.decisionNote && <p className="text-sm text-[var(--foreground)] mt-2">HomeTrue's note: “{a.decisionNote}”</p>}
        </div>
        <StatusBadge {...settlementAccountBadge(a.status)} />
      </div>
    </ListCard>
  );
}
