// The single place a MoneyRange is rendered, which is what makes the
// no-midpoint rule enforceable: a range renders as a range, everywhere.
//
// A midpoint presented as a figure is a number nobody quoted and nobody is
// bound by, so there is deliberately no code path here that produces one.
//
// Currency is a PROP, not a field on the money: the backend's MoneyRangeDto
// carries only {min, max, isRange}, and the currency lives on the parent DTO
// (a tier's `currency`, a fee's `currency`). Passing it in from the same place
// the backend keeps it means the two can never disagree.
//
// Rendered in that declared currency and never converted — these are
// contractual figures, not a price comparison.

import { formatCompactDeclared, formatDeclaredAmount } from "../../lib/formatCurrency";
import { isRange, type MoneyRange } from "../../services/costDisclosureService";
import type { Currency } from "../../data/mockData";

interface MoneyRangeDisplayProps {
  money: MoneyRange;
  currency: Currency;
  // Compact is for dense surfaces (listing cards); the precise value stays
  // available on hover via `title`, same convention as EstateCard's price.
  compact?: boolean;
  className?: string;
}

export default function MoneyRangeDisplay({ money, currency, compact = false, className }: MoneyRangeDisplayProps) {
  const format = (amount: number) => (compact ? formatCompactDeclared(amount, currency) : formatDeclaredAmount(amount, currency));
  // `isRange` is the backend's own determination — read, never recomputed by
  // comparing min and max, so the two cannot end up disagreeing.
  const ranged = isRange(money);
  const precise = ranged
    ? `${formatDeclaredAmount(money.min, currency)} – ${formatDeclaredAmount(money.max, currency)}`
    : formatDeclaredAmount(money.min, currency);

  return (
    <span className={className} title={precise}>
      {ranged ? `${format(money.min)} – ${format(money.max)}` : format(money.min)}
    </span>
  );
}
