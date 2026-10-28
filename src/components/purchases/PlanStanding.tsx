// A running plan's standing on the purchase page, from the Figma
// "Instalments: arrears, withdraw, revoke, restructure" proposal: a calm panel
// when something is late (what's owed, by when, what happens next, what the
// buyer can do), a notice of revocation at the top when one is running, the
// buyer's options, and — once a plan has ended — each payment's refund.
//
// Tone: a person in difficulty, not an error. Warning-tinted, never red, and
// every figure is the backend's, as of today.

import { Link } from "react-router-dom";
import type { Purchase } from "../../services/paymentsService";
import { fetchWithdrawal } from "../../services/planService";
import { useFetch } from "../../lib/useFetch";
import { formatMoney } from "../../lib/formatCurrency";
import { formatDay } from "../../lib/formatDate";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import Button, { LinkButton } from "../ui/Button";
import RefundPanel from "./RefundPanel";
import LoadError from "../LoadError";
import { Loading } from "../ui/Page";

const PANEL = "rounded-xl border border-[var(--warning-border)] bg-[var(--warning-surface)] text-[var(--warning-text)] px-4 py-4 sm:px-5 space-y-2";

// Every link to the restructure page says where the buyer's request stands.
function restructureLabel(status: NonNullable<Purchase["standing"]>["restructureStatus"]): string {
  return status === "proposed" ? "See the proposal" : status === "requested" ? "See your request" : "Ask to restructure";
}

