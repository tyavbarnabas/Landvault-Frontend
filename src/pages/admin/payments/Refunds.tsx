// Super Admin refunds — /admin/refunds (admin.payouts.manage; starting a
// refund or sending it to an account also needs the admin's own two-factor).
//
//   Due   payments owed back: the developer rejected the purchase, or a late
//         payment wasn't allocated. Refund returns the FULL amount — nobody
//         types an amount.
//   All   every refund, by status. A bank-transfer refund waits for the
//         buyer's account (`needs-attention`); once given, the admin checks
//         the bank's name for it against the buyer and sends it.
//
// Laid out from the Figma money-screen proposal: four figures, and one "To
// do" tab with everything waiting on HomeTrue — refunds not started, and
// accounts buyers have given that need checking and sending (before, those
// were only under All refunds). The other stages are counted tabs.

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatInCurrency } from "../../../data/mockData";
import { ApiError, ApiTransportError } from "../../../lib/apiClient";
import { useFetch } from "../../../lib/useFetch";
import { formatDay, formatDayTime } from "../../../lib/formatDate";
import { withCount } from "../../../lib/useTabCounts";
import LoadError from "../../../components/LoadError";
import TabBar from "../../../components/ui/Tabs";
import EmptyState from "../../../components/ui/EmptyState";
import Dialog, { DialogActions } from "../../../components/ui/Dialog";
import Page, { Loading } from "../../../components/ui/Page";
import Card, { InfoBox } from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import Alert from "../../../components/ui/Alert";
import Figure, { Figures } from "../../../components/ui/Figure";
import DisclosureTable, { DisclosureRow, TableRow } from "../../../components/ui/DisclosureTable";
import StatusBadge, { refundStatusBadge } from "../../../components/StatusBadge";
import ProblemNote, { type MoneyProblem } from "../../../components/payments/ProblemNote";
import { CheckIcon, ClockIcon, ReceiptIcon, TrendingUpIcon } from "../../../components/icons";
import { paidWithLabel } from "../../../services/financeService";
import {
  fetchRefunds, fetchRefundsDue, refundStage, sendRefundToAccount, startRefund,
  type AdminRefund, type RefundDue, type RefundStage,
} from "../../../services/adminPayoutsService";

type Tab = "todo" | Exclude<RefundStage, "ready_to_send"> | "all";
const TABS: { id: Tab; label: string }[] = [
  { id: "todo", label: "To do" },
  { id: "waiting_on_buyer", label: "Waiting on buyer" },
  { id: "in_progress", label: "In progress" },
  { id: "refunded", label: "Refunded" },
  { id: "failed", label: "Failed" },
  { id: "all", label: "All" },
];
const money = (n: number, c: string) => formatInCurrency(n, c);
const buyerOf = (r: { buyerName: string | null; buyerEmail: string | null }) => [r.buyerName, r.buyerEmail].filter(Boolean).join(" · ") || "Buyer not shown";

function totals(items: { amount: number; currency: string }[]): string {
  const by = new Map<string, number>();
  for (const i of items) by.set(i.currency, (by.get(i.currency) ?? 0) + i.amount);
  return by.size ? [...by].map(([c, n]) => money(n, c)).join(" + ") : money(0, "NGN");
}

