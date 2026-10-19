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

// `layout="rows"`: the estate page's expandable rows inside one card. Both
// exits still always render together — only their container changes.
export default function ExitCostsPanel({ exitCosts, layout = "cards" }: { exitCosts: ExitCosts; layout?: "cards" | "rows" }) {
  // Field names are the backend's: ifYouWithdraw / ifYouFallBehind.
  const { ifYouWithdraw: refund, ifYouFallBehind: penaltySteps, revocation, currency, basisLandPrice, basisTierLabel } = exitCosts;
  if (layout === "rows") return <ExitRows exitCosts={exitCosts} />;

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

function ExitRow({ title, summary, open, children }: { title: string; summary: React.ReactNode; open?: boolean; children: React.ReactNode }) {
  return (
    <details open={open} className="group border-t border-[var(--border)] first:border-t-0">
      <summary className="flex items-center justify-between gap-4 py-4 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[var(--foreground)]">{title}</span>
          <span className="block text-xs text-[var(--muted-foreground)] mt-0.5">{summary}</span>
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className="shrink-0 text-[var(--muted-foreground)] transition-transform group-open:rotate-90">
          <path d="m9 18 6-6-6-6" />
        </svg>
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}

function ExitRows({ exitCosts }: { exitCosts: ExitCosts }) {
  const { ifYouWithdraw: refund, ifYouFallBehind: penaltySteps, revocation, currency, basisLandPrice, basisTierLabel } = exitCosts;
  const money = (n: number) => <span className="font-mono-data">{formatDeclaredAmount(n, currency)}</span>;
  return (
    <div>
      {exitCosts.bothPathsCarryACost && (
        <p className="text-sm text-[var(--foreground)] mb-2">
          Both ways out of this purchase cost something: falling behind is penalised, and withdrawing forfeits part of what you paid.
        </p>
      )}
      <ExitRow open title="If you withdraw" summary={`Illustrated for the ${basisTierLabel} tier, paid in full`}>
        <dl className="rounded-lg bg-[var(--muted)] p-3.5 space-y-2 text-sm">
          <div className="flex justify-between gap-3"><dt className="text-[var(--foreground)]">You get back</dt><dd className="font-semibold">{money(refund.refundAmount)}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-[var(--muted-foreground)]">Administrative deduction ({refund.deductionPct}% of {formatDeclaredAmount(basisLandPrice, currency)})</dt><dd className="text-[var(--muted-foreground)]">−{money(refund.deduction)}</dd></div>
          {refund.nonRefundableFees > 0 && (
            <div className="flex justify-between gap-3"><dt className="text-[var(--muted-foreground)]">Fees already paid that are not refundable</dt><dd className="text-[var(--muted-foreground)]">−{money(refund.nonRefundableFees)}</dd></div>
          )}
          {refund.processingDays !== undefined && (
            <div className="flex justify-between gap-3"><dt className="text-[var(--muted-foreground)]">Paid back within</dt><dd className="font-medium">about {refund.processingDays} days</dd></div>
          )}
        </dl>
      </ExitRow>
      <ExitRow title="If you fall behind on payments" summary={penaltySteps.length === 0 ? "No late-payment penalty has been declared for this estate" : `${penaltySteps.length} penalty step${penaltySteps.length > 1 ? "s" : ""} declared`}>
        {penaltySteps.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">No late-payment penalty has been declared for this estate.</p>
        ) : (
          <div className="divide-y divide-[var(--border)]">
            {penaltySteps.map((step) => (
              <div key={step.monthsLate} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="text-[var(--muted-foreground)]">{step.monthsLate} months late ({step.penaltyPct}%)</span>
                {money(step.amount)}
              </div>
            ))}
          </div>
        )}
      </ExitRow>
      {revocation && (
        <ExitRow title="If the allocation is revoked" summary={`${revocation.noticeDays} days' notice first`}>
          <dl className="space-y-2 text-sm">
            <div><dt className="text-xs text-[var(--muted-foreground)]">What triggers it</dt><dd>{revocation.trigger}</dd></div>
            <div><dt className="text-xs text-[var(--muted-foreground)]">What happens to money already paid</dt><dd>{revocation.paymentsAlreadyMade}</dd></div>
          </dl>
        </ExitRow>
      )}
    </div>
  );
}
