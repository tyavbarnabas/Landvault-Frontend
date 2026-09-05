// Route: /inspections/new?listingId=&plotId= — Part 3 of the buyer flow.
// No sidebar — a focused flow continuing straight out of the marketplace,
// same convention as the existing /checkout route.

import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { fetchListingById, type Listing } from "../../services/marketplaceService";
import { fetchPlotById, type ListingPlot, plotLabel } from "../../services/marketplacePlotsService";
import { createInspection, type Inspection } from "../../services/inspectionService";
import InspectionForm, { type InspectionFormValue } from "../../components/inspections/InspectionForm";

export default function NewInspection() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const listingId = searchParams.get("listingId");
  const plotId = searchParams.get("plotId");

  const [listing, setListing] = useState<Listing | null | undefined>(undefined);
  const [plot, setPlot] = useState<ListingPlot | null | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [booked, setBooked] = useState<Inspection | null>(null);

  useEffect(() => {
    if (!listingId || !plotId) { setListing(null); setPlot(null); return; }
    let cancelled = false;
    fetchListingById(listingId).then((l) => { if (!cancelled) setListing(l ?? null); });
    fetchPlotById(listingId, plotId).then((p) => { if (!cancelled) setPlot(p ?? null); });
    return () => { cancelled = true; };
  }, [listingId, plotId]);

  if (listing === undefined || plot === undefined) return <div className="p-8 text-[var(--muted-foreground)] text-sm">Loading…</div>;
  if (!listing || !plot) return <div className="p-8 text-[var(--muted-foreground)] text-sm">Plot not found. <Link to="/marketplace" className="text-[var(--accent)] hover:underline">Back to marketplace</Link></div>;

  const handleSubmit = async (value: InspectionFormValue) => {
    setSubmitting(true);
    const inspection = await createInspection({
      listingId: listing.id,
      listingName: listing.name,
      plotId: plot.id,
      plotLabel: plotLabel(plot),
      sellerBranchName: listing.seller.branchName,
      type: value.type,
      date: value.date,
      timeSlot: value.timeSlot,
      note: value.note || undefined,
    });
    setSubmitting(false);
    setBooked(inspection);
  };

  return (
    <div className="min-h-full bg-[var(--background)] py-8 px-4">
      <div className="max-w-lg mx-auto">
        <button onClick={() => navigate(-1)} className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] mb-6">← Back</button>

        {!booked ? (
          <>
            <h1 className="font-display text-2xl mb-1">Book an inspection</h1>
            <p className="text-sm text-[var(--muted-foreground)] mb-6">{listing.name} — {plotLabel(plot)} · {plot.sizeSqm} sqm</p>

            <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
              This plot stays open to other buyers during your inspection — it isn't held. Save the estate to your wishlist to track it, then reserve when you're ready.
            </div>

            <InspectionForm onSubmit={handleSubmit} submitting={submitting} />
          </>
        ) : (
          <div className="text-center py-6">
            <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6 text-3xl">✅</div>
            <h2 className="font-display text-2xl mb-2">Inspection booked</h2>
            <p className="text-sm text-[var(--muted-foreground)] max-w-sm mx-auto mb-6">
              Your {booked.type === "physical" ? "physical visit" : "virtual tour"} to {listing.name} ({booked.plotLabel}) is confirmed for {booked.date} at {booked.timeSlot}.
            </p>

            <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 text-left mb-6 space-y-2 text-sm">
              <Row label="Assigned agent" value={booked.agent.name} />
              <Row label="Agent phone" value={booked.agent.phone} mono />
              <Row label="Date & time" value={`${booked.date} · ${booked.timeSlot}`} mono />
              {booked.meetingPoint && <Row label="Meeting point" value={booked.meetingPoint} />}
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 mb-6 text-left">
              This plot is not held for you during the inspection period — it remains open to other buyers. Return here to reserve it once you've decided.
            </div>

            <div className="flex gap-3">
              <Link to="/inspections" className="flex-1 py-2.5 border border-[var(--border)] rounded-md text-sm font-medium hover:bg-[var(--muted)] transition-colors text-center">View my inspections</Link>
              <button onClick={() => navigate(`/marketplace/${listing.id}/plots?size=${plot.sizeSqm}&plot=${plot.id}`)} className="flex-1 py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 transition-opacity">
                Back to plot
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[var(--muted-foreground)]">{label}</span>
      <span className={mono ? "font-mono-data" : ""}>{value}</span>
    </div>
  );
}