// The arrears panel, or the notice of revocation when one is running.
export function StandingPanel({ purchase, onPay }: { purchase: Purchase; onPay: () => void }) {
  const standing = purchase.standing;
  if (purchase.status !== "on_plan" || !standing) return null;
  const a = standing.arrears;
  const rv = standing.revocation;
  const money = (n: number) => formatMoney(n, purchase.currency);
  const withdrawTo = `/purchases/${purchase.id}/withdraw`;
  const restructureTo = `/purchases/${purchase.id}/restructure`;

  if (rv?.notice) {
    return (
      <section aria-labelledby="notice-heading" className={PANEL} role="status">
        <h2 id="notice-heading" className="font-semibold">Notice of revocation</h2>
        <p className="text-sm">The developer says: “{rv.notice.reason}”</p>
        <p className="text-sm">
          {a ? <>Pay what is overdue (<span className="font-mono-data">{money(a.totalDue)}</span>) by the end of {formatDay(rv.notice.deadline)}</> : <>Pay what is overdue by the end of {formatDay(rv.notice.deadline)}</>} and
          the notice stops, once the developer's finance team verifies it. If not, the plan may be revoked, and you'd get back exactly what withdrawing returns. You can also withdraw yourself, or ask to restructure.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button onClick={onPay}>Pay now</Button>
          <LinkButton to={withdrawTo} variant="secondary">See withdrawal figures</LinkButton>
          <Link to={restructureTo} className="self-center text-sm font-medium underline">{restructureLabel(standing.restructureStatus)}</Link>
        </div>
      </section>
    );
  }

  if (!a) return null;
  const sequence = standing.instalments.find((i) => i.status === "overdue" || i.status === "in_arrears")?.sequence;
  return (
    <section aria-labelledby="arrears-heading" className={PANEL} role="status">
      <h2 id="arrears-heading" className="font-semibold">{sequence ? `Instalment ${sequence} was due on ${formatDay(a.overdueSince)}` : `Payment was due on ${formatDay(a.overdueSince)}`}</h2>
      <p className="text-sm">
        <span className="font-mono-data">{money(a.totalDue)}</span> is due now{a.penaltyAmount > 0 ? <>, including a late-payment penalty of <span className="font-mono-data">{money(a.penaltyAmount)}</span></> : ""}. Paying it brings your plan back on track.
      </p>
      {a.status !== "in_arrears" && standing.status !== "in_arrears" && <p className="text-sm">It goes into arrears after {formatDay(a.graceEnds)}.</p>}
      {rv?.revocableFrom && !rv.revocableNow && sequence && (
        <p className="text-sm">If instalment {sequence} is still unpaid on {formatDay(rv.revocableFrom)}, the developer may give notice to revoke the plan.</p>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button onClick={onPay}>Pay what's due</Button>
        <LinkButton to={restructureTo} variant="secondary">{restructureLabel(standing.restructureStatus)}</LinkButton>
      </div>
    </section>
  );
}

// "Your options" beside a running plan: restructure, or see what withdrawing returns.
export function PlanOptionsCard({ purchase }: { purchase: Purchase }) {
  if (purchase.status !== "on_plan" || !purchase.standing) return null;
  const open = purchase.standing.restructureStatus === "requested" || purchase.standing.restructureStatus === "proposed";
  return (
    <Card as="section" aria-labelledby="options-heading" className="space-y-3">
      <h2 id="options-heading" className="font-semibold text-[var(--foreground)]">Your options</h2>
      <div className="space-y-1">
        <div className="text-sm font-medium text-[var(--foreground)]">Need more time?</div>
        <p className="text-sm text-[var(--muted-foreground)]">
          {open ? "You've asked the developer to restructure what you owe." : "Ask the developer to spread what you still owe differently. The total stays the same."}
        </p>
      </div>
      <LinkButton to={`/purchases/${purchase.id}/restructure`} variant="secondary" fullWidth>
        {restructureLabel(purchase.standing.restructureStatus)}
      </LinkButton>
      <div className="border-t border-[var(--border)] pt-3 space-y-1">
        <div className="text-sm font-medium text-[var(--foreground)]">Withdraw from the plan</div>
        <p className="text-sm text-[var(--muted-foreground)]">See what you'd get back today under your offer's terms. Nothing happens until you confirm.</p>
        <Link to={`/purchases/${purchase.id}/withdraw`} className="inline-block text-sm font-medium text-[var(--accent)] hover:underline">See withdrawal figures →</Link>
      </div>
    </Card>
  );
}

// A plan that ended (withdrawn or revoked): what was settled, each payment's
// part coming back on its own — with the bank-account step where one's needed.
export function PlanSettlementCard({ purchase }: { purchase: Purchase }) {
  const ended = purchase.status === "withdrawn" || purchase.status === "revoked";
  const loaded = useFetch(() => (ended ? fetchWithdrawal(purchase.id) : Promise.resolve(null)), [purchase.id, ended]);
  if (!ended) return null;
  if (loaded.loading && !loaded.data) return <Card><Loading label="Loading your refunds…" /></Card>;
  if (loaded.error || !loaded.data) return <LoadError error={loaded.errorValue} what="your refunds" onRetry={loaded.refetch} />;
  const w = loaded.data;
  const money = (n: number) => formatMoney(n, w.currency);
  return (
    <Card as="section" aria-labelledby="settled-heading" className="space-y-3">
      <h2 id="settled-heading" className="font-semibold text-[var(--foreground)]">Your refunds</h2>
      <dl className="grid grid-cols-3 gap-3 text-sm">
        <div><dt className="text-xs text-[var(--muted-foreground)]">You paid</dt><dd className="font-mono-data">{money(w.paid)}</dd></div>
        <div><dt className="text-xs text-[var(--muted-foreground)]">Comes back</dt><dd className="font-mono-data">{money(w.refund)}</dd></div>
        <div><dt className="text-xs text-[var(--muted-foreground)]">Developer keeps</dt><dd className="font-mono-data">{money(w.developerKeeps)}</dd></div>
      </dl>
      <ul className="space-y-3">
        {w.payments.map((p) => (
          <li key={p.reference} className="border border-[var(--border)] rounded-lg px-3 py-2.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium text-[var(--foreground)]">{lineLabel(p.paymentFor, p.instalmentSequence)} · <span className="font-mono-data">{money(p.refund)}</span> back</span>
              <Badge label={refundWords(p.refundStatus)} variant={p.refundStatus === "processed" ? "success" : p.refundStatus === "needs-attention" ? "warning" : "info"} />
            </div>
            {p.refundStatus === "needs-attention" && <RefundPanel paymentReference={p.reference} />}
          </li>
        ))}
      </ul>
      <p className="text-xs text-[var(--muted-foreground)]">Each payment comes back on its own. A receipt reads refunded only when the whole payment came back.</p>
    </Card>
  );
}

export function lineLabel(paymentFor: string, sequence: number | null): string {
  if (paymentFor === "deposit") return "Deposit";
  if (paymentFor === "balance") return "Balance";
  return sequence ? `Instalment ${sequence}` : "Payment";
}

function refundWords(status: string | null): string {
  switch (status) {
    case "processed": return "Refunded";
    case "needs-attention": return "Needs your bank account";
    case "failed": return "Problem — we're on it";
    case "pending": case "sending": case "processing": return "On its way";
    default: return "Being arranged";
  }
}
