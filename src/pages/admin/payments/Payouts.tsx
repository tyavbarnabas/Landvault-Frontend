// Super Admin payouts — /admin/payouts (admin.payouts.manage + the admin's
// own two-factor).
//
//   Ready     verified sales owed money. Pay out sends the NEXT part (Paystack
//             caps a transfer at ₦10,000,000, so bigger sales go in equal
//             parts); each part needs Paystack's own code.
//   History   every payout attempt. One left waiting for its code can be
//             finished or cancelled here — otherwise that sale would sit off
//             the ready list with nothing to do about it.
//
// The admin never types an amount or an account. The backend decides both.
//
// Laid out from the Figma money-screen proposal: four figures, the ready
// sales as a table, a tab of its own for payouts left waiting for their code
// (otherwise only findable in History), and History as a table with status
// chips — each payout named by its company, from the payout's own
// companyName, so a role without the tenant directory still sees whose it is.

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { formatMoney } from "../../../lib/formatCurrency";
import { ApiError, ApiTransportError } from "../../../lib/apiClient";
import { useFetch, type UseFetchResult } from "../../../lib/useFetch";
import { formatDay, formatDayTime } from "../../../lib/formatDate";
import { withCount } from "../../../lib/useTabCounts";
import { useApp } from "../../../contexts/AppContext";
import LoadError from "../../../components/LoadError";
import TabBar from "../../../components/ui/Tabs";
import EmptyState from "../../../components/ui/EmptyState";
import Dialog from "../../../components/ui/Dialog";
import Page, { Loading } from "../../../components/ui/Page";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import TextLink from "../../../components/ui/TextLink";
import Alert from "../../../components/ui/Alert";
import Figure, { Figures } from "../../../components/ui/Figure";
import FilterChips from "../../../components/ui/FilterChips";
import DisclosureTable, { TableRow } from "../../../components/ui/DisclosureTable";
import { Field, Input } from "../../../components/ui/Field";
import StatusBadge, { payoutStatusBadge } from "../../../components/StatusBadge";
import ProblemNote, { type MoneyProblem } from "../../../components/payments/ProblemNote";
import { AlertIcon, DownloadIcon, WalletIcon } from "../../../components/icons";
import { failedPayouts, trancheText, type Payout } from "../../../services/financeService";
import type { PayoutBlocker, PayoutStatus } from "../../../services/paymentTypes";
import {
  cancelPayout, fetchPayoutHistory, fetchReadyPayouts, resendPayoutOtp, sendPayout, submitPayoutOtp,
  type ReadyPayout,
} from "../../../services/adminPayoutsService";

type Tab = "ready" | "awaiting" | "history";
const TAB_IDS: Tab[] = ["ready", "awaiting", "history"];
const money = (n: number, c: string) => formatMoney(n, c);

// Totals per currency, never added across currencies.
function totals(items: { amount: number; currency: string }[]): string {
  const by = new Map<string, number>();
  for (const i of items) by.set(i.currency, (by.get(i.currency) ?? 0) + i.amount);
  return by.size ? [...by].map(([c, n]) => money(n, c)).join(" + ") : money(0, "NGN");
}

const BLOCKER_TEXT: Record<PayoutBlocker, string> = {
  NO_APPROVED_PAYOUT_ACCOUNT: "The company has no approved payout account.",
  COMPANY_NOT_ACTIVE: "The company is suspended — payouts are on hold.",
  CURRENCY_NOT_SUPPORTED: "This sale isn't in naira, so it can't be paid out yet.",
};
const BLOCKER_SHORT: Record<PayoutBlocker, string> = {
  NO_APPROVED_PAYOUT_ACCOUNT: "No approved account",
  COMPANY_NOT_ACTIVE: "Company suspended",
  CURRENCY_NOT_SUPPORTED: "Not in naira",
};

