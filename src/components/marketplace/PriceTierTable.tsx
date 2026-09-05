// The ONE size-tier price list, for both /estates and /marketplace — merged
// from what used to be two structurally-identical components (this file, and
// components/estates/PriceTierTable.tsx, now deleted), each reading a
// differently-named but identical PriceTier shape. There's one PriceTier type
// now (see estatesService.ts) so there's one table. See
// landvault-catalogue-unification-plan in project memory.

import { formatAmount, type Currency } from "../../data/mockData";
import { pricePerSqm, type PriceTier } from "../../services/marketplaceService";
import AvailabilityPill from "./AvailabilityPill";

interface PriceTierTableProps {
  tiers: PriceTier[];
  cornerPremiumPct: number;
  currency: Currency;
  selectedSizeSqm: number | null;
  onSelectSize: (sizeSqm: number) => void;
}

export default function PriceTierTable({ tiers, cornerPremiumPct, currency, selectedSizeSqm, onSelectSize }: PriceTierTableProps) {
  if (tiers.length === 0) {
    return <p className="text-sm text-[var(--muted-foreground)]">No price tiers published for this estate yet.</p>;
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--muted)] text-left">
              <th scope="col" className="px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Size</th>
              <th scope="col" className="px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Price</th>
              <th scope="col" className="px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Per sqm</th>
              <th scope="col" className="px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Availability</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {tiers.map((tier) => {
              const soldOut = tier.availability === "sold_out";
              const selected = selectedSizeSqm === tier.sizeSqm;
              return (
                <tr
                  key={tier.id}
                  aria-disabled={soldOut}
                  onClick={() => !soldOut && onSelectSize(tier.sizeSqm)}
                  className={`${soldOut ? "opacity-50" : "cursor-pointer"} ${selected ? "bg-[var(--secondary)]" : "bg-[var(--card)]"} transition-colors`}
                >
                  <td className="px-4 py-3">
                    <div className="font-medium text-[var(--foreground)]">{tier.sizeSqm} sqm</div>
                    <div className="text-xs text-[var(--muted-foreground)]">~{tier.actualAreaSqm} sqm surveyed</div>
                  </td>
                  <td className="px-4 py-3 font-mono-data text-[var(--foreground)]">{formatAmount(tier.price, currency)}</td>
                  <td className="px-4 py-3 font-mono-data text-[var(--muted-foreground)]">{formatAmount(pricePerSqm(tier), currency)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <AvailabilityPill status={tier.availability} />
                      {!soldOut && <span className="text-xs text-[var(--muted-foreground)]">{tier.plotsRemaining} left</span>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[var(--muted-foreground)] mt-2.5">
        Corner plots carry a {cornerPremiumPct}% premium on their tier's price — dual road frontage and a larger effective frontage.
      </p>
    </div>
  );
}
