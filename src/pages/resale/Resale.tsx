import { useState, useEffect } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { formatAmount, type Estate, type OwnedPlot } from "../../data/mockData";
import { fetchEstates } from "../../services/estatesService";
import { fetchOwnedPlots } from "../../services/portfolioService";
import { useApp } from "../../contexts/AppContext";

// ─── Marketplace browse ────────────────────────────────────────────────────

interface Listing {
  id: string;
  estateId: string;
  plotLabel: string;
  sqm: number;
  type: "standard" | "corner";
  asking: number;
  originalPrice: number;
  seller: string;
  daysListed: number;
  intent: "development" | "investment";
  pctPaid: number;
}

const MOCK_LISTINGS: Listing[] = [
  { id: "l1", estateId: "millbrook", plotLabel: "Block A, Plot 7", sqm: 400, type: "corner", asking: 52_000_000, originalPrice: 45_500_000, seller: "T. Adeyemi", daysListed: 3, intent: "investment", pctPaid: 100 },
  { id: "l2", estateId: "millbrook", plotLabel: "Block D, Plot 2", sqm: 300, type: "standard", asking: 38_000_000, originalPrice: 32_000_000, seller: "O. Nwosu", daysListed: 14, intent: "investment", pctPaid: 100 },
  { id: "l3", estateId: "sterling", plotLabel: "Block B, Plot 11", sqm: 300, type: "standard", asking: 24_500_000, originalPrice: 20_000_000, seller: "F. Okafor", daysListed: 7, intent: "investment", pctPaid: 100 },
  { id: "l4", estateId: "emerald", plotLabel: "Block H, Plot 4", sqm: 300, type: "standard", asking: 15_800_000, originalPrice: 12_000_000, seller: "A. Musa", daysListed: 21, intent: "investment", pctPaid: 100 },
];

interface Offer {
  id: string;
  listingId: string;
  buyer: string;
  amount: number;
  date: string;
  status: "pending" | "accepted" | "declined";
}

const MOCK_OFFERS: Offer[] = [
  { id: "o1", listingId: "mine", buyer: "E. Obi", amount: 49_500_000, date: "2026-08-22", status: "pending" },
  { id: "o2", listingId: "mine", buyer: "K. Ibrahim", amount: 47_000_000, date: "2026-08-19", status: "declined" },
];

