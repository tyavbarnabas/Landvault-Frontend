// The purchase page's "Offer letter" card (backend changeset 098), from the
// Figma "Offer letter" proposal: the developer's offer this purchase was made
// on — its number, when it was issued and accepted, and its files. While the
// purchase waits for payment an unaccepted offer can be accepted here; a
// lapsed one is history, with no Accept.

import { useState } from "react";
import { formatDayTime } from "../../lib/formatDate";
import type { Purchase } from "../../services/paymentsService";
import { acceptOffer, offerErrorCode, offerState } from "../../services/offerLetterService";
import Card from "../ui/Card";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import { ErrorText } from "../ui/Field";
import OfferDownloads from "./OfferDownloads";

export default function OfferCard({ purchase, onChanged }: { purchase: Purchase; onChanged: () => void }) {
  const offer = purchase.offer!;
  const state = offerState(offer, purchase.status);
  const canAccept = state === "waiting" && purchase.status === "pending_payment";
  const [open, setOpen] = useState(false);
  const [ticked, setTicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const accept = async () => {
    setBusy(true);
    setError("");
    try {
      await acceptOffer(offer.id);
      onChanged();
    } catch (err) {
      // No longer waiting for payment: the purchase's own state says why.
      const code = offerErrorCode(err);
      if (code === "OFFER_NOT_OPEN") onChanged();
      else if (code === "DOCUMENT_NOT_FOUND") setError("We couldn't find this offer on your account.");
      else setError("Your acceptance didn't go through. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card as="section" aria-labelledby="offer-card-heading" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="offer-card-heading" className="font-semibold text-[var(--foreground)]">Offer letter</h2>
        {state === "accepted" ? <Badge label="Accepted" variant="success" />
          : state === "lapsed" ? <Badge label="Lapsed" variant="neutral" />
            : <Badge label="Waiting for you" variant="warning" />}
      </div>
      <dl className="space-y-2 text-sm">
        <Row label="Number"><span className="font-mono-data text-xs">{offer.number}</span></Row>
        <Row label="Issued">{formatDayTime(offer.issuedAt)}</Row>
        {offer.acceptedAt && <Row label="Accepted">{formatDayTime(offer.acceptedAt)}</Row>}
      </dl>
      {state === "lapsed" && <p className="text-xs text-[var(--muted-foreground)]">This offer lapsed with the purchase. It's kept for your records and gives no right to the plot.</p>}
      {canAccept && !open && <p className="text-xs text-[var(--muted-foreground)]">Accept it to pay. Your plot is held only until the checkout timer runs out.</p>}
      <OfferDownloads offer={offer} compact />
      {canAccept && (open ? (
        <div className="space-y-3 pt-3 border-t border-[var(--border)]">
          <label className="flex items-start gap-2.5 cursor-pointer text-sm">
            <input type="checkbox" checked={ticked} onChange={(e) => setTicked(e.target.checked)} className="mt-0.5 w-4 h-4 shrink-0 accent-[var(--primary)]" />
            <span className="font-medium text-[var(--foreground)]">I have read this offer and accept its terms</span>
          </label>
          {error && <ErrorText>{error}</ErrorText>}
          <Button fullWidth onClick={accept} disabled={!ticked || busy}>{busy ? "Accepting…" : "Accept offer"}</Button>
        </div>
      ) : (
        <Button fullWidth onClick={() => setOpen(true)}>Read and accept the offer</Button>
      ))}
    </Card>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--muted-foreground)]">{label}</dt>
      <dd className="text-right text-[var(--foreground)]">{children}</dd>
    </div>
  );
}
