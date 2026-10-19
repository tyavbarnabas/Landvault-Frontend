// The company's payout bank account — /portal/payout-account
// (portal.settlement.manage: Executive Directors, company-wide).
//
// LandVault pays verified sales into the APPROVED account only. A new account
// waits for a LandVault Super Admin; meanwhile payouts keep going to the
// approved one. The bank names the account — there's no name field — and the
// name is shown back so a wrong number is caught before anyone approves it.

import { useState } from "react";
import { ApiError } from "../../../lib/apiClient";
import { useFetch } from "../../../lib/useFetch";
import LoadError from "../../../components/LoadError";
import EmptyState from "../../../components/ui/EmptyState";
import Dialog, { DialogActions } from "../../../components/ui/Dialog";
import Page, { Loading } from "../../../components/ui/Page";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import Alert from "../../../components/ui/Alert";
import { ErrorText } from "../../../components/ui/Field";
import StatusBadge, { settlementAccountBadge } from "../../../components/StatusBadge";
import TextLink from "../../../components/ui/TextLink";
import { WalletIcon } from "../../../components/icons";
import BankAccountForm, { bankAccountErrors, type BankAccountErrors } from "../../../components/payments/BankAccountForm";
import {
  fetchCompanySettlement, fetchSettlementBanks, submitSettlementAccount, withdrawSettlementAccount, type SettlementAccount,
} from "../../../services/settlementService";

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null);

export default function PayoutAccount() {
  const loaded = useFetch(() => fetchCompanySettlement(), []);
  const [justSubmitted, setJustSubmitted] = useState<SettlementAccount | null>(null);
  const [withdrawing, setWithdrawing] = useState<SettlementAccount | null>(null);
  const [changing, setChanging] = useState(false);

  if (loaded.loading && !loaded.data) return <PayoutPage><Loading /></PayoutPage>;
  if (loaded.error) {
    const code = loaded.errorValue instanceof ApiError ? loaded.errorValue.body?.code : undefined;
    if (code === "SETTLEMENT_REQUIRES_COMPANY_WIDE_SCOPE" || code === "COMPANY_SCOPE_REQUIRED") {
      return <PayoutPage><EmptyState title="The payout account is company-wide" description="Your account works inside one branch, so you can't manage where HomeTrue pays the company." /></PayoutPage>;
    }
    return <PayoutPage><LoadError error={loaded.errorValue} what="your payout account" onRetry={loaded.refetch} /></PayoutPage>;
  }
  const { approved, pending, history } = loaded.data!;

  return (
    <PayoutPage action={!pending ? <Button variant={approved ? "secondary" : "primary"} onClick={() => setChanging(true)}>{approved ? "Change account" : "Add a payout account"}</Button> : undefined}>
      {approved ? <CurrentAccount account={approved} /> : (
        <Alert>No approved payout account yet. HomeTrue can't pay you for verified sales until one is approved.</Alert>
      )}

      {pending && (
        <Card as="section" aria-labelledby="pending-heading" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="pending-heading" className="font-semibold text-[var(--foreground)]">Waiting for HomeTrue approval</h2>
            <StatusBadge {...settlementAccountBadge(pending.status)} />
          </div>
          <AccountFacts account={pending} />
          {justSubmitted?.id === pending.id && (
            <Alert tone="info" role="status">
              The bank says this account belongs to: <strong>{pending.accountName}</strong>. If that isn't your company, withdraw it now.
            </Alert>
          )}
          <p className="text-sm text-[var(--muted-foreground)]">
            {approved ? "Payouts still go to your approved account until HomeTrue approves this one." : "Payouts are on hold until HomeTrue approves it."}
            {" "}To submit a different account, withdraw this one first.
          </p>
          <Button variant="link" onClick={() => setWithdrawing(pending)}>Withdraw this account</Button>
        </Card>
      )}

      {history.length > 0 && <HistoryTable history={history} />}

      {changing && !pending && (
        <Dialog title={approved ? "Change the payout account" : "Add a payout account"} onClose={() => setChanging(false)}>
          <p className="text-sm text-[var(--muted-foreground)] mb-4">
            Use an account in the company's name. Your bank tells us whose account it is. Every Executive Director is emailed, and HomeTrue approves it before any money is sent there.
          </p>
          <BankAccountForm idPrefix="payout" loadBanks={fetchSettlementBanks} submitLabel="Submit for approval" onCancel={() => setChanging(false)}
            onSubmit={async (account) => {
              try {
                setJustSubmitted(await submitSettlementAccount(account));
                setChanging(false);
                loaded.refetch();
              } catch (err) {
                return payoutAccountErrors(err);
              }
            }} />
        </Dialog>
      )}

      {withdrawing && (
        <WithdrawDialog account={withdrawing} onClose={() => setWithdrawing(null)} onDone={() => { setJustSubmitted(null); loaded.refetch(); }} />
      )}
    </PayoutPage>
  );
}