export function ResaleMarketplace() {
  const { currency } = useApp();
  const [estates, setEstates] = useState<Estate[]>([]);
  const [estateFilter, setEstateFilter] = useState("all");
  const [showOffer, setShowOffer] = useState<Listing | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchEstates().then((data) => { if (!cancelled) setEstates(data); });
    return () => { cancelled = true; };
  }, []);

  const filtered = estateFilter === "all" ? MOCK_LISTINGS : MOCK_LISTINGS.filter((l) => l.estateId === estateFilter);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">Secondary market</h1>
        <p className="text-sm text-[var(--muted-foreground)]">Plots listed for resale by verified owners. Ownership transfer handled by the developer after verified payment.</p>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <select value={estateFilter} onChange={(e) => setEstateFilter(e.target.value)} className="px-3 py-2 text-sm bg-[var(--card)] border border-[var(--border)] rounded-md">
          <option value="all">All estates</option>
          {estates.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <Link to="/resale/my-listings" className="ml-auto px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
          My listings & offers
        </Link>
      </div>

      {estates.length === 0 ? (
        <div className="text-center py-16 text-[var(--muted-foreground)] text-sm">Loading listings…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-[var(--muted-foreground)]">
          <div className="text-4xl mb-3">🏷</div>
          <p className="font-medium">No listings match your filter.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {filtered.map((listing) => {
            const estate = estates.find((e) => e.id === listing.estateId);
            if (!estate) return null;
            const gain = ((listing.asking - listing.originalPrice) / listing.originalPrice * 100).toFixed(1);
            return (
              <div key={listing.id} className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
                <div className="h-28 overflow-hidden bg-[var(--muted)] relative">
                  <img src={`https://images.unsplash.com/${estate.imageId}?w=500&h=160&fit=crop&auto=format`} alt={estate.name} className="w-full h-full object-cover opacity-80" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[var(--foreground)]/40 to-transparent" />
                  <div className="absolute bottom-2 left-3 text-white text-xs font-medium">{estate.name}</div>
                  {listing.type === "corner" && (
                    <div className="absolute top-2 right-2 bg-[var(--accent)] text-white text-xs px-2 py-0.5 rounded-full">Corner ★</div>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="font-semibold text-sm">{listing.plotLabel}</div>
                      <div className="text-xs text-[var(--muted-foreground)]">{listing.sqm} sqm · {listing.intent}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold font-mono-data">{formatAmount(listing.asking, currency)}</div>
                      <div className="text-xs text-emerald-700 font-medium">+{gain}% vs. original</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] pt-3 border-t border-[var(--border)]">
                    <span>Listed {listing.daysListed} day{listing.daysListed !== 1 ? "s" : ""} ago by {listing.seller}</span>
                    <button
                      onClick={() => setShowOffer(listing)}
                      className="px-3 py-1.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-xs font-medium hover:opacity-90 transition-opacity"
                    >
                      Make offer
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Make offer modal */}
      {showOffer && (
        <MakeOfferModal listing={showOffer} currency={currency} onClose={() => setShowOffer(null)} />
      )}
    </div>
  );
}

function MakeOfferModal({ listing, currency, onClose }: { listing: Listing; currency: any; onClose: () => void }) {
  const [amount, setAmount] = useState(String(listing.asking));
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <ModalShell onClose={onClose}>
        <div className="text-center py-6">
          <div className="text-3xl mb-3">✅</div>
          <h3 className="font-semibold mb-1">Offer submitted</h3>
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
    <ModalShell onClose={onClose}>
      <h3 className="font-semibold mb-1">Make an offer</h3>
      <p className="text-sm text-[var(--muted-foreground)] mb-4">{listing.plotLabel} · {listing.sqm} sqm · Asking {formatAmount(listing.asking, currency)}</p>
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Your offer (NGN)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-3 py-2.5 border border-[var(--border)] rounded-md text-sm font-mono-data bg-[var(--card)]"
          />
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">
          On accepted offer, funds are transferred to the seller's verified account. A 2% developer transfer fee is deducted automatically.
        </p>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 border border-[var(--border)] rounded-md text-sm text-[var(--muted-foreground)]">Cancel</button>
          <button onClick={() => setSubmitted(true)} className="flex-1 py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 transition-opacity">
            Submit offer
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

// ─── My listings & offers ──────────────────────────────────────────────────

export function MyListings() {
  const { currency } = useApp();
  const navigate = useNavigate();
  const [ownedPlots, setOwnedPlots] = useState<OwnedPlot[]>([]);
  const [offerResponse, setOfferResponse] = useState<Record<string, "accepted" | "declined">>({});

  useEffect(() => {
    let cancelled = false;
    fetchOwnedPlots().then((data) => { if (!cancelled) setOwnedPlots(data); });
    return () => { cancelled = true; };
  }, []);

  const eligiblePlots = ownedPlots.filter((p) => p.intent === "investment");

  const respond = (offerId: string, action: "accepted" | "declined") => {
    setOfferResponse((prev) => ({ ...prev, [offerId]: action }));
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <nav className="text-xs text-[var(--muted-foreground)] mb-4 flex items-center gap-1.5">
        <Link to="/resale" className="hover:text-[var(--foreground)]">Marketplace</Link>
        <span>/</span>
        <span className="text-[var(--foreground)]">My listings & offers</span>
      </nav>

      <h1 className="font-display text-2xl mb-6">My listings & offers</h1>

      {/* Eligible plots to list */}
      <div className="mb-8">
        <h2 className="font-semibold text-sm mb-3">Eligible plots for resale</h2>
        {eligiblePlots.length === 0 ? (
          <div className="bg-[var(--muted)] rounded-xl p-6 text-center text-sm text-[var(--muted-foreground)]">
            You don't have any investment-flagged plots available for listing.
          </div>
        ) : (
          <div className="space-y-3">
            {eligiblePlots.map((plot) => (
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
      </div>

      {/* Incoming offers on "my" listing (mocked) */}
      <div>
        <h2 className="font-semibold text-sm mb-3">Offers received</h2>
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
          <div className="px-5 py-3 bg-[var(--muted)] text-xs font-medium text-[var(--muted-foreground)]">
            Emerald Park, Block G Plot 9 — Asking ₦17.5M
          </div>
          <div className="divide-y divide-[var(--border)]">
            {MOCK_OFFERS.map((offer) => {
              const resp = offerResponse[offer.id] || offer.status;
              return (
                <div key={offer.id} className="px-5 py-4 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium">{offer.buyer}</div>
                    <div className="text-xs text-[var(--muted-foreground)] font-mono-data">{offer.date}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono-data font-semibold text-sm">{formatAmount(offer.amount, currency)}</div>
                    {resp === "pending" ? (
                      <div className="flex gap-1.5 mt-1">
                        <button onClick={() => respond(offer.id, "accepted")} className="text-xs px-2.5 py-1 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 transition-colors">Accept</button>
                        <button onClick={() => respond(offer.id, "declined")} className="text-xs px-2.5 py-1 border border-[var(--border)] text-[var(--muted-foreground)] rounded-md hover:text-red-600 hover:border-red-300 transition-colors">Decline</button>
                      </div>
                    ) : (
                      <span className={`text-xs font-medium capitalize ${resp === "accepted" ? "text-emerald-700" : "text-[var(--muted-foreground)]"}`}>
                        {resp}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {MOCK_OFFERS.some((o) => (offerResponse[o.id] || o.status) === "accepted") && (
          <div className="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">
            Offer accepted. The settlement and transfer flow has been initiated. You'll receive the net proceeds ({formatAmount(MOCK_OFFERS[0].amount * 0.98, currency)} after 2% transfer fee) within 3–5 business days.
          </div>
        )}
      </div>
    </div>
  );
}

// ─── List a specific plot ──────────────────────────────────────────────────

export function ListPlot() {
  const { plotId } = useParams();
  const navigate = useNavigate();
  const { currency } = useApp();
  const [plot, setPlot] = useState<OwnedPlot | null | undefined>(undefined); // undefined = loading, null = not found
  const [price, setPrice] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchOwnedPlots().then((plots) => { if (!cancelled) setPlot(plots.find((p) => p.id === plotId) ?? null); });
    return () => { cancelled = true; };
  }, [plotId]);

  if (plot === undefined) return <div className="p-8 text-[var(--muted-foreground)]">Loading…</div>;
  if (!plot) return <div className="p-8">Plot not found.</div>;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="p-6 max-w-lg mx-auto text-center py-16">
        <div className="text-4xl mb-4">🏷</div>
        <h2 className="font-display text-2xl mb-2">Listing published</h2>
        <p className="text-sm text-[var(--muted-foreground)] mb-6">
          {plot.plotLabel} at {plot.estate} is now live on the secondary market at{" "}
          <strong className="font-mono-data">{formatAmount(Number(price), currency)}</strong>. Buyers can make offers.
        </p>
        <div className="flex gap-3 justify-center">
          <Link to="/resale/my-listings" className="px-5 py-2.5 border border-[var(--border)] rounded-md text-sm font-medium hover:bg-[var(--muted)] transition-colors">
            Manage listing
          </Link>
          <Link to="/resale" className="px-5 py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 transition-opacity">
            View marketplace
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <nav className="text-xs text-[var(--muted-foreground)] mb-4 flex items-center gap-1.5">
        <Link to="/resale" className="hover:text-[var(--foreground)]">Marketplace</Link>
        <span>/</span>
        <span className="text-[var(--foreground)]">List plot</span>
      </nav>
      <h1 className="font-display text-2xl mb-6">List for resale</h1>

      <div className="bg-[var(--muted)] rounded-xl p-4 mb-5 text-sm">
        <div className="font-semibold">{plot.estate} — {plot.plotLabel}</div>
        <div className="text-[var(--muted-foreground)]">{plot.sqm} sqm · {plot.intent} · Paid {formatAmount(plot.paidAmount, currency)}</div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Asking price (NGN)</label>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="e.g. 17500000"
            required
            min={plot.totalPrice}
            className="w-full px-3 py-2.5 border border-[var(--border)] rounded-md text-sm font-mono-data bg-[var(--card)]"
          />
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            Minimum: {formatAmount(plot.totalPrice, currency)} (your total plot price). A 2% developer transfer fee will be deducted from proceeds on sale.
          </p>
        </div>
        <div className="p-3 bg-[var(--muted)] rounded-lg text-xs text-[var(--muted-foreground)] leading-relaxed">
          Listing is public to all verified buyers on the platform. On an accepted offer and verified payment, ownership transfers and your account receives the net proceeds.
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => navigate(-1)} className="flex-1 py-2.5 border border-[var(--border)] rounded-md text-sm text-[var(--muted-foreground)]">Cancel</button>
          <button type="submit" disabled={!price} className="flex-[2] py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity">
            Publish listing
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Shared ────────────────────────────────────────────────────────────────

function ModalShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-6 max-w-sm w-full shadow-2xl">
        <div className="flex justify-end mb-2">
          <button onClick={onClose} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
