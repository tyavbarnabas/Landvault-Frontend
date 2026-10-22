// The purchase page's "Your plan" card, from the Figma "Instalment plans"
// proposal: what finance has verified against the plan total, how many
// instalments are paid, the next one, and the ways to pay it — the next
// instalment (early is fine) or the whole balance at once. Every figure is the
// backend's; a payment counts once finance verifies it, not when Paystack
// confirms it.

import { useState } from "react";
import type { OwnedPlot } from "../../data/mockData";
import type { Purchase } from "../../services/paymentsService";
import { startPayment, type Payment } from "../../services/paymentsService";
import { formatMoney } from "../../lib/formatCurrency";
import { formatDay } from "../../lib/formatDate";
import { awaitingVerification, instalmentsVerified, nextInstalment } from "../../lib/planProgress";
import { frequencyWord } from "../../services/paymentPlansService";
import Card from "../ui/Card";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Dialog, { DialogActions } from "../ui/Dialog";
import { ErrorText } from "../ui/Field";
import { CalendarIcon } from "../icons";
import PayButton, { goToPaystack, paymentErrorMessage } from "./PayButton";
import { useNavigate } from "react-router-dom";

export default function PlanCard({ purchase, owned, onChanged }: { purchase: Purchase; owned: OwnedPlot | null; onChanged: () => void }) {
  const schedule = purchase.schedule!;
  const money = (n: number) => formatMoney(n, purchase.currency);
  const count = schedule.instalments.length;
  const paid = instalmentsVerified(schedule, owned, purchase.status);
  const next = nextInstalment(schedule, owned, purchase.status);
  const waiting = awaitingVerification(owned);
  // While a payment waits for finance, the "next" instalment is the one it
  // paid (the backend doesn't move on until it's verified): show it as
  // received, and name the one after it on the (disabled) button.
  const waitingBalance = !!owned?.payments.some((p) => p.status === "pending_verification" && p.type === "balance");
  const after = waiting && next ? schedule.instalments.find((i) => i.sequence === next.sequence + 1) ?? null : null;
  const [payingOff, setPayingOff] = useState(false);
  const completed = purchase.status === "verified";
  // Verified so far, of the plan total — the portfolio's figures. Before the
  // deposit is verified the entry shows nothing paid.
  const verified = owned?.paidAmount ?? (completed ? schedule.planTotal : 0);
  const total = owned?.totalPrice ?? schedule.planTotal;
  const share = total > 0 ? Math.min(100, (verified / total) * 100) : 0;

  return (
    <Card as="section" aria-labelledby="plan-heading" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="plan-heading" className="font-semibold text-[var(--foreground)] whitespace-nowrap">Your plan</h2>
        <span className="text-sm text-[var(--muted-foreground)]">{schedule.planName} · {paid} of {count} instalment{count === 1 ? "" : "s"} paid</span>
      </div>

      {purchase.status === "pending_payment" || purchase.status === "awaiting_finance" ? (
        <dl className="space-y-1.5 text-sm">
          <Row label="Deposit" value={money(schedule.deposit)} />
          <Row label={`Then ${count} ${frequencyWord(schedule.frequency)} instalment${count === 1 ? "" : "s"} of`} value={money(schedule.instalments[0]?.amount ?? 0)} />
          <Row label="Plan total" value={money(schedule.planTotal)} bold />
        </dl>
      ) : (
        <>
          <div>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-mono-data text-2xl text-[var(--foreground)]">{money(verified)}</span>
              <span className="text-sm text-[var(--muted-foreground)]">verified of {money(total)}</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-[var(--muted)] overflow-hidden" role="progressbar" aria-label="Verified of the plan total"
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share)}>
              <div className="h-full rounded-full bg-[var(--primary)]" style={{ width: `${share}%` }} />
            </div>
          </div>
          {next && (
            <div className="flex items-center gap-3 rounded-lg bg-[var(--muted)] px-3.5 py-3">
              <CalendarIcon size={18} className="shrink-0 text-[var(--primary)]" />
              <div className="flex-1 min-w-0 text-sm">
                <div className="font-semibold text-[var(--foreground)]">{waitingBalance ? "Balance paid off" : waiting ? `Instalment ${next.sequence} of ${next.count}` : `Next: instalment ${next.sequence} of ${next.count}`}</div>
                <div className="text-[var(--muted-foreground)]">
                  {waiting ? "Received — awaiting verification" : `${next.dueDate ? `Due ${formatDay(next.dueDate)} · ` : ""}paying early is fine`}
                </div>
              </div>
              <span className="font-mono-data font-medium text-[var(--foreground)]">{money(next.amount)}</span>
            </div>
          )}
        </>
      )}

      {purchase.status === "on_plan" && (
        <>
          {waiting && <Alert tone="info" role="status">Your last payment is waiting for the developer's finance team to verify it. You can pay the next one after that.</Alert>}
          <div className="flex flex-col sm:flex-row gap-3">
            {next && !waitingBalance && (waiting ? after : true) && (
              <div className="sm:flex-1">
                <PayButton transactionId={purchase.id} disabled={waiting} note={false} onRefused={(code) => code === "INSTALMENT_AWAITING_VERIFICATION" && onChanged()}
                  label={waiting && after
                    ? `Pay instalment ${after.sequence} of ${count} — ${money(after.amount)}`
                    : `Pay instalment ${next.sequence} of ${next.count} — ${money(next.amount)}${next.dueDate ? ` (due ${formatDay(next.dueDate)})` : ""}`} />
              </div>
            )}
            <Button variant="secondary" size="lg" disabled={waiting} onClick={() => setPayingOff(true)}>Pay off the balance</Button>
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            You pay on Paystack's secure page. A payment counts once the developer's finance team has verified it arrived — Paystack confirming it isn't enough.
          </p>
        </>
      )}

      {payingOff && <PayOffDialog purchase={purchase} onClose={() => setPayingOff(false)} onRefused={onChanged} />}
    </Card>
  );
}

