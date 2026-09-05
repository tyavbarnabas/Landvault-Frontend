import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { formatAmount, getPlotBlockLabel, type Estate, type Currency, type VerificationCheck } from "../../data/mockData";
import { fetchEstateById, fetchPriceTiers, type PriceTier } from "../../services/estatesService";
import { fetchListingById, type Listing } from "../../services/marketplaceService";
import { fetchReviews } from "../../services/reviewsService";
import { createInspection, type Inspection } from "../../services/inspectionService";
import { toListingPlot, type ListingPlot } from "../../services/marketplacePlotsService";
import { useApp } from "../../contexts/AppContext";
import PlotCanvas from "../../components/PlotCanvas";
import PlotDetailPanel from "../../components/marketplace/PlotDetailPanel";
import EnquiryPanel from "../../components/marketplace/EnquiryPanel";
import EstateReviews, { StarRating } from "../../components/EstateReviews";
import TabBar from "../../components/TabBar";
import PriceTierTable from "../../components/marketplace/PriceTierTable";
import InspectionForm, { type InspectionFormValue } from "../../components/inspections/InspectionForm";
import { TitleBadge } from "./Browse";

type Tab = "map" | "details" | "projections";
const TABS: { id: Tab; label: string }[] = [
  { id: "map", label: "Plot map" },
  { id: "details", label: "Estate details" },
  { id: "projections", label: "Investment data" },
];

