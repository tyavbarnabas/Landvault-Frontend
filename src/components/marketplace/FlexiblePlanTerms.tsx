// How a flexible ("pay as you can") plan works, on the estate page — from the
// Figma "Flexible plans" listing frames. Every figure is the tier's
// FlexiblePlanQuote; the gain share is an example, never a forecast.

import type { FlexibleTierPlan } from "../../services/paymentPlansService";
import { formatMoney } from "../../lib/formatCurrency";

export default function FlexiblePlanTerms({ plan, sizeSqm, currency }: { plan: FlexibleTierPlan; sizeSqm: number; currency: string }) {
  const q = plan.flexible;
  const money = (n: number) => formatMoney(n, currency);
  const gain = q.ifSoldForMore;
  const keepsAll = gain.buyerSharePct === 0;
  const facts: [string, string, string][] = [
    ["To start", money(q.minimumToStart), "your first payment"],
    ["After that", q.minimumContribution ? `${money(q.minimumContribution)} or more` : "Any amount", "any time, as often as you like"],
  ];
  if (q.maxMonths) facts.push(["Finish by", `${q.maxMonths} months`, "from when the plan starts"]);
  return (
    <div className="space-y-5">
      <p className="text-sm text-[var(--muted-foreground)]">
        {sizeSqm} sqm · plan total <span className="font-mono-data">{money(q.planTotal)}</span>
        {q.premium > 0 ? <>, which includes <span className="font-mono-data">{money(q.premium)}</span> for paying over time</> : ""}. Every figure is HomeTrue's, worked out from the price.
      </p>
      <div className={`grid gap-3 grid-cols-1 ${facts.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        {facts.map(([label, value, detail]) => (
          <div key={label} className="rounded-lg bg-[var(--muted)] px-3.5 py-3">
            <div className="text-xs text-[var(--muted-foreground)]">{label}</div>
            <div className="font-mono-data text-lg text-[var(--foreground)]">{value}</div>
            <div className="text-xs text-[var(--muted-foreground)]">{detail}</div>
          </div>
        ))}
      </div>
      <p className="text-sm text-[var(--foreground)]">
        No schedule, no due dates and no late-payment penalties. The developer's finance team checks each payment; the plot is held for you from your first verified payment and is yours once the plan total is verified.
      </p>

      <div className="pt-4 border-t border-[var(--border)] space-y-2">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">If you stop and leave the plan</h3>
        <p className="text-sm text-[var(--muted-foreground)]">You can leave at any time. What you paid comes back from escrow, less the developer's share. For example:</p>
        <table className="w-full text-sm border border-[var(--border)] rounded-lg overflow-hidden border-separate border-spacing-0">
          <thead>
            <tr className="bg-[var(--muted)] text-xs text-[var(--muted-foreground)]">
              <th className="text-left font-medium px-3 py-2">If you have paid</th>
              <th className="text-left font-medium px-3 py-2">You get back</th>
              <th className="text-left font-medium px-3 py-2">The developer keeps</th>
            </tr>
          </thead>
          <tbody>
            {q.ifYouStopAfterPaying.map((r) => (
              <tr key={r.paid} className="font-mono-data text-[var(--foreground)]">
                <td className="px-3 py-2.5">{money(r.paid)}</td>
                <td className="px-3 py-2.5">{money(r.youGetBack)}</td>
                <td className="px-3 py-2.5">{money(r.developerKeeps)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pt-4 border-t border-[var(--border)] space-y-2">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">If HomeTrue later sells your plot for more</h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          After you leave, the plot goes back on sale.{" "}
          {keepsAll ? (
            <>If HomeTrue sells it for more than your <span className="font-mono-data">{money(q.price)}</span> price, the developer keeps all of the difference.</>
          ) : (
            <>
              If HomeTrue sells it for more than your <span className="font-mono-data">{money(q.price)}</span> price, you get {gain.buyerSharePct}% of the difference and the developer keeps {gain.developerSharePct}% — <span className="font-mono-data">{money(gain.perMillionAbove)}</span> for every <span className="font-mono-data">{money(1_000_000)}</span> above your price.
            </>
          )}
        </p>
        {!keepsAll && (
          <div className="rounded-lg border border-[var(--info-border)] bg-[var(--info-surface)] text-[var(--info-text)] px-3.5 py-3 space-y-1.5 text-sm">
            <div className="text-xs font-medium">An example, not a forecast</div>
            <div className="flex justify-between gap-3"><span>If it sold for <span className="font-mono-data">{money(gain.example.soldFor)}</span></span><span className="font-mono-data">{money(gain.example.difference)} more</span></div>
            <div className="flex justify-between gap-3"><span>You would get</span><span className="font-mono-data">{money(gain.example.youGet)}</span></div>
          </div>
        )}
      </div>

      <div className="pt-4 border-t border-[var(--border)] space-y-2">
        <h3 className="text-sm font-semibold text-[var(--foreground)]">If nothing is paid for a while</h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          If no payment is made for {q.inactivityMonths} months{q.maxMonths ? `, or the plan isn't finished within ${q.maxMonths} months` : ""}, the developer may give you {q.noticeDays} days' written notice. A payment during the notice ends it{q.maxMonths ? " — unless the notice is about the finish date, which only finishing ends" : ""}. If not, the plan ends on the same terms as leaving.
        </p>
      </div>
    </div>
  );
}
