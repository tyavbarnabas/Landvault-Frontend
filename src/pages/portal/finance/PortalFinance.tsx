// The developer's Finance area — /portal/finance (portal.payments.verify).
//
//   Awaiting verification  paid purchases: the agreed price beside Paystack's
//                          record. Verify SELLS the plot; Reject puts it back
//                          on sale and LandVault refunds the buyer in full.
//   Late payments          money that arrived after the reservation ended:
//                          allocate the plot (if still free) or refund.
//   Payouts                what LandVault has sent the company. Read-only.
//
// Nothing here is decided for the user: every action is one purchase, behind
// a confirmation that says exactly what it does.

import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApp } from "../../../contexts/AppContext";
import { DOCUMENTS_VIEW_PERMISSION } from "../../../services/authService";
import { formatInCurrency } from "../../../data/mockData";
import { ApiError, ApiTransportError } from "../../../lib/apiClient";
import { useFetch, type UseFetchResult } from "../../../lib/useFetch";
import { AlertIcon, CheckIcon } from "../../../components/icons";
import LoadError from "../../../components/LoadError";
import StatusBadge, { payoutStatusBadge, type BadgeVariant } from "../../../components/StatusBadge";
import TabBar from "../../../components/ui/Tabs";
import EmptyState from "../../../components/ui/EmptyState";
import Dialog, { DialogActions } from "../../../components/ui/Dialog";
import Page, { Loading } from "../../../components/ui/Page";
import Card, { InfoBox, ListCard } from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import Alert from "../../../components/ui/Alert";
import { ErrorText, Field, Textarea, describedBy } from "../../../components/ui/Field";
import {
  REASON_MAX, allocateLatePayment, failedPayouts, fetchCompanyPayouts, saleGroups, type SaleGroupData, fetchFinanceQueue, fetchLatePayments, paidWithLabel,
  refundLatePayment, rejectPurchase, verifyPurchase, type FinanceDecision, type FinanceQueueItem, type LatePayment, type Payout,
} from "../../../services/financeService";

type Tab = "verify" | "late" | "payouts";
const TABS: { id: Tab; label: string }[] = [
  { id: "verify", label: "Awaiting verification" },
  { id: "late", label: "Late payments" },
  { id: "payouts", label: "Payouts" },
];

const money = (amount: number, currency: string) => formatInCurrency(amount, currency);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null);

export default function PortalFinance() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((t) => t.id === params.get("tab")) ? params.get("tab") : "verify") as Tab;
  // Loaded once for the page, so the figures and tab counts agree with the lists.
  const queue = useFetch(() => fetchFinanceQueue(), []);
  const late = useFetch(() => fetchLatePayments(), []);
  const payouts = useFetch(() => fetchCompanyPayouts(), []);
  const count: Record<Tab, string | null> = {
    verify: queue.data ? String(queue.data.length) : null,
    late: late.data ? String(late.data.length) : null,
    payouts: payouts.data ? `${saleGroups(payouts.data).length} sale${saleGroups(payouts.data).length === 1 ? "" : "s"}` : null,
  };
  const tabs = TABS.map((t) => ({ ...t, label: count[t.id] !== null ? `${t.label} ${count[t.id]}` : t.label }));
  return (
    <Page title="Finance" description="Check buyers' payments before a plot is sold, settle late payments, and see what HomeTrue has paid you.">
      <Figures queue={queue.data} late={late.data} payouts={payouts.data} />
      <TabBar tabs={tabs} active={tab} onActivate={(t) => setParams({ tab: t }, { replace: true })} ariaLabel="Finance" divider />
      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "verify" && <VerificationQueue list={queue} />}
        {tab === "late" && <LatePayments list={late} />}
        {tab === "payouts" && <Payouts list={payouts} />}
      </div>
    </Page>
  );
}

