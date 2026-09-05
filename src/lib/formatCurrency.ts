import { formatAmount, type Currency } from "../data/mockData";

// Compact display for large NGN figures (₦412M, ₦4.2M) with the full precise
// value available via the caller's `title` attribute (formatAmount). Never
// does floating-point math on the underlying amount — only on the display
// string.
export function formatCompactCurrency(amount: number, currency: Currency = "NGN"): string {
  const symbols: Record<Currency, string> = { NGN: "₦", USD: "$", GBP: "£", EUR: "€" };
  const symbol = symbols[currency];
  if (amount >= 1_000_000_000) return `${symbol}${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `${symbol}${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${symbol}${(amount / 1_000).toFixed(0)}K`;
  return formatAmount(amount, currency);
}
