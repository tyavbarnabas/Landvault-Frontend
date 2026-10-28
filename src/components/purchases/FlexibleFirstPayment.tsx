// A flexible ("pay as you can") plan's first payment, from the Figma "Flexible
// plans" checkout frame: the buyer chooses how much to pay now, between the
// minimum to start and the plan total — both the purchase's own figures. The
// amount is the one figure the page ever sends; the backend checks it
// (INVALID_AMOUNT, shown under the button as it words it).

import { useId, useState } from "react";
import { formatMoney } from "../../lib/formatCurrency";
import type { PurchaseFlexible } from "../../services/paymentPlansService";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import { Field, Input, describedBy } from "../ui/Field";
import PayButton from "./PayButton";

// "5,000,000" or "5000000.50" → a number of naira; NaN when it isn't one.
function parseAmount(text: string): number {
  const t = text.replace(/[,\s₦]/g, "");
  return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : NaN;
}

// A figure as the buyer would type it: "1,500,000", or "1,500,000.50".
const asText = (n: number) => n.toLocaleString("en-NG", { maximumFractionDigits: 2 });

export default function FlexibleFirstPayment({ transactionId, flexible, onOfferNotAccepted }: {
  transactionId: string; flexible: PurchaseFlexible; onOfferNotAccepted?: () => void;
}) {
  const id = useId();
  const money = (n: number) => formatMoney(n, "NGN");
  const [text, setText] = useState(asText(flexible.minimumToStart));
  const amount = parseAmount(text);
  const inRange = Number.isFinite(amount) && amount >= flexible.minimumToStart && amount <= flexible.planTotal;
  const hint = `Between ${money(flexible.minimumToStart)} and ${money(flexible.planTotal)}, in naira and kobo.`;
  // Nothing typed yet shows only the hint; anything unusable says why.
  const error = text.trim() === "" ? undefined : !Number.isFinite(amount) ? "Enter an amount in naira, like 1,500,000." : !inRange ? `Pay at least ${money(flexible.minimumToStart)} and no more than ${money(flexible.planTotal)}.` : undefined;
  const quick: [string, number][] = [["The minimum", flexible.minimumToStart], ["The whole plan", flexible.planTotal]];
  return (
    <Card as="section" aria-labelledby={`${id}-h`} className="space-y-4 sm:p-6">
      <div>
        <h2 id={`${id}-h`} className="flex flex-wrap items-center gap-2 font-semibold text-[var(--foreground)]">Your first payment <Badge label={flexible.planName} variant="info" /></h2>
        <p className="text-sm text-[var(--muted-foreground)]">Choose how much to pay now. Anything from the minimum to the whole plan total — you can pay the rest whenever you like.</p>
      </div>
      <Field id={`${id}-amount`} label="Amount to pay now (₦)" hint={hint} error={error}>
        <Input id={`${id}-amount`} inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} className="font-mono-data"
          aria-invalid={!!error} aria-describedby={describedBy(`${id}-amount`, { hint: true, error })} />
      </Field>
      <div className="flex flex-wrap gap-2" aria-label="Quick amounts">
        {quick.map(([label, n]) => (
          <button key={label} type="button" onClick={() => setText(asText(n))}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${amount === n ? "border-[var(--primary)] bg-[var(--secondary)] text-[var(--secondary-foreground)]" : "border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)]"}`}>
            {label} · <span className="font-mono-data">{money(n)}</span>
          </button>
        ))}
      </div>
      <PayButton transactionId={transactionId} amount={inRange ? amount : undefined} disabled={!inRange}
        label={inRange ? `Pay ${money(amount)} with Paystack` : "Pay with Paystack"} onOfferNotAccepted={onOfferNotAccepted} />
    </Card>
  );
}
