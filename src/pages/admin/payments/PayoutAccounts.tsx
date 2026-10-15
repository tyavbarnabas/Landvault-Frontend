// Super Admin review of companies' payout bank accounts —
// /admin/payout-accounts (admin.payouts.manage).
//
// LandVault sends sale proceeds only to an approved account, so this is where
// a hijacked or mistyped account is stopped. Each submission is shown beside
// what's known about the company: the bank's name for the account, the account
// declared at onboarding, and the account payouts go to today. Mismatches are
// WARNINGS — a person decides, and must be able to approve a legitimate change.

import { useState } from "react";
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
import { ErrorText, Field, Textarea, describedBy } from "../../../components/ui/Field";
import StatusBadge, { settlementAccountBadge } from "../../../components/StatusBadge";
import { REASON_MAX } from "../../../services/financeService";
import {
  approveSettlementAccount, fetchSettlementReviews, rejectSettlementAccount,
  type ReviewFilter, type SettlementAccount, type SettlementAccountReview,
} from "../../../services/settlementService";

const TABS: { id: ReviewFilter; label: string }[] = [
  { id: "pending", label: "Waiting for review" },
  { id: "all", label: "All" },
];
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null);

export default function PayoutAccounts() {
  const [filter, setFilter] = useState<ReviewFilter>("pending");
  const list = useFetch(() => fetchSettlementReviews(filter), [filter]);
  return (
    <Page title="Payout accounts" description="Bank accounts companies want their sale proceeds paid into. Nothing is paid to an account until it's approved here.">
      <TabBar tabs={TABS} active={filter} onActivate={setFilter} ariaLabel="Payout accounts by status" divider />
      {list.loading && !list.data && <Loading />}
      {list.error && <LoadError error={list.errorValue} what="payout accounts" onRetry={list.refetch} />}
      {list.data && list.data.length === 0 && (
        <EmptyState title={filter === "pending" ? "Nothing waiting for review" : "No payout accounts yet"}
          description={filter === "pending" ? "Accounts companies submit appear here, oldest first." : "Accounts appear here once a company submits one."} />
      )}
      {list.data && list.data.length > 0 && (
        <ul className="space-y-3">{list.data.map((r) => <ReviewCard key={r.account.id} review={r} onDecided={list.refetch} />)}</ul>
      )}
    </Page>
  );
}

function ReviewCard({ review, onDecided }: { review: SettlementAccountReview; onDecided: () => void }) {
  const [dialog, setDialog] = useState<"approve" | "reject" | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const company = review.tradingName ?? review.registeredName ?? "Company name not on record";
  const a = review.account;
  const pending = a.status === "pending";

  return (
    <ListCard className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-[var(--foreground)]">{company}</div>
          {review.registeredName && review.registeredName !== company && <div className="text-xs text-[var(--muted-foreground)]">Registered as {review.registeredName}</div>}
        </div>
        <StatusBadge {...settlementAccountBadge(a.status)} />
      </div>

      <div className="grid md:grid-cols-3 gap-3 text-sm">
        <AccountBox title="Submitted" account={a} note={`Submitted ${day(a.submittedAt)}`} highlight />
        <OnboardingBox review={review} />
        <AccountBox title="Payouts go here today" account={review.currentApproved} empty="No approved account yet." />
      </div>

      {/* Warnings, never blockers. */}
      {!review.nameMatchesCompany && (
        <Alert role="alert">The bank's name for this account (“{a.accountName}”) doesn't match the company.</Alert>
      )}
      {review.matchesOnboardingAccount === false && (
        <Alert role="alert">Different from the account declared at onboarding.</Alert>
      )}

      {a.decisionNote && <p className="text-xs text-[var(--muted-foreground)]">Decision note: “{a.decisionNote}”</p>}

      {outcome ? <p className="text-sm font-medium" role="status">{outcome}</p> : pending && (
        <div className="flex gap-3">
          <Button onClick={() => setDialog("approve")}>Approve</Button>
          <Button variant="secondary" onClick={() => setDialog("reject")}>Reject</Button>
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
    </ListCard>
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
