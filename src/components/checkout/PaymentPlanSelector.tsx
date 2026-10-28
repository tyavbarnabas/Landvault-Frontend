// Checkout's "How will you pay?", from the Figma "Instalment plans" and
// "Flexible plans" proposals: pay in full, one of the instalment plans the
// developer declared for this tier, or a flexible ("pay as you can") one, each
// with HomeTrue's figures. Nothing is worked out here — every figure is the
// listing's (priceTiers[].paymentPlans / flexiblePlans), and the purchase's
// own schedule or terms replace them once it opens.

import { formatMoney } from "../../lib/formatCurrency";
import OptionCard from "./OptionCard";
import { CalendarIcon, CreditCardIcon, InfoIcon, WalletIcon } from "../icons";
import Badge from "../ui/Badge";
import { frequencyWord, planInSentence, type FlexibleTierPlan, type TierPlan } from "../../services/paymentPlansService";

interface PaymentPlanSelectorProps {
  plans: TierPlan[];
  flexiblePlans?: FlexibleTierPlan[];
  // The price in full, as the listing gives it for this plot.
  price: number;
  currency: string;
  // The chosen plan's id, or null for paying in full.
  planId: string | null;
  onChange: (planId: string | null) => void;
  tierLabel: string;
  corner: boolean;
  // The estate lists milestone payment, which isn't offered online.
  milestoneListed?: boolean;
}

export default function PaymentPlanSelector({ plans, flexiblePlans = [], price, currency, planId, onChange, tierLabel, corner, milestoneListed }: PaymentPlanSelectorProps) {
  const money = (n: number) => formatMoney(n, currency);
  const chosen = plans.find((p) => p.planId === planId) ?? null;
  const chosenFlexible = flexiblePlans.find((p) => p.planId === planId) ?? null;
  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Payment plan" className="grid gap-3">
        <OptionCard name="payment-plan" value="outright" checked={!chosen && !chosenFlexible} onSelect={() => onChange(null)}
          icon={<CreditCardIcon size={20} />} title="Pay in full"
          description={<>Pay the full price at once. The plot is yours once the developer verifies your payment.<span className="sm:hidden"> {money(price)}.</span></>}
          aside={<Total value={money(price)} note="the price" />} />
        {plans.map((p) => (
          <OptionCard key={p.planId} name="payment-plan" value={p.planId} checked={chosen?.planId === p.planId} onSelect={() => onChange(p.planId)}
            icon={<CalendarIcon size={20} />} title={p.name}
            description={<>
              {money(p.deposit)} deposit, then {p.instalmentCount} {frequencyWord(p.frequency)} instalment{p.instalmentCount === 1 ? "" : "s"} of {money(p.instalment)}
              {p.lastInstalment !== p.instalment ? ` (the last ${money(p.lastInstalment)})` : ""}.
              <span className="sm:hidden"> Total {money(p.planTotal)}.</span>
            </>}
            aside={<Total value={money(p.planTotal)} note={p.premium > 0 ? `includes ${money(p.premium)} for paying over time` : "no extra for paying over time"} />} />
        ))}
        {flexiblePlans.map((p) => (
          <OptionCard key={p.planId} name="payment-plan" value={p.planId} checked={chosenFlexible?.planId === p.planId} onSelect={() => onChange(p.planId)}
            icon={<WalletIcon size={20} />} title={<span className="inline-flex flex-wrap items-center gap-2">{p.name}<Badge label="Flexible" variant="info" /></span>}
            description={<>
              {money(p.flexible.minimumToStart)} to start, then any amount you choose, any time, until it's paid. No due dates.
              <span className="sm:hidden"> Total {money(p.flexible.planTotal)}.</span>
            </>}
            aside={<Total value={money(p.flexible.planTotal)} note={p.flexible.premium > 0 ? `includes ${money(p.flexible.premium)} for paying over time` : "no extra for paying over time"} />} />
        ))}
      </div>

      {chosenFlexible && (
        <div className="rounded-xl bg-[var(--muted)] p-4 space-y-2.5">
          <div className="text-sm font-semibold text-[var(--foreground)]">On {planInSentence(chosenFlexible.name)}</div>
          <dl className="space-y-1.5 text-sm">
            <Row label="To start — your first payment" value={`${money(chosenFlexible.flexible.minimumToStart)} or more`} />
            <Row label="After that, each payment" value={chosenFlexible.flexible.minimumContribution ? `${money(chosenFlexible.flexible.minimumContribution)} or more` : "Any amount"} />
            {chosenFlexible.flexible.premium > 0 && <Row label="Includes for paying over time" value={money(chosenFlexible.flexible.premium)} />}
            <div className="border-t border-[var(--border)] pt-2"><Row label="Plan total" value={money(chosenFlexible.flexible.planTotal)} bold /></div>
          </dl>
          <p className="flex gap-2 text-xs text-[var(--muted-foreground)]">
            <InfoIcon size={14} className="mt-px shrink-0" />
            <span>
              You choose each amount and when to pay; nothing is ever late. The plot is held for you from your first verified payment and is yours when the plan total is verified.
              You can leave any time and get back what you paid, less the developer's share — your offer letter sets it out, with what you'd get if HomeTrue later sells the plot for more.
              {corner ? " These figures are for a plot that isn't a corner plot; your offer letter has this plot's, which are higher." : ""}
            </span>
          </p>
        </div>
      )}

      {chosen && (
        <div className="rounded-xl bg-[var(--muted)] p-4 space-y-2.5">
          <div className="text-sm font-semibold text-[var(--foreground)]">On the {chosen.name}</div>
          <dl className="space-y-1.5 text-sm">
            <Row label="Deposit — your first payment" value={money(chosen.deposit)} />
            <Row label={`Then ${chosen.instalmentCount} ${frequencyWord(chosen.frequency)} instalment${chosen.instalmentCount === 1 ? "" : "s"} of`} value={money(chosen.instalment)} />
            {chosen.lastInstalment !== chosen.instalment && <Row label="The last instalment" value={money(chosen.lastInstalment)} />}
            {chosen.premium > 0 && <Row label="Includes for paying over time" value={money(chosen.premium)} />}
            <div className="border-t border-[var(--border)] pt-2"><Row label="Plan total" value={money(chosen.planTotal)} bold /></div>
          </dl>
          <p className="flex gap-2 text-xs text-[var(--muted-foreground)]">
            <InfoIcon size={14} className="mt-px shrink-0" />
            <span>
              Due dates count from today and are fixed once your offer letter is issued. The offer lists every date and what a late instalment costs.
              The plot is yours when the last instalment is verified — until then it's held for you on the plan.
              {corner ? " These figures are for a plot that isn't a corner plot; your offer letter has this plot's, which are higher." : ""}
            </span>
          </p>
        </div>
      )}

      {plans.length === 0 && flexiblePlans.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">The {tierLabel} plots are sold outright only.</p>}
      {milestoneListed && <p className="text-xs text-[var(--muted-foreground)]">Milestone plans aren't available for online payment.</p>}
    </div>
  );
}

function Total({ value, note }: { value: string; note: string }) {
  return (
    <>
      <span className="block font-mono-data font-medium text-[var(--foreground)]">{value}</span>
      <span className="block text-xs text-[var(--muted-foreground)] max-w-44">{note}</span>
    </>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={bold ? "font-semibold text-[var(--foreground)]" : "text-[var(--muted-foreground)]"}>{label}</dt>
      <dd className={`font-mono-data text-[var(--foreground)] ${bold ? "font-medium text-base" : ""}`}>{value}</dd>
    </div>
  );
}
