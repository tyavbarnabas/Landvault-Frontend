import { useState, useEffect, useRef } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { formatAmount, type OwnedPlot } from "../../data/mockData";
import { fetchOwnedPlots } from "../../services/portfolioService";
import { useApp } from "../../contexts/AppContext";
import PlotStatusBadge from "../../components/portfolio/PlotStatusBadge";
import ResaleProgress from "../../components/resale/ResaleProgress";
import {
  fetchMyListings, createListing, fetchMyOffersReceived,
  declineOffer, acceptOffer, getListingEligibility, fetchResaleTransfer, fetchMyResaleTransfers,
  RESALE_POLICY, type ResaleListing, type ResaleOffer, type ResaleTransfer, type OutstandingTreatment,
} from "../../services/resaleService";

// This file is the SELLER workspace only — "what I'm selling," reachable
// from the portfolio, deliberately not from the marketplace feed. Buyer-side
// browsing and offers live in the unified /marketplace feed
// (marketplaceFeedService.ts, ListingCard, MarketplaceResaleDetail.tsx) —
// /resale itself now just redirects there (see App.tsx).

// ─── My listings & offers ──────────────────────────────────────────────────

export function MyListings() {
  const { currency, user } = useApp();
  const navigate = useNavigate();
  const [ownedPlots, setOwnedPlots] = useState<OwnedPlot[]>([]);
  const [received, setReceived] = useState<{ listing: ResaleListing; offers: ResaleOffer[] }[]>([]);
  const [transfers, setTransfers] = useState<ResaleTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondingId, setRespondingId] = useState<string | null>(null);

  const load = () => {
    if (!user) return;
    setLoading(true);
    Promise.all([fetchOwnedPlots(), fetchMyOffersReceived(user.name), fetchMyResaleTransfers(user.name)]).then(([plots, offers, txns]) => {
      setOwnedPlots(plots);
      setReceived(offers);
      setTransfers(txns);
      setLoading(false);
    });
  };

  useEffect(() => { load(); }, [user]);

  if (loading) return <div className="p-8 text-[var(--muted-foreground)] text-sm">Loading…</div>;

  const eligible = ownedPlots.filter((p) => getListingEligibility(p).eligible);
  const ineligibleInArrears = ownedPlots.filter((p) => p.status === "in_arrears");

  const respond = async (offer: ResaleOffer, action: "accepted" | "declined") => {
    setRespondingId(offer.id);
    try {
      if (action === "declined") {
        await declineOffer(offer.id, "Declined by seller.");
        load();
      } else {
        const transfer = await acceptOffer(offer.id);
        navigate(`/resale/transfer/${transfer.id}`);
      }
    } finally {
      setRespondingId(null);
    }
  };

  const inFlightTransfers = transfers.filter((t) => t.status === "in_progress");
  const pastTransfers = transfers.filter((t) => t.status !== "in_progress");

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <nav className="text-xs text-[var(--muted-foreground)] mb-4 flex items-center gap-1.5">
        <Link to="/portfolio" className="hover:text-[var(--foreground)]">Portfolio</Link>
        <span>/</span>
        <span className="text-[var(--foreground)]">My listings & offers</span>
      </nav>

      <h1 className="font-display text-2xl mb-6">My listings & offers</h1>

      {/* Reachable-later transfers in progress or completed */}
      {(inFlightTransfers.length > 0 || pastTransfers.length > 0) && (
        <div className="mb-8">
          <h2 className="font-semibold text-sm mb-3">Transfers</h2>
          <div className="space-y-2">
            {[...inFlightTransfers, ...pastTransfers].map((t) => (
              <Link key={t.id} to={`/resale/transfer/${t.id}`} className="flex items-center justify-between gap-4 bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 hover:border-[var(--accent)]/50 transition-colors">
                <div>
                  <div className="font-medium text-sm">{t.estateName} — {t.plotLabel}</div>
                  <div className="text-xs text-[var(--muted-foreground)]">to {t.buyerName} · {formatAmount(t.amount, t.currency)}</div>
                </div>
                <TransferStatusPill status={t.status} />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Eligible plots to list */}
      <div className="mb-8">
        <h2 className="font-semibold text-sm mb-3">Eligible plots for resale</h2>
        {eligible.length === 0 ? (
          <div className="bg-[var(--muted)] rounded-xl p-6 text-center text-sm text-[var(--muted-foreground)]">
            You don't have any plots available for listing right now.
          </div>
        ) : (
          <div className="space-y-3">
            {eligible.map((plot) => (
              <div key={plot.id} className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4 flex items-center justify-between gap-4">
                <div>
                  <div className="font-semibold text-sm">{plot.estate} — {plot.plotLabel}</div>
                  <div className="text-xs text-[var(--muted-foreground)]">{plot.sqm} sqm · Paid {formatAmount(plot.paidAmount, currency)}</div>
                </div>
                <Link
                  to={`/resale/list/${plot.id}`}
                  className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-xs font-medium hover:opacity-90 transition-opacity whitespace-nowrap"
                >
                  Create listing
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* Fix 2: plots in arrears are blocked from listing, with a path forward */}
        {ineligibleInArrears.length > 0 && (
          <div className="mt-3 space-y-2">
            {ineligibleInArrears.map((plot) => (
              <div key={plot.id} className="flex items-center justify-between gap-4 bg-red-50 border border-red-200 rounded-xl p-4">
                <div>
                  <div className="font-semibold text-sm text-red-900">{plot.estate} — {plot.plotLabel}</div>
                  <div className="text-xs text-red-700">In arrears — can't be listed until resolved.</div>
                </div>
                <Link to={`/portfolio/${plot.id}`} className="text-xs font-medium text-red-800 hover:underline whitespace-nowrap">Request restructuring →</Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Offers received, per listing */}
      <div>
        <h2 className="font-semibold text-sm mb-3">Offers received</h2>
        {received.length === 0 ? (
          <div className="bg-[var(--muted)] rounded-xl p-6 text-center text-sm text-[var(--muted-foreground)]">No offers yet.</div>
        ) : (
          <div className="space-y-4">
            {received.map(({ listing, offers }) => (
              <div key={listing.id} className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
                <div className="px-5 py-3 bg-[var(--muted)] text-xs font-medium text-[var(--muted-foreground)] flex items-center justify-between">
                  <span>{listing.estateName}, {listing.plotLabel} — Asking {formatAmount(listing.asking, currency)}</span>
                  {listing.status === "resale_pending" && <span className="text-amber-700 font-semibold">Pending transfer</span>}
                </div>
                {offers.length === 0 ? (
                  <div className="px-5 py-4 text-sm text-[var(--muted-foreground)]">No offers on this listing yet.</div>
                ) : (
                  <div className="divide-y divide-[var(--border)]">
                    {offers.map((offer) => (
                      <div key={offer.id} className="px-5 py-4 flex items-center justify-between gap-4">
                        <div>
                          <div className="text-sm font-medium">{offer.buyerName}</div>
                          <div className="text-xs text-[var(--muted-foreground)] font-mono-data">{offer.date}</div>
                          {offer.declineReason && <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{offer.declineReason}</div>}
                        </div>
                        <div className="text-right">
                          <div className="font-mono-data font-semibold text-sm">{formatAmount(offer.amount, currency)}</div>
                          {offer.status === "pending" && listing.status === "active" ? (
                            <div className="flex gap-1.5 mt-1">
                              <button
                                onClick={() => respond(offer, "accepted")}
                                disabled={respondingId === offer.id}
                                className="text-xs px-2.5 py-1 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors disabled:opacity-60"
                              >
                                {respondingId === offer.id ? "Accepting…" : "Accept"}
                              </button>
                              <button
                                onClick={() => respond(offer, "declined")}
                                disabled={respondingId === offer.id}
                                className="text-xs px-2.5 py-1 border border-[var(--border)] text-[var(--muted-foreground)] rounded-md hover:text-red-600 hover:border-red-300 transition-colors disabled:opacity-60"
                              >
                                Decline
                              </button>
                            </div>
                          ) : (
                            <span className={`text-xs font-medium capitalize ${offer.status === "accepted" ? "text-emerald-700" : "text-[var(--muted-foreground)]"}`}>
                              {offer.status}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TransferStatusPill({ status }: { status: ResaleTransfer["status"] }) {
  const info: Record<ResaleTransfer["status"], { label: string; className: string }> = {
    in_progress: { label: "In progress", className: "bg-blue-50 text-blue-700 border-blue-200" },
    completed: { label: "Completed", className: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    developer_declined: { label: "Developer declined", className: "bg-red-50 text-red-700 border-red-200" },
    payment_window_expired: { label: "Payment expired", className: "bg-amber-50 text-amber-700 border-amber-200" },
    finance_rejected: { label: "Payment flagged", className: "bg-red-50 text-red-700 border-red-200" },
  };
  const s = info[status];
  return <span className={`text-xs font-medium px-2.5 py-1 rounded-full border shrink-0 ${s.className}`}>{s.label}</span>;
}

// ─── Resale transfer detail — reachable later from My listings ────────────

export function ResaleTransferDetail() {
  const { transferId } = useParams();
  const navigate = useNavigate();
  const { addNotification } = useApp();
  const [transfer, setTransfer] = useState<ResaleTransfer | null | undefined>(undefined);
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (!transferId) { setTransfer(null); return; }
    let cancelled = false;
    // Clone on every poll — fetchResaleTransfer returns the same mutated
    // object reference each tick in mock mode, and React bails out of a
    // setState with an unchanged reference (Object.is), so the UI would
    // otherwise freeze on the first-rendered stage forever.
    const poll = () => fetchResaleTransfer(transferId).then((t) => { if (!cancelled) setTransfer(t ? { ...t } : null); });
    poll();
    const interval = setInterval(poll, 1200);
    return () => { cancelled = true; clearInterval(interval); };
  }, [transferId]);

  useEffect(() => {
    if (transfer?.status === "completed" && !notifiedRef.current) {
      notifiedRef.current = true;
      addNotification({
        type: "payment",
        title: "Resale settled — proceeds released",
        body: `${transfer.estateName}, ${transfer.plotLabel} has transferred to ${transfer.buyerName}. Net proceeds of ${formatAmount(transfer.netProceeds, transfer.currency)} have been released to your account.`,
        date: new Date().toISOString().split("T")[0],
      });
    }
  }, [transfer, addNotification]);

  if (transfer === undefined) return <div className="p-8 text-[var(--muted-foreground)] text-sm">Loading…</div>;
  if (transfer === null) return <div className="p-8 text-[var(--muted-foreground)] text-sm">Transfer not found. <Link to="/resale/my-listings" className="text-[var(--accent)] hover:underline">Back to my listings</Link></div>;

  return (
    <div className="p-6 max-w-xl mx-auto">
      <button onClick={() => navigate("/resale/my-listings")} className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] mb-6">← Back to my listings</button>
      <h1 className="font-display text-2xl mb-1">{transfer.estateName} — {transfer.plotLabel}</h1>
      <p className="text-sm text-[var(--muted-foreground)] mb-6">Resale transfer to {transfer.buyerName}</p>
      <ResaleProgress transfer={transfer} />
    </div>
  );
}

// ─── List a specific plot ──────────────────────────────────────────────────

export function ListPlot() {
  const { plotId } = useParams();
  const navigate = useNavigate();
  const { currency, user } = useApp();
  const [plot, setPlot] = useState<OwnedPlot | null | undefined>(undefined);
  const [price, setPrice] = useState("");
  const [outstandingTreatment, setOutstandingTreatment] = useState<OutstandingTreatment>("deduct_from_proceeds");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [published, setPublished] = useState<{ price: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchOwnedPlots().then((plots) => { if (!cancelled) setPlot(plots.find((p) => p.id === plotId) ?? null); });
    return () => { cancelled = true; };
  }, [plotId]);

  if (plot === undefined) return <div className="p-8 text-[var(--muted-foreground)]">Loading…</div>;
  if (!plot) return <div className="p-8">Plot not found.</div>;

  const eligibility = getListingEligibility(plot);
  if (!eligibility.eligible) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <div className="text-sm font-semibold text-red-900 mb-1">This plot can't be listed</div>
          <p className="text-xs text-red-800 mb-4">{eligibility.reason}</p>
          {plot.status === "in_arrears" ? (
            <Link to={`/portfolio/${plot.id}`} className="text-xs font-medium text-red-800 hover:underline">Request restructuring →</Link>
          ) : (
            <Link to={`/portfolio/${plot.id}`} className="text-xs font-medium text-red-800 hover:underline">Back to plot →</Link>
          )}
        </div>
      </div>
    );
  }

  const numericPrice = Number(price);
  const validPrice = price.trim() !== "" && Number.isFinite(numericPrice) && numericPrice > 0;
  const belowOriginal = validPrice && numericPrice < plot.totalPrice;
  const netAfterFeesAndOutstanding = numericPrice * (1 - RESALE_POLICY.developerTransferFeePct / 100) - (outstandingTreatment === "deduct_from_proceeds" ? eligibility.outstandingBalance : 0);
  const wouldNotCoverOutstanding = validPrice && eligibility.outstandingBalance > 0 && outstandingTreatment === "deduct_from_proceeds" && netAfterFeesAndOutstanding < 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validPrice) { setSubmitError("Enter a valid asking price greater than zero."); return; }
    setSubmitError("");
    setSubmitting(true);
    try {
      await createListing({
        plot,
        asking: numericPrice,
        sellerName: user?.name ?? "You",
        outstandingTreatment: eligibility.outstandingBalance > 0 ? outstandingTreatment : undefined,
      });
      setPublished({ price: numericPrice });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong publishing your listing.");
    } finally {
      setSubmitting(false);
    }
  };

  if (published) {
    return (
      <div className="p-6 max-w-lg mx-auto text-center py-16">
        <div className="text-4xl mb-4" aria-hidden="true">🏷</div>
        <h2 className="font-display text-2xl mb-2">Listing published</h2>
        <p className="text-sm text-[var(--muted-foreground)] mb-6">
          {plot.plotLabel} at {plot.estate} is now live on the secondary market at{" "}
          <strong className="font-mono-data">{formatAmount(published.price, currency)}</strong>. Buyers can make offers.
        </p>
        <div className="flex gap-3 justify-center">
          <Link to="/resale/my-listings" className="px-5 py-2.5 border border-[var(--border)] rounded-md text-sm font-medium hover:bg-[var(--muted)] transition-colors">
            Manage listing
          </Link>
          <Link to="/marketplace?type=resale" className="px-5 py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 transition-opacity">
            View in marketplace
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <nav className="text-xs text-[var(--muted-foreground)] mb-4 flex items-center gap-1.5">
        <Link to="/resale/my-listings" className="hover:text-[var(--foreground)]">My listings</Link>
        <span>/</span>
        <span className="text-[var(--foreground)]">List plot</span>
      </nav>
      <h1 className="font-display text-2xl mb-6">List for resale</h1>

      <div className="bg-[var(--muted)] rounded-xl p-4 mb-5 text-sm flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{plot.estate} — {plot.plotLabel}</div>
          <div className="text-[var(--muted-foreground)]">{plot.sqm} sqm · {plot.intent} · Original price {formatAmount(plot.totalPrice, currency)} · Paid {formatAmount(plot.paidAmount, currency)}</div>
        </div>
        <PlotStatusBadge status={plot.status} />
      </div>

      {eligibility.outstandingBalance > 0 && (
        <div className="mb-5 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="text-sm font-semibold text-amber-900 mb-1">Outstanding balance: {formatAmount(eligibility.outstandingBalance, currency)}</div>
          <p className="text-xs text-amber-800 mb-3">Choose how this is handled when the sale settles.</p>
          <div className="space-y-2" role="radiogroup" aria-label="Outstanding balance treatment">
            {RESALE_POLICY.allowedOutstandingTreatments.map((t) => (
              <label key={t} className="flex items-start gap-2 text-xs text-amber-900 cursor-pointer">
                <input type="radio" name="outstanding-treatment" checked={outstandingTreatment === t} onChange={() => setOutstandingTreatment(t)} className="mt-0.5" />
                {t === "deduct_from_proceeds" ? "Deduct from my proceeds at settlement" : "Transfers to the buyer along with the plot"}
              </label>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="asking-price" className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Asking price ({plot.currency})</label>
          <input
            id="asking-price"
            type="number"
            min="0.01"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="e.g. 17500000"
            required
            aria-invalid={!!submitError}
            aria-describedby={[belowOriginal && "asking-price-warning", wouldNotCoverOutstanding && "asking-price-outstanding-warning", submitError && "asking-price-error"].filter(Boolean).join(" ") || undefined}
            className="w-full px-3 py-2.5 border border-[var(--border)] rounded-md text-sm font-mono-data bg-[var(--card)]"
          />
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            For reference: you originally paid {formatAmount(plot.totalPrice, currency)}. There's no required minimum — a {RESALE_POLICY.developerTransferFeePct}% developer transfer fee is deducted from proceeds on sale.
          </p>
          {belowOriginal && (
            <p id="asking-price-warning" className="text-xs text-amber-700 mt-1">This is below your original price — not blocked, just worth knowing before you publish.</p>
          )}
          {wouldNotCoverOutstanding && (
            <p id="asking-price-outstanding-warning" role="alert" className="text-xs text-red-600 mt-1">At this price, proceeds after the fee wouldn't fully cover your outstanding balance.</p>
          )}
          {submitError && <p id="asking-price-error" role="alert" className="text-xs text-red-600 mt-1">{submitError}</p>}
        </div>
        <div className="p-3 bg-[var(--muted)] rounded-lg text-xs text-[var(--muted-foreground)] leading-relaxed">
          Listing is public to all verified buyers on the platform. On an accepted offer, the buyer's payment is held until the developer approves and title formally transfers — only then are your proceeds released.
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => navigate(-1)} className="flex-1 py-2.5 border border-[var(--border)] rounded-md text-sm text-[var(--muted-foreground)]">Cancel</button>
          <button type="submit" disabled={submitting} className="flex-[2] py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity">
            {submitting ? "Publishing…" : "Publish listing"}
          </button>
        </div>
      </form>
    </div>
  );
}
