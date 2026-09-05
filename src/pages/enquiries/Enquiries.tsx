import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { fetchMyEnquiries, type Enquiry } from "../../services/enquiryService";

const STATUS_STYLES: Record<Enquiry["status"], string> = {
  open: "bg-blue-50 text-blue-700 border-blue-200",
  answered: "bg-emerald-50 text-emerald-700 border-emerald-200",
  closed: "bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]",
};

export default function Enquiries() {
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchMyEnquiries().then((data) => { if (!cancelled) { setEnquiries(data); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="p-8 text-[var(--muted-foreground)] text-sm">Loading enquiries…</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">My enquiries</h1>
        <p className="text-sm text-[var(--muted-foreground)]">Questions you've sent to sellers, and their replies.</p>
      </div>

      {enquiries.length === 0 ? (
        <div className="text-center py-12 text-[var(--muted-foreground)]">
          <div className="text-3xl mb-2">💬</div>
          No enquiries yet. Ask a question from any estate's plot detail panel in the marketplace.
          <div className="mt-4">
            <Link to="/marketplace" className="text-sm text-[var(--accent)] hover:underline">Browse the marketplace →</Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {enquiries.map((enq) => (
            <div key={enq.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
              <div className="flex items-start justify-between gap-3 mb-2">
                <div>
                  <div className="font-medium text-sm text-[var(--foreground)]">{enq.listingName}</div>
                  <div className="text-xs text-[var(--muted-foreground)] font-mono-data">{new Date(enq.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>
                </div>
                <span className={`text-xs font-medium px-2.5 py-1 rounded-full border capitalize shrink-0 ${STATUS_STYLES[enq.status]}`}>{enq.status}</span>
              </div>
              <div className="space-y-2">
                {enq.messages.map((m) => (
                  <div key={m.id} className={`text-sm rounded-lg px-3 py-2 max-w-md ${m.author === "buyer" ? "bg-[var(--secondary)] ml-auto text-right" : "bg-[var(--muted)]"}`}>
                    {m.body}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