// The four numbers a finance officer opens the page for. One whose list
// didn't load is left out, never shown as zero.
function Figures({ queue, late, payouts }: { queue: FinanceQueueItem[] | null; late: LatePayment[] | null; payouts: Payout[] | null }) {
  const cards: [string, string, string, boolean, string | undefined][] = [];
  if (queue) cards.push(["To verify", String(queue.length), queue.length ? `oldest waiting since ${dayOf(queue.map((q) => q.awaitingSince).sort()[0])}` : "nothing waiting", false, queue.length ? "text-[var(--warning-text)]" : undefined]);
  if (late) cards.push(["Late payments", String(late.length), late.length ? "to allocate or refund" : "nothing to settle", false, undefined]);
  if (payouts) {
    const currency = payouts.find((p) => p.currency === "NGN")?.currency ?? payouts[0]?.currency ?? "NGN";
    const paid = payouts.filter((p) => p.status === "success" && p.currency === currency);
    const moving = payouts.filter((p) => IN_FLIGHT.includes(p.status) && p.currency === currency);
    cards.push(["Paid out to you", money(paid.reduce((n, p) => n + p.amount, 0), currency), paid.length ? `${paid.length} transfer${paid.length === 1 ? "" : "s"}` : "nothing paid yet", true, undefined]);
    cards.push(["In progress", money(moving.reduce((n, p) => n + p.amount, 0), currency),
      moving.length ? `${moving.length} part${moving.length === 1 ? "" : "s"} ${moving.some((p) => p.status === "awaiting_otp") ? "awaiting HomeTrue's code" : "on the way"}` : "no transfer under way", true, moving.length ? "text-[var(--warning-text)]" : undefined]);
  }
  if (!cards.length) return null;
  return (
    <dl className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {cards.map(([label, value, sub, isMoney, tone]) => (
        <div key={label} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
          <dt className="text-xs text-[var(--muted-foreground)]">{label}</dt>
          <dd className={`${isMoney ? "font-mono-data font-medium text-lg sm:text-xl mt-1" : "font-display text-3xl"} ${tone ?? "text-[var(--foreground)]"} truncate`}>{value}</dd>
          <dd className="text-xs text-[var(--muted-foreground)] mt-1">{sub}</dd>
        </div>
      ))}
    </dl>
  );
}

const IN_FLIGHT: string[] = ["awaiting_otp", "pending", "sending"];
const dayOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

// ─── Awaiting verification ───────────────────────────────────────────────────

function VerificationQueue({ list }: { list: UseFetchResult<FinanceQueueItem[]> }) {
  const [done, setDone] = useState<Record<string, string>>({});
  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <LoadError error={list.errorValue} what="payments awaiting verification" onRetry={list.refetch} />;
  const items = list.data ?? [];
  if (items.length === 0) return <EmptyState title="Nothing waiting for verification" description="Paid purchases appear here for you to check against Paystack's record." />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted-foreground)]">Check each payment against Paystack's record. Verifying sells the plot, issues the buyer's documents and starts your payout.</p>
    <ul className="space-y-3">
      {items.map((item) => (
        <QueueCard key={item.transactionId} item={item} outcome={done[item.transactionId]}
          onDone={(message) => setDone((d) => ({ ...d, [item.transactionId]: message }))} />
      ))}
    </ul>
    </div>
  );
}

