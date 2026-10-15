// Super Admin refunds — /admin/refunds (admin.payouts.manage; starting a
// refund or sending it to an account also needs the admin's own two-factor).
//
//   Due   payments owed back: the developer rejected the purchase, or a late
//         payment wasn't allocated. Refund returns the FULL amount — nobody
//         types an amount.
//   All   every refund, by status. A bank-transfer refund waits for the
//         buyer's account (`needs-attention`); once given, the admin checks
//         the bank's name for it against the buyer and sends it.

import { useState } from "react";
import { formatInCurrency } from "../../../data/mockData";
import { ApiError, ApiTransportError } from "../../../lib/apiClient";
import { useFetch } from "../../../lib/useFetch";
import LoadError from "../../../components/LoadError";
import TabBar from "../../../components/ui/Tabs";
import EmptyState from "../../../components/ui/EmptyState";
import Dialog, { DialogActions } from "../../../components/ui/Dialog";
import Page, { Loading } from "../../../components/ui/Page";
import { InfoBox, ListCard } from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import Alert from "../../../components/ui/Alert";
import { Select } from "../../../components/ui/Field";
import StatusBadge, { refundStatusBadge } from "../../../components/StatusBadge";
import ProblemNote, { type MoneyProblem } from "../../../components/payments/ProblemNote";
import { paidWithLabel } from "../../../services/financeService";
import {
  fetchRefunds, fetchRefundsDue, sendRefundToAccount, startRefund, type AdminRefund, type RefundDue, type RefundFilter,
} from "../../../services/adminPayoutsService";

type Tab = "due" | "all";
const TABS: { id: Tab; label: string }[] = [{ id: "due", label: "Refunds due" }, { id: "all", label: "All refunds" }];
const money = (n: number, c: string) => formatInCurrency(n, c);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null);
const buyerOf = (r: { buyerName: string | null; buyerEmail: string | null }) => [r.buyerName, r.buyerEmail].filter(Boolean).join(" · ") || "Buyer not shown";

export default function Refunds() {
  const [tab, setTab] = useState<Tab>("due");
  return (
    <Page title="Refunds" description="Return buyers' money in full when a purchase is rejected or a late payment isn't allocated.">
      <TabBar tabs={TABS} active={tab} onActivate={setTab} ariaLabel="Refunds" divider />
      {tab === "due" ? <Due /> : <All />}
    </Page>
  );
}

// ─── Refunds due ─────────────────────────────────────────────────────────────

function Due() {
  const list = useFetch(() => fetchRefundsDue(), []);
  const [notice, setNotice] = useState("");
  const banner = notice && <Alert tone="info" role="status" className="font-medium mb-3">{notice}</Alert>;
  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <LoadError error={list.errorValue} what="refunds due" onRetry={list.refetch} />;
  if (!list.data?.length) return <>{banner}<EmptyState title="No refunds due" description="Payments owed back to buyers appear here." /></>;
  return (
    <>
      {banner}
      <ul className="space-y-3">
        {list.data.map((d) => <DueCard key={d.paymentId} due={d} onDone={(m) => { setNotice(m); list.refetch(); }} />)}
      </ul>
    </>
  );
}

function DueCard({ due, onDone }: { due: RefundDue; onDone: (message: string) => void }) {
  const [confirm, setConfirm] = useState(false);
  const paidWith = paidWithLabel(due.channel, due.last4);
  return (
    <ListCard className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-[var(--foreground)]">{buyerOf(due)}</div>
          <div className="text-xs text-[var(--muted-foreground)]">
            <span className="font-mono-data">{due.paymentReference}</span>{due.paidAt ? ` · paid ${when(due.paidAt)}` : ""}{paidWith ? ` with ${paidWith}` : ""}
          </div>
        </div>
        <div className="font-mono-data text-lg">{money(due.amount, due.currency)}</div>
      </div>
      {due.reason && <p className="text-sm text-[var(--foreground)]">{due.reason}</p>}
      {due.channel === "bank_transfer" && (
        <p className="text-xs text-[var(--muted-foreground)]">Paid by bank transfer: once started, the buyer is asked for an account in their name to receive it.</p>
      )}
      {due.lastAttempt && (
        <p className="text-xs text-[var(--muted-foreground)]">
          Last attempt: {refundStatusBadge(due.lastAttempt.status).label.toLowerCase()}{due.lastAttempt.gatewayMessage ? ` — Paystack: “${due.lastAttempt.gatewayMessage}”` : ""}
        </p>
      )}
      <Button onClick={() => setConfirm(true)}>Refund {money(due.amount, due.currency)}</Button>
      {confirm && (
        <ActionDialog title="Refund this payment?" confirmLabel={`Refund ${money(due.amount, due.currency)}`} onClose={() => setConfirm(false)}
          action={() => startRefund(due.paymentReference)}
          onDone={(r) => onDone(refundStartedMessage(r))}>
          Returns the full <strong>{money(due.amount, due.currency)}</strong> to {buyerOf(due)}{paidWith ? `, back to the ${paidWith}` : ""}.
        </ActionDialog>
      )}
    </ListCard>
  );
}

