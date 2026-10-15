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

import { useState } from "react";
import { formatInCurrency } from "../../../data/mockData";
import { ApiError, ApiTransportError } from "../../../lib/apiClient";
import { useFetch } from "../../../lib/useFetch";
import LoadError from "../../../components/LoadError";
import TabBar from "../../../components/ui/Tabs";
import EmptyState from "../../../components/ui/EmptyState";
import Dialog from "../../../components/ui/Dialog";
import Page, { Loading } from "../../../components/ui/Page";
import { ListCard } from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import Alert from "../../../components/ui/Alert";
import { Field, Input, Select } from "../../../components/ui/Field";
import StatusBadge, { payoutStatusBadge } from "../../../components/StatusBadge";
import ProblemNote, { type MoneyProblem } from "../../../components/payments/ProblemNote";
import type { Payout } from "../../../services/financeService";
import type { PayoutBlocker } from "../../../services/paymentTypes";
import {
  cancelPayout, fetchPayoutHistory, fetchReadyPayouts, resendPayoutOtp, sendPayout, submitPayoutOtp,
  type PayoutFilter, type ReadyPayout,
} from "../../../services/adminPayoutsService";

type Tab = "ready" | "history";
const TABS: { id: Tab; label: string }[] = [{ id: "ready", label: "Ready to pay out" }, { id: "history", label: "History" }];
const money = (n: number, c: string) => formatInCurrency(n, c);
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null);

const BLOCKER_TEXT: Record<PayoutBlocker, string> = {
  NO_APPROVED_PAYOUT_ACCOUNT: "The company has no approved payout account.",
  COMPANY_NOT_ACTIVE: "The company is suspended — payouts are on hold.",
  CURRENCY_NOT_SUPPORTED: "This sale isn't in naira, so it can't be paid out yet.",
};

export default function Payouts() {
  const [tab, setTab] = useState<Tab>("ready");
  return (
    <Page title="Payouts" description="Send verified sales' proceeds to developers' approved accounts. Each transfer needs Paystack's code.">
      <TabBar tabs={TABS} active={tab} onActivate={setTab} ariaLabel="Payouts" divider />
      {tab === "ready" ? <Ready /> : <History />}
    </Page>
  );
}

// ─── Ready to pay out ────────────────────────────────────────────────────────

function Ready() {
  const list = useFetch(() => fetchReadyPayouts(), []);
  // Held here, not on the card: a sale whose payout is in flight leaves the
  // list on refresh, and its card — with any message on it — goes too.
  const [notice, setNotice] = useState("");
  const banner = notice && <Alert tone="info" role="status" className="font-medium mb-3">{notice}</Alert>;
  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <LoadError error={list.errorValue} what="sales ready to pay out" onRetry={list.refetch} />;
  if (!list.data?.length) return <>{banner}<EmptyState title="Nothing to pay out" description="Verified sales that are owed money appear here." /></>;
  return (
    <>
      {banner}
      <ul className="space-y-3">{list.data.map((s) => <ReadyCard key={s.transactionId} sale={s} onChanged={(message) => { setNotice(message ?? ""); list.refetch(); }} />)}</ul>
    </>
  );
}

