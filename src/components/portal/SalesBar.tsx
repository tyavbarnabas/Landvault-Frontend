// An estate's plots as one bar: sold, reserved and withheld coloured in, the
// rest available. Shared by the portal overview and the estates list.

import type { PortalEstate } from "../../services/portalEstatesService";

export default function SalesBar({ estate }: { estate: Pick<PortalEstate, "totalPlots" | "soldPlots" | "reservedPlots" | "availablePlots" | "withheldPlots"> }) {
  const total = estate.totalPlots || 1;
  const parts: [number, string][] = [[estate.soldPlots, "bg-[var(--primary)]"], [estate.reservedPlots, "bg-[var(--accent)]"], [estate.withheldPlots, "bg-[var(--muted-foreground)]/50"]];
  return (
    <div className="h-1.5 rounded-full bg-[var(--border)] overflow-hidden flex" role="img"
      aria-label={`${estate.soldPlots} sold, ${estate.reservedPlots} reserved, ${estate.availablePlots} available of ${estate.totalPlots}`}>
      {parts.map(([n, color], i) => n > 0 && <span key={i} className={`h-full ${color}`} style={{ width: `${(n / total) * 100}%` }} />)}
    </div>
  );
}