// Confirm, then show the amount the backend charges, then go to Paystack.
function PayOffDialog({ purchase, onClose, onRefused }: { purchase: Purchase; onClose: () => void; onRefused: () => void }) {
  const [payment, setPayment] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const schedule = purchase.schedule!;
  const navigate = useNavigate();

  const getAmount = async () => {
    setBusy(true);
    setError("");
    try {
      setPayment(await startPayment(purchase.id, { balance: true }));
    } catch (err) {
      setError(paymentErrorMessage(err));
      onRefused();
    } finally {
      setBusy(false);
    }
  };

  if (!payment) {
    return (
      <Dialog title="Pay off the balance?" onClose={onClose}>
        <p className="text-sm text-[var(--muted-foreground)] mb-3">
          You'll pay everything still owed on your {schedule.planName} in one payment. There's no discount for paying early. We'll show you the exact amount before you go to Paystack.
        </p>
        {error && <div className="mb-3"><ErrorText>{error}</ErrorText></div>}
        <DialogActions onCancel={onClose} onConfirm={getAmount} confirmLabel="Continue" busy={busy} busyLabel="Working out the amount…" />
      </Dialog>
    );
  }
  return (
    <Dialog title={`${formatMoney(payment.amount, payment.currency)} to pay off your plan`} onClose={onClose}>
      <p className="text-sm text-[var(--muted-foreground)] mb-3">That's every instalment still owed, as worked out by HomeTrue. Nothing is charged until you pay on Paystack.</p>
      <div className="rounded-lg bg-[var(--muted)] p-3.5 mb-4 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold text-[var(--foreground)]">Due now</span>
          <span className="font-mono-data text-lg text-[var(--foreground)]">{formatMoney(payment.amount, payment.currency)}</span>
        </div>
        <p className="text-xs text-[var(--muted-foreground)] mt-1.5">When finance verifies it, the plot is yours and your allocation letter is issued.</p>
      </div>
      <DialogActions onCancel={onClose} onConfirm={() => goToPaystack(payment.authorizationUrl, navigate)} confirmLabel="Pay on Paystack" />
    </Dialog>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={bold ? "font-semibold text-[var(--foreground)]" : "text-[var(--muted-foreground)]"}>{label}</dt>
      <dd className={`font-mono-data text-[var(--foreground)] ${bold ? "font-medium" : ""}`}>{value}</dd>
    </div>
  );
}
