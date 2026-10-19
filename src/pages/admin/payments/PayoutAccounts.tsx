// Super Admin review of companies' payout bank accounts —
// /admin/payout-accounts (admin.payouts.manage).
//
// LandVault sends sale proceeds only to an approved account, so this is where
// a hijacked or mistyped account is stopped. Each submission is shown beside
// what's known about the company: the bank's name for the account, the account
// declared at onboarding, and the account payouts go to today. Mismatches are
// WARNINGS — a person decides, and must be able to approve a legitimate change.
//
// Laid out from the Figma money-screen proposal: counted tabs by status and a
// table, each account opening to the comparison; a waiting one opens by itself.

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError, ApiTransportError } from "../../../lib/apiClient";
import { useFetch } from "../../../lib/useFetch";
import { formatDay } from "../../../lib/formatDate";
import { withCount } from "../../../lib/useTabCounts";
import LoadError from "../../../components/LoadError";
import TabBar from "../../../components/ui/Tabs";
import EmptyState from "../../../components/ui/EmptyState";
import Dialog, { DialogActions } from "../../../components/ui/Dialog";
import Page, { Loading } from "../../../components/ui/Page";
import Card, { InfoBox } from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import Alert from "../../../components/ui/Alert";
import DisclosureTable, { DisclosureRow } from "../../../components/ui/DisclosureTable";
import { ErrorText, Field, Textarea, describedBy } from "../../../components/ui/Field";
import StatusBadge, { settlementAccountBadge } from "../../../components/StatusBadge";
import { REASON_MAX } from "../../../services/financeService";
import type { SettlementAccountStatus } from "../../../services/paymentTypes";
import {
  approveSettlementAccount, fetchSettlementReviews, rejectSettlementAccount,
  type SettlementAccount, type SettlementAccountReview,
} from "../../../services/settlementService";

type Tab = SettlementAccountStatus | "all";
const TABS: { id: Tab; label: string }[] = [
  { id: "pending", label: "Waiting for review" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
  { id: "superseded", label: "Replaced" },
  { id: "withdrawn", label: "Withdrawn" },
  { id: "all", label: "All" },
];

const COLUMNS = ["Company", "Account", "Submitted", "Decided", "Status", "Checks"];
const GRID = "lg:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_7rem_7rem_minmax(0,1fr)_minmax(0,1.3fr)_16px]";

const companyOf = (r: SettlementAccountReview) => r.tradingName ?? r.registeredName ?? "Company name not on record";

export default function PayoutAccounts() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "pending") as Tab;
  // One read of every account; the tabs narrow it here. The server only filters pending/all.
  const list = useFetch(() => fetchSettlementReviews("all"), []);
  const all = list.data ?? [];
  const count = (t: Tab) => (list.data ? (t === "all" ? all.length : all.filter((r) => r.account.status === t).length) : undefined);
  // Waiting: oldest first (first come, first reviewed). Everything else: newest first.
  const shown = all.filter((r) => tab === "all" || r.account.status === tab)
    .sort((a, b) => (tab === "pending" ? 1 : -1) * a.account.submittedAt.localeCompare(b.account.submittedAt));

  return (
    <Page title="Payout accounts" description="Bank accounts companies want their sale proceeds paid into. Nothing is paid to an account until it's approved here.">
      <TabBar tabs={TABS.map((t) => ({ id: t.id, label: withCount(t.label, count(t.id)) }))} active={tab}
        onActivate={(t) => setParams(t === "pending" ? {} : { tab: t }, { replace: true })} ariaLabel="Payout accounts by status" divider />
      <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {list.loading && !list.data && <Loading />}
        {list.error && <LoadError error={list.errorValue} what="payout accounts" onRetry={list.refetch} />}
        {list.data && shown.length === 0 && (
          <Card padding="sm">
            <EmptyState title={tab === "pending" ? "Nothing waiting for review" : "None"}
              description={tab === "pending" ? "Accounts companies submit appear here, oldest first." : "No accounts with this status."} />
          </Card>
        )}
        {shown.length > 0 && (
          <DisclosureTable columns={COLUMNS} grid={GRID} label="Payout accounts">
            {shown.map((r) => <AccountRow key={r.account.id} review={r} onDecided={list.refetch} />)}
          </DisclosureTable>
        )}
      </div>
    </Page>
  );
}

