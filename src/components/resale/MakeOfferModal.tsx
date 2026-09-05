import { useState } from "react";
import { formatAmount, type Currency } from "../../data/mockData";
import { submitOffer, RESALE_POLICY, type ResaleListing } from "../../services/resaleService";
import { useApp } from "../../contexts/AppContext";
import ModalShell from "./ModalShell";

export default function MakeOfferModal({ listing, currency, onClose }: { listing: ResaleListing; currency: Currency; onClose: () => void }) {
  const { user } = useApp();
  const [amount, setAmount] = useState(String(listing.asking));
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const numeric = Number(amount);
    if (!amount.trim() || !Number.isFinite(numeric) || Number.isNaN(numeric) || numeric <= 0) {
      setError("Enter a valid offer amount greater than zero.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      await submitOffer({ listingId: listing.id, buyerName: user?.name ?? "You", amount: numeric, currency: listing.currency });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong submitting your offer. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <ModalShell title="Offer submitted" onClose={onClose}>
        <div className="text-center py-6">
          <div className="text-3xl mb-3" aria-hidden="true">✅</div>
          <p className="text-sm text-[var(--muted-foreground)]">
            Your offer of <strong className="font-mono-data">{formatAmount(Number(amount), currency)}</strong> has been sent to the seller. You'll be notified of their response.
          </p>
          <button onClick={onClose} className="mt-4 px-5 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
            Close
          </button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell title="Make an offer" onClose={onClose}>
      <p className="text-sm text-[var(--muted-foreground)] mb-4">{listing.estateName} — {listing.plotLabel} · {listing.sqm} sqm · Asking {formatAmount(listing.asking, currency)}</p>
      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        <div>
          <label htmlFor="offer-amount" className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Your offer ({listing.currency})</label>
          <input
            id="offer-amount"
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? "offer-amount-error" : undefined}
            className="w-full px-3 py-2.5 border border-[var(--border)] rounded-md text-sm font-mono-data bg-[var(--card)]"
          />
          {error && <p id="offer-amount-error" role="alert" className="text-red-600 text-xs mt-1">{error}</p>}
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">
          If accepted, your payment is held in a developer-controlled account and released only once title has transferred to you — never sent directly to the seller. A {RESALE_POLICY.developerTransferFeePct}% developer transfer fee applies to the seller's proceeds.
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 py-2.5 border border-[var(--border)] rounded-md text-sm text-[var(--muted-foreground)]">Cancel</button>
          <button type="submit" disabled={submitting} className="flex-1 py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold disabled:opacity-60 hover:opacity-90 transition-opacity">
            {submitting ? "Submitting…" : "Submit offer"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
