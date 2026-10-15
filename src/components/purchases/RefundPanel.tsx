// The buyer's refund — when the developer rejected a paid purchase, or a late
// payment wasn't allocated, LandVault returns the FULL amount.
//
// A card payment goes back on its own. A bank-transfer payment can't, so the
// buyer gives an account IN THEIR OWN NAME. There's deliberately no name
// field: the bank supplies the name, and LandVault checks it.

import { useEffect, useState } from "react";
import { formatInCurrency } from "../../data/mockData";
import { useFetch } from "../../lib/useFetch";
import LoadError from "../LoadError";
import BankAccountForm, { bankAccountErrors, type BankAccountErrors } from "../payments/BankAccountForm";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Card from "../ui/Card";
import { fetchBanks, fetchRefund, submitRefundAccount, type BuyerRefund } from "../../services/paymentsService";

const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });

export default function RefundPanel({ paymentReference }: { paymentReference: string }) {
  const loaded = useFetch(() => fetchRefund(paymentReference), [paymentReference]);
  const [refund, setRefund] = useState<BuyerRefund | null>(null);
  const [changing, setChanging] = useState(false);
  useEffect(() => { if (loaded.data !== undefined) setRefund(loaded.data); }, [loaded.data]);

  if (loaded.loading && !loaded.data) return <Box title="Your refund"><p className="text-sm text-[var(--muted-foreground)]">Checking your refund…</p></Box>;
  if (loaded.error) return <LoadError error={loaded.errorValue} what="your refund" onRetry={loaded.refetch} />;

  if (!refund) {
    return <Box title="Your refund"><p className="text-sm">Your refund is being arranged. We'll email you when it's on its way.</p></Box>;
  }

  const amount = formatInCurrency(refund.amount, refund.currency);
  const account = refund.accountBankName && refund.accountLast4 ? `${refund.accountBankName} ending ${refund.accountLast4}` : null;

  switch (refund.status) {
    case "processed":
      return <Box title="Refund paid"><p className="text-sm">{amount} refunded{refund.refundedAt ? ` on ${date(refund.refundedAt)}` : ""}{account ? ` to ${account}` : ""}.</p></Box>;
    case "failed":
      return <Box title="Your refund" tone="warning"><p className="text-sm">There was a problem sending your refund of {amount}. Our team is on it and will be in touch.</p></Box>;
    case "pending":
    case "sending":
    case "processing":
      return (
        <Box title="Refund on its way">
          <p className="text-sm">
            {amount} is being returned{account ? ` to ${account}` : ""}.{refund.expectedAt ? ` Expected by ${date(refund.expectedAt)}.` : ""}
          </p>
        </Box>
      );
    case "needs-attention":
      if (!refund.needsAccount) {
        // The account has been sent to Paystack; it's out of the buyer's hands.
        return <Box title="Refund on its way"><p className="text-sm">{amount} is being sent{account ? ` to ${account}` : ""}.</p></Box>;
      }
      if (account && !changing) {
        return (
          <Box title="Your refund">
            <p className="text-sm">Thanks. HomeTrue will send your refund of {amount} to {account}.</p>
            <Button variant="link" onClick={() => setChanging(true)} className="mt-2">Use a different account</Button>
          </Box>
        );
      }
      return (
        <Box title="Where should we send your refund?" tone="warning">
          <p className="text-sm mb-4">
            You paid by bank transfer, so we need an account to return {amount} to. It must be <strong>in your own name</strong> — the bank tells us whose it is.
          </p>
          <AccountForm paymentReference={paymentReference} onSaved={(r) => { setRefund(r); setChanging(false); }} onCancel={account ? () => setChanging(false) : undefined} />
        </Box>
      );
  }
}

function AccountForm({ paymentReference, onSaved, onCancel }: {
  paymentReference: string; onSaved: (refund: BuyerRefund) => void; onCancel?: () => void;
}) {
  return (
    <BankAccountForm idPrefix="refund" loadBanks={fetchBanks} submitLabel="Send my refund here" onCancel={onCancel}
      onSubmit={async (account) => {
        try { onSaved(await submitRefundAccount(paymentReference, account)); } catch (err) { return refundAccountErrors(err); }
      }} />
  );
}

// The backend's refusals, as the field or form they belong to. Exported for tests.
export function refundAccountErrors(err: unknown): BankAccountErrors {
  return bankAccountErrors(err, (code) => code === "REFUND_NOT_AWAITING_ACCOUNT"
    ? { form: "Your refund has already been sent, so the account can't be changed now." } : undefined);
}

// Needs the buyer (warning) → a tinted panel; otherwise a plain card.
function Box({ title, tone = "neutral", children }: { title: string; tone?: "neutral" | "warning"; children: React.ReactNode }) {
  if (tone === "warning") return <Alert as="section" tone="warning" title={<h2>{title}</h2>} aria-label="Refund">{children}</Alert>;
  return (
    <Card as="section" padding="md" aria-label="Refund">
      <h2 className="font-semibold text-sm mb-1">{title}</h2>
      {children}
    </Card>
  );
}
