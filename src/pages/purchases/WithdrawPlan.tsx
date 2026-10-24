// /purchases/:id/withdraw — the buyer leaves a running plan (phase 5a), from
// the Figma "Withdraw" proposal. Quote first, then confirm: today's figures
// (what's been paid, what comes back, what the developer keeps under the
// offer's terms) and each payment's part, all as the backend worked them out.
// Confirming names the quote's refund; if the figures moved since, the
// backend refuses (WITHDRAWAL_QUOTE_CHANGED) and the new quote is shown.
// Once withdrawn (or revoked), the same page shows what was settled.

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useFetch } from "../../lib/useFetch";
import { formatMoney } from "../../lib/formatCurrency";
import { formatDay } from "../../lib/formatDate";
import { fetchWithdrawal, planErrorCode, planErrorMessage, withdraw } from "../../services/planService";
import { lineLabel } from "../../components/purchases/PlanStanding";
import Page, { Loading } from "../../components/ui/Page";
import Card, { InfoBox } from "../../components/ui/Card";
import Alert from "../../components/ui/Alert";
import Badge from "../../components/ui/Badge";
import Button, { LinkButton } from "../../components/ui/Button";
import { ErrorText, Field, Textarea } from "../../components/ui/Field";
import LoadError from "../../components/LoadError";

