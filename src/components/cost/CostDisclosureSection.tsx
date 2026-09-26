// The whole cost picture for one estate at one tier: what the land costs,
// what it actually commits you to, every fee itemised by when it falls due,
// and what both exits cost.
//
// Used on the public estate page AND at reservation. That repetition is the
// point: every one of these terms is already disclosed by developers — in a
// letter issued after the buyer has paid. The failure is sequence, not
// secrecy, and reservation is the last moment disclosure can still change a
// decision.

import { formatDeclaredAmount } from "../../lib/formatCurrency";
import MoneyRangeDisplay from "./MoneyRangeDisplay";
import FeeBreakdown from "./FeeBreakdown";
import ExitCostsPanel from "./ExitCostsPanel";
import { isGrandfathered, type EstateCostDisclosure, type TierCommitment } from "../../services/costDisclosureService";

interface CostDisclosureSectionProps {
  disclosure: EstateCostDisclosure | null;
  // The tier the buyer is actually looking at. Null when no tier is selected
  // yet on a multi-tier estate — the fee schedule still renders, the total
  // does not, because a total belongs to a specific tier.
  tier: TierCommitment | null;
  loading?: boolean;
}

export default function CostDisclosureSection({ disclosure, tier, loading }: CostDisclosureSectionProps) {
  if (loading) return <p className="text-sm text-[var(--muted-foreground)]">Loading cost details…</p>;

  // Nothing declared. Render nothing at all — not a zero, not an estimate,
  // not an empty section header implying there is nothing to pay.
  if (!disclosure) return null;

  if (isGrandfathered(disclosure)) {
    return (
      <div className="bg-[var(--muted)] border border-[var(--border)] rounded-xl p-5">
        <div className="text-sm font-medium text-[var(--foreground)] mb-1">Fees have not been declared for this listing</div>
        <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">
          This estate was listed before the platform required a declared fee schedule, so the figures below the land price are not
          available here. That is not the same as there being no fees — ask the seller for the full schedule, in writing, before you commit.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tier && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-[var(--muted-foreground)] mb-0.5">Land price ({tier.sizeSqm} sqm)</div>
              <div className="font-mono-data font-semibold text-[var(--foreground)]">{formatDeclaredAmount(tier.landPrice, tier.currency)}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted-foreground)] mb-0.5">Fees on top</div>
              <MoneyRangeDisplay money={tier.oneOffFees} currency={tier.currency} className="font-mono-data font-semibold text-[var(--foreground)] block" />
            </div>
            <div>
              <div className="text-xs text-[var(--muted-foreground)] mb-0.5">Total commitment</div>
              <MoneyRangeDisplay money={tier.totalCommitment} currency={tier.currency} className="font-mono-data font-semibold text-lg text-[var(--foreground)] block" />
            </div>
          </div>

          {tier.totalCommitmentIfCorner && (
            <p className="text-xs text-[var(--muted-foreground)] mt-3 pt-3 border-t border-[var(--border)]">
              On a corner plot, the total commitment is{" "}
              <MoneyRangeDisplay money={tier.totalCommitmentIfCorner} currency={tier.currency} className="font-mono-data text-[var(--foreground)]" />.
            </p>
          )}

          {/* Amounts in different currencies are never summed, so the total
              above is knowingly incomplete — say so rather than letting it
              read as the whole. The excluded fees still appear below. */}
          {tier.totalExcludesOtherCurrencyFees && (
            <p className="text-xs text-amber-700 mt-3 pt-3 border-t border-[var(--border)]">
              This total leaves out at least one fee charged in another currency, because amounts in different currencies are not added
              together. Those charges are listed in the breakdown below.
            </p>
          )}
        </div>
      )}

      <FeeBreakdown feeSchedule={disclosure.fees} tier={tier} />

      {disclosure.exitCosts && (
        <div>
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-3">If you need to get out</h3>
          <ExitCostsPanel exitCosts={disclosure.exitCosts} />
        </div>
      )}
    </div>
  );
}
