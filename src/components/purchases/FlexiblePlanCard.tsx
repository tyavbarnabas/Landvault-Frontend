// A running flexible ("pay as you can") plan on the purchase page, from the
// Figma "Flexible plans" purchase-page frames: what finance has verified of
// the plan total, what's left, the last payment and the date to finish by,
// then "Pay an amount" or "Pay what's left". Every figure is the backend's
// (flexibleStanding); the one figure sent is the amount the buyer types.
// Nothing on this plan is ever due or late.

import { useId, useState } from "react";
import type { Purchase } from "../../services/paymentsService";
import { formatMoney } from "../../lib/formatCurrency";
import { formatDay } from "../../lib/formatDate";
import { planInSentence } from "../../services/paymentPlansService";
import Card from "../ui/Card";
import Alert from "../ui/Alert";
import Button, { LinkButton } from "../ui/Button";
import { Field, Input, describedBy } from "../ui/Field";
import PayButton from "./PayButton";

// "500,000" or "500000.50" → naira; NaN when it isn't an amount.
function parseAmount(text: string): number {
  const t = text.replace(/[,\s₦]/g, "");
  return /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : NaN;
}

export function FlexiblePlanCard({ purchase, onChanged }: { purchase: Purchase; onChanged: () => void }) {
  const id = useId();
  const terms = purchase.flexible!;
  const st = purchase.flexibleStanding ?? null;
  const money = (n: number) => formatMoney(n, purchase.currency);
  const [text, setText] = useState("");
  if (!st) return null;
  const finished = purchase.status === "verified" || st.remaining <= 0;
  const waiting = st.awaitingFinance !== null;
  const share = terms.planTotal > 0 ? Math.min(100, (st.paid / terms.planTotal) * 100) : 0;
  // At least the plan's minimum, unless it's exactly what's left; never more
  // than what's left. The backend checks it again (INVALID_AMOUNT).
  const amount = parseAmount(text);
  const min = terms.minimumContribution;
  const allowed = Number.isFinite(amount) && amount > 0 && amount <= st.remaining && (min === null || amount >= min || amount === st.remaining);
  const rule = min && min < st.remaining
    ? `At least ${money(min)}, or exactly what's left. Never more than ${money(st.remaining)}.`
    : `Up to ${money(st.remaining)}, what's left on the plan.`;
  const error = text.trim() === "" ? undefined : !Number.isFinite(amount) ? "Enter an amount in naira, like 500,000." : !allowed ? rule : undefined;

  return (
    <Card as="section" aria-labelledby="plan-heading" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="plan-heading" className="font-semibold text-[var(--foreground)]">Your plan</h2>
        <span className="text-sm text-[var(--muted-foreground)]">{finished ? "Paid in full" : "Pay any amount, any time"}</span>
      </div>
      <div>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-mono-data text-2xl text-[var(--foreground)]">{money(st.paid)}</span>
          <span className="text-sm text-[var(--muted-foreground)]">verified of <span className="font-mono-data">{money(terms.planTotal)}</span></span>
        </div>
        <div className="mt-2 h-2 rounded-full bg-[var(--muted)] overflow-hidden" role="progressbar" aria-label="Verified of the plan total" aria-valuenow={Math.round(share)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-[var(--primary)]" style={{ width: `${share}%` }} />
        </div>
      </div>
      <div className={`grid gap-3 grid-cols-1 ${st.finishBy ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <Figure label="Left to pay" value={money(st.remaining)} note="of the plan total" />
        <Figure label="Last payment" value={st.lastPaymentOn ? formatDay(st.lastPaymentOn) : "None yet"} note="verified" />
        {st.finishBy && <Figure label="Finish by" value={formatDay(st.finishBy)} note="from your offer letter" />}
      </div>

      {!finished && (
        <>
          {waiting && (
            <Alert tone="info" role="status" title={`${money(st.awaitingFinance!)} is with the developer's finance team.`}>
              You can pay again once they've verified it.
            </Alert>
          )}
          <Field id={`${id}-amount`} label="Pay an amount (₦)" hint={rule} error={error}>
            <Input id={`${id}-amount`} inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} disabled={waiting} className="font-mono-data"
              placeholder={min ? min.toLocaleString("en-NG") : undefined} aria-invalid={!!error} aria-describedby={describedBy(`${id}-amount`, { hint: true, error })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <PayButton transactionId={purchase.id} amount={allowed ? amount : undefined} disabled={waiting || !allowed} note={false}
              label={allowed ? `Pay ${money(amount)}` : "Pay an amount"} onRefused={(code) => { if (code === "INSTALMENT_AWAITING_VERIFICATION") onChanged(); }} />
            <PayButton transactionId={purchase.id} balance variant="secondary" disabled={waiting} note={false}
              label={`Pay what's left — ${money(st.remaining)}`} onRefused={(code) => { if (code === "INSTALMENT_AWAITING_VERIFICATION") onChanged(); }} />
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            A payment counts once the developer's finance team has verified it. Nothing on this plan is ever due or late. You'll pay on Paystack's secure page — by card or bank transfer — then come back here.
          </p>
        </>
      )}
    </Card>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg bg-[var(--muted)] px-3 py-2.5">
      <div className="text-xs text-[var(--muted-foreground)]">{label}</div>
      <div className="font-mono-data text-[var(--foreground)]">{value}</div>
      <div className="text-xs text-[var(--muted-foreground)]">{note}</div>
    </div>
  );
}