export function refundStartedMessage(r: AdminRefund): string {
  const amount = money(r.amount, r.currency);
  switch (r.status) {
    case "needs-attention": return `Refund of ${amount} started. It was paid by bank transfer, so the buyer has been asked for an account — it appears under All refunds when they give one.`;
    case "processed": return `Refunded ${amount}.`;
    case "failed": return `The refund failed${r.gatewayMessage ? `: “${r.gatewayMessage}”` : "."} You can try again.`;
    default: return `Refund of ${amount} is on its way${r.expectedAt ? ` — expected by ${new Date(r.expectedAt).toLocaleDateString()}` : ""}.`;
  }
}

// ─── All refunds ─────────────────────────────────────────────────────────────

const FILTERS: { id: RefundFilter; label: string }[] = [
  { id: "all", label: "All" }, { id: "needs-attention", label: "Needs an account" }, { id: "processing", label: "Processing" },
  { id: "pending", label: "Pending" }, { id: "sending", label: "Sending" }, { id: "processed", label: "Refunded" }, { id: "failed", label: "Failed" },
];

function All() {
  const [filter, setFilter] = useState<RefundFilter>("all");
  const list = useFetch(() => fetchRefunds(filter), [filter]);
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-[var(--muted-foreground)]">Show</span>
        <Select inputSize="sm" value={filter} onChange={(e) => setFilter(e.target.value as RefundFilter)}>
          {FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </Select>
      </label>
      {list.loading && !list.data && <Loading />}
      {list.error && <LoadError error={list.errorValue} what="refunds" onRetry={list.refetch} />}
      {list.data && list.data.length === 0 && <EmptyState title="No refunds" description={filter === "all" ? "Refunds appear here once one is started." : "None with this status."} />}
      {list.data && list.data.length > 0 && <ul className="space-y-3">{list.data.map((r) => <RefundRow key={r.id} refund={r} onChanged={list.refetch} />)}</ul>}
    </div>
  );
}