export default function Refunds() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "todo") as Tab;
  const due = useFetch(() => fetchRefundsDue(), []);
  const refunds = useFetch(() => fetchRefunds("all"), []);
  // Held here: a row that's acted on leaves its list on refresh.
  const [notice, setNotice] = useState("");
  const refresh = (message: string) => { setNotice(message); due.refetch(); refunds.refetch(); };

  const started = refunds.data ?? [];
  const inStage = (st: RefundStage) => started.filter((r) => refundStage(r) === st);
  const toSend = inStage("ready_to_send");
  const count: Record<Tab, number | undefined> = {
    todo: due.data && refunds.data ? due.data.length + toSend.length : undefined,
    waiting_on_buyer: refunds.data ? inStage("waiting_on_buyer").length : undefined,
    in_progress: refunds.data ? inStage("in_progress").length : undefined,
    refunded: refunds.data ? inStage("refunded").length : undefined,
    failed: refunds.data ? inStage("failed").length : undefined,
    all: refunds.data?.length,
  };

  return (
    <Page title="Refunds" description="Return buyers' money in full when a purchase is rejected or a late payment isn't allocated.">
      {due.data && refunds.data && (
        <Figures>
          <Figure label="Not started" icon={<ReceiptIcon size={14} />} mono value={totals(due.data)} sub={due.data.length ? `${due.data.length} payment${due.data.length === 1 ? "" : "s"} owed back` : "Nothing owed"} />
          <Figure label="Ready to send" icon={<CheckIcon size={14} />} mono tone={toSend.length ? "warning" : "neutral"} value={totals(toSend)}
            sub={toSend.length ? `${toSend.length} buyer${toSend.length === 1 ? "" : "s"} gave an account — check and send` : "No accounts waiting"} />
          <Figure label="Waiting on buyers" icon={<ClockIcon size={14} />} value={String(count.waiting_on_buyer)} sub="Bank-transfer refunds without an account yet" />
          <Figure label="In progress" icon={<TrendingUpIcon size={14} />} value={String(count.in_progress)} sub="With Paystack or the bank" />
        </Figures>
      )}
      <TabBar tabs={TABS.map((t) => ({ id: t.id, label: withCount(t.label, count[t.id]) }))} active={tab}
        onActivate={(t) => { setNotice(""); setParams(t === "todo" ? {} : { tab: t }, { replace: true }); }} ariaLabel="Refunds" divider />
      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="space-y-3">
        {notice && <Alert tone="info" role="status" className="font-medium">{notice}</Alert>}
        {(due.loading && !due.data) || (refunds.loading && !refunds.data) ? <Loading />
          : due.error ? <LoadError error={due.errorValue} what="refunds due" onRetry={due.refetch} />
            : refunds.error ? <LoadError error={refunds.errorValue} what="refunds" onRetry={refunds.refetch} />
              : tab === "todo" ? <ToDo due={due.data!} toSend={toSend} onDone={refresh} />
                : <RefundList refunds={tab === "all" ? started : inStage(tab)} tab={tab} />}
      </div>
    </Page>
  );
}

// ─── To do: everything waiting on HomeTrue ───────────────────────────────────

function ToDo({ due, toSend, onDone }: { due: RefundDue[]; toSend: AdminRefund[]; onDone: (message: string) => void }) {
  if (!due.length && !toSend.length) {
    return <Card padding="sm"><EmptyState title="Nothing to do" description="Payments owed back to buyers, and accounts buyers give for a refund, appear here." /></Card>;
  }
  return (
    <div className="space-y-6">
      {toSend.length > 0 && (
        <section aria-labelledby="send-heading" className="space-y-3">
          <h2 id="send-heading" className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Account given — check and send</h2>
          <ul className="space-y-3">{toSend.map((r) => <SendCard key={r.id} refund={r} onDone={onDone} />)}</ul>
        </section>
      )}
      {due.length > 0 && (
        <section aria-labelledby="due-heading" className="space-y-3">
          <h2 id="due-heading" className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">Not started</h2>
          <DisclosureTable columns={DUE_COLUMNS} grid={DUE_GRID} label="Refunds not started">
            {due.map((d) => <DueRow key={d.paymentId} due={d} onDone={onDone} />)}
          </DisclosureTable>
        </section>
      )}
    </div>
  );
}

const DUE_COLUMNS = ["Buyer", "Paid with", "Why it's owed", "Amount"];
const DUE_GRID = "lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_minmax(0,2fr)_minmax(0,1fr)_auto]";