// A notice to end a quiet plan, or one past its finish date — at the top of
// the page, in the calm warning tone. What ends it differs: any verified
// payment ends a notice about inactivity; only finishing ends a finish-by one.
export function FlexibleNoticePanel({ purchase, onPay }: { purchase: Purchase; onPay: () => void }) {
  const st = purchase.flexibleStanding;
  const terms = purchase.flexible;
  if (purchase.status !== "on_plan" || !st?.notice || !terms) return null;
  const n = st.notice;
  const money = (x: number) => formatMoney(x, purchase.currency);
  const finishBy = n.trigger === "finish_by";
  return (
    <section aria-labelledby="flex-notice-heading" role="status"
      className="rounded-xl border border-[var(--warning-border)] bg-[var(--warning-surface)] text-[var(--warning-text)] px-4 py-4 sm:px-5 space-y-2">
      <h2 id="flex-notice-heading" className="font-semibold">Notice to end your plan</h2>
      <p className="text-sm">The developer says: “{n.reason}”</p>
      <p className="text-sm">
        {finishBy ? (
          <>Your plan was to be finished by {st.finishBy ? formatDay(st.finishBy) : "its finish date"}. Pay what's left — <span className="font-mono-data">{money(st.remaining)}</span> — by the end of {formatDay(n.deadline)} and the plot is yours once it's verified. A smaller payment doesn't end this notice.</>
        ) : (
          <>{st.lastPaymentOn ? `Nothing has been paid since ${formatDay(st.lastPaymentOn)}. ` : ""}Pay any amount{terms.minimumContribution ? <> — at least <span className="font-mono-data">{money(terms.minimumContribution)}</span> —</> : ""} by the end of {formatDay(n.deadline)} and, once it's verified, the notice ends.</>
        )}
        {" "}If not, the developer may end {planInSentence(terms.planName)} from {formatDay(n.confirmableFrom)} and you'd get back exactly what leaving returns{finishBy ? "" : ", with your share if HomeTrue later sells the plot for more"}.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button onClick={onPay}>{finishBy ? `Pay what's left — ${money(st.remaining)}` : "Pay now"}</Button>
        <LinkButton to={`/purchases/${purchase.id}/withdraw`} variant="secondary">See what leaving returns</LinkButton>
      </div>
    </section>
  );
}
