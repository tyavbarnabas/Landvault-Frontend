// Reusable payment-plan picker — generalizes the outright/installment step
// that used to live only inline in the internal Checkout.tsx, and adds
// "milestone" (marketplaceService.ts's third PaymentPlanType), filtered to
// whatever the listing actually offers.

import { formatAmount } from "../../data/mockData";
import OptionCard from "./OptionCard";
import { BuildingIcon, CalendarIcon, CreditCardIcon } from "../icons";
import type { Currency } from "../../data/mockData";
import type { PaymentPlanType } from "../../services/marketplaceService";

interface PaymentPlanSelectorProps {
  availablePlans: PaymentPlanType[];
  totalPrice: number;
  currency: Currency;
  plan: PaymentPlanType;
  onPlanChange: (plan: PaymentPlanType) => void;
  installmentMonths: number;
  onInstallmentMonthsChange: (months: number) => void;
  // Plans the estate offers that can't be chosen here (live online payment is
  // outright-only for now): shown greyed out with the reason, not hidden.
  unavailablePlans?: PaymentPlanType[];
  unavailableReason?: string;
}

const PLAN_INFO: Record<PaymentPlanType, { label: string; icon: React.ReactNode; desc: (total: string) => string }> = {
  outright: { label: "Pay in full", icon: <CreditCardIcon size={20} />, desc: (total) => `${total} today. The plot is allocated once the developer verifies your payment.` },
  installment: { label: "Pay in instalments", icon: <CalendarIcon size={20} />, desc: () => "20% deposit now, balance spread evenly over your chosen period." },
  milestone: { label: "Pay by milestone", icon: <BuildingIcon size={20} />, desc: () => "20% deposit now, balance tied to development milestones as they're reached." },
};

export function depositFor(plan: PaymentPlanType, totalPrice: number): number {
  return plan === "outright" ? totalPrice : totalPrice * 0.2;
}

export default function PaymentPlanSelector({ availablePlans, totalPrice, currency, plan, onPlanChange, installmentMonths, onInstallmentMonthsChange, unavailablePlans = [], unavailableReason }: PaymentPlanSelectorProps) {
  const deposit = depositFor(plan, totalPrice);
  const remaining = totalPrice - deposit;
  const installmentAmount = plan !== "outright" ? remaining / installmentMonths : 0;

  return (
    <div>
      <div role="radiogroup" aria-label="Payment plan" className="grid gap-3">
        {availablePlans.map((p) => (
          <OptionCard key={p} name="payment-plan" value={p} checked={plan === p} onSelect={() => onPlanChange(p)}
            icon={PLAN_INFO[p].icon} title={PLAN_INFO[p].label} description={PLAN_INFO[p].desc(formatAmount(totalPrice, currency))} />
        ))}
        {unavailablePlans.filter((p) => !availablePlans.includes(p)).map((p) => (
          <OptionCard key={p} name="payment-plan" value={p} checked={false} onSelect={() => {}} disabled
            icon={PLAN_INFO[p].icon} title={PLAN_INFO[p].label} description={unavailableReason ?? "Not available here."} />
        ))}
      </div>

      {plan !== "outright" && (
        <div className="mt-4 bg-[var(--muted)] rounded-xl p-4">
          <label htmlFor="plan-length" className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">{plan === "milestone" ? "Number of milestones" : "Duration"}</label>
          <select id="plan-length" value={installmentMonths} onChange={(e) => onInstallmentMonthsChange(Number(e.target.value))} className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md bg-[var(--card)]">
            {[6, 9, 12, 18, 24].map((m) => <option key={m} value={m}>{m} {plan === "milestone" ? "milestones" : "months"}</option>)}
          </select>
          <div className="mt-3 space-y-1.5 text-sm">
            <Row label="Deposit today (20%)" value={formatAmount(deposit, currency)} />
            <Row label={plan === "milestone" ? "Per milestone" : "Monthly installment"} value={formatAmount(installmentAmount, currency)} />
            <Row label="Total" value={formatAmount(totalPrice, currency)} bold />
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--muted-foreground)]">{label}</span>
      <span className={`font-mono-data ${bold ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}