export default function Payouts() {
  const { user } = useApp();
  const canSeeCompanies = (user?.permissions ?? []).includes("admin.tenants.view");
  const [params, setParams] = useSearchParams();
  const tab = (TAB_IDS.find((t) => t === params.get("tab")) ?? "ready") as Tab;
  const ready = useFetch(() => fetchReadyPayouts(), []);
  const history = useFetch(() => fetchPayoutHistory("all"), []);
  // Held here, not on a row: a sale whose payout is in flight leaves the
  // ready list on refresh, and its row — with any message on it — goes too.
  const [notice, setNotice] = useState("");
  const refresh = (message?: string) => { setNotice(message ?? ""); ready.refetch(); history.refetch(); };
  const awaiting = (history.data ?? []).filter((p) => p.status === "awaiting_otp");

  const counts: Record<Tab, number | undefined> = { ready: ready.data?.length, awaiting: history.data ? awaiting.length : undefined, history: history.data?.length };
  const tabs = [
    { id: "ready" as const, label: withCount("Ready to pay out", counts.ready) },
    { id: "awaiting" as const, label: withCount("Awaiting code", counts.awaiting) },
    { id: "history" as const, label: withCount("History", counts.history) },
  ];

  return (
    <Page title="Payouts" description="Send verified sales' proceeds to developers' approved accounts. Each transfer needs Paystack's code.">
      {ready.data && history.data && <PayoutFigures ready={ready.data} history={history.data} awaiting={awaiting} />}
      <TabBar tabs={tabs} active={tab} onActivate={(t) => { setNotice(""); setParams(t === "ready" ? {} : { tab: t }, { replace: true }); }} ariaLabel="Payouts" divider />
      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="space-y-3">
        {notice && <Alert tone="info" role="status" className="font-medium">{notice}</Alert>}
        {tab === "ready" && <Ready list={ready} canSeeCompanies={canSeeCompanies} onChanged={refresh} />}
        {tab === "awaiting" && <Awaiting list={history} payouts={awaiting} onChanged={refresh} />}
        {tab === "history" && <History list={history} onChanged={refresh} />}
      </div>
    </Page>
  );
}

// A sale whose payout is waiting for its code is off the ready list, so the
// figures say so rather than reading as if the money were no longer owed.
function PayoutFigures({ ready, history, awaiting }: { ready: ReadyPayout[]; history: Payout[]; awaiting: Payout[] }) {
  const owed = ready.map((r) => ({ amount: r.amountOwed ?? r.amount, currency: r.currency }));
  const sendable = ready.filter((r) => !r.blockers.length);
  const next = sendable.map((r) => ({ amount: r.nextPartAmount ?? r.amountOwed ?? r.amount, currency: r.currency }));
  const blocked = ready.filter((r) => r.blockers.length);
  const failed = failedPayouts(history);
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  const one = sendable.length === 1 ? sendable[0] : null;
  const waitingNote = awaiting.length ? `${plural(awaiting.length, "payout")} waiting for ${awaiting.length === 1 ? "its" : "their"} code` : null;
  return (
    <Figures>
      <Figure label="Owed to developers" icon={<DownloadIcon size={14} />} mono value={totals(owed)} sub={[ready.length ? plural(ready.length, "verified sale") : waitingNote ? null : "Nothing owed", waitingNote ? `plus ${waitingNote}` : null].filter(Boolean).join(" · ")} />
      <Figure label="Ready to send now" icon={<WalletIcon size={14} />} mono value={totals(next)}
        sub={one ? `${one.companyName ?? "One company"}${one.partCount && one.partCount > 1 ? ` · part ${one.nextPart} of ${one.partCount}` : ""}` : sendable.length ? `${sendable.length} sales, next transfer each` : waitingNote ? `Finish the ${plural(awaiting.length, "payout")} waiting for a code` : "Nothing can be sent yet"} />
      <Figure label="Blocked" icon={<AlertIcon size={14} />} tone={blocked.length ? "warning" : "neutral"} value={plural(blocked.length, "sale")}
        sub={blocked.length === 1 ? `${blocked[0].companyName ?? "A company"}: ${BLOCKER_SHORT[blocked[0].blockers[0]]?.toLowerCase() ?? "can't be paid yet"}` : blocked.length ? "See each sale for why" : "Nothing blocked"} />
      <Figure label="Failed" icon={<AlertIcon size={14} />} tone={failed.length ? "error" : "neutral"} value={plural(failed.length, "payout")}
        sub={failed.length ? `${totals(failed)} not sent — see History` : "No failed transfers"} />
    </Figures>
  );
}