// What's worth a second look, in a word or two. Warnings, never blockers.
function Checks({ review: r }: { review: SettlementAccountReview }) {
  const notes: [string, "ok" | "warn" | "none"][] = [];
  if (!r.nameMatchesCompany) notes.push(["Name isn't the company's", "warn"]);
  if (r.matchesOnboardingAccount === true) notes.push(["Matches onboarding", "ok"]);
  else if (r.matchesOnboardingAccount === false) notes.push(["Not the onboarding account", "warn"]);
  else notes.push(["Nothing declared at onboarding", "none"]);
  return (
    <ul className="text-xs space-y-0.5">
      {notes.map(([text, tone]) => (
        <li key={text} className={tone === "ok" ? "text-[var(--success-text)]" : tone === "warn" ? "text-[var(--warning-text)]" : "text-[var(--muted-foreground)]"}>{text}</li>
      ))}
    </ul>
  );
}

function AccountRow({ review, onDecided }: { review: SettlementAccountReview; onDecided: () => void }) {
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const company = companyOf(review);
  const a = review.account;
  const pending = a.status === "pending";

  const cells = [
    <>
      <div className="font-semibold text-[var(--foreground)]">{company}</div>
      {review.registeredName && review.registeredName !== company && <div className="text-xs text-[var(--muted-foreground)]">{review.registeredName}</div>}
    </>,
    <>
      <div className="text-sm font-medium text-[var(--foreground)]">{a.accountName}</div>
      <div className="text-xs text-[var(--muted-foreground)]">{a.bankName} · <span className="font-mono-data">{a.accountNumber}</span></div>
    </>,
    <span className="text-sm text-[var(--muted-foreground)]"><span className="lg:hidden">Submitted </span>{formatDay(a.submittedAt)}</span>,
    <span className="text-sm text-[var(--muted-foreground)]"><span className="lg:hidden">Decided </span>{a.decidedAt ? formatDay(a.decidedAt) : "—"}</span>,
    <StatusBadge {...settlementAccountBadge(a.status)} />,
    <Checks review={review} />,
  ];

  return (
    <DisclosureRow id={`account-${a.id}`} grid={GRID} cells={cells} defaultOpen={pending}>
      <div className="grid md:grid-cols-3 gap-3 text-sm">
        <AccountBox title="Submitted" account={a} note={`Submitted ${formatDay(a.submittedAt)}`} highlight />
        <OnboardingBox review={review} />
        <AccountBox title="Payouts go here today" account={review.currentApproved} empty={a.status === "approved" ? "This account." : "No approved account yet."} />
      </div>

      {/* Warnings, never blockers. */}
      {!review.nameMatchesCompany && (
        <Alert role="alert">The bank's name for this account (“{a.accountName}”) doesn't match the company.</Alert>
      )}
      {review.matchesOnboardingAccount === false && (
        <Alert role="alert">Different from the account declared at onboarding.</Alert>
      )}

      {a.decisionNote && <p className="text-sm text-[var(--muted-foreground)]">Decision note: “{a.decisionNote}”</p>}

      {outcome ? <p className="text-sm font-medium" role="status">{outcome}</p> : pending && (
        <div className="flex flex-wrap gap-3 pt-4 border-t border-[var(--border)]">
          <Button onClick={() => setDialog("approve")}>Approve</Button>
          <Button variant="danger" onClick={() => setDialog("reject")}>Reject</Button>
        </div>
      )}

      {dialog === "approve" && (
        <DecisionDialog title="Approve this payout account?" confirmLabel="Approve" onClose={() => setDialog(null)}
          action={() => approveSettlementAccount(a.id)}
          onDone={() => { setOutcome(`Approved — ${company}'s payouts now go to ${a.bankName} · ${a.accountNumber}.`); onDecided(); }}>
          {company}'s payouts will go to <strong>{a.bankName} · {a.accountNumber}</strong> ({a.accountName}).
          {review.currentApproved && <> It replaces {review.currentApproved.bankName} · {review.currentApproved.accountNumber}.</>}
          {(!review.nameMatchesCompany || review.matchesOnboardingAccount === false) && <> <strong>There's a warning on this account</strong> — approve only if you've checked it.</>}
        </DecisionDialog>
      )}
      {dialog === "reject" && (
        <DecisionDialog title="Reject this payout account?" confirmLabel="Reject" withReason onClose={() => setDialog(null)}
          action={(reason) => rejectSettlementAccount(a.id, reason!)}
          onDone={() => { setOutcome(`Rejected — ${company} has been told why.`); onDecided(); }}>
          The company's Executive Directors see your reason. {review.currentApproved ? "Payouts keep going to the current approved account." : ""}
        </DecisionDialog>
      )}
    </DisclosureRow>
  );
}

