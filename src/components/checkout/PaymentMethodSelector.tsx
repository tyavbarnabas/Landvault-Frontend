// Extracted from MarketplaceCheckout.tsx's inline payment-method buttons so
// PlotView.tsx's installment payment can reuse the exact same selector
// instead of a second implementation. Routed by the buyer's country of
// residence (paymentMethodsForCountry) — never asked to choose local vs
// diaspora again. NOTE: Stripe is not a Nigerian local rail — never wire it
// as the default here.

import { PAYMENT_METHOD_INFO, type MarketplacePaymentMethod } from "../../services/marketplaceCheckoutService";

interface PaymentMethodSelectorProps {
  methods: MarketplacePaymentMethod[];
  selected: MarketplacePaymentMethod | null;
  onSelect: (method: MarketplacePaymentMethod) => void;
}

export default function PaymentMethodSelector({ methods, selected, onSelect }: PaymentMethodSelectorProps) {
  return (
    <div className="grid gap-2" role="radiogroup" aria-label="Payment method">
      {methods.map((m) => (
        <button
          key={m}
          type="button"
          role="radio"
          aria-checked={selected === m}
          onClick={() => onSelect(m)}
          className={`text-left p-3 rounded-lg border-2 transition-colors flex items-center gap-3 ${selected === m ? "border-[var(--primary)] bg-[var(--secondary)]" : "border-[var(--border)]"}`}
        >
          <span className="text-xl" aria-hidden="true">{PAYMENT_METHOD_INFO[m].flag}</span>
          <div>
            <div className="text-sm font-medium">{PAYMENT_METHOD_INFO[m].label}</div>
            <div className="text-xs text-[var(--muted-foreground)]">{PAYMENT_METHOD_INFO[m].desc}</div>
          </div>
        </button>
      ))}
    </div>
  );
}
