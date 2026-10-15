// Where Paystack sends the buyer back: /payments/return?reference=…&trxref=…
//
// ARRIVING HERE PROVES NOTHING. Anyone can type this address. The only thing
// that counts is POST /api/payments/{reference}/verify — the backend asking
// Paystack. And even a confirmed payment means "received, being verified by
// the developer", never "the plot is yours": that's the purchase page's call,
// once finance verifies. This page never says it.

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatInCurrency } from "../../data/mockData";
import { ApiError, ApiTransportError } from "../../lib/apiClient";
import { pollUntilSettled } from "../../lib/purchaseStatus";
import PayButton from "../../components/purchases/PayButton";
import PurchaseStatusPanel from "../../components/purchases/PurchaseStatusPanel";
import Page, { Loading } from "../../components/ui/Page";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import TextLink from "../../components/ui/TextLink";
import { fetchPurchase, verifyPayment, type Payment, type Purchase } from "../../services/paymentsService";

type Problem = { kind: "not_found" } | { kind: "provider"; message: string } | { kind: "other"; message: string };

export default function PaymentReturn() {
  const [params] = useSearchParams();
  // Paystack sends both; they carry the same value.
  const reference = params.get("reference") ?? params.get("trxref");

  const [payment, setPayment] = useState<Payment | null>(null);
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [problem, setProblem] = useState<Problem | null>(reference ? null : { kind: "not_found" });
  const [polling, setPolling] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  // Each check gets a number; only the latest may keep polling or set state.
  // (A shared on/off flag let two loops run when React mounts twice.)
  const run = useRef(0);

  const check = useCallback(async () => {
    if (!reference) return;
    const mine = ++run.current;
    const stale = () => run.current !== mine;
    setProblem(null);
    setGaveUp(false);
    setPolling(true);
    try {
      const outcome = await pollUntilSettled(
        () => verifyPayment(reference),
        (p) => { if (!stale()) setPayment(p); },
        { cancelled: stale },
      );
      if (outcome === "gave_up") setGaveUp(true);
    } catch (err) {
      if (stale()) return;
      const code = err instanceof ApiError ? err.body?.code : (err as { code?: string }).code;
      if (code === "PAYMENT_NOT_FOUND") setProblem({ kind: "not_found" });
      else if (code === "PAYMENT_PROVIDER_UNAVAILABLE" || code === "PAYMENT_PROVIDER_REFUSED") {
        setProblem({ kind: "provider", message: "We couldn't check with Paystack just now. Your payment is safe — please check again in a moment." });
      } else if (err instanceof ApiTransportError) setProblem({ kind: "other", message: "We couldn't reach HomeTrue. Check your connection and try again." });
      else setProblem({ kind: "other", message: err instanceof Error && err.message ? err.message : "Something went wrong checking your payment." });
    } finally {
      if (!stale()) setPolling(false);
    }
  }, [reference]);

  useEffect(() => {
    void check();
    // Leaving the page (or a fresh check) makes any running loop stale.
    return () => { run.current++; };
  }, [check]);

  // Late money is reviewed by a person: the purchase says which way it's going.
  useEffect(() => {
    if (payment?.underReview) fetchPurchase(payment.transactionId).then(setPurchase).catch(() => {});
  }, [payment?.underReview, payment?.transactionId]);

  return (
    <Page title="Your payment" width="sm" titleSize="md" className="py-12">
      <div className="space-y-5">
      {problem?.kind === "not_found" && (
        <Notice tone="warning" title="We couldn't find that payment">
          If you've just paid, open your purchase from the marketplace to see where it stands.
        </Notice>
      )}
      {problem && problem.kind !== "not_found" && (
        <>
          <Notice tone="warning" title="We couldn't check your payment">{problem.message}</Notice>
          <Button variant="link" onClick={() => void check()}>Check again</Button>
        </>
      )}

      {!problem && !payment && <Loading label="Checking your payment with Paystack…" />}

      {!problem && payment && <Outcome payment={payment} purchase={purchase} polling={polling} gaveUp={gaveUp} onCheckAgain={() => void check()} />}

      {payment && (
        <TextLink to={`/purchases/${payment.transactionId}`} className="inline-block text-sm">View your purchase →</TextLink>
      )}
      </div>
    </Page>
  );
}

function Outcome({ payment, purchase, polling, gaveUp, onCheckAgain }: {
  payment: Payment; purchase: Purchase | null; polling: boolean; gaveUp: boolean; onCheckAgain: () => void;
}) {
  const amount = formatInCurrency(payment.amount, payment.currency);

  if (payment.underReview) {
    // Late money or a refund: the purchase's own words, never "owned".
    return purchase ? <PurchaseStatusPanel purchase={purchase} />
      : <Notice tone="info" title="We've received your payment">A person is reviewing it. Your purchase page says what happens next.</Notice>;
  }

  switch (payment.status) {
    case "succeeded":
      return (
        <Notice tone="info" title="Payment received — the developer is verifying it">
          Paystack confirmed {amount}. The developer's finance team checks it before allocating the plot to you; your purchase page will show when they have.
        </Notice>
      );
    case "initialized":
    case "abandoned":
      return (
        <>
          <Notice tone="neutral" title="Your payment is still being processed">
            {polling ? "Bank transfers can take a few minutes. This page keeps checking." : "It hasn't come through yet. Bank transfers can take a few minutes."}
          </Notice>
          {gaveUp && !polling && (
            <Button variant="link" onClick={onCheckAgain}>Check again</Button>
          )}
        </>
      );
    case "failed":
      return (
        <>
          <Notice tone="warning" title="Your payment didn't go through">
            {payment.gatewayResponse ? <>Paystack said: “{payment.gatewayResponse}”. </> : null}Nothing was taken.
          </Notice>
          <PayButton transactionId={payment.transactionId} label="Pay again" />
        </>
      );
    case "mismatched":
      return (
        <Notice tone="warning" title="We received a payment we need to review">
          The amount didn't match what was agreed. Our team will contact you.
        </Notice>
      );
  }
}

function Notice({ tone, title, children }: { tone: "info" | "warning" | "neutral"; title: string; children: React.ReactNode }) {
  return <Alert tone={tone} title={title} role="status"><p>{children}</p></Alert>;
}
