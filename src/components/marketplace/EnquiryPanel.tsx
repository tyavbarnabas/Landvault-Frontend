// Lightweight enquiry form/panel — Part 4 of the buyer flow. Opened from
// PlotDetailPanel's "Enquire" CTA. Deliberately a panel, not a full checkout-
// style route, per spec ("Lightweight form or panel").

import { useState } from "react";
import { createEnquiry, whatsappHandoffUrl, type EnquiryContactMethod } from "../../services/enquiryService";
import type { Listing } from "../../services/marketplaceService";
import type { ListingPlot } from "../../services/marketplacePlotsService";
import { plotLabel } from "../../services/marketplacePlotsService";
import { Link } from "react-router-dom";

interface EnquiryPanelProps {
  listing: Listing;
  plot?: ListingPlot;
  onClose: () => void;
}

export default function EnquiryPanel({ listing, plot, onClose }: EnquiryPanelProps) {
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState<EnquiryContactMethod>("in_app");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSubmitting(true);
    await createEnquiry({ listingId: listing.id, listingName: listing.name, plotId: plot?.id, message, preferredContact: contact });
    setSubmitting(false);
    setSubmitted(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true" aria-label="Enquire about this estate">
      <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-6 max-w-md w-full shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-sm">Enquire — {listing.name}{plot ? ` · ${plotLabel(plot)}` : ""}</h3>
          <button onClick={onClose} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-lg leading-none" aria-label="Close">×</button>
        </div>

        {submitted ? (
          <div className="text-center py-6">
            <div className="text-2xl mb-2">✅</div>
            <div className="font-medium text-sm mb-1">Enquiry sent</div>
            <p className="text-xs text-[var(--muted-foreground)] mb-4">{listing.seller.branchName}'s sales team will respond via {contact === "in_app" ? "in-app message" : contact === "whatsapp" ? "WhatsApp" : "phone"}, usually within a business day.</p>
            <div className="flex gap-2 justify-center">
              <Link to="/enquiries" className="text-xs px-3 py-1.5 border border-[var(--border)] rounded-md hover:bg-[var(--muted)]">View my enquiries</Link>
              <button onClick={onClose} className="text-xs px-3 py-1.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:opacity-90">Close</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Your message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder="Ask about pricing, title, availability, or anything else…"
                className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md bg-[var(--card)] resize-none"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Preferred contact method</label>
              <div className="grid grid-cols-2 gap-2">
                {([{ id: "in_app", label: "In-app message" }, { id: "whatsapp", label: "WhatsApp" }] as const).map((opt) => (
                  <button key={opt.id} type="button" onClick={() => setContact(opt.id)} className={`py-2 text-xs font-medium rounded-md border transition-colors ${contact === opt.id ? "border-[var(--primary)] bg-[var(--secondary)] text-[var(--foreground)]" : "border-[var(--border)] text-[var(--muted-foreground)]"}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {contact === "whatsapp" && (
              <p className="text-xs text-[var(--muted-foreground)]">
                We'll still log this enquiry in-app. You can also{" "}
                <a href={whatsappHandoffUrl(listing.name, plot ? plotLabel(plot) : undefined)} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline">
                  message the seller on WhatsApp directly
                </a>.
              </p>
            )}
            <button type="submit" disabled={submitting || !message.trim()} className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity">
              {submitting ? "Sending…" : "Send enquiry"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
