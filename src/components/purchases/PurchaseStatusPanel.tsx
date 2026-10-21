// A purchase's state, as its buyer should read it (lib/purchaseStatus.ts
// decides the words), with the Pay button when paying is possible. Used by the
// purchase page and the payment return page, so both always agree.

import { useState } from "react";
import { describePurchase } from "../../lib/purchaseStatus";
import type { Purchase } from "../../services/paymentsService";
import PayButton from "./PayButton";
import Alert from "../ui/Alert";

// `refundShown`: the page shows the refund in full (RefundPanel), so the
// one-line summary would only repeat it.
export default function PurchaseStatusPanel({ purchase, refundShown = false }: { purchase: Purchase; refundShown?: boolean }) {
  const state = describePurchase(purchase);
  const [paying, setPaying] = useState(false);
  const offerWaiting = !!purchase.offer && !purchase.offer.acceptedAt;
  return (
    <div className="space-y-3">
      <Alert tone={state.tone} title={state.title} role="status">
        <p>{state.body}</p>
        {state.refund && !refundShown && <p className="mt-2 font-medium">{state.refund}</p>}
      </Alert>
      {/* The offer letter comes first (changeset 098): its card says how. */}
      {state.canPay && offerWaiting && (
        <p className="text-sm text-[var(--muted-foreground)]">Accept the offer letter for this purchase, then pay here.</p>
      )}
      {state.canPay && !offerWaiting && <PayButton transactionId={purchase.id} label={state.payLabel} busy={paying} onBusy={setPaying} />}
      {state.payNote && purchase.status === "pending_payment" && (
        <p className="text-xs text-[var(--muted-foreground)]">{state.payNote}</p>
      )}
    </div>
  );
}