function QueueCard({ item, outcome, onDone }: { item: FinanceQueueItem; outcome?: string; onDone: (message: string) => void }) {
  const [dialog, setDialog] = useState<"verify" | "reject" | null>(null);
  const p = item.payment;
  const paymentOk = item.amountsMatch && !!p;
  const canVerify = paymentOk && item.letterApproved;
  const buyer = item.buyerEmail ?? "the buyer";
  const { user } = useApp();
  const seesLetters = !!user?.permissions?.includes(DOCUMENTS_VIEW_PERMISSION);

  return (
    <ListCard className="space-y-4" alert={!paymentOk}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-[var(--foreground)]">{item.estateName} — {item.plotLabel}</div>
          <div className="text-xs text-[var(--muted-foreground)]">
            {item.buyerEmail ?? "Buyer email not shown"} · <span className="font-mono-data">{item.transactionReference}</span> · waiting since {when(item.awaitingSince)}
          </div>
        </div>
        <StatusBadge {...(!p ? { label: "No payment on record", variant: "error" as const } : !paymentOk ? { label: "Amount doesn't match", variant: "error" as const }
          : !item.letterApproved ? { label: "Letter not approved", variant: "warning" as const } : { label: "Amounts match", variant: "success" as const })} />
      </div>

      <div className="grid sm:grid-cols-[1fr_auto_1fr] gap-3 items-center">
        <InfoBox label="Agreed price">
          <div className="font-mono-data text-lg">{money(item.expectedAmount, item.currency)}</div>
        </InfoBox>
        <span aria-hidden="true" className={`hidden sm:flex w-8 h-8 rounded-full items-center justify-center ${paymentOk ? "bg-[var(--success-surface)] text-[var(--success-text)]" : "bg-[var(--error-surface)] text-[var(--error-text)]"}`}>
          {paymentOk ? <CheckIcon size={16} /> : <AlertIcon size={16} />}
        </span>
        <InfoBox label="Paystack received" tone={paymentOk ? "neutral" : "error"}>
          <div className="font-mono-data text-lg">{p ? money(p.amountPaid, p.currency) : "Nothing confirmed"}</div>
        </InfoBox>
      </div>
      {p && (
        <p className="text-xs text-[var(--muted-foreground)]">
          {[paidWithLabel(p.channel, p.last4) && `Paid with ${paidWithLabel(p.channel, p.last4)}`, p.paidAt && when(p.paidAt), p.gatewayResponse && `Paystack: “${p.gatewayResponse}”`].filter(Boolean).join(" · ")}
          {" · "}<span className="font-mono-data break-all">{p.reference}</span>
        </p>
      )}

      {paymentOk && !item.letterApproved && (
        <Alert role="status" id={`letter-${item.transactionId}`}>
          Approve this estate's allocation letter first. Verifying issues the buyer's letter, so it can't be done until the Executive Director approves it.
          {seesLetters && <> <Link to={`/portal/estates/${item.estateId}/letter`} className="font-semibold hover:underline">See the estate's letter</Link></>}
        </Alert>
      )}

      {!paymentOk && (
        <Alert role="alert">
          {p ? `${shortfall(item)}Don't verify this purchase — reject it so the buyer is refunded, or contact HomeTrue.`
            : "There's no confirmed payment for this purchase, so it can't be verified."}
        </Alert>
      )}

      {outcome ? (
        <p className="text-sm font-medium text-[var(--foreground)]" role="status">{outcome}</p>
      ) : (
        <div className="flex gap-3">
          <Button onClick={() => setDialog("verify")} disabled={!canVerify}
            aria-describedby={paymentOk && !item.letterApproved ? `letter-${item.transactionId}` : undefined}>Verify and sell</Button>
          <Button variant="secondary" onClick={() => setDialog("reject")}>Reject</Button>
        </div>
      )}

      {dialog === "verify" && (
        <ConfirmDialog title="Verify this payment?" confirmLabel="Verify and sell the plot" onClose={() => setDialog(null)}
          action={() => verifyPurchase(item.transactionId)}
          onDone={(decision) => onDone(`Verified — ${item.plotLabel} is sold to ${buyer}. ${letterIssued(decision)}`)}>
          This sells <strong>{item.plotLabel}</strong> at {item.estateName} to <strong>{buyer}</strong> for {money(item.expectedAmount, item.currency)}. It can't be undone.
        </ConfirmDialog>
      )}
      {dialog === "reject" && (
        <ReasonDialog title="Reject this payment?" confirmLabel="Reject and refund the buyer" reasonLabel="Why are you rejecting it?"
          reasonHint="Recorded with the decision." onClose={() => setDialog(null)}
          action={(reason) => rejectPurchase(item.transactionId, reason)}
          onDone={() => onDone(`Rejected — ${item.plotLabel} is back on sale and HomeTrue is refunding ${buyer} in full.`)}>
          The plot goes back on sale, and HomeTrue returns the buyer's {p ? money(p.amountPaid, p.currency) : "payment"} in full.
        </ReasonDialog>
      )}
    </ListCard>
  );
}

// "Paystack received ₦500,000 less than the agreed price." — only when the
// two are in the same currency; otherwise just that they differ.
function shortfall(item: FinanceQueueItem): string {
  const p = item.payment;
  if (!p || p.currency !== item.currency || p.amountPaid === item.expectedAmount) return "The amount Paystack received doesn't match the agreed price. ";
  const gap = Math.abs(item.expectedAmount - p.amountPaid);
  return `Paystack received ${money(gap, item.currency)} ${p.amountPaid < item.expectedAmount ? "less" : "more"} than the agreed price. `;
}

// ─── Late payments ───────────────────────────────────────────────────────────

function LatePayments({ list }: { list: UseFetchResult<LatePayment[]> }) {
  const [done, setDone] = useState<Record<string, string>>({});
  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <LoadError error={list.errorValue} what="late payments" onRetry={list.refetch} />;
  const items = list.data ?? [];
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted-foreground)]">
        These buyers paid after their reservation had ended. Allocate the plot if it's still free, or refund them — they'll be told either way.
      </p>
      {items.length === 0 ? <EmptyState title="No late payments" description="Payments that arrive after a reservation ends appear here." /> : (
        <ul className="space-y-3">
          {items.map((item) => (
            <LateCard key={item.transactionId} item={item} outcome={done[item.transactionId]}
              onDone={(message) => setDone((d) => ({ ...d, [item.transactionId]: message }))} />
          ))}
        </ul>
      )}
    </div>
  );
}

