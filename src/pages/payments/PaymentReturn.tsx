// Where Paystack sends the buyer back: /payments/return?reference=…&trxref=…
//
// ARRIVING HERE PROVES NOTHING. Anyone can type this address. The only thing
// that counts is POST /api/payments/{reference}/verify — the backend asking
// Paystack. And even a confirmed payment means "received, being verified by
// the developer", never "the plot is yours": that's the purchase page's call,
// once finance verifies. This page never says it.
//
// Laid out from the Figma buyer-path proposal: inside the site header and
// footer (it used to have neither), one outcome per card with an icon, the
// amount and reference, and the purchase page's own timeline.

import { planInSentence } from "../../services/paymentPlansService";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatMoney } from "../../lib/formatCurrency";
import { ApiError, ApiTransportError } from "../../lib/apiClient";
import { pollUntilSettled, purchaseTimeline } from "../../lib/purchaseStatus";
import PayButton from "../../components/purchases/PayButton";
import PurchaseStatusPanel from "../../components/purchases/PurchaseStatusPanel";
import PurchaseTimeline from "../../components/purchases/PurchaseTimeline";
import { Loading } from "../../components/ui/Page";
import Card, { InfoBox } from "../../components/ui/Card";
import Button, { LinkButton } from "../../components/ui/Button";
import { cx } from "../../components/ui/cx";
import { AlertIcon, CheckIcon, ClockIcon, InfoIcon } from "../../components/icons";
import { paidWithLabel } from "../../services/financeService";
import { fetchListingById } from "../../services/marketplaceService";
import { fetchPlotById, plotLabel } from "../../services/marketplacePlotsService";
import { fetchPurchase, verifyPayment, type Payment, type Purchase } from "../../services/paymentsService";

type Problem = { kind: "not_found" } | { kind: "provider"; message: string } | { kind: "other"; message: string };
// What the buyer bought, in words, for the status line. Display only.
type Bought = { purchase: Purchase; what: string | null };

export default function PaymentReturn() {
  const [params] = useSearchParams();
  // Paystack sends both; they carry the same value.
  const reference = params.get("reference") ?? params.get("trxref");

  const [payment, setPayment] = useState<Payment | null>(null);
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

  // The purchase behind the payment: its progress for the timeline, its
  // own words when a person is reviewing late money, and what was bought.
  const [bought, setBought] = useState<Bought | null>(null);
  useEffect(() => {
    if (!payment?.transactionId) return;
    let cancelled = false;
    (async () => {
      const purchase = await fetchPurchase(payment.transactionId);
      if (!purchase || cancelled) return;
      const [listing, plot] = await Promise.all([
        fetchListingById(purchase.estateId).catch(() => undefined),
        fetchPlotById(purchase.estateId, purchase.plotId).catch(() => undefined),
      ]);
      if (!cancelled) setBought({ purchase, what: [listing?.name, plot ? plotLabel(plot) : null].filter(Boolean).join(", ") || null });
    })().catch(() => {});
    return () => { cancelled = true; };
  }, [payment?.transactionId, payment?.status]);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      {problem?.kind === "not_found" && (
        <Status tone="neutral" icon={<InfoIcon size={22} />} title="We couldn't find that payment"
          body="If you've just paid, your purchases list shows where it stands."
          actions={<><LinkButton to="/purchases">Open My purchases</LinkButton><LinkButton to="/marketplace" variant="secondary">Back to the marketplace</LinkButton></>} />
      )}
      {problem && problem.kind !== "not_found" && (
        <Status tone="warning" icon={<AlertIcon size={22} />} title="We couldn't check your payment" body={problem.message}
          actions={<Button onClick={() => void check()}>Check again</Button>} />
      )}

      {!problem && !payment && <Card><Loading label="Checking your payment with Paystack…" /></Card>}

      {!problem && payment && <Outcome payment={payment} bought={bought} polling={polling} gaveUp={gaveUp} onCheckAgain={() => void check()} />}
    </div>
  );
}