function DueRow({ due, onDone }: { due: RefundDue; onDone: (message: string) => void }) {
  const [confirm, setConfirm] = useState(false);
  const paidWith = paidWithLabel(due.channel, due.last4);
  const cells = [
    <>
      <div className="font-semibold text-[var(--foreground)]">{due.buyerName ?? "Buyer name not on record"}</div>
      {due.buyerEmail && <div className="text-xs text-[var(--muted-foreground)] wrap-anywhere">{due.buyerEmail}</div>}
    </>,
    <>
      <div className="text-sm text-[var(--foreground)] first-letter:uppercase">{paidWith ?? "—"}</div>
      {/* A payment reference is 39 characters with nowhere to wrap: let it
          break anywhere rather than run into the next column. */}
      <div className="text-xs text-[var(--muted-foreground)] font-mono-data break-all">{due.paymentReference}</div>
      {due.paidAt && <div className="text-xs text-[var(--muted-foreground)]">{formatDay(due.paidAt)}</div>}
    </>,
    <span className="text-sm text-[var(--muted-foreground)]">{due.reason ?? "—"}</span>,
    <span className="font-mono-data font-medium text-[var(--foreground)]">{money(due.amount, due.currency)}</span>,
  ];
  return (
    <TableRow
      grid={DUE_GRID}
      cells={cells}
      action={<Button onClick={() => setConfirm(true)}>Refund</Button>}
      below={(due.channel === "bank_transfer" || due.lastAttempt || confirm) && (
        <>
          {due.channel === "bank_transfer" && (
            <p className="text-xs text-[var(--muted-foreground)]">Paid by bank transfer: once started, the buyer is asked for an account in their name to receive it.</p>
          )}
          {due.lastAttempt && (
            <p className="text-xs text-[var(--muted-foreground)]">
              Last attempt: {refundStatusBadge(due.lastAttempt.status).label.toLowerCase()}{due.lastAttempt.gatewayMessage ? ` — Paystack: “${due.lastAttempt.gatewayMessage}”` : ""}
            </p>
          )}
          {confirm && (
            <ActionDialog title="Refund this payment?" confirmLabel={`Refund ${money(due.amount, due.currency)}`} onClose={() => setConfirm(false)}
              action={() => startRefund(due.paymentReference)}
              onDone={(r) => onDone(refundStartedMessage(r))}>
              Returns the full <strong>{money(due.amount, due.currency)}</strong> to {buyerOf(due)}{paidWith ? `, back to the ${paidWith}` : ""}.
            </ActionDialog>
          )}
        </>
      )}
    />
  );
}

export function refundStartedMessage(r: AdminRefund): string {
  const amount = money(r.amount, r.currency);
  switch (r.status) {
    case "needs-attention": return `Refund of ${amount} started. It was paid by bank transfer, so the buyer has been asked for an account — it comes back to To do when they give one.`;
    case "processed": return `Refunded ${amount}.`;
    case "failed": return `The refund failed${r.gatewayMessage ? `: “${r.gatewayMessage}”` : "."} You can try again.`;
    default: return `Refund of ${amount} is on its way${r.expectedAt ? ` — expected by ${new Date(r.expectedAt).toLocaleDateString()}` : ""}.`;
  }
}

