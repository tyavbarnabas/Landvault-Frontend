import { formatAmount, type Currency } from "../data/mockData";

const SYMBOLS: Record<Currency, string> = { NGN: "₦", USD: "$", GBP: "£", EUR: "€" };

// Renders an amount that is ALREADY denominated in `currency`, with no FX
// conversion.
//
// This exists because mockData's formatAmount does NOT do that: it treats its
// input as naira and converts it into the currency argument (the buyer's
// display-currency selector). That's right for browsing a naira catalogue in
// pounds; it is wrong for any figure quoted in its own currency — a $180
// documentation fee passed through formatAmount renders as "$0", because 180
// naira really is about eleven cents.
//
// Contractual figures (cost disclosure) are quoted by the developer in a
// specific currency and are never converted or re-based for display.
export function formatDeclaredAmount(amount: number, currency: Currency): string {
  return `${SYMBOLS[currency]}${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

// Compact display for large NGN figures (₦412M, ₦4.2M) with the full precise
// value available via the caller's `title` attribute (formatAmount). Never
// does floating-point math on the underlying amount — only on the display
// string.
export function formatCompactCurrency(amount: number, currency: Currency = "NGN"): string {
  const symbol = SYMBOLS[currency];
  if (amount >= 1_000_000_000) return `${symbol}${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `${symbol}${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${symbol}${(amount / 1_000).toFixed(0)}K`;
  return formatAmount(amount, currency);
}

// The compact counterpart of formatDeclaredAmount — same abbreviation rules,
// but the sub-thousand fallback stays in the amount's own currency instead of
// falling through to formatAmount's conversion.
export function formatCompactDeclared(amount: number, currency: Currency): string {
  if (amount >= 1_000) return formatCompactCurrency(amount, currency);
  return formatDeclaredAmount(amount, currency);
}
