// The single place a MoneyRange is rendered, which is what makes the
// no-midpoint rule enforceable: a range renders as a range, everywhere.
//
// A midpoint presented as a figure is a number nobody quoted and nobody will
// honour, so there is deliberately no code path here that produces one.
//
// Always rendered in the money's OWN currency — never the buyer's selected
// display currency. These are contractual figures, not a price comparison.

import { formatCompactDeclared, formatDeclaredAmount } from "../../lib/formatCurrency";
import { isRange, type MoneyRange } from "../../services/costDisclosureService";

interface MoneyRangeDisplayProps {
  money: MoneyRange;
  // Compact is for dense surfaces (listing cards); the precise value stays
  // available on hover via `title`, same convention as EstateCard's price.
  compact?: boolean;
  className?: string;
}

export default function MoneyRangeDisplay({ money, compact = false, className }: MoneyRangeDisplayProps) {
  const format = (amount: number) => (compact ? formatCompactDeclared(amount, money.currency) : formatDeclaredAmount(amount, money.currency));
  const precise = isRange(money)
    ? `${formatDeclaredAmount(money.low, money.currency)} – ${formatDeclaredAmount(money.high, money.currency)}`
    : formatDeclaredAmount(money.low, money.currency);

  return (
    <span className={className} title={precise}>
      {isRange(money) ? `${format(money.low)} – ${format(money.high)}` : format(money.low)}
    </span>
  );
}