function RefundRow({ refund: r, onChanged }: { refund: AdminRefund; onChanged: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [outcome, setOutcome] = useState("");
  const badge = refundStatusBadge(r.status);
  const awaitingSend = r.status === "needs-attention" && r.account && !r.account.sentAt;
  return (
    <ListCard className="space-y-3">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-[var(--foreground)]">
            <span className="font-mono-data">{money(r.amount, r.currency)}</span> <span className="font-normal">· {buyerOf(r)}</span>
          </div>
          <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
            {r.paymentReference ? <><span className="font-mono-data">{r.paymentReference}</span> · </> : null}
            started {when(r.createdAt)}{r.expectedAt && r.status !== "processed" ? ` · expected by ${when(r.expectedAt)}` : ""}{r.refundedAt ? ` · refunded ${when(r.refundedAt)}` : ""}
          </div>
        </div>
        <StatusBadge label={badge.label} variant={badge.variant} />
      </div>
      {r.reason && <p className="text-xs text-[var(--foreground)]">{r.reason}</p>}
      {r.gatewayMessage && r.status === "failed" && <p className="text-xs text-[var(--error-text)]">Paystack: “{r.gatewayMessage}”</p>}

      {r.status === "needs-attention" && !r.account && (
        <Alert>Waiting for the buyer to give a bank account.</Alert>
      )}
      {r.account && (
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <InfoBox label="Buyer">
            <div className="font-semibold">{r.buyerName ?? "Name not on record"}</div>
            {r.buyerEmail && <div className="text-xs">{r.buyerEmail}</div>}
          </InfoBox>
          <InfoBox label="The bank says the account belongs to" tone="info">
            <div className="font-semibold">{r.account.accountName}</div>
            <div>{r.account.bankName} · <span className="font-mono-data">{r.account.accountNumber}</span></div>
            <div className="text-xs text-[var(--muted-foreground)]">Given {when(r.account.submittedAt)}{r.account.sentAt ? ` · sent ${when(r.account.sentAt)}` : ""}</div>
          </InfoBox>
        </div>
      )}
      {/* A warning, not a block: names are written many ways. */}
      {r.accountNameMatchesBuyer === false && (
        <Alert role="alert">The account name doesn't match the buyer.</Alert>
      )}

      {outcome ? <p className="text-sm font-medium" role="status">{outcome}</p> : awaitingSend && (
        <Button onClick={() => setConfirm(true)}>Send the refund to this account</Button>
      )}
      {confirm && r.account && (
        <ActionDialog title="Send this refund?" confirmLabel={`Send ${money(r.amount, r.currency)}`} onClose={() => setConfirm(false)}
          action={() => sendRefundToAccount(r.id)}
          onDone={(updated) => { setOutcome(refundStartedMessage(updated)); onChanged(); }}>
          Sends <strong>{money(r.amount, r.currency)}</strong> to {r.account.bankName} · {r.account.accountNumber} ({r.account.accountName}).
          {r.accountNameMatchesBuyer === false && <> <strong>The name doesn't match the buyer</strong> — send only if you've checked it's theirs.</>}
        </ActionDialog>
      )}
    </ListCard>
  );
}

// ─── Saying what happened ────────────────────────────────────────────────────

export function refundProblem(err: unknown): MoneyProblem {
  if (err instanceof ApiTransportError) return { message: "We couldn't reach HomeTrue. Nothing was changed — try again." };
  const code = err instanceof ApiError ? err.body?.code : (err as { code?: string } | null)?.code;
  const message = err instanceof Error ? err.message : "";
  switch (code) {
    case "TWO_FACTOR_REQUIRED": return { message: "Turn on two-factor authentication to send refunds.", needsTwoFactor: true };
    case "REFUND_OUTCOME_UNKNOWN": return { message: "Paystack didn't answer. The refund is kept as sending — check again later before trying anything else." };
    case "PAYMENT_PROVIDER_REFUSED": return { message: `Paystack refused the refund${message ? `: “${message}”` : "."} It's recorded as failed; you can try again.` };
    case "PAYMENT_PROVIDER_UNAVAILABLE": return { message: "Paystack isn't responding right now. Try again in a moment." };
    case "REFUND_IN_PROGRESS": return { message: "A refund for this payment is already in progress." };
    case "REFUND_NOT_DUE": return { message: "No refund is due for this payment any more. Refresh the list." };
    case "REFUND_ACCOUNT_MISSING": return { message: "The buyer hasn't given an account yet." };
    case "REFUND_NOT_AWAITING_ACCOUNT": return { message: "This refund has already been sent." };
    case "REFUND_NOT_FOUND": return { message: "We couldn't find that refund. Refresh the list." };
    case "UNKNOWN_BANK": return { message: "Paystack doesn't recognise the buyer's bank. Ask the buyer to choose it again." };
    default: return { message: message || "That didn't go through." };
  }
}

function ActionDialog({ title, confirmLabel, children, action, onDone, onClose }: {
  title: string; confirmLabel: string; children: React.ReactNode;
  action: () => Promise<AdminRefund>; onDone: (refund: AdminRefund) => void; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<MoneyProblem | null>(null);
  const go = async () => {
    setBusy(true);
    setProblem(null);
    try { onDone(await action()); onClose(); } catch (err) { setProblem(refundProblem(err)); setBusy(false); }
  };
  return (
    <Dialog title={title} onClose={busy ? () => {} : onClose}>
      <p className="text-sm mb-4">{children}</p>
      {problem && <div className="mb-3"><ProblemNote problem={problem} /></div>}
      <DialogActions onCancel={onClose} onConfirm={go} confirmLabel={confirmLabel} busy={busy} />
    </Dialog>
  );
}
