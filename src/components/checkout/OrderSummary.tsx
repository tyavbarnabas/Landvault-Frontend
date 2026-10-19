// Checkout's order summary, from the Figma checkout proposal: the plot, its
// price, the declared total commitment and the hold, beside every step. On a
// phone it folds into a bar under the header that opens to the same summary.
// Figures come from the plot and the developer's declared costs; nothing is
// shown that they don't carry.

import { ChevronDownIcon, FileCheckIcon, LockIcon, ShieldCheckIcon, ClockIcon } from "../icons";
import MoneyRangeDisplay from "../cost/MoneyRangeDisplay";
import CountdownTimer from "./CountdownTimer";
import { formatAmount, type Currency } from "../../data/mockData";
import { plotLabel, type ListingPlot } from "../../services/marketplacePlotsService";
import type { Listing } from "../../services/marketplaceService";
import { RESERVATION_SECONDS } from "../../services/reservationService";
import type { TierCommitment } from "../../services/costDisclosureService";

interface OrderSummaryProps {
  listing: Listing;
  plot: ListingPlot;
  base: number;
  totalPrice: number;
  currency: Currency;
  commitment: TierCommitment | null;
  // Seconds left on the hold; null before it starts (or once it no longer runs).
  holdSecondsLeft: number | null;
  // Whether a hold has started at all, so "Not held yet" stops showing.
  held: boolean;
}

const HOLD_MINUTES = Math.round(RESERVATION_SECONDS / 60);

function plotLine(plot: ListingPlot) {
  return `${plotLabel(plot)} · ${plot.sizeSqm} sqm · ${plot.isCorner ? "Corner" : "Standard"}`;
}

function total(commitment: TierCommitment, corner: boolean) {
  return corner && commitment.totalCommitmentIfCorner ? commitment.totalCommitmentIfCorner : commitment.totalCommitment;
}

function Figures({ listing, plot, base, totalPrice, currency, commitment, holdSecondsLeft, held }: OrderSummaryProps) {
  const inNaira = commitment?.currency === "NGN" && currency !== "NGN";
  return (
    <div className="space-y-4">
      <div>
        <div className="font-semibold text-lg text-[var(--foreground)]">{listing.name}</div>
        <div className="text-sm text-[var(--muted-foreground)]">{plotLine(plot)}</div>
      </div>
      <dl className="border-t border-[var(--border)] pt-4 space-y-2.5 text-sm">
        {/* Beside naira fees and a naira total, the plot price reads in naira
            too; a buyer viewing another currency sees their figure under it. */}
        <Row label="Plot price" value={formatAmount(totalPrice, inNaira ? "NGN" : currency)} />
        {inNaira && <Row label={`In ${currency}, at today's rate`} value={`≈ ${formatAmount(totalPrice, currency)}`} small />}
        {plot.isCorner && <Row label="Includes corner premium" value={`${listing.cornerPremiumPct}% on ${formatAmount(base, inNaira ? "NGN" : currency)}`} small />}
        {commitment && (
          <div className="flex items-center justify-between gap-3">
            <dt className="text-[var(--muted-foreground)]">Fees on top</dt>
            <dd><MoneyRangeDisplay money={commitment.oneOffFees} currency={commitment.currency} className="font-mono-data text-[var(--foreground)]" /></dd>
          </div>
        )}
      </dl>
      {commitment && (
        <div className="border-t border-[var(--border)] pt-4">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-sm text-[var(--foreground)]">Total commitment</span>
            <MoneyRangeDisplay money={total(commitment, plot.isCorner)} currency={commitment.currency} className="font-mono-data font-medium text-lg text-[var(--foreground)]" />
          </div>
          {commitment.recurringFees.map((fee) => (
            <p key={fee.label} className="text-xs text-[var(--muted-foreground)] mt-1.5">
              Plus {fee.label.toLowerCase()}
              {fee.amount ? <>, <MoneyRangeDisplay money={fee.amount} currency={fee.currency} /> a year</> : " every year (amount not stated)"}
            </p>
          ))}
        </div>
      )}
      {holdSecondsLeft !== null ? (
        <CountdownTimer secondsLeft={holdSecondsLeft} />
      ) : !held && (
        <div className="rounded-lg bg-[var(--muted)] px-3.5 py-3 flex gap-3">
          <ClockIcon size={16} className="mt-0.5 shrink-0 text-[var(--muted-foreground)]" />
          <div>
            <div className="text-sm font-semibold text-[var(--foreground)]">Not held yet</div>
            <div className="text-xs text-[var(--muted-foreground)]">We hold this plot for {HOLD_MINUTES} minutes once you continue.</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className={`flex items-center justify-between gap-3 ${small ? "text-xs" : ""}`}>
      <dt className="text-[var(--muted-foreground)]">{label}</dt>
      <dd className="font-mono-data text-[var(--foreground)]">{value}</dd>
    </div>
  );
}

const PROMISES: [React.ReactNode, string][] = [
  [<ShieldCheckIcon key="s" />, "The developer verifies your payment before the plot is allocated to you."],
  [<FileCheckIcon key="f" />, "Your receipt and allocation letter are issued to your document vault, each with a verification code."],
  [<LockIcon key="l" />, "Card and bank payments are taken on Paystack's secure page. HomeTrue never sees your card."],
];

export function TrustPromises({ className }: { className?: string }) {
  return (
    <ul className={`space-y-3 ${className ?? ""}`}>
      {PROMISES.map(([icon, text]) => (
        <li key={text} className="flex gap-2.5 text-sm text-[var(--muted-foreground)]">
          <span className="mt-0.5 shrink-0 text-[var(--secondary-foreground)]">{icon}</span>
          {text}
        </li>
      ))}
    </ul>
  );
}

export default function OrderSummary(props: OrderSummaryProps) {
  const { listing } = props;
  return (
    <aside aria-label="Order summary" className="space-y-4">
      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden">
        {listing.imageUrl && <img src={listing.imageUrl} alt="" loading="lazy" className="w-full aspect-[16/7] object-cover" />}
        <div className="p-6"><Figures {...props} /></div>
      </div>
      <TrustPromises className="px-1" />
    </aside>
  );
}

// The phone version: a bar under the header that opens to the summary. The
// countdown stays visible while it's closed.
export function OrderSummaryBar(props: OrderSummaryProps) {
  const { listing, plot, commitment, holdSecondsLeft } = props;
  return (
    <div className="bg-[var(--secondary)] border-b border-[var(--border)]">
      <details className="group">
        <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer px-4 py-3 flex items-center gap-3">
          {listing.imageUrl && <img src={listing.imageUrl} alt="" className="w-11 h-11 rounded-lg object-cover shrink-0" />}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-[var(--foreground)] truncate">{listing.name}</div>
            <div className="text-xs text-[var(--muted-foreground)] truncate">{plotLabel(plot)} · {plot.sizeSqm} sqm</div>
          </div>
          {commitment && <MoneyRangeDisplay money={total(commitment, plot.isCorner)} currency={commitment.currency} compact className="font-mono-data text-sm font-medium text-[var(--foreground)]" />}
          <ChevronDownIcon size={16} className="text-[var(--muted-foreground)] transition-transform group-open:rotate-180" />
          <span className="sr-only">Show order summary</span>
        </summary>
        <div className="px-4 pb-4"><div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4"><Figures {...props} holdSecondsLeft={null} held /></div></div>
      </details>
      {holdSecondsLeft !== null && <div className="px-4 pb-3"><CountdownTimer secondsLeft={holdSecondsLeft} compact /></div>}
    </div>
  );
}
