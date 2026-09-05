import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { fetchMyInspections, cancelInspection, rescheduleInspection, type Inspection } from "../../services/inspectionService";
import InspectionForm, { type InspectionFormValue } from "../../components/inspections/InspectionForm";

const STATUS_STYLES: Record<Inspection["status"], string> = {
  scheduled: "bg-blue-50 text-blue-700 border-blue-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelled: "bg-[var(--muted)] text-[var(--muted-foreground)] border-[var(--border)]",
};

export default function Inspections() {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);

  const load = () => fetchMyInspections().then((data) => { setInspections(data); setLoading(false); });

  useEffect(() => { load(); }, []);

  const handleCancel = async (id: string) => {
    await cancelInspection(id);
    load();
  };

  const handleReschedule = async (id: string, value: InspectionFormValue) => {
    await rescheduleInspection(id, value.date, value.timeSlot);
    setReschedulingId(null);
    load();
  };

  if (loading) return <div className="p-8 text-[var(--muted-foreground)] text-sm">Loading inspections…</div>;

  const upcoming = inspections.filter((i) => i.status === "scheduled");
  const past = inspections.filter((i) => i.status !== "scheduled");

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">My inspections</h1>
        <p className="text-sm text-[var(--muted-foreground)]">Physical and virtual site visits you've booked. Plots aren't held during an inspection — reserve when you're ready.</p>
      </div>

      {inspections.length === 0 ? (
        <div className="text-center py-12 text-[var(--muted-foreground)]">
          <div className="text-3xl mb-2">📅</div>
          No inspections booked yet.
          <div className="mt-4">
            <Link to="/marketplace" className="text-sm text-[var(--accent)] hover:underline">Browse the marketplace →</Link>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {upcoming.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Upcoming</h2>
              <div className="space-y-3">
                {upcoming.map((insp) => (
                  <div key={insp.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4">
                    <InspectionRow insp={insp} onCancel={() => handleCancel(insp.id)} onReschedule={() => setReschedulingId(reschedulingId === insp.id ? null : insp.id)} />
                    {reschedulingId === insp.id && (
                      <div className="mt-4 pt-4 border-t border-[var(--border)]">
                        <InspectionForm submitLabel="Confirm new date" onSubmit={(v) => handleReschedule(insp.id, v)} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Past & cancelled</h2>
              <div className="space-y-3">
                {past.map((insp) => (
                  <div key={insp.id} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 opacity-75">
                    <InspectionRow insp={insp} />
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function InspectionRow({ insp, onCancel, onReschedule }: { insp: Inspection; onCancel?: () => void; onReschedule?: () => void }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="font-medium text-sm text-[var(--foreground)]">{insp.listingName} — {insp.plotLabel}</div>
        <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{insp.type === "physical" ? "🏗 Physical visit" : "📷 Virtual / drone tour"} · {insp.date} · {insp.timeSlot}</div>
        <div className="text-xs text-[var(--muted-foreground)] mt-0.5">Agent: {insp.agent.name} · {insp.agent.phone}</div>
      </div>
      <div className="flex flex-col items-end gap-2 shrink-0">
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full border capitalize ${STATUS_STYLES[insp.status]}`}>{insp.status}</span>
        {insp.status === "scheduled" && (
          <div className="flex gap-2">
            <button onClick={onReschedule} className="text-xs text-[var(--accent)] hover:underline">Reschedule</button>
            <button onClick={onCancel} className="text-xs text-red-600 hover:underline">Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}