function LateCard({ item, outcome, onDone }: { item: LatePayment; outcome?: string; onDone: (message: string) => void }) {
  const [dialog, setDialog] = useState<"allocate" | "refund" | null>(null);
  const canAllocate = item.plotAvailable && item.amountsMatch && item.letterApproved;
  const buyer = item.buyerName ?? item.buyerEmail ?? "the buyer";
  return (
    <ListCard className="space-y-3">
      <div>
        <div className="font-semibold text-[var(--foreground)]">{item.estateName} — {item.plotLabel}</div>
        <div className="text-xs text-[var(--muted-foreground)]">
          {[item.buyerName, item.buyerEmail].filter(Boolean).join(" · ") || "Buyer not shown"} · <span className="font-mono-data">{item.transactionReference}</span>
        </div>
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div><dt className="text-xs text-[var(--muted-foreground)]">Agreed price</dt><dd className="font-mono-data">{money(item.agreedPrice, item.currency)}</dd></div>
        <div><dt className="text-xs text-[var(--muted-foreground)]">Paid</dt><dd className="font-mono-data">{money(item.amountPaid, item.currency)}</dd></div>
        <div><dt className="text-xs text-[var(--muted-foreground)]">Paid on</dt><dd>{when(item.paidAt) ?? "—"}</dd></div>
        <div><dt className="text-xs text-[var(--muted-foreground)]">Payment</dt><dd className="font-mono-data text-xs break-all">{item.paymentReference}</dd></div>
      </dl>
      {!item.plotAvailable && <Alert>Someone else has this plot now. Refunding is the only option.</Alert>}
      {item.plotAvailable && !item.amountsMatch && <Alert>The amount paid doesn't match the agreed price, so the plot can't be allocated. Refund the buyer.</Alert>}
      {item.plotAvailable && item.amountsMatch && !item.letterApproved && (
        <Alert role="status">Approve this estate's allocation letter first. Allocating issues the buyer's letter, so it can't be done until the Executive Director approves it. You can still refund.</Alert>
      )}
      {outcome ? <p className="text-sm font-medium" role="status">{outcome}</p> : (
        <div className="flex gap-3">
          {canAllocate && <Button onClick={() => setDialog("allocate")}>Allocate the plot</Button>}
          <Button variant="secondary" onClick={() => setDialog("refund")}>Refund</Button>
        </div>
      )}
      {dialog === "allocate" && (
        <ConfirmDialog title="Allocate this plot?" confirmLabel="Allocate the plot" onClose={() => setDialog(null)}
          action={() => allocateLatePayment(item.transactionId)} onDone={(decision) => onDone(`Allocated — ${item.plotLabel} is sold to ${buyer}. ${letterIssued(decision)}`)}>
          This sells <strong>{item.plotLabel}</strong> to <strong>{buyer}</strong> for the {money(item.amountPaid, item.currency)} they paid. It can't be undone.
        </ConfirmDialog>
      )}
      {dialog === "refund" && (
        <ReasonDialog title="Refund this payment?" confirmLabel="Refund the buyer" reasonLabel="Message to the buyer"
          reasonHint="The buyer sees this." onClose={() => setDialog(null)}
          action={(reason) => refundLatePayment(item.transactionId, reason)}
          onDone={() => onDone(`Refund requested — HomeTrue will return ${money(item.amountPaid, item.currency)} to ${buyer}.`)}>
          HomeTrue returns the buyer's {money(item.amountPaid, item.currency)} in full.
        </ReasonDialog>
      )}
    </ListCard>
  );
}

// ─── Payouts (read-only) ─────────────────────────────────────────────────────