// ─── Ready to pay out ────────────────────────────────────────────────────────

const READY_COLUMNS = ["Company", "What's owed", "Owed now", "Next transfer", "To account"];
const READY_GRID = "lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.5fr)_10rem]";

function Ready({ list, canSeeCompanies, onChanged }: { list: UseFetchResult<ReadyPayout[]>; canSeeCompanies: boolean; onChanged: (message?: string) => void }) {
  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <LoadError error={list.errorValue} what="sales ready to pay out" onRetry={list.refetch} />;
  if (!list.data?.length) return <Card padding="sm"><EmptyState title="Nothing to pay out" description="Verified sales that are owed money appear here." /></Card>;
  return (
    <DisclosureTable columns={READY_COLUMNS} grid={READY_GRID} label="Sales ready to pay out">
      {list.data.map((s) => <ReadyRow key={`${s.transactionId}-${s.tranche ?? ""}-${s.sharePaymentId ?? ""}`} sale={s} canSeeCompanies={canSeeCompanies} onChanged={onChanged} />)}
    </DisclosureTable>
  );
}

function ReadyRow({ sale, canSeeCompanies, onChanged }: { sale: ReadyPayout; canSeeCompanies: boolean; onChanged: (message?: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PayoutProblem | null>(null);
  const [otpFor, setOtpFor] = useState<Payout | null>(null);
  const blocked = sale.blockers.length > 0;
  const parts = sale.partCount !== null && sale.nextPart !== null && sale.nextPartAmount !== null && sale.amountOwed !== null;
  const many = parts && sale.partCount! > 1;

  const payOut = async () => {
    setBusy(true);
    setError(null);
    try {
      const payout = await sendPayout(sale.transactionId);
      if (payout.status === "awaiting_otp") setOtpFor(payout);
      else onChanged(sentMessage(payout));
    } catch (err) {
      setError(payoutProblem(err));
    } finally {
      setBusy(false);
    }
  };

  const cells = [
    <span className="font-semibold text-[var(--foreground)]">{sale.companyName || "Company not shown"}</span>,
    <>
      {/* The tranche is the row's title: "Developer's share of the deposit". */}
      {sale.trancheLabel && <div className="text-sm font-semibold text-[var(--foreground)]">{sale.trancheLabel}</div>}
      <div className={sale.trancheLabel ? "text-xs text-[var(--muted-foreground)]" : "text-sm text-[var(--foreground)]"}>{sale.estateName}</div>
      <div className="text-xs text-[var(--muted-foreground)]">{sale.plotLabel} · <span className="font-mono-data">{sale.transactionReference}</span></div>
      {sale.heldInEscrow != null
        ? <div className="text-xs text-[var(--info-text)]">HomeTrue holds {money(sale.heldInEscrow, sale.currency)} in escrow until the plan completes</div>
        : <div className="text-xs text-[var(--muted-foreground)]">Verified {formatDay(sale.verifiedAt)}</div>}
    </>,
    <>
      <span className="lg:hidden text-xs text-[var(--muted-foreground)]">Owed </span>
      <span className="font-mono-data font-medium text-[var(--foreground)]">{money(sale.amountOwed ?? sale.amount, sale.currency)}</span>
      {sale.amountOwed !== null && sale.amountOwed !== sale.amount && !sale.tranche && <div className="text-xs text-[var(--muted-foreground)]">of {money(sale.amount, sale.currency)}</div>}
    </>,
    parts ? (
      <>
        <span className="lg:hidden text-xs text-[var(--muted-foreground)]">Next </span>
        <span className="font-mono-data font-medium text-[var(--foreground)]">{money(sale.nextPartAmount!, sale.currency)}</span>
        <div className="text-xs text-[var(--muted-foreground)]">{many ? `Part ${sale.nextPart} of ${sale.partCount}` : "One transfer"}</div>
      </>
    ) : <span className="text-sm text-[var(--muted-foreground)]">—</span>,
    blocked ? (
      <div className="space-y-1">
        <div className="flex flex-wrap gap-1">{sale.blockers.map((b) => <StatusBadge key={b} label={BLOCKER_SHORT[b] ?? b} variant="warning" />)}</div>
        <div className="text-xs text-[var(--muted-foreground)]">{sale.blockers.map((b) => BLOCKER_TEXT[b] ?? b).join(" ")}</div>
        {canSeeCompanies && <TextLink to={`/admin/tenants/${sale.tenantId}`} className="text-xs">Open company →</TextLink>}
      </div>
    ) : sale.payoutAccount ? (
      <>
        <div className="text-sm text-[var(--foreground)]">{sale.payoutAccount.bankName} ••{sale.payoutAccount.accountLast4}</div>
        <div className="text-xs text-[var(--muted-foreground)]">{sale.payoutAccount.accountName}</div>
      </>
    ) : <span className="text-sm text-[var(--muted-foreground)]">No payout account</span>,
  ];

  return (
    <TableRow
      grid={READY_GRID}
      cells={cells}
      action={
        <Button onClick={payOut} disabled={blocked || busy}>
          {busy ? "Starting…" : many ? `Pay out part ${sale.nextPart}` : "Pay out"}
        </Button>
      }
      below={(sale.lastAttempt || error || otpFor) && (
        <>
          {sale.lastAttempt && (
            <p className="text-xs text-[var(--muted-foreground)]">
              Last attempt: {payoutStatusBadge(sale.lastAttempt.status).label.toLowerCase()}{sale.lastAttempt.gatewayMessage ? ` — Paystack: “${sale.lastAttempt.gatewayMessage}”` : ""}
            </p>
          )}
          {error && <ProblemNote problem={error} />}
          {otpFor && <OtpDialog payout={otpFor} onClose={(message) => { setOtpFor(null); onChanged(message); }} />}
        </>
      )}
    />
  );
}

// ─── Awaiting code, and history ──────────────────────────────────────────────

const PAYOUT_COLUMNS = ["Company", "Amount", "Account", "Started", "Reference", "Status"];
const PAYOUT_GRID = "lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1.1fr)_auto]";

function Awaiting({ list, payouts, onChanged }: { list: UseFetchResult<Payout[]>; payouts: Payout[]; onChanged: (message?: string) => void }) {
  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <LoadError error={list.errorValue} what="payouts waiting for a code" onRetry={list.refetch} />;
  if (!payouts.length) return <Card padding="sm"><EmptyState title="Nothing waiting for a code" description="A payout started but not finished — no code entered, not cancelled — waits here until it's sent or cancelled." /></Card>;
  return (
    <DisclosureTable columns={PAYOUT_COLUMNS} grid={PAYOUT_GRID} label="Payouts waiting for a code">
      {payouts.map((p) => <PayoutRow key={p.id} payout={p} company={payoutCompany(p)} onChanged={onChanged} />)}
    </DisclosureTable>
  );
}

type HistoryFilter = "all" | PayoutStatus;
const FILTER_LABEL: Record<PayoutStatus, string> = {
  awaiting_otp: "Awaiting code", sending: "Sending", pending: "With the bank", success: "Paid", failed: "Failed", reversed: "Reversed", cancelled: "Cancelled",
};

function History({ list, onChanged }: { list: UseFetchResult<Payout[]>; onChanged: (message?: string) => void }) {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <LoadError error={list.errorValue} what="payout history" onRetry={list.refetch} />;
  const all = list.data ?? [];
  if (!all.length) return <Card padding="sm"><EmptyState title="No payouts yet" description="Payouts appear here once one is sent." /></Card>;
  // Only the statuses that occur, so the chips stay short.
  const present = (Object.keys(FILTER_LABEL) as PayoutStatus[]).filter((s) => all.some((p) => p.status === s));
  const shown = filter === "all" ? all : all.filter((p) => p.status === filter);
  return (
    <>
      <FilterChips ariaLabel="Payouts by status" value={filter} onChange={setFilter}
        options={[{ id: "all" as const, label: "All", count: all.length }, ...present.map((s) => ({ id: s, label: FILTER_LABEL[s], count: all.filter((p) => p.status === s).length }))]} />
      {shown.length === 0 ? <Card padding="sm"><EmptyState title="None" description="No payouts with this status." /></Card> : (
        <DisclosureTable columns={PAYOUT_COLUMNS} grid={PAYOUT_GRID} label="Payout history">
          {shown.map((p) => <PayoutRow key={p.id} payout={p} company={payoutCompany(p)} onChanged={onChanged} />)}
        </DisclosureTable>
      )}
    </>
  );
}

// The payout's own company name (trading name, else registered name); null
// means none on record, shown neutrally, never guessed. Exported for tests.
export function payoutCompany(p: Pick<Payout, "companyName">): string {
  return p.companyName || "Company not shown";
}

function PayoutRow({ payout: p, company, onChanged }: { payout: Payout; company: string; onChanged: (message?: string) => void }) {
  const [otp, setOtp] = useState(false);
  const cells = [
    <span className="font-semibold text-[var(--foreground)]">{company}</span>,
    <>
      <span className="font-mono-data font-medium text-[var(--foreground)]">{money(p.amount, p.currency)}</span>
      <div className="text-xs text-[var(--muted-foreground)]">{[trancheText(p), p.partCount > 1 ? `Part ${p.partNumber} of ${p.partCount}` : "one transfer"].filter(Boolean).join(" · ").replace(/^one/, "One")}</div>
    </>,
    <span className="text-sm text-[var(--foreground)]">{p.bankName ? `${p.bankName}${p.accountLast4 ? ` ••${p.accountLast4}` : ""}` : "—"}</span>,
    <>
      <span className="text-sm text-[var(--muted-foreground)]"><span className="lg:hidden">Started </span>{formatDayTime(p.createdAt)}</span>
      {p.transferredAt && <div className="text-xs text-[var(--muted-foreground)]">Sent {formatDayTime(p.transferredAt)}</div>}
    </>,
    <span className="font-mono-data text-xs text-[var(--muted-foreground)] break-all">{p.reference}</span>,
    <StatusBadge {...payoutStatusBadge(p.status)} />,
  ];
  const failedNote = p.gatewayMessage && (p.status === "failed" || p.status === "reversed");
  return (
    <TableRow
      grid={PAYOUT_GRID}
      cells={cells}
      action={p.status === "awaiting_otp" ? <Button variant="secondary" onClick={() => setOtp(true)}>Enter code or cancel</Button> : undefined}
      below={(failedNote || p.reviewReason || otp) && (
        <>
          {failedNote && <p className="text-xs text-[var(--error-text)]">Paystack: “{p.gatewayMessage}”</p>}
          {p.reviewReason && <Alert tone="error" role="alert">Under review: {p.reviewReason}</Alert>}
          {otp && <OtpDialog payout={p} onClose={(message) => { setOtp(false); onChanged(message); }} />}
        </>
      )}
    />
  );
}

// ─── The code dialog ─────────────────────────────────────────────────────────

function OtpDialog({ payout, onClose }: { payout: Payout; onClose: (message?: string) => void }) {
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState<"otp" | "resend" | "cancel" | null>(null);
  const [problem, setProblem] = useState<PayoutProblem | null>(null);
  const [info, setInfo] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const part = payout.partCount > 1 ? ` (part ${payout.partNumber} of ${payout.partCount})` : "";

  const run = async (kind: "otp" | "resend" | "cancel", call: () => Promise<Payout>, done: (p: Payout) => void) => {
    setBusy(kind);
    setProblem(null);
    setInfo("");
    try { done(await call()); } catch (err) { setProblem(payoutProblem(err)); } finally { setBusy(null); }
  };

  const submit = () => {
    if (!/^\d{4,8}$/.test(otp)) { setProblem({ message: "Enter the code — 4 to 8 digits." }); return; }
    void run("otp", () => submitPayoutOtp(payout.id, otp), (p) => onClose(sentMessage(p)));
  };

  // Closing without a decision leaves the transfer waiting for its code.
  const close = () => onClose(busy ? undefined : "This payout is waiting for its code. Finish or cancel it under Awaiting code.");

  return (
    <Dialog title="Enter Paystack's code" onClose={close}>
      <p className="text-sm mb-3">
        Sending <strong>{money(payout.amount, payout.currency)}</strong>{part}{payout.bankName ? ` to ${payout.bankName}${payout.accountLast4 ? ` ending ${payout.accountLast4}` : ""}` : ""}.
        Paystack sent a code to the Paystack account owner's phone or email.
      </p>
      <Field id="payout-otp" label="Code" className="mb-3">
        <Input id="payout-otp" kind="code" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" autoComplete="one-time-code" />
      </Field>
      {problem && <div className="mb-3"><ProblemNote problem={problem} /></div>}
      {info && <p className="text-sm mb-3" role="status">{info}</p>}
      <Button size="lg" fullWidth onClick={submit} disabled={busy !== null} className="mb-2">
        {busy === "otp" ? "Sending…" : "Send the payout"}
      </Button>
      <div className="flex justify-between text-sm">
        <Button variant="link" disabled={busy !== null}
          onClick={() => void run("resend", () => resendPayoutOtp(payout.id), () => setInfo("A new code is on its way."))}>
          {busy === "resend" ? "Resending…" : "Resend code"}
        </Button>
        {confirmCancel ? (
          <span>
            Nothing will be sent.{" "}
            <Button variant="linkDanger" disabled={busy !== null}
              onClick={() => void run("cancel", () => cancelPayout(payout.id), () => onClose("Cancelled — nothing was sent. The sale is back on the ready list."))}>
              {busy === "cancel" ? "Cancelling…" : "Cancel the payout"}
            </Button>
          </span>
        ) : (
          <Button variant="linkMuted" disabled={busy !== null} onClick={() => setConfirmCancel(true)}>Cancel payout…</Button>
        )}
      </div>
    </Dialog>
  );
}

// ─── Saying what happened ────────────────────────────────────────────────────

export type PayoutProblem = MoneyProblem;

export function sentMessage(p: Payout): string {
  const part = p.partCount > 1 ? ` (part ${p.partNumber} of ${p.partCount})` : "";
  return p.status === "success" ? `Paid — ${money(p.amount, p.currency)}${part} has been transferred.`
    : p.status === "failed" ? `The transfer failed${p.gatewayMessage ? `: “${p.gatewayMessage}”` : "."}`
      : `Sent — ${money(p.amount, p.currency)}${part} is with the bank.`;
}

export function payoutProblem(err: unknown): PayoutProblem {
  if (err instanceof ApiTransportError) return { message: "We couldn't reach HomeTrue. Nothing was changed — try again." };
  const code = err instanceof ApiError ? err.body?.code : (err as { code?: string } | null)?.code;
  const message = err instanceof Error ? err.message : "";
  switch (code) {
    case "TWO_FACTOR_REQUIRED": return { message: "Turn on two-factor authentication to send payouts.", needsTwoFactor: true };
    case "OTP_REJECTED": return { message: message || "Paystack didn't accept that code. Check it and try again." };
    case "PAYOUT_OUTCOME_UNKNOWN": return { message: "Paystack didn't answer. It's safe to press Pay out again — it can't pay twice." };
    case "PAYMENT_PROVIDER_REFUSED": return { message: `Paystack refused the transfer${message ? `: “${message}”` : "."} It's recorded as failed; you can try again.` };
    case "PAYMENT_PROVIDER_UNAVAILABLE": return { message: "Paystack isn't responding right now. Try again in a moment." };
    case "PAYOUT_IN_PROGRESS": return { message: "A payout for this sale is already in progress. Finish or cancel it under Awaiting code." };
    case "SALE_ALREADY_PAID": return { message: "This sale has already been paid in full." };
    // Information, not an error: an instalment plan's escrow.
    case "HELD_IN_ESCROW": return { message: "Every share owed so far has been paid; the rest is released when the buyer completes the plan.", info: true };
    case "PAYOUT_NOT_AWAITING_OTP": return { message: "This payout isn't waiting for a code any more — check History." };
    case "COMPANY_NOT_ACTIVE": return { message: "The company is suspended, so payouts are on hold." };
    case "NO_APPROVED_PAYOUT_ACCOUNT": return { message: "The company has no approved payout account." };
    case "SALE_NOT_PAYABLE": return { message: "This sale isn't waiting for a payout any more. Refresh the list." };
    case "PAYOUT_NOT_FOUND": return { message: "We couldn't find that payout. Refresh the list." };
    case "VALIDATION_ERROR": return { message: (err as ApiError).body?.fieldErrors?.otp ?? "Check the code and try again." };
    default: return { message: message || "That didn't go through." };
  }
}