export default function WithdrawPlan() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const loaded = useFetch(() => fetchWithdrawal(id!), [id]);
  const [reason, setReason] = useState("");
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [changed, setChanged] = useState(false);
  const back = { to: `/purchases/${id}`, label: "Your purchase" };

  if (loaded.loading && !loaded.data) return <Page title="Withdraw from your plan" back={back} width="lg"><Loading label="Working out today's figures…" /></Page>;
  if (loaded.error || !loaded.data) {
    const code = planErrorCode(loaded.errorValue);
    if (code === "PLAN_NOT_WITHDRAWABLE" || code === "NOT_IN_DEMO") {
      return <Page title="Withdraw from your plan" back={back} width="lg"><Alert tone="info">{planErrorMessage(loaded.errorValue)}</Alert></Page>;
    }
    return <LoadError error={loaded.errorValue} what="the withdrawal figures" onRetry={loaded.refetch} />;
  }
  const w = loaded.data;
  const money = (n: number) => formatMoney(n, w.currency);
  const quote = w.status === "on_plan";

  const confirm = async () => {
    setBusy(true);
    setError("");
    setChanged(false);
    try {
      await withdraw(w.transactionId, w.refund, reason);
      navigate(`/purchases/${w.transactionId}`);
    } catch (err) {
      if (planErrorCode(err) === "WITHDRAWAL_QUOTE_CHANGED") {
        // Nothing happened: show the new figures and ask again.
        setChanged(true);
        setSure(false);
        loaded.refetch();
      } else setError(planErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page width="lg" back={back} title={quote ? "Withdraw from your plan" : w.status === "revoked" ? "Your plan was revoked" : "You withdrew from your plan"}
      description={quote ? "These are today's figures. Nothing happens until you confirm below." : w.withdrawnAt ? `Settled on ${formatDay(w.withdrawnAt)}. Each payment's part comes back on its own.` : "Each payment's part comes back on its own."}>
      <div className="space-y-6">
        {changed && <Alert tone="warning" role="alert">The figures changed since you opened this page — here are today's. Nothing has happened; check them and confirm again.</Alert>}

        <Card as="section" aria-labelledby="quote-heading" className="space-y-4">
          <h2 id="quote-heading" className="font-semibold text-[var(--foreground)]">{quote ? "If you withdraw today" : "What was settled"}</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <InfoBox label="You've paid"><div className="font-mono-data text-lg">{money(w.paid)}</div></InfoBox>
            <InfoBox label="Comes back to you" tone="success"><div className="font-mono-data text-lg">{money(w.refund)}</div></InfoBox>
            <InfoBox label="The developer keeps"><div className="font-mono-data text-lg">{money(w.developerKeeps)}</div></InfoBox>
          </div>
          {w.terms && (
            <p className="text-sm text-[var(--muted-foreground)]">
              Under the terms in your offer letter, the developer keeps {w.terms.deductionPct}% {w.terms.appliesTo === "total_price" ? "of the price" : "of each payment"}.
              {" "}Late-payment penalties are {w.terms.penaltiesRefundable ? "refunded" : "not refunded"}.
            </p>
          )}
          <table className="w-full text-sm">
            <thead className="max-sm:hidden">
              <tr className="text-xs text-[var(--muted-foreground)] border-b border-[var(--border)]">
                <th className="text-left font-medium py-2">Payment</th>
                <th className="text-right font-medium py-2">Paid</th>
                <th className="text-right font-medium py-2">Developer keeps</th>
                <th className="text-right font-medium py-2">Comes back</th>
              </tr>
            </thead>
            <tbody>
              {w.payments.map((p) => (
                <tr key={p.reference} className="border-b border-[var(--border)] last:border-b-0 max-sm:block max-sm:py-2">
                  <td className="py-2.5 pr-3 max-sm:block max-sm:py-0">
                    <div className="font-medium text-[var(--foreground)]">{lineLabel(p.paymentFor, p.instalmentSequence)}</div>
                    {p.penaltyAmount > 0 && <div className="text-xs text-[var(--muted-foreground)]">includes {money(p.penaltyAmount)} late-payment penalty</div>}
                    {p.awaitingFinance && <div className="text-xs text-[var(--info-text)]">Awaiting verification — counted as paid; your part comes back with the rest.</div>}
                    {!quote && p.refundStatus && <div className="mt-1"><Badge label={p.refundStatus === "processed" ? "Refunded" : p.refundStatus === "needs-attention" ? "Needs your bank account" : "On its way"} variant={p.refundStatus === "processed" ? "success" : p.refundStatus === "needs-attention" ? "warning" : "info"} /></div>}
                  </td>
                  <td className="py-2.5 text-right font-mono-data max-sm:inline-block max-sm:py-0 max-sm:mr-3"><span className="sm:hidden text-xs text-[var(--muted-foreground)] font-sans">Paid </span>{money(p.amount)}</td>
                  <td className="py-2.5 text-right font-mono-data max-sm:inline-block max-sm:py-0 max-sm:mr-3"><span className="sm:hidden text-xs text-[var(--muted-foreground)] font-sans">Keeps </span>{money(p.developerKeeps)}</td>
                  <td className="py-2.5 text-right font-mono-data font-medium max-sm:inline-block max-sm:py-0"><span className="sm:hidden text-xs text-[var(--muted-foreground)] font-sans font-normal">Back </span>{money(p.refund)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {quote ? (
          <>
            <Card as="section" aria-labelledby="next-heading" className="space-y-2">
              <h2 id="next-heading" className="font-semibold text-[var(--foreground)]">What happens if you withdraw</h2>
              <ul className="list-disc pl-5 text-sm text-[var(--foreground)] space-y-1.5">
                <li>Your plan ends today and the plot goes back on sale. This can't be undone.</li>
                <li>Each payment's part comes back on its own: a card payment back to the card; for a bank transfer we'll ask for an account in your name.</li>
                <li>Your provisional allocation letter is marked withdrawn.</li>
                <li>The developer is told. Nobody needs to approve it.</li>
              </ul>
            </Card>
            <Card as="section" aria-label="Confirm" className="space-y-4">
              <Field id="withdraw-reason" label="Why are you withdrawing? (optional)" hint="The developer sees this.">
                <Textarea id="withdraw-reason" rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
              </Field>
              <label className="flex items-start gap-2.5 cursor-pointer text-sm font-medium text-[var(--foreground)]">
                <input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} className="mt-0.5 w-4 h-4 shrink-0 accent-[var(--primary)]" />
                I understand withdrawing ends my plan and can't be undone.
              </label>
              {error && <ErrorText>{error}</ErrorText>}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button size="lg" onClick={confirm} disabled={!sure || busy}>{busy ? "Withdrawing…" : `Withdraw and get ${money(w.refund)} back`}</Button>
                <LinkButton to={back.to} variant="secondary" size="lg">Keep my plan</LinkButton>
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">Behind on payments? You don't have to withdraw — you can ask the developer to restructure what you owe.</p>
            </Card>
          </>
        ) : (
          <LinkButton to={back.to} variant="secondary">Back to your purchase</LinkButton>
        )}
      </div>
    </Page>
  );
}