function Payouts({ list }: { list: UseFetchResult<Payout[]> }) {
  if (list.loading && !list.data) return <Loading />;
  if (list.error) {
    const code = list.errorValue instanceof ApiError ? list.errorValue.body?.code : undefined;
    if (code === "COMPANY_WIDE_SCOPE_REQUIRED") {
      return <EmptyState title="Payouts are company-wide" description="Your account works inside one branch, so payouts aren't shown to you. Your Executive Director can see them." />;
    }
    return <LoadError error={list.errorValue} what="payouts" onRetry={list.refetch} />;
  }
  const items = list.data ?? [];
  if (items.length === 0) return <EmptyState title="No payouts yet" description="When HomeTrue pays you for a verified sale, it appears here." />;
  const groups = saleGroups(items);
  const bank = items.find((p) => p.bankName);
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted-foreground)]">
        What HomeTrue has sent{bank?.bankName ? ` to ${bank.bankName}${bank.accountLast4 ? ` ••${bank.accountLast4}` : ""}` : " to your payout account"}, one row per sale. A sale over ₦10,000,000 is paid in parts.
      </p>
      <Card padding="none" className="overflow-hidden">
        <ul className="divide-y divide-[var(--border)]">{groups.map((g) => <SaleGroup key={g.transactionId} group={g} />)}</ul>
      </Card>
    </div>
  );
}

function groupBadge(g: SaleGroupData): { label: string; variant: BadgeVariant } {
  const waiting = g.parts.find((p) => p.status === "awaiting_otp");
  if (waiting) return { label: g.parts.length > 1 ? `Part ${waiting.partNumber} waiting` : "Waiting on HomeTrue", variant: "warning" };
  if (g.parts.some((p) => p.status === "pending" || p.status === "sending")) return { label: "Sending", variant: "info" };
  if (failedPayouts(g.parts).length) return { label: "Failed", variant: "error" };
  if (g.parts.some((p) => p.status === "success")) return { label: "Paid", variant: "success" };
  return payoutStatusBadge(g.parts[g.parts.length - 1].status);
}

function SaleGroup({ group: g }: { group: SaleGroupData }) {
  const badge = groupBadge(g);
  return (
    <li className="px-4 sm:px-5 py-4 space-y-2.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-[var(--foreground)]">Sale · <span className="font-mono-data">{money(g.amount, g.currency)}</span></div>
          <div className="text-xs text-[var(--muted-foreground)]">Started {dayOf(g.started)}{g.retried ? " · retried after an earlier attempt failed" : ""}</div>
        </div>
        <StatusBadge label={badge.label} variant={badge.variant} />
      </div>
      <ul className="space-y-1.5">{g.parts.map((p) => <PayoutPart key={p.id} payout={p} />)}</ul>
    </li>
  );
}

function PayoutPart({ payout: p }: { payout: Payout }) {
  const badge = payoutStatusBadge(p.status);
  const failed = p.status === "failed" || p.status === "reversed";
  return (
    <li className="rounded-lg bg-[var(--muted)] px-3 py-2.5 text-sm">
      <div className="grid grid-cols-2 sm:grid-cols-[9rem_9rem_minmax(0,1fr)_auto] gap-x-4 gap-y-1 items-center">
        <span className="text-[var(--foreground)]">{p.partCount > 1 ? `Part ${p.partNumber} of ${p.partCount}` : "Single transfer"}</span>
        <span className="font-mono-data text-right sm:text-left">{money(p.amount, p.currency)}</span>
        <span className="text-xs text-[var(--muted-foreground)]">{when(p.createdAt)}{p.transferredAt ? ` · transferred ${when(p.transferredAt)}` : ""}</span>
        <span className="justify-self-end"><StatusBadge label={badge.label} variant={badge.variant} /></span>
      </div>
      {failed && p.gatewayMessage && <p className="text-xs text-[var(--error-text)] mt-1.5">Paystack: “{p.gatewayMessage}”</p>}
      {p.reviewReason && <p className="text-xs text-[var(--warning-text)] font-medium mt-1.5">HomeTrue is looking into this payout.</p>}
      <p className="text-[11px] text-[var(--muted-foreground)] font-mono-data mt-1 break-all">{p.reference}</p>
    </li>
  );
}

// ─── Dialogs ─────────────────────────────────────────────────────────────────

