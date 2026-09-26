// Both exits, in one view, deliberately.
//
// One real estate penalises up to 20% for falling behind AND deducts 20% on
// withdrawal — meaning there is no exit that does not cost. Neither clause is
// hidden on its own; the trap is only visible when both appear at once, which
// is why the backend returns them together and why this component never
// renders one without the other.
//
// Tone: these are lawful terms that thousands of people accept every year.
// The platform's contribution is timing, not judgement — so nothing here
// calls a term unfair, expensive or hidden. It states the figures.

import { formatDeclaredAmount } from "../../lib/formatCurrency";
import type { ExitCosts } from "../../services/costDisclosureService";

export default function ExitCostsPanel({ exitCosts }: { exitCosts: ExitCosts }) {
  // Field names are the backend's: ifYouWithdraw / ifYouFallBehind.
  const { ifYouWithdraw: refund, ifYouFallBehind: penaltySteps, revocation, currency, basisLandPrice, basisTierLabel } = exitCosts;

  return (
    <div>
      {/* The backend's own "no free exit" determination — read, never
          re-derived here, so the two can't disagree about it. */}
      {exitCosts.bothPathsCarryACost && (
        <p className="text-sm text-[var(--foreground)] mb-3">
          Both ways out of this purchase cost something: falling behind is penalised, and withdrawing forfeits part of what you paid.
        </p>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {/* Withdrawal — the naira figure, not the percentage. "20%
            administrative charge" is abstract; this is what a buyer reacts to. */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">If you withdraw</h3>
          {/* An illustration of one tier, assuming payment in full — a maximum
              exposure, not this buyer's position. Nothing here knows that. */}
          <p className="text-xs text-[var(--muted-foreground)] mb-2">Illustrated against the {basisTierLabel} tier, assuming payment in full.</p>
          <p className="text-sm text-[var(--foreground)] leading-relaxed">
            You receive <span className="font-mono-data font-semibold">{formatDeclaredAmount(refund.refundAmount, currency)}</span> — a loss of{" "}
            <span className="font-mono-data font-semibold">{formatDeclaredAmount(refund.totalLoss, currency)}</span>
            {refund.processingDays !== undefined ? ` — after approximately ${refund.processingDays} days.` : "."}
          </p>
          <div className="mt-3 space-y-1.5 text-xs text-[var(--muted-foreground)]">
            <div className="flex justify-between gap-3">
              <span>Administrative deduction ({refund.deductionPct}% of {formatDeclaredAmount(basisLandPrice, currency)})</span>
              <span className="font-mono-data shrink-0">{formatDeclaredAmount(refund.deduction, currency)}</span>
            </div>
            {refund.nonRefundableFees > 0 && (
              <div className="flex justify-between gap-3">
                <span>Fees already paid that are not refundable</span>
                <span className="font-mono-data shrink-0">{formatDeclaredAmount(refund.nonRefundableFees, currency)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Falling behind — each step's amount is computed by the backend. */}
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">If you fall behind on payments</h3>
          {penaltySteps.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">No late-payment penalty has been declared for this estate.</p>
          ) : (
            <div className="divide-y divide-[var(--border)]">
              {penaltySteps.map((step) => (
                <div key={step.monthsLate} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="text-[var(--muted-foreground)]">{step.monthsLate} months late ({step.penaltyPct}%)</span>
                  <span className="font-mono-data text-[var(--foreground)]">{formatDeclaredAmount(step.amount, currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* The worst outcome, including the part buyers never think to ask
          about: what happens to money already paid. Rendered only when a
          revocation clause has actually been sourced — an absent clause is
          absent, never filled in with plausible wording. */}
      {revocation && (
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 mt-4">
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">If the allocation is revoked</h3>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-xs text-[var(--muted-foreground)]">What triggers it</dt>
            <dd className="text-[var(--foreground)]">{revocation.trigger}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted-foreground)]">Notice you receive first</dt>
            <dd className="text-[var(--foreground)]">{revocation.noticeDays} days</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted-foreground)]">What happens to money already paid</dt>
            <dd className="text-[var(--foreground)]">{revocation.paymentsAlreadyMade}</dd>
          </div>
        </dl>
      </div>
      )}
    </div>
  );
}
