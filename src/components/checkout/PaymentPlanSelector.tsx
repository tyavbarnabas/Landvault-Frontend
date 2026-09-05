// Reusable payment-plan picker — generalizes the outright/installment step
// that used to live only inline in the internal Checkout.tsx, and adds
// "milestone" (marketplaceService.ts's third PaymentPlanType), filtered to
// whatever the listing actually offers.

import { formatAmount } from "../../data/mockData";
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
}

const PLAN_INFO: Record<PaymentPlanType, { label: string; icon: string; desc: (total: string) => string }> = {
  outright: { label: "Outright payment", icon: "⚡", desc: (total) => `Pay ${total} today and documents are issued once verified.` },
  installment: { label: "Installment plan", icon: "📅", desc: () => "20% deposit now, balance spread evenly over your chosen period." },
  milestone: { label: "Milestone plan", icon: "🏗", desc: () => "20% deposit now, balance tied to development milestones as they're reached." },
};

export function depositFor(plan: PaymentPlanType, totalPrice: number): number {
  return plan === "outright" ? totalPrice : totalPrice * 0.2;
}

export default function PaymentPlanSelector({ availablePlans, totalPrice, currency, plan, onPlanChange, installmentMonths, onInstallmentMonthsChange }: PaymentPlanSelectorProps) {
  const deposit = depositFor(plan, totalPrice);
  const remaining = totalPrice - deposit;
  const installmentAmount = plan !== "outright" ? remaining / installmentMonths : 0;

  return (
    <div>
      <div className="grid gap-3 mb-4">
        {availablePlans.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPlanChange(p)}
            className={`text-left p-4 rounded-xl border-2 transition-colors ${plan === p ? "border-[var(--primary)] bg-[var(--secondary)]" : "border-[var(--border)]"}`}
          >
            <div className="flex items-start gap-3">
              <span className="text-xl mt-0.5">{PLAN_INFO[p].icon}</span>
              <div>
                <div className="font-semibold text-sm">{PLAN_INFO[p].label}</div>
                <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{PLAN_INFO[p].desc(formatAmount(totalPrice, currency))}</div>
              </div>
            </div>
          </button>
        ))}
      </div>

      {plan !== "outright" && (
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4">
          <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">{plan === "milestone" ? "Number of milestones" : "Duration"}</label>
          <select value={installmentMonths} onChange={(e) => onInstallmentMonthsChange(Number(e.target.value))} className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md bg-[var(--card)]">
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
