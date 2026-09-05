import type { TierAvailability } from "../../services/marketplaceService";

const STYLES: Record<TierAvailability, string> = {
  available: "bg-emerald-50 text-emerald-700 border-emerald-200",
  low_stock: "bg-amber-50 text-amber-700 border-amber-200",
  sold_out: "bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]",
};

const LABELS: Record<TierAvailability, string> = {
  available: "Available",
  low_stock: "Low stock",
  sold_out: "Sold out",
};

// Status is text, not color alone — LABELS always render alongside the pill's
// tint, so it still reads without relying on color perception.
export default function AvailabilityPill({ status }: { status: TierAvailability }) {
  return <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border ${STYLES[status]}`}>{LABELS[status]}</span>;
}