export default function EstateDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currency } = useApp();
  const [estate, setEstate] = useState<Estate | null | undefined>(undefined); // undefined = loading, null = not found
  const [priceTiers, setPriceTiers] = useState<PriceTier[]>([]);
  const [avgRating, setAvgRating] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [selectedPlot, setSelectedPlot] = useState<ListingPlot | null>(null);
  const [selectedSizeSqm, setSelectedSizeSqm] = useState<number | null>(null);
  const [showInspection, setShowInspection] = useState(false);
  const [enquiryOpen, setEnquiryOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("map");
  // The estate's own public marketplace listing, when it has one — see
  // marketplaceService.ts's projectListing() publication gate. Reused both
  // for the "View on public marketplace" link and to power the shared
  // reserve/inspect/enquire plot panel below (the same flow /marketplace
  // uses), since that panel needs a Listing's seller/pricing shape, not the
  // internal Estate shape. Null for an estate whose tenant isn't
  // verified/active/entitled, or that hasn't opted in — the panel falls
  // back to a plain message in that case rather than assuming this always
  // resolves.
  const [listing, setListing] = useState<Listing | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchEstateById(id).then((data) => { if (!cancelled) setEstate(data ?? null); });
    fetchPriceTiers(id).then((tiers) => { if (!cancelled) setPriceTiers(tiers); });
    fetchListingById(id).then((l) => { if (!cancelled) setListing(l ?? null); });
    fetchReviews(id).then((reviews) => {
      if (cancelled) return;
      setReviewCount(reviews.length);
      setAvgRating(reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0);
    });
    return () => { cancelled = true; };
  }, [id]);

  if (estate === undefined) return <div className="p-8 text-[var(--muted-foreground)]">Loading estate…</div>;
  if (estate === null) return <div className="p-8 text-[var(--muted-foreground)]">Estate not found.</div>;

  const listingPlots = estate.plots.map((p) => toListingPlot(estate.id, p));

  const handleSelectSize = (sizeSqm: number) => {
    setSelectedSizeSqm(sizeSqm);
    setSelectedPlot(null);
    setActiveTab("map"); // jump straight to the filtered canvas — the whole point of Part 3
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Breadcrumb */}
      <nav className="text-xs text-[var(--muted-foreground)] mb-4 flex items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          <button onClick={() => navigate("/estates")} className="hover:text-[var(--foreground)]">Estates</button>
          <span>/</span>
          <span className="text-[var(--foreground)]">{estate.name}</span>
        </div>
        {listing ? (
          <Link to={`/marketplace/${estate.id}`} className="text-[var(--accent)] hover:underline shrink-0">View on public marketplace →</Link>
        ) : (
          <span className="shrink-0">Not yet on the public marketplace</span>
        )}
      </nav>

      {/* Header */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
        <div>
          <div className="flex items-start gap-3 mb-3">
            <h1 className="font-display text-3xl text-[var(--foreground)] flex-1">{estate.name}</h1>
            <TitleBadge type={estate.titleType} verified={estate.titleVerified} />
          </div>
          <p className="text-sm text-[var(--muted-foreground)] mb-2">{estate.location}, {estate.state}</p>

          {/* Rating summary — jumps to reviews on click, Temu-style */}
          <button
            onClick={() => document.getElementById("reviews")?.scrollIntoView({ behavior: "smooth" })}
            className="flex items-center gap-2 mb-3 hover:opacity-80 transition-opacity"
          >
            <StarRating rating={avgRating} size="text-base" />
            {reviewCount > 0 ? (
              <>
                <span className="text-sm font-semibold font-mono-data">{avgRating.toFixed(1)}</span>
                <span className="text-xs text-[var(--muted-foreground)] underline underline-offset-2">
                  {reviewCount} review{reviewCount !== 1 ? "s" : ""}
                </span>
              </>
            ) : (
              <span className="text-xs text-[var(--muted-foreground)] underline underline-offset-2">Be the first to review</span>
            )}
          </button>

          <p className="text-sm text-[var(--muted-foreground)] leading-relaxed mb-4">{estate.description}</p>

          <div className="flex flex-wrap gap-2 mb-4">
            {estate.amenities.map((a) => (
              <span key={a} className="text-xs bg-[var(--muted)] text-[var(--muted-foreground)] px-2.5 py-1 rounded">{a}</span>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[var(--border)]">
            <div>
              <div className="text-xs text-[var(--muted-foreground)]">Plots from</div>
              <div className="font-semibold font-mono-data text-sm mt-0.5">{formatAmount(estate.priceFrom, currency)}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted-foreground)]">Available</div>
              <div className="font-semibold font-mono-data text-sm mt-0.5">{estate.availablePlots} / {estate.totalPlots}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted-foreground)]">Title verified</div>
              <div className="text-xs font-mono-data mt-0.5 text-emerald-700">{estate.lastVerified}</div>
            </div>
          </div>
        </div>

        <div className="aspect-video rounded-xl overflow-hidden bg-[var(--muted)] relative">
          <img
            src={estate.imageUrl}
            alt={estate.name}
            className="w-full h-full object-cover"
          />
          <button onClick={() => setShowInspection(true)} className="absolute bottom-4 right-4 bg-white/90 text-[var(--foreground)] text-xs font-medium px-3 py-1.5 rounded-md hover:bg-white transition-colors flex items-center gap-1.5">
            <span aria-hidden="true">📅</span> Book inspection
          </button>
        </div>
      </div>

      {/* Price tier list — Part 3: the price menu at a glance, not buried in the canvas */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Plot sizes &amp; pricing</h2>
        <PriceTierTable
          tiers={priceTiers}
          cornerPremiumPct={estate.cornerPremiumPct}
          currency={currency}
          selectedSizeSqm={selectedSizeSqm}
          onSelectSize={handleSelectSize}
        />
      </section>

      {/* Tabs */}
      <div className="border-b border-[var(--border)] mb-6">
        <TabBar tabs={TABS} active={activeTab} onActivate={setActiveTab} ariaLabel="Estate sections" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left — canvas or content */}
        <div className="lg:col-span-2">
          {activeTab === "map" && (
            <div id="panel-map" role="tabpanel" aria-labelledby="tab-map">
              <PlotCanvas
                estateId={estate.id}
                plots={listingPlots}
                tiers={priceTiers}
                cornerPremiumPct={estate.cornerPremiumPct}
                onSelectPlot={setSelectedPlot}
                selectedPlotId={selectedPlot?.id}
                selectedSizeSqm={selectedSizeSqm}
                showAgisControls={true}
              />
            </div>
          )}
          {activeTab === "details" && (
            <div id="panel-details" role="tabpanel" aria-labelledby="tab-details" className="space-y-4">
              <DetailSection title="Infrastructure" items={estate.amenities} />
              <VerificationSection estate={estate} />
            </div>
          )}
          {activeTab === "projections" && (
            <div id="panel-projections" role="tabpanel" aria-labelledby="tab-projections">
              <ProjectionTable estate={estate} currency={currency} />
            </div>
          )}
        </div>

        {/* Right — plot detail panel: the same shared panel /marketplace
            uses (Reserve / Book inspection / Enquire / Wishlist), plus the
            investment-projection block when a plot has one. */}
        <div>
          {selectedPlot ? (
            listing ? (
              <PlotDetailPanel
                plot={selectedPlot}
                listing={listing}
                onClose={() => setSelectedPlot(null)}
                onOpenEnquiry={() => setEnquiryOpen(true)}
              />
            ) : (
              <div className="bg-[var(--muted)] rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted-foreground)]">
                This estate isn't on the shared reserve/inspect/enquire flow yet.
              </div>
            )
          ) : (
            <div className="bg-[var(--muted)] rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted-foreground)]">
              <div className="text-2xl mb-2" aria-hidden="true">👆</div>
              Click any available plot on the map to inspect its details and pricing.
            </div>
          )}

          {/* Inspection modal — general estate visit, not tied to a plot */}
          {showInspection && (
            <InspectionBooking onClose={() => setShowInspection(false)} estate={estate} />
          )}
        </div>
      </div>

      {enquiryOpen && listing && (
        <EnquiryPanel listing={listing} plot={selectedPlot ?? undefined} onClose={() => setEnquiryOpen(false)} />
      )}

      {/* Ratings & reviews — visible directly on the estate page */}
      <div id="reviews" className="mt-8 scroll-mt-6">
        <EstateReviews estateId={estate.id} estateName={estate.name} />
      </div>
    </div>
  );
}

function DetailSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
      <h3 className="font-semibold text-sm mb-3">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2 text-sm text-[var(--muted-foreground)]">
            <span className="text-emerald-600 mt-0.5 shrink-0" aria-hidden="true">✓</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Part 2: real, per-check verification state — never a blanket positive
// claim. A check absent from the estate's own data renders nothing at all,
// rather than silently implying it passed.
// TODO (backend): backed by a real AGIS / state-registry integration once
// one exists — see VerificationCheck in mockData.ts.
const CHECK_STYLES: Record<VerificationCheck["status"], { icon: string; color: string; text: string }> = {
  verified: { icon: "✓", color: "text-emerald-700", text: "verified" },
  pending: { icon: "⏳", color: "text-amber-700", text: "verification pending" },
  not_checked: { icon: "○", color: "text-[var(--muted-foreground)]", text: "not yet checked" },
  failed: { icon: "✗", color: "text-red-700", text: "verification failed" },
};

function VerificationSection({ estate }: { estate: Estate }) {
  const rows: { label: string; check: VerificationCheck }[] = [
    { label: `${estate.titleType} instrument`, check: { status: estate.titleVerified ? "verified" : "pending", date: estate.lastVerified } },
  ];
  if (estate.agisRegistration) rows.push({ label: "FCT AGIS registration", check: estate.agisRegistration });
  if (estate.encroachmentStatus) rows.push({ label: "Encroachment status", check: estate.encroachmentStatus });

  return (
    <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
      <h3 className="font-semibold text-sm mb-3">Title &amp; verification</h3>
      <ul className="space-y-2">
        {rows.map(({ label, check }) => {
          const style = CHECK_STYLES[check.status];
          return (
            <li key={label} className="flex items-start gap-2 text-sm">
              <span className={`${style.color} mt-0.5 shrink-0`} aria-hidden="true">{style.icon}</span>
              <span className="text-[var(--muted-foreground)]">
                <span className="text-[var(--foreground)]">{label}</span> — <span className={style.color}>{style.text}{check.date ? ` ${check.date}` : ""}</span>
                {check.note && <span className="block text-xs mt-0.5">{check.note}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ProjectionTable({ estate, currency }: { estate: Estate; currency: Currency }) {
  const investmentPlots = estate.plots.filter((p) => p.status === "available-inv" && p.projectedROI).slice(0, 6);

  if (investmentPlots.length === 0) {
    return (
      <div className="bg-[var(--card)] rounded-xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted-foreground)]">
        No investment-flagged plots are currently available at this estate.
      </div>
    );
  }

  return (
    <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--border)]">
        <h3 className="font-semibold text-sm">Investment plot projections</h3>
        <p className="text-xs text-[var(--muted-foreground)] mt-0.5">Estimates only — not a guarantee of returns.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--muted)]">
              <th className="text-left px-4 py-2.5 text-xs font-medium text-[var(--muted-foreground)]">Plot</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-[var(--muted-foreground)]">Size</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-[var(--muted-foreground)]">Price</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-[var(--muted-foreground)]">Est. ROI</th>
              <th className="text-right px-4 py-2.5 text-xs font-medium text-[var(--muted-foreground)]">Hold</th>
            </tr>
          </thead>
          <tbody>
            {investmentPlots.map((p) => (
              <tr key={p.id} className="border-t border-[var(--border)] hover:bg-[var(--muted)]/50 transition-colors">
                <td className="px-4 py-2.5 font-mono-data text-xs">{getPlotBlockLabel(estate, p).label}</td>
                <td className="px-4 py-2.5 text-right text-xs font-mono-data">{p.sqm} m²</td>
                <td className="px-4 py-2.5 text-right text-xs font-mono-data">{formatAmount(p.price, currency)}</td>
                <td className="px-4 py-2.5 text-right text-xs font-mono-data text-emerald-700 font-medium">+{p.projectedROI}%</td>
                <td className="px-4 py-2.5 text-right text-xs text-[var(--muted-foreground)]">{p.holdingYears}yr</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Part 7: wired to the real inspection service (shared with the marketplace
// buyer flow — an inspection is an account-level concept, not tied to which
// browse surface it was booked from) instead of setting local state with no
// request. Never promises a response time the system can't honour — the
// agent is assigned immediately and shown, not "within 24 hours." Booked at
// the estate level here (this button isn't tied to one specific plot), so a
// placeholder plot reference is used — see plotId/plotLabel below.
function InspectionBooking({ onClose, estate }: { onClose: () => void; estate: Estate }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [booked, setBooked] = useState<Inspection | null>(null);

  const handleSubmit = async (value: InspectionFormValue) => {
    setSubmitting(true);
    setError("");
    try {
      const inspection = await createInspection({
        listingId: estate.id,
        listingName: estate.name,
        plotId: "general",
        plotLabel: "General estate visit",
        sellerBranchName: estate.name,
        type: value.type,
        date: value.date,
        timeSlot: value.timeSlot,
        note: value.note || undefined,
      });
      setBooked(inspection);
    } catch {
      setError("Something went wrong booking your inspection. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (booked) {
    return (
      <div className="mt-4 bg-[var(--card)] rounded-xl border border-[var(--border)] p-5 text-center">
        <div className="text-2xl mb-2" aria-hidden="true">✅</div>
        <div className="font-medium text-sm mb-1">Inspection booked</div>
        <div className="text-xs text-[var(--muted-foreground)] mb-1">{booked.type === "physical" ? "Physical visit" : "Virtual / drone tour"} on {booked.date} at {booked.timeSlot}.</div>
        <div className="text-xs text-[var(--muted-foreground)] mb-3">Assigned agent: {booked.agent.name} · {booked.agent.phone}</div>
        <button onClick={onClose} className="text-xs text-[var(--accent)] hover:underline">Close</button>
      </div>
    );
  }

  return (
    <div className="mt-4 bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm">Book an inspection</h3>
        <button onClick={onClose} aria-label="Close" className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-lg leading-none">×</button>
      </div>

      <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
        Plots at {estate.name} are not held during your inspection — save any plot you like from the map, then return to reserve it once you've decided.
      </div>

      <InspectionForm onSubmit={handleSubmit} submitting={submitting} />
      {error && <p role="alert" className="text-red-600 text-xs mt-2">{error}</p>}
    </div>
  );
}
