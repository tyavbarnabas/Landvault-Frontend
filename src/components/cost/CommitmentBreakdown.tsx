// Land price, each declared fee by when it falls due, and the total, as one
// block for a card. Shared by the estate page and checkout's Review step, so
// a buyer reads the same figures, laid out the same way, in both places.
// The caller handles an estate that declared nothing, or was grandfathered.

import { formatDeclaredAmount } from "../../lib/formatCurrency";
import FeeBreakdown from "./FeeBreakdown";
import MoneyRangeDisplay from "./MoneyRangeDisplay";
import type { EstateCostDisclosure, TierCommitment } from "../../services/costDisclosureService";

interface CommitmentBreakdownProps {
  disclosure: EstateCostDisclosure;
  commitment: TierCommitment | null;
  // Checkout knows the plot: a corner plot's total leads, the other is dropped.
  corner?: boolean;
  landLabel?: string;
}

export default function CommitmentBreakdown({ disclosure, commitment, corner, landLabel = "Land price" }: CommitmentBreakdownProps) {
  const cornerTotal = commitment?.totalCommitmentIfCorner ?? null;
  const total = commitment ? (corner && cornerTotal ? cornerTotal : commitment.totalCommitment) : null;
  return (
    <>
      {commitment && (
        <div className="flex items-start justify-between gap-4 pb-3 mb-3 border-b border-[var(--border)]">
          <div>
            <div className="text-sm font-medium text-[var(--foreground)]">{landLabel}</div>
            <div className="text-xs text-[var(--muted-foreground)]">{commitment.sizeSqm} sqm plot{corner ? " · before the corner premium" : ""}</div>
          </div>
          <span className="font-mono-data font-medium text-[var(--foreground)]">{formatDeclaredAmount(commitment.landPrice, commitment.currency)}</span>
        </div>
      )}
      <FeeBreakdown feeSchedule={disclosure.fees} tier={commitment} bare />
      {commitment && total && (
        <div className="mt-4 rounded-lg bg-[var(--secondary)] text-[var(--secondary-foreground)] px-4 py-3.5 flex items-center justify-between gap-4">
          <div>
            <div className="font-semibold">Total commitment</div>
            {corner && cornerTotal && <div className="text-xs">Corner plot, premium included</div>}
            {!corner && cornerTotal && (
              <div className="text-xs">On a corner plot: <MoneyRangeDisplay money={cornerTotal} currency={commitment.currency} className="font-mono-data" /></div>
            )}
          </div>
          <MoneyRangeDisplay money={total} currency={commitment.currency} className="font-mono-data font-semibold text-lg" />
        </div>
      )}
      {commitment?.totalExcludesOtherCurrencyFees && (
        <p className="text-xs text-[var(--warning-text)] mt-3">
          This total leaves out at least one fee charged in another currency, because amounts in different currencies are not added together. Those charges are listed above.
        </p>
      )}
    </>
  );
}
