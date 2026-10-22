// Starts (or resumes) a Paystack payment and sends the browser to Paystack's
// page, where the buyer chooses card or bank transfer. Paystack sends them back
// to /payments/return, which asks the backend what actually happened.

import { useState } from "react";
import { useNavigate, type NavigateFunction } from "react-router-dom";
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
    case "OFFER_NOT_ACCEPTED": return "Accept the offer letter first — payment opens straight after.";
    case "INSTALMENT_AWAITING_VERIFICATION": return "Your last payment is waiting for the developer's finance team to verify it. You can pay the next one after that.";
    case "NOTHING_TO_PAY_OFF": return "There's no active plan on this purchase to pay off.";
    // The rest (PAYMENT_PLAN_NOT_SUPPORTED, CURRENCY_NOT_SUPPORTED,
    // PAYMENT_PROVIDER_REFUSED, INVALID_AMOUNT): the backend's message is
    // written for people.
    default: return message || "We couldn't start your payment. Please try again.";
  }
}

// Off to Paystack. Demo mode's "gateway" link is a path in this app, followed
// in-app so the demo's in-memory purchase survives the trip.
export function goToPaystack(url: string, navigate: NavigateFunction): void {
  if (url.startsWith("/")) navigate(url);
  else window.location.assign(url);
}

export default function PayButton({ transactionId, label, busy, onBusy, onOfferNotAccepted, disabled, note = true, onRefused }: {
  transactionId: string;
  label: string;
  busy?: boolean;
  onBusy?: (busy: boolean) => void;
  disabled?: boolean;
  // The "You'll pay on Paystack's secure page" line under the button.
  note?: boolean;
  // A refusal the page shows itself (e.g. refetching on INSTALMENT_AWAITING_VERIFICATION).
  onRefused?: (code: string | undefined) => void;
  // 409 OFFER_NOT_ACCEPTED: where to show the offer and its Accept step.
  onOfferNotAccepted?: () => void;
}) {
  const [error, setError] = useState("");
  const [localBusy, setLocalBusy] = useState(false);
  const working = busy ?? localBusy;
  const navigate = useNavigate();

  const pay = async () => {
    setError("");
    setLocalBusy(true);
    onBusy?.(true);
    try {
      const payment = await startPayment(transactionId);
      // Leave for Paystack. Nothing is "paid" until the return page verifies.
      goToPaystack(payment.authorizationUrl, navigate);
    } catch (err) {
      if (onOfferNotAccepted && err instanceof ApiError && err.body?.code === "OFFER_NOT_ACCEPTED") {
        setLocalBusy(false);
        onBusy?.(false);
        onOfferNotAccepted();
        return;
      }
      setError(paymentErrorMessage(err));
      onRefused?.(err instanceof ApiError ? err.body?.code : undefined);
      setLocalBusy(false);
      onBusy?.(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button size="lg" fullWidth onClick={pay} disabled={working || disabled}>{working ? "Opening Paystack…" : label}</Button>
      {error && <ErrorText>{error}</ErrorText>}
      {note && <p className="text-xs text-[var(--muted-foreground)]">You'll pay on Paystack's secure page — by card or bank transfer — then come back here.</p>}
    </div>
  );
}