function AccountBox({ title, account, note, empty, highlight }: { title: string; account: SettlementAccount | null; note?: string; empty?: string; highlight?: boolean }) {
  return (
    <InfoBox label={title} tone={highlight ? "info" : "neutral"}>
      {account ? (
        <>
          <div className="font-semibold">{account.accountName}</div>
          <div>{account.bankName}</div>
          <div className="font-mono-data">{account.accountNumber}</div>
          {note && <div className="text-xs text-[var(--muted-foreground)] mt-1">{note}</div>}
        </>
      ) : <div className="text-[var(--muted-foreground)]">{empty}</div>}
    </InfoBox>
  );
}

function OnboardingBox({ review }: { review: SettlementAccountReview }) {
  const declared = review.onboardingAccountNumber || review.onboardingBankName || review.onboardingAccountName;
  return (
    <InfoBox label="Declared at onboarding">
      {declared ? (
        <>
          {review.onboardingAccountName && <div className="font-semibold">{review.onboardingAccountName}</div>}
          {review.onboardingBankName && <div>{review.onboardingBankName}</div>}
          {review.onboardingAccountNumber && <div className="font-mono-data">{review.onboardingAccountNumber}</div>}
          {review.matchesOnboardingAccount === true && <div className="text-xs text-[var(--success-text)] mt-1">Matches the submitted account</div>}
        </>
      ) : <div className="text-[var(--muted-foreground)]">None declared.</div>}
    </InfoBox>
  );
}

// Exported for tests.
export function reviewErrorMessage(err: unknown): string {
  if (err instanceof ApiTransportError) return "We couldn't reach HomeTrue. Nothing was changed — try again.";
  const code = err instanceof ApiError ? err.body?.code : (err as { code?: string } | null)?.code;
  switch (code) {
    case "SETTLEMENT_ACCOUNT_NOT_PENDING": return "This account has already been decided — someone may have got there first. Refresh the list.";
    case "SETTLEMENT_ACCOUNT_NOT_FOUND": return "We couldn't find this account any more. Refresh the list.";
    case "PAYMENT_PROVIDER_REFUSED":
    case "PAYMENT_PROVIDER_UNAVAILABLE": return "Paystack couldn't register the account just now. Nothing was changed — try again.";
    default: return err instanceof Error && err.message ? err.message : "That didn't go through. Nothing was changed.";
  }
}

function DecisionDialog({ title, confirmLabel, withReason, children, action, onDone, onClose }: {
  title: string; confirmLabel: string; withReason?: boolean; children: React.ReactNode;
  action: (reason?: string) => Promise<unknown>; onDone: () => void; onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const go = async () => {
    if (withReason && !reason.trim()) { setError("Give a reason — the company sees it."); return; }
    setBusy(true);
    setError("");
    try { await action(withReason ? reason.trim() : undefined); onDone(); onClose(); } catch (err) {
      const fields = err instanceof ApiError ? err.body?.fieldErrors : undefined;
      setError(fields?.reason ?? reviewErrorMessage(err));
      setBusy(false);
    }
  };
  return (
    <Dialog title={title} onClose={busy ? () => {} : onClose}>
      <p className="text-sm mb-3">{children}</p>
      {withReason && (
        <Field id="review-reason" label="Reason" hint={`${reason.length}/${REASON_MAX}`} className="mb-3">
          <Textarea id="review-reason" value={reason} onChange={(e) => setReason(e.target.value.slice(0, REASON_MAX))} rows={3}
            aria-describedby={describedBy("review-reason", { hint: true })} />
        </Field>
      )}
      {error && <ErrorText className="mb-3">{error}</ErrorText>}
      <DialogActions onCancel={onClose} onConfirm={go} confirmLabel={confirmLabel} busy={busy} variant={withReason ? "danger" : "primary"} />
    </Dialog>
  );
}
