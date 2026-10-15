// Starts (or resumes) a Paystack payment and sends the browser to Paystack's
// page, where the buyer chooses card or bank transfer. Paystack sends them back
// to /payments/return, which asks the backend what actually happened.

import { useState } from "react";
import { ApiError, ApiTransportError } from "../../lib/apiClient";
import { startPayment } from "../../services/paymentsService";
import Button from "../ui/Button";
import { ErrorText } from "../ui/Field";

export function paymentErrorMessage(err: unknown): string {
  if (err instanceof ApiTransportError) return "We couldn't reach HomeTrue. Check your connection and try again.";
  const code = err instanceof ApiError ? err.body?.code : (err as { code?: string } | null)?.code;
  const message = err instanceof Error ? err.message : "";
  switch (code) {
    case "PAYMENT_PROVIDER_UNAVAILABLE": return "Paystack isn't responding right now. Please try again in a moment.";
    case "TRANSACTION_NOT_PAYABLE": return message || "This purchase can't be paid for — it may already be paid, verified or ended.";
    case "TRANSACTION_NOT_FOUND": return "We couldn't find this purchase.";
    // The rest (PAYMENT_PLAN_NOT_SUPPORTED, CURRENCY_NOT_SUPPORTED,
    // PAYMENT_PROVIDER_REFUSED, INVALID_AMOUNT): the backend's message is
    // written for people.
    default: return message || "We couldn't start your payment. Please try again.";
  }
}

export default function PayButton({ transactionId, label, busy, onBusy }: {
  transactionId: string;
  label: string;
  busy?: boolean;
  onBusy?: (busy: boolean) => void;
}) {
  const [error, setError] = useState("");
  const [localBusy, setLocalBusy] = useState(false);
  const working = busy ?? localBusy;

  const pay = async () => {
    setError("");
    setLocalBusy(true);
    onBusy?.(true);
    try {
      const payment = await startPayment(transactionId);
      // Leave for Paystack. Nothing is "paid" until the return page verifies.
      window.location.assign(payment.authorizationUrl);
    } catch (err) {
      setError(paymentErrorMessage(err));
      setLocalBusy(false);
      onBusy?.(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button size="lg" fullWidth onClick={pay} disabled={working}>{working ? "Opening Paystack…" : label}</Button>
      {error && <ErrorText>{error}</ErrorText>}
      <p className="text-xs text-[var(--muted-foreground)]">You'll pay on Paystack's secure page — by card or bank transfer — then come back here.</p>
    </div>
  );
}
