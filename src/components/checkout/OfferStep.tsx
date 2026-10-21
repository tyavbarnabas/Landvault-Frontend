// Checkout's "Your offer letter" step (backend changeset 098), from the Figma
// "Offer letter" proposal: the developer's offer, issued when the purchase
// opened — read it, see what accepting means, tick and accept. Payment opens
// after. It stays on the checkout page because the hold keeps running.

import { useState } from "react";
import { formatInCurrency } from "../../data/mockData";
import { formatDayTime } from "../../lib/formatDate";
import type { OfferSummary } from "../../services/marketplaceCheckoutService";
import { acceptOffer, offerErrorCode } from "../../services/offerLetterService";
import Card, { InfoBox } from "../ui/Card";
import Alert from "../ui/Alert";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import TextLink from "../ui/TextLink";
import { ErrorText } from "../ui/Field";
import { CheckIcon, ClockIcon, FileCheckIcon, LockIcon, ShieldCheckIcon } from "../icons";
import OfferDownloads from "../purchases/OfferDownloads";

const MEANS: [React.ReactNode, string, string][] = [
  [<CheckIcon key="c" size={16} />, "It fixes your terms.", "If the developer changes fees or conditions later, your allocation letter still quotes this offer."],
  [<ShieldCheckIcon key="s" size={16} />, "It isn't the plot yet.", "The plot is yours once you've paid and the developer has verified the payment."],
  [<ClockIcon key="t" size={16} />, "Your hold keeps running.", "Accepting doesn't add time — accept and pay before the timer runs out."],
  [<LockIcon key="l" size={16} />, "Pay only through HomeTrue.", "Never to a bank account in a letter, an email or a message."],
];

export default function OfferStep({ offer, transactionId, price, plot, notAccepted, onAccepted, onContinue }: {
  offer: OfferSummary;
  transactionId: string;
  price: number;
  plot: string;
  // Pay was pressed before accepting (409 OFFER_NOT_ACCEPTED).
  notAccepted?: boolean;
  onAccepted: (acceptedAt: string) => void;
  onContinue: () => void;
}) {
  const [ticked, setTicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notOpen, setNotOpen] = useState(false);

  const accept = async () => {
    if (!ticked || busy) return;
    setBusy(true);
    setError("");
    try {
      const doc = await acceptOffer(offer.id);
      onAccepted(doc.acceptedAt ?? new Date().toISOString());
    } catch (err) {
      if (offerErrorCode(err) === "OFFER_NOT_OPEN") setNotOpen(true);
      else setError("Your acceptance didn't go through. Please try again — your plot is still held.");
    } finally {
      setBusy(false);
    }
  };

  if (notOpen) {
    return (
      <Alert tone="info" title="This purchase is no longer waiting for payment" role="status">
        Its hold ran out or it was already paid, so the offer can't be accepted now.
        <div className="mt-3"><TextLink to={`/purchases/${transactionId}`} className="font-medium">See this purchase →</TextLink></div>
      </Alert>
    );
  }

  return (
    <>
      <Card as="section" aria-labelledby="offer-heading" className="space-y-4 sm:p-6">
        <div className="flex items-center gap-3.5">
          <span className="w-11 h-11 shrink-0 rounded-lg bg-[var(--secondary)] text-[var(--primary)] flex items-center justify-center"><FileCheckIcon size={22} /></span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h2 id="offer-heading" className="font-semibold text-[var(--foreground)]">Offer letter</h2>
              {offer.acceptedAt ? <Badge label="Accepted" variant="success" /> : <Badge label="Waiting for you" variant="warning" />}
            </div>
            <div className="font-mono-data text-xs text-[var(--muted-foreground)]">{offer.number}</div>
            <div className="text-xs text-[var(--muted-foreground)]">Issued {formatDayTime(offer.issuedAt)} · on the developer's letterhead, signed and sealed</div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <InfoBox label="Price in the offer"><div className="font-mono-data text-lg text-[var(--foreground)]">{formatInCurrency(price, "NGN")}</div></InfoBox>
          <InfoBox label="Plot"><div className="font-medium text-[var(--foreground)]">{plot}</div></InfoBox>
        </div>
        <p className="text-sm text-[var(--muted-foreground)]">
          The letter sets out the price in figures and words, the full commitment, and every fee, condition, refund and default term the developer declared.
        </p>
        <OfferDownloads offer={offer} />
      </Card>

      <Card as="section" aria-labelledby="offer-means-heading" className="space-y-3.5 sm:p-6">
        <h2 id="offer-means-heading" className="font-semibold text-[var(--foreground)]">What accepting means</h2>
        <ul className="space-y-3">
          {MEANS.map(([icon, head, body]) => (
            <li key={head} className="flex gap-3">
              <span className="mt-0.5 shrink-0 text-[var(--primary)]">{icon}</span>
              <div className="text-sm">
                <div className="font-medium text-[var(--foreground)]">{head}</div>
                <div className="text-[var(--muted-foreground)]">{body}</div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {offer.acceptedAt ? (
        <Card as="section" className="space-y-4 sm:p-6">
          <Alert tone="success" role="status">You accepted this offer on {formatDayTime(offer.acceptedAt)}. Its terms are fixed for this purchase.</Alert>
          <Button size="lg" className="w-full sm:w-auto" onClick={onContinue}>Continue to payment</Button>
        </Card>
      ) : (
        <Card as="section" aria-label="Accept the offer" className="space-y-4 sm:p-6">
          {notAccepted && <Alert tone="warning" role="alert">Accept the offer first — payment opens straight after. Your plot is still held.</Alert>}
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} className="mt-0.5 w-5 h-5 shrink-0 accent-[var(--primary)]" />
            <span className="text-sm">
              <span className="block font-medium text-[var(--foreground)]">I have read this offer and accept its terms</span>
              <span className="block text-[var(--muted-foreground)]">We record that you accepted {offer.number}, when, and from which browser.</span>
            </span>
          </label>
          {error && <ErrorText>{error}</ErrorText>}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button size="lg" className="w-full sm:w-auto" onClick={accept} disabled={!ticked || busy}>{busy ? "Accepting…" : "Accept offer"}</Button>
            {!ticked && <span className="text-sm text-[var(--muted-foreground)]">Tick the box to accept.</span>}
          </div>
        </Card>
      )}
    </>
  );
}
