import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { formatAmount, getPlotBlockLabel, type Plot, type Estate } from "../../data/mockData";
import { fetchEstateById } from "../../services/estatesService";
import { fetchReviews } from "../../services/reviewsService";
import { useApp } from "../../contexts/AppContext";
import PlotCanvas from "../../components/PlotCanvas";
import EstateReviews, { StarRating } from "../../components/EstateReviews";
import { TitleBadge } from "./Browse";

export default function EstateDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currency, savedPlots, toggleSavedPlot } = useApp();
  const [estate, setEstate] = useState<Estate | null | undefined>(undefined); // undefined = loading, null = not found
  const [avgRating, setAvgRating] = useState(0);
  const [reviewCount, setReviewCount] = useState(0);
  const [selectedPlot, setSelectedPlot] = useState<Plot | null>(null);
  const [showInspection, setShowInspection] = useState(false);
  const [activeTab, setActiveTab] = useState<"map" | "details" | "projections">("map");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchEstateById(id).then((data) => { if (!cancelled) setEstate(data ?? null); });
    fetchReviews(id).then((reviews) => {
      if (cancelled) return;
      setReviewCount(reviews.length);
      setAvgRating(reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0);
    });
    return () => { cancelled = true; };
  }, [id]);

  if (estate === undefined) return <div className="p-8 text-[var(--muted-foreground)]">Loading estate…</div>;
  if (estate === null) return <div className="p-8 text-[var(--muted-foreground)]">Estate not found.</div>;

  const isSavedPlot = selectedPlot ? savedPlots.includes(`${estate.id}:${selectedPlot.id}`) : false;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Breadcrumb */}
      <nav className="text-xs text-[var(--muted-foreground)] mb-4 flex items-center gap-1.5">
        <button onClick={() => navigate("/estates")} className="hover:text-[var(--foreground)]">Estates</button>
        <span>/</span>
        <span className="text-[var(--foreground)]">{estate.name}</span>
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
            src={`https://images.unsplash.com/${estate.imageId}?w=700&h=400&fit=crop&auto=format`}
            alt={estate.name}
            className="w-full h-full object-cover"
          />
          <button onClick={() => setShowInspection(true)} className="absolute bottom-4 right-4 bg-white/90 text-[var(--foreground)] text-xs font-medium px-3 py-1.5 rounded-md hover:bg-white transition-colors flex items-center gap-1.5">
            📅 Book inspection
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-[var(--border)] mb-6">
        <div className="flex gap-0">
          {(["map", "details", "projections"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${activeTab === t ? "border-[var(--primary)] text-[var(--foreground)]" : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
            >
              {t === "map" ? "Plot map" : t === "details" ? "Estate details" : "Investment data"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left — canvas or content */}
        <div className="lg:col-span-2">
          {activeTab === "map" && (
            <div>
              <PlotCanvas
                estate={estate}
                onSelectPlot={setSelectedPlot}
                selectedPlotId={selectedPlot?.id}
                showAgisControls={true}
              />
            </div>
          )}
          {activeTab === "details" && (
            <div className="space-y-4">
              <DetailSection title="Infrastructure" items={estate.amenities} />
              <DetailSection title="Title documentation" items={[`${estate.titleType} — verified ${estate.lastVerified}`, "FCT AGIS registration confirmed", "No encroachment notices on file"]} />
              <DetailSection title="Plot types available" items={[`Standard plots: ${estate.sqmFrom} sqm`, `Edge plots: ${estate.sqmFrom + 100} sqm`, `Corner pieces: ${estate.sqmTo} sqm (${formatAmount(estate.priceTo, currency)} — premium applies)`]} />
            </div>
          )}
          {activeTab === "projections" && (
            <ProjectionTable estate={estate} currency={currency} />
          )}
        </div>

        {/* Right — plot detail panel */}
        <div>
          {selectedPlot ? (
            <PlotDetailPanel
              plot={selectedPlot}
              estate={estate}
              currency={currency}
              isSaved={isSavedPlot}
              onToggleSave={() => toggleSavedPlot(`${estate.id}:${selectedPlot.id}`)}
              onCheckout={() => navigate(`/checkout/${estate.id}/${selectedPlot.id}`)}
              onClose={() => setSelectedPlot(null)}
            />
          ) : (
            <div className="bg-[var(--muted)] rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted-foreground)]">
              <div className="text-2xl mb-2">👆</div>
              Click any available plot on the map to inspect its details and pricing.
            </div>
          )}

          {/* Inspection modal */}
          {showInspection && (
            <InspectionBooking onClose={() => setShowInspection(false)} estate={estate.name} />
          )}
        </div>
      </div>

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
            <span className="text-emerald-600 mt-0.5 shrink-0">✓</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProjectionTable({ estate, currency }: { estate: Estate; currency: any }) {
  const investmentPlots = estate.plots.filter((p) => p.status === "available-inv" && p.projectedROI).slice(0, 6);
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

function PlotDetailPanel({ plot, estate, currency, isSaved, onToggleSave, onCheckout, onClose }: any) {
  return (
    <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
        <h3 className="font-semibold text-sm">{getPlotBlockLabel(estate, plot).label}</h3>
        <button onClick={onClose} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-lg leading-none">×</button>
      </div>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Size", value: `${plot.sqm} sqm` },
            { label: "Orientation", value: plot.orientation },
            { label: "Type", value: plot.type === "corner" ? "Corner piece ★" : "Standard" },
            { label: "Status", value: plot.status === "available-dev" ? "Available (Dev)" : "Available (Inv)" },
          ].map((d) => (
            <div key={d.label} className="bg-[var(--muted)] rounded-lg p-3">
              <div className="text-xs text-[var(--muted-foreground)] mb-0.5">{d.label}</div>
              <div className="text-sm font-medium">{d.value}</div>
            </div>
          ))}
        </div>

        <div className="pt-3 border-t border-[var(--border)]">
          <div className="text-xs text-[var(--muted-foreground)] mb-0.5">Price</div>
          <div className="font-display text-2xl text-[var(--foreground)]">{formatAmount(plot.price, currency)}</div>
          {plot.type === "corner" && <div className="text-xs text-[var(--accent)] mt-0.5">Includes corner piece premium</div>}
        </div>

        {plot.projectedROI && (
          <div className="bg-blue-50 rounded-lg p-3 border border-blue-200">
            <div className="text-xs font-medium text-blue-900 mb-1">Investment projection (estimate)</div>
            <div className="text-sm text-blue-800">~{plot.projectedROI}% capital appreciation over {plot.holdingYears} years.</div>
            <div className="text-xs text-blue-600 mt-1">Not a guarantee of returns.</div>
          </div>
        )}

        <div className="flex flex-col gap-2 pt-2">
          <button onClick={onCheckout} className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
            Reserve this plot
          </button>
          <button onClick={onToggleSave} className={`w-full py-2 text-sm rounded-md border transition-colors ${isSaved ? "border-[var(--accent)] text-[var(--accent)] bg-amber-50" : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}>
            {isSaved ? "★ Saved" : "☆ Save plot"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InspectionBooking({ onClose, estate }: { onClose: () => void; estate: string }) {
  const [type, setType] = useState<"physical" | "virtual">("physical");
  const [date, setDate] = useState("");
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <div className="mt-4 bg-[var(--card)] rounded-xl border border-[var(--border)] p-5 text-center">
        <div className="text-2xl mb-2">✅</div>
        <div className="font-medium text-sm mb-1">Inspection booked</div>
        <div className="text-xs text-[var(--muted-foreground)] mb-3">An agent will contact you within 24 hours to confirm your {date} {type} visit to {estate}.</div>
        <button onClick={onClose} className="text-xs text-[var(--accent)] hover:underline">Close</button>
      </div>
    );
  }

  return (
    <div className="mt-4 bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-sm">Book an inspection</h3>
        <button onClick={onClose} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-lg">×</button>
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {(["physical", "virtual"] as const).map((t) => (
            <button key={t} onClick={() => setType(t)} className={`py-2 text-xs font-medium rounded-md border transition-colors capitalize ${type === t ? "border-[var(--primary)] bg-[var(--secondary)] text-[var(--foreground)]" : "border-[var(--border)] text-[var(--muted-foreground)]"}`}>
              {t === "physical" ? "🏗 Physical visit" : "📷 Virtual / drone"}
            </button>
          ))}
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">Preferred date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} min={new Date().toISOString().split("T")[0]} className="w-full px-3 py-2 text-sm bg-[var(--card)] border border-[var(--border)] rounded-md" />
        </div>
        <button onClick={() => date && setSubmitted(true)} disabled={!date} className="w-full py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity">
          Confirm booking
        </button>
      </div>
    </div>
  );
}