// A refused decision, said plainly. Every 409 here means "nothing was changed".
export function financeErrorMessage(err: unknown): string {
  if (err instanceof ApiTransportError) return "We couldn't reach HomeTrue. Nothing was changed — try again.";
  const code = err instanceof ApiError ? err.body?.code : (err as { code?: string } | null)?.code;
  switch (code) {
    case "TRANSACTION_NOT_AWAITING_FINANCE": return "This purchase isn't waiting for verification any more — someone may have decided it already. Nothing was changed.";
    case "PAYMENT_NOT_CONFIRMED": return "The payment isn't confirmed for the agreed amount, so it can't be verified. Nothing was changed.";
    case "PLOT_NOT_RESERVED": return "The plot isn't held for this purchase any more. Nothing was changed.";
    case "PLOT_NO_LONGER_AVAILABLE": return "Someone else has this plot now, so it can't be allocated. Nothing was changed — refund the buyer instead.";
    case "TRANSACTION_NOT_FOUND":
    case "LATE_PAYMENT_NOT_FOUND": return "We couldn't find this any more — it may have been settled already. Refresh the list.";
    case "COMPANY_SCOPE_REQUIRED": return "This needs a company account. Nothing was changed.";
    // The estate's letter isn't approved (or lapsed since the list loaded).
    case "LETTER_NOT_APPROVED": return "This estate's allocation letter isn't approved, so the plot can't be allocated yet. Nothing was changed. Ask the Executive Director to approve it.";
    // Separation of duties: the backend refuses anyone deciding on a purchase
    // they made themselves.
    case "OWN_PURCHASE": return "You can't decide on your own purchase — another finance officer or director must. Nothing was changed.";
    default: return err instanceof Error && err.message ? err.message : "That didn't go through. Nothing was changed.";
  }
}

// Finance can't open the buyer's letter, so its number is a confirmation, not a link.
function letterIssued(decision: FinanceDecision): string {
  return decision.allocationLetterNumber
    ? `Allocation letter ${decision.allocationLetterNumber} issued to the buyer.`
    : "The buyer's allocation letter was issued.";
}

function ConfirmDialog({ title, confirmLabel, children, action, onDone, onClose }: {
  title: string; confirmLabel: string; children: React.ReactNode;
  action: () => Promise<FinanceDecision>; onDone: (decision: FinanceDecision) => void; onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const go = async () => {
    setBusy(true);
    setError("");
    try { const decision = await action(); onDone(decision); onClose(); } catch (err) { setError(financeErrorMessage(err)); setBusy(false); }
  };
  return (
    <Dialog title={title} onClose={busy ? () => {} : onClose}>
      <p className="text-sm text-[var(--foreground)] mb-4">{children}</p>
      {error && <ErrorText className="mb-3">{error}</ErrorText>}
      <DialogActions onCancel={onClose} onConfirm={go} confirmLabel={confirmLabel} busy={busy} />
    </Dialog>
  );
}

function ReasonDialog({ title, confirmLabel, reasonLabel, reasonHint, children, action, onDone, onClose }: {
  title: string; confirmLabel: string; reasonLabel: string; reasonHint: string; children: React.ReactNode;
  action: (reason: string) => Promise<unknown>; onDone: () => void; onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const go = async () => {
    const trimmed = reason.trim();
    if (!trimmed) { setError("Give a reason."); return; }
    setBusy(true);
    setError("");
    try { await action(trimmed); onDone(); onClose(); } catch (err) {
      const fields = err instanceof ApiError ? err.body?.fieldErrors : undefined;
      setError(fields?.reason ?? financeErrorMessage(err));
      setBusy(false);
    }
  };
  return (
    <Dialog title={title} onClose={busy ? () => {} : onClose}>
      <p className="text-sm text-[var(--foreground)] mb-3">{children}</p>
      <Field id="finance-reason" label={reasonLabel} hint={`${reasonHint} ${reason.length}/${REASON_MAX}`} className="mb-3">
        <Textarea id="finance-reason" value={reason} onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX))} rows={3}
          aria-describedby={describedBy("finance-reason", { hint: true })} />
      </Field>
      {error && <ErrorText className="mb-3">{error}</ErrorText>}
      <DialogActions onCancel={onClose} onConfirm={go} confirmLabel={confirmLabel} busy={busy} variant="danger" />
    </Dialog>
  );
}
