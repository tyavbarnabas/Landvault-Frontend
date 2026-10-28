// "Your share of the sale", on the purchase page of a flexible plan the buyer
// left (or the developer ended), from the Figma "Flexible plans" leaving
// frames: waiting for the plot's next sale, what's owed with the form for
// where to send it, on its way, paid, or nothing to share. Every figure is the
// backend's; the bank supplies the account name.

import { useState } from "react";
import { formatMoney } from "../../lib/formatCurrency";
import { formatDay } from "../../lib/formatDate";
import { gainShareState, saveGainShareAccount, type GainShare } from "../../services/gainShareService";
import { fetchBanks } from "../../services/paymentsService";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import BankAccountForm, { bankAccountErrors } from "../payments/BankAccountForm";

const BADGE = {
  waiting: { label: "Waiting for a sale", variant: "neutral" },
  account_needed: { label: "Owed to you", variant: "success" },
  on_its_way: { label: "On its way", variant: "info" },
  paid: { label: "Paid", variant: "success" },
  nothing: { label: "Nothing to share", variant: "neutral" },
} as const;

export default function GainShareCard({ share, plot }: { share: GainShare; plot: string }) {
  const [g, setG] = useState(share);
  const [changing, setChanging] = useState(false);
  const [sending, setSending] = useState("");
  const state = gainShareState(g);
  const money = (n: number) => formatMoney(n, g.currency);
  const save = async (account: { bankCode: string; accountNumber: string }) => {
    try {
      setG(await saveGainShareAccount(g.id, account));
      setChanging(false);
    } catch (err) {
      return bankAccountErrors(err, (code, message) => {
        // The transfer has started: the account can't change any more.
        if (code === "GAIN_SHARE_ALREADY_SENDING") { setSending(message || "The transfer has started, so the account can't be changed now."); setChanging(false); return {}; }
        if (code === "GAIN_SHARE_NOT_OWED") return { form: message };
        return undefined;
      });
    }
  };
  const showForm = !sending && (state === "account_needed" || (state === "on_its_way" && changing));
  return (
    <Card as="section" aria-labelledby="gain-heading" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="gain-heading" className="font-semibold text-[var(--foreground)]">Your share of the sale</h2>
        <Badge label={BADGE[state].label} variant={BADGE[state].variant} />
      </div>

      {state === "waiting" && (
        <p className="text-sm text-[var(--muted-foreground)]">
          {plot} is back on sale. If HomeTrue sells it for more than your <span className="font-mono-data">{money(g.agreedPrice)}</span> price, you get {g.yourSharePct}% of the difference. If it sells for the same or less, there's nothing to share. We'll email you either way.
        </p>
      )}
      {state === "nothing" && (
        <p className="text-sm text-[var(--muted-foreground)]">
          {plot} was sold{g.settledAt ? ` on ${formatDay(g.settledAt)}` : ""}. There was nothing to share with you from that sale, so this is closed.
        </p>
      )}

      {(state === "account_needed" || state === "on_its_way" || state === "paid") && g.amount !== null && (
        <>
          {state === "account_needed" && (
            <p className="text-sm text-[var(--muted-foreground)]">HomeTrue sold {plot} for more than your price. Under your offer letter you get {g.yourSharePct}% of the difference.</p>
          )}
          <dl className="rounded-lg bg-[var(--muted)] px-4 py-3 space-y-1.5 text-sm">
            {g.salePrice !== null && <Row label="It sold for" value={money(g.salePrice)} />}
            <Row label="Your price" value={money(g.agreedPrice)} />
            {g.gain !== null && <Row label="The difference" value={money(g.gain)} />}
            <div className="flex items-center justify-between gap-3 pt-1">
              <dt className="font-medium text-[var(--foreground)]">Your share ({g.yourSharePct}%)</dt>
              <dd className="font-mono-data text-lg text-[var(--foreground)]">{money(g.amount)}</dd>
            </div>
            <Row label={state === "paid" ? "Paid to you" : "Paid to you so far"} value={money(g.paid)} />
          </dl>
          {state === "on_its_way" && g.account && (
            <p className="text-sm text-[var(--foreground)]">
              We're sending <span className="font-mono-data">{money(g.amount)}</span> to {g.account.bankName} ····{g.account.accountLast4} ({g.account.accountName}).
              {!changing && !sending && <> <Button variant="link" onClick={() => setChanging(true)}>Change the account</Button></>}
            </p>
          )}
          {state === "paid" && g.account && (
            <p className="text-sm text-[var(--foreground)]"><span className="font-mono-data">{money(g.paid)}</span> reached {g.account.bankName} ····{g.account.accountLast4}{g.settledAt ? ` on ${formatDay(g.settledAt)}` : ""}.</p>
          )}
          {sending && <Alert tone="info" role="status">{sending}</Alert>}
          {showForm && (
            <div className="rounded-xl border border-[var(--info-border)] bg-[var(--info-surface)] p-4 space-y-3">
              <div>
                <h3 className="text-sm font-semibold text-[var(--info-text)]">Where should we send it?</h3>
                <p className="text-sm text-[var(--info-text)]">Give a Nigerian bank account in your name. Your bank supplies the account name — we check it matches before anything is sent.</p>
              </div>
              <BankAccountForm idPrefix={`gain-${g.id}`} loadBanks={fetchBanks} submitLabel="Save the account" onSubmit={save}
                onCancel={changing ? () => setChanging(false) : undefined} />
            </div>
          )}
          {state !== "paid" && <p className="text-xs text-[var(--muted-foreground)]">It's paid after the developer's payout from that sale. You can change the account until the transfer starts.</p>}
        </>
      )}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[var(--muted-foreground)]">{label}</dt>
      <dd className="font-mono-data text-[var(--foreground)]">{value}</dd>
    </div>
  );
}