// The account payouts go to now, and what a change would take.
function CurrentAccount({ account }: { account: SettlementAccount }) {
  return (
    <Card as="section" aria-labelledby="current-heading" className="space-y-4">
      <div className="flex items-center gap-3.5">
        <span className="w-11 h-11 shrink-0 rounded-lg bg-[var(--secondary)] text-[var(--secondary-foreground)] flex items-center justify-center"><WalletIcon size={22} /></span>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-[var(--muted-foreground)]">Payouts go to</div>
          <h2 id="current-heading" className="font-semibold text-lg text-[var(--foreground)] truncate">{account.accountName}</h2>
        </div>
        <StatusBadge {...settlementAccountBadge(account.status)} />
      </div>
      <AccountFacts account={account} />
      <p className="text-sm rounded-lg bg-[var(--info-surface)] text-[var(--info-text)] px-3.5 py-2.5">
        A change needs an account in the company's name. Every Executive Director is emailed, and HomeTrue approves it before any money goes there — until then payouts keep going to this account.
      </p>
    </Card>
  );
}

function AccountFacts({ account }: { account: SettlementAccount }) {
  const facts: [string, React.ReactNode][] = [
    ["Bank", account.bankName],
    ["Account number", <span className="font-mono-data">{account.accountNumber}</span>],
    account.status === "approved" ? ["Approved by HomeTrue", day(account.decidedAt) ?? "—"] : ["Submitted", day(account.submittedAt) ?? "—"],
  ];
  return (
    <dl className="grid sm:grid-cols-3 gap-3">
      {facts.map(([label, value]) => (
        <div key={label} className="rounded-lg bg-[var(--muted)] px-3.5 py-2.5">
          <dt className="text-xs text-[var(--muted-foreground)]">{label}</dt>
          <dd className="text-sm font-medium text-[var(--foreground)]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// The latest few accounts on the page; the full history keeps its own page.
const HISTORY_ON_PAGE = 5;

function HistoryTable({ history }: { history: SettlementAccount[] }) {
  const shown = history.slice(0, HISTORY_ON_PAGE);
  return (
    <Card as="section" padding="none" className="overflow-hidden" aria-labelledby="history-heading">
      <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3.5">
        <h2 id="history-heading" className="font-semibold text-[var(--foreground)]">History</h2>
        {history.length > HISTORY_ON_PAGE && <TextLink to="/portal/payout-account/history" className="text-sm">All {history.length} →</TextLink>}
      </div>
      <ul className="divide-y divide-[var(--border)] border-t border-[var(--border)]">
        {shown.map((a) => (
          <li key={a.id} className="px-4 sm:px-5 py-3 sm:grid sm:grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
            <div className="text-sm text-[var(--foreground)]">{a.bankName} · <span className="font-mono-data">{a.accountNumber}</span></div>
            <div className="text-sm text-[var(--muted-foreground)] truncate">{a.accountName}</div>
            <div className="text-xs text-[var(--muted-foreground)]">Submitted {day(a.submittedAt)}{a.decidedAt ? ` · decided ${day(a.decidedAt)}` : ""}</div>
            <div className="mt-1.5 sm:mt-0"><StatusBadge {...settlementAccountBadge(a.status)} /></div>
            {a.decisionNote && <p className="text-sm text-[var(--foreground)] mt-1 sm:col-span-4">HomeTrue's note: “{a.decisionNote}”</p>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// Exported for tests.
export function payoutAccountErrors(err: unknown): BankAccountErrors {
  return bankAccountErrors(err, (code, message) => {
    switch (code) {
      case "SETTLEMENT_ACCOUNT_UNCHANGED": return { form: "That's already your approved payout account." };
      case "SETTLEMENT_ACCOUNT_PENDING": return { form: "An account is already waiting for approval. Withdraw it first." };
      case "SETTLEMENT_REQUIRES_COMPANY_WIDE_SCOPE":
      case "COMPANY_SCOPE_REQUIRED": return { form: "Only company-wide access can change where HomeTrue pays the company." };
      default: return message && code.startsWith("SETTLEMENT_") ? { form: message } : undefined;
    }
  });
}

function WithdrawDialog({ account, onClose, onDone }: { account: SettlementAccount; onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const go = async () => {
    setBusy(true);
    try {
      await withdrawSettlementAccount(account.id);
      onDone();
      onClose();
    } catch (err) {
      const code = err instanceof ApiError ? err.body?.code : (err as { code?: string }).code;
      setError(code === "SETTLEMENT_ACCOUNT_NOT_PENDING" ? "HomeTrue has already decided on this account, so it can't be withdrawn."
        : err instanceof Error && err.message ? err.message : "That didn't go through.");
      setBusy(false);
    }
  };
  return (
    <Dialog title="Withdraw this account?" onClose={busy ? () => {} : onClose}>
      <p className="text-sm mb-4">{account.bankName} · {account.accountNumber} ({account.accountName}) won't be considered for approval. Your approved account, if any, stays as it is.</p>
      {error && <ErrorText className="mb-3">{error}</ErrorText>}
      <DialogActions onCancel={onClose} onConfirm={go} cancelLabel="Keep it" confirmLabel="Withdraw" busy={busy} busyLabel="Withdrawing…" />
    </Dialog>
  );
}

function PayoutPage({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Page title="Payout account" description="Where HomeTrue sends the money from your verified sales." actions={action}>
      <div className="space-y-6">{children}</div>
    </Page>
  );
}