function Outcome({ payment, bought, polling, gaveUp, onCheckAgain }: {
  payment: Payment; bought: Bought | null; polling: boolean; gaveUp: boolean; onCheckAgain: () => void;
}) {
  const amount = formatMoney(payment.amount, payment.currency);
  const forWhat = bought?.what ? ` for ${bought.what}` : "";
  const paidBy = paidWithLabel(payment.channel, null);
  const facts = (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <InfoBox label="Amount"><span className="font-mono-data font-medium">{amount}</span></InfoBox>
      <InfoBox label="Reference"><span className="font-mono-data break-all">{payment.reference}</span></InfoBox>
      <InfoBox label="Paid by"><span className="first-letter:uppercase inline-block">{paidBy ?? "—"}</span></InfoBox>
    </div>
  );
  // Secondary whenever the card has another main action (Pay again, Check again).
  const purchaseLink = (variant: "primary" | "secondary" = "primary") => <LinkButton to={`/purchases/${payment.transactionId}`} variant={variant}>View your purchase</LinkButton>;
  const back = <LinkButton to="/marketplace" variant="secondary">Back to the marketplace</LinkButton>;
  const timeline = bought && (
    <div>
      <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">What happens next</h2>
      <PurchaseTimeline steps={purchaseTimeline(bought.purchase)} />
    </div>
  );

  if (payment.underReview) {
    // Late money or a refund: the purchase's own words, never "owned".
    return (
      <div className="space-y-4">
        {bought ? <PurchaseStatusPanel purchase={bought.purchase} />
          : <Status tone="info" icon={<InfoIcon size={22} />} title="We've received your payment" body="A person is reviewing it. Your purchase page says what happens next." />}
        <div className="flex flex-wrap gap-3">{purchaseLink()}{back}</div>
      </div>
    );
  }

  switch (payment.status) {
    case "succeeded": {
      // PaymentDto carries no purpose, so the purchase words it: a plan's
      // deposit (awaiting_finance with a schedule), an instalment or a pay-off
      // (on_plan), or a full-price payment. Never "before the plot is
      // allocated" for a deposit.
      const plan = bought?.purchase.schedule ? bought.purchase : null;
      const flexible = bought?.purchase.flexible ? bought.purchase : null;
      const deposit = !!plan && (plan.status === "awaiting_finance" || plan.status === "payment_received");
      const instalment = plan?.status === "on_plan" || flexible?.status === "on_plan";
      // A flexible plan's first payment, verified, holds the plot on the plan — never "allocated".
      const firstFlexible = !!flexible && (flexible.status === "awaiting_finance" || flexible.status === "payment_received");
      const title = deposit || firstFlexible || instalment ? `${deposit ? "Deposit" : "Payment"} received — awaiting verification` : "Payment received";
      const body = firstFlexible
        ? `Paystack confirmed ${amount}, your first payment on ${planInSentence(flexible!.flexible!.planName)}${forWhat}. Once the developer's finance team verifies it, the plot is held for you on the plan and you'll get a provisional allocation letter.`
        : deposit
        ? `Paystack confirmed ${amount}, the deposit on your ${plan!.schedule!.planName}${forWhat}. Once the developer's finance team verifies it, the plot is held for you on your plan and you'll get a provisional allocation letter.`
        : instalment
          ? `Paystack confirmed ${amount}${forWhat}. It counts towards your plan once the developer's finance team verifies it.`
          : `Paystack confirmed ${amount}${forWhat}. The developer's finance team now checks it before the plot is allocated to you.`;
      return (
        <Status tone="success" icon={<CheckIcon size={22} />} title={title}
          body={body}
          actions={<>{purchaseLink()}{back}</>}>
          {facts}
          {timeline}
        </Status>
      );
    }
    case "initialized":
    case "abandoned":
      return (
        <Status tone="neutral" icon={<ClockIcon size={22} />} title="Your payment is still being processed"
          body={polling ? "Bank transfers can take a few minutes. This page keeps checking." : "It hasn't come through yet. Bank transfers can take a few minutes."}
          actions={<>{gaveUp && !polling && <Button onClick={onCheckAgain}>Check again</Button>}{purchaseLink(gaveUp && !polling ? "secondary" : "primary")}</>}>
          {facts}
        </Status>
      );
    case "failed":
      return (
        <Status tone="error" icon={<AlertIcon size={22} />} title="Your payment didn't go through"
          body={`${payment.gatewayResponse ? `Paystack said: “${payment.gatewayResponse}”. ` : ""}Nothing was taken.`}
          actions={bought?.purchase.flexible
            // A flexible plan's payment is the buyer's own amount, chosen on the purchase page.
            ? <><LinkButton to={`/purchases/${payment.transactionId}`}>Choose an amount and pay again</LinkButton>{back}</>
            : <><PayButton transactionId={payment.transactionId} label="Pay again" />{purchaseLink("secondary")}</>} />
      );
    case "mismatched":
      return (
        <Status tone="warning" icon={<AlertIcon size={22} />} title="We received a payment we need to review"
          body="The amount didn't match what was agreed. Our team will contact you." actions={purchaseLink()}>
          {facts}
        </Status>
      );
  }
}

const ICON_TONE = {
  success: "bg-[var(--success-surface)] text-[var(--success-text)]",
  warning: "bg-[var(--warning-surface)] text-[var(--warning-text)]",
  error: "bg-[var(--error-surface)] text-[var(--error-text)]",
  info: "bg-[var(--info-surface)] text-[var(--info-text)]",
  neutral: "bg-[var(--muted)] text-[var(--muted-foreground)]",
} as const;

// One outcome, one card: an icon, a plain headline, what it means, and the way on.
function Status({ tone, icon, title, body, actions, children }: {
  tone: keyof typeof ICON_TONE; icon: React.ReactNode; title: string; body: string; actions?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <Card as="section" role="status" aria-labelledby="payment-status" className="space-y-5">
      <span className={cx("w-12 h-12 rounded-full flex items-center justify-center", ICON_TONE[tone])} aria-hidden="true">{icon}</span>
      <div>
        <h1 id="payment-status" className="font-display text-3xl text-[var(--foreground)] mb-2">{title}</h1>
        <p className="text-sm text-[var(--muted-foreground)]">{body}</p>
      </div>
      {children}
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </Card>
  );
}