// A buyer gave an account for a bank-transfer refund: compare, then send.
function SendCard({ refund: r, onDone }: { refund: AdminRefund; onDone: (message: string) => void }) {
  const [confirm, setConfirm] = useState(false);
  const account = r.account!;
  return (
    <Card as="li" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-[var(--foreground)]">{buyerOf(r)}</div>
          <div className="text-xs text-[var(--muted-foreground)]">
            {r.paymentReference ? <><span className="font-mono-data break-all">{r.paymentReference}</span> · </> : null}started {formatDay(r.createdAt)}{r.reason ? ` · ${r.reason.toLowerCase()}` : ""}
          </div>
        </div>
        <div className="font-mono-data font-medium text-lg text-[var(--foreground)]">{money(r.amount, r.currency)}</div>
      </div>
      <AccountCompare refund={r} />
      {/* A warning, not a block: names are written many ways. */}
      {r.accountNameMatchesBuyer === false && (
        <Alert role="alert">The account name doesn't match the buyer exactly. Names are written many ways — send only if you've checked it's theirs.</Alert>
      )}
      <Button onClick={() => setConfirm(true)}>Send {money(r.amount, r.currency)} to this account</Button>
      {confirm && (
        <ActionDialog title="Send this refund?" confirmLabel={`Send ${money(r.amount, r.currency)}`} onClose={() => setConfirm(false)}
          action={() => sendRefundToAccount(r.id)}
          onDone={(updated) => onDone(refundStartedMessage(updated))}>
          Sends <strong>{money(r.amount, r.currency)}</strong> to {account.bankName} · {account.accountNumber} ({account.accountName}).
          {r.accountNameMatchesBuyer === false && <> <strong>The name doesn't match the buyer</strong> — send only if you've checked it's theirs.</>}
        </ActionDialog>
      )}
    </Card>
  );
}

function AccountCompare({ refund: r }: { refund: AdminRefund }) {
  if (!r.account) return null;
  return (
    <div className="grid sm:grid-cols-2 gap-3 text-sm">
      <InfoBox label="Buyer">
        <div className="font-semibold">{r.buyerName ?? "Name not on record"}</div>
        {r.buyerEmail && <div className="text-xs">{r.buyerEmail}</div>}
      </InfoBox>
      <InfoBox label="The bank says the account belongs to" tone="info">
        <div className="font-semibold">{r.account.accountName}</div>
        <div>{r.account.bankName} · <span className="font-mono-data">{r.account.accountNumber}</span></div>
        <div className="text-xs text-[var(--muted-foreground)]">Given {formatDayTime(r.account.submittedAt)}{r.account.sentAt ? ` · sent ${formatDayTime(r.account.sentAt)}` : ""}</div>
      </InfoBox>
    </div>
  );
}

// ─── Every other stage: a table, each refund opening in place ────────────────

const LIST_COLUMNS = ["Buyer", "Amount", "Payment", "Started", "Status"];
const LIST_GRID = "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.1fr)_16px]";
const EMPTY: Record<Exclude<Tab, "todo">, string> = {
  waiting_on_buyer: "Bank-transfer refunds wait here until the buyer gives an account.",
  in_progress: "Refunds with Paystack or the bank appear here.",
  refunded: "Finished refunds appear here.",
  failed: "No refund has failed.",
  all: "Refunds appear here once one is started.",
};

function RefundList({ refunds, tab }: { refunds: AdminRefund[]; tab: Exclude<Tab, "todo"> }) {
  if (!refunds.length) return <Card padding="sm"><EmptyState title="None" description={EMPTY[tab]} /></Card>;
  return (
    <DisclosureTable columns={LIST_COLUMNS} grid={LIST_GRID} label="Refunds">
      {refunds.map((r) => {
        const stage = refundStage(r);
        const cells = [
          <>
            <div className="font-semibold text-[var(--foreground)]">{r.buyerName ?? "Buyer name not on record"}</div>
            {r.buyerEmail && <div className="text-xs text-[var(--muted-foreground)] wrap-anywhere">{r.buyerEmail}</div>}
          </>,
          <span className="font-mono-data font-medium text-[var(--foreground)]">{money(r.amount, r.currency)}</span>,
          <span className="block font-mono-data text-xs text-[var(--muted-foreground)] break-all">{r.paymentReference ?? "—"}</span>,
          <span className="text-sm text-[var(--muted-foreground)]"><span className="lg:hidden">Started </span>{formatDay(r.createdAt)}</span>,
          stage === "ready_to_send" ? <StatusBadge label="Ready to send" variant="warning" /> : <StatusBadge {...refundStatusBadge(r.status)} />,
        ];
        return (
          <DisclosureRow key={r.id} id={`refund-${r.id}`} grid={LIST_GRID} cells={cells}>
            {r.reason && <p className="text-sm text-[var(--foreground)]">{r.reason}</p>}
            <p className="text-xs text-[var(--muted-foreground)]">
              Started {formatDayTime(r.createdAt)}{r.expectedAt && r.status !== "processed" ? ` · expected by ${formatDayTime(r.expectedAt)}` : ""}{r.refundedAt ? ` · refunded ${formatDayTime(r.refundedAt)}` : ""}
            </p>
            {r.gatewayMessage && r.status === "failed" && <p className="text-sm text-[var(--error-text)]">Paystack: “{r.gatewayMessage}”</p>}
            {stage === "waiting_on_buyer" && <Alert>Waiting for the buyer to give a bank account.</Alert>}
            {stage === "ready_to_send" && <Alert tone="info">The buyer has given an account. Check and send it from To do.</Alert>}
            <AccountCompare refund={r} />
          </DisclosureRow>
        );
      })}
    </DisclosureTable>
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