function ReadyCard({ sale, onChanged }: { sale: ReadyPayout; onChanged: (message?: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PayoutProblem | null>(null);
  const [otpFor, setOtpFor] = useState<Payout | null>(null);
  const blocked = sale.blockers.length > 0;
  const parts = sale.partCount !== null && sale.nextPart !== null && sale.nextPartAmount !== null && sale.amountOwed !== null;

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

  return (
    <ListCard className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-[var(--foreground)]">{sale.companyName ?? "Company name not on record"}</div>
          <div className="text-xs text-[var(--muted-foreground)]">
            {sale.estateName} — {sale.plotLabel} · <span className="font-mono-data">{sale.transactionReference}</span> · verified {when(sale.verifiedAt)}
          </div>
        </div>
        <div className="text-right">
          <div className="font-mono-data text-lg">{money(sale.amount, sale.currency)}</div>
          <div className="text-xs text-[var(--muted-foreground)]">sale price</div>
        </div>
      </div>

      {parts && (
        <p className="text-sm">
          {money(sale.amountOwed!, sale.currency)} owed{sale.partCount! > 1 ? <> · part {sale.nextPart} of {sale.partCount}: <strong className="font-mono-data">{money(sale.nextPartAmount!, sale.currency)}</strong></> : null}
        </p>
      )}
      <p className="text-sm text-[var(--muted-foreground)]">
        {sale.payoutAccount ? <>To {sale.payoutAccount.bankName} ending {sale.payoutAccount.accountLast4} ({sale.payoutAccount.accountName})</> : "No payout account"}
      </p>

      {blocked && (
        <Alert>
          <ul className="space-y-1">{sale.blockers.map((b) => <li key={b}>{BLOCKER_TEXT[b] ?? b}</li>)}</ul>
        </Alert>
      )}
      {sale.lastAttempt && (
        <p className="text-xs text-[var(--muted-foreground)]">
          Last attempt: {payoutStatusBadge(sale.lastAttempt.status).label.toLowerCase()}{sale.lastAttempt.gatewayMessage ? ` — Paystack: “${sale.lastAttempt.gatewayMessage}”` : ""}
        </p>
      )}

      {error && <ProblemNote problem={error} />}

      <Button onClick={payOut} disabled={blocked || busy}>
        {busy ? "Starting the transfer…" : parts && sale.partCount! > 1 ? `Pay out part ${sale.nextPart} of ${sale.partCount}` : "Pay out"}
      </Button>

      {otpFor && <OtpDialog payout={otpFor} onClose={(message) => { setOtpFor(null); onChanged(message); }} />}
    </ListCard>
  );
}

// ─── History ─────────────────────────────────────────────────────────────────

const FILTERS: { id: PayoutFilter; label: string }[] = [
  { id: "all", label: "All" }, { id: "awaiting_otp", label: "Awaiting code" }, { id: "pending", label: "With the bank" },
  { id: "success", label: "Paid" }, { id: "failed", label: "Failed" }, { id: "reversed", label: "Reversed" }, { id: "cancelled", label: "Cancelled" },
];

function History() {
  const [filter, setFilter] = useState<PayoutFilter>("all");
  const list = useFetch(() => fetchPayoutHistory(filter), [filter]);
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <span className="text-[var(--muted-foreground)]">Show</span>
        <Select inputSize="sm" value={filter} onChange={(e) => setFilter(e.target.value as PayoutFilter)}>
          {FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </Select>
      </label>
      {list.loading && !list.data && <Loading />}
      {list.error && <LoadError error={list.errorValue} what="payout history" onRetry={list.refetch} />}
      {list.data && list.data.length === 0 && <EmptyState title="No payouts" description={filter === "all" ? "Payouts appear here once one is sent." : "None with this status."} />}
      {list.data && list.data.length > 0 && <ul className="space-y-3">{list.data.map((p) => <HistoryRow key={p.id} payout={p} onChanged={list.refetch} />)}</ul>}
    </div>
  );
}

function HistoryRow({ payout: p, onChanged }: { payout: Payout; onChanged: () => void }) {
  const [otp, setOtp] = useState(false);
  const badge = payoutStatusBadge(p.status);
  return (
    <ListCard alert={!!p.reviewReason}>
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0 space-y-1.5">
          <div>
            <div className="font-semibold text-[var(--foreground)]">
              <span className="font-mono-data">{money(p.amount, p.currency)}</span>
              {p.partCount > 1 && <span className="text-xs font-normal text-[var(--muted-foreground)]"> · part {p.partNumber} of {p.partCount}</span>}
            </div>
            <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
              {p.bankName && p.accountLast4 ? `${p.bankName} ending ${p.accountLast4} · ` : p.bankName ? `${p.bankName} · ` : ""}
              started {when(p.createdAt)}{p.transferredAt ? ` · transferred ${when(p.transferredAt)}` : ""} · <span className="font-mono-data">{p.reference}</span>
            </div>
          </div>
          {p.gatewayMessage && (p.status === "failed" || p.status === "reversed") && <p className="text-xs text-[var(--error-text)]">Paystack: “{p.gatewayMessage}”</p>}
          {p.reviewReason && <p className="text-sm text-[var(--error-text)] font-semibold">Under review: {p.reviewReason}</p>}
          {p.status === "awaiting_otp" && (
            <Button variant="link" onClick={() => setOtp(true)}>Enter code or cancel</Button>
          )}
        </div>
        <StatusBadge label={badge.label} variant={badge.variant} />
      </div>
      {otp && <OtpDialog payout={p} onClose={() => { setOtp(false); onChanged(); }} />}
    </ListCard>
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
  const close = () => onClose(busy ? undefined : "This payout is waiting for its code. Finish or cancel it from History.");

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
    case "PAYOUT_IN_PROGRESS": return { message: "A payout for this sale is already in progress. Finish or cancel it from History." };
    case "SALE_ALREADY_PAID": return { message: "This sale has already been paid in full." };
    case "PAYOUT_NOT_AWAITING_OTP": return { message: "This payout isn't waiting for a code any more — check History." };
    case "COMPANY_NOT_ACTIVE": return { message: "The company is suspended, so payouts are on hold." };
    case "NO_APPROVED_PAYOUT_ACCOUNT": return { message: "The company has no approved payout account." };
    case "SALE_NOT_PAYABLE": return { message: "This sale isn't waiting for a payout any more. Refresh the list." };
    case "PAYOUT_NOT_FOUND": return { message: "We couldn't find that payout. Refresh the list." };
    case "VALIDATION_ERROR": return { message: (err as ApiError).body?.fieldErrors?.otp ?? "Check the code and try again." };
    default: return { message: message || "That didn't go through." };
  }
}
