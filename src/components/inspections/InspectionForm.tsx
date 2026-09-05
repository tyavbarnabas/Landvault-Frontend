// Reusable inspection-booking form — used by NewInspection.tsx and could be
// reused for a reschedule flow later without duplicating the field layout.

import { useState } from "react";
import { availableSlotsForDate, type InspectionType } from "../../services/inspectionService";
import { useApp } from "../../contexts/AppContext";

export interface InspectionFormValue {
  type: InspectionType;
  date: string;
  timeSlot: string;
  note: string;
}

interface InspectionFormProps {
  onSubmit: (value: InspectionFormValue) => void;
  submitting?: boolean;
  submitLabel?: string;
}

export default function InspectionForm({ onSubmit, submitting, submitLabel = "Confirm booking" }: InspectionFormProps) {
  const { user } = useApp();
  const [type, setType] = useState<InspectionType>("physical");
  const [date, setDate] = useState("");
  const [timeSlot, setTimeSlot] = useState("");
  const [note, setNote] = useState("");

  const minDate = new Date().toISOString().split("T")[0];
  const slots = date ? availableSlotsForDate(date) : [];

  const handleDateChange = (v: string) => {
    setDate(v);
    setTimeSlot("");
  };

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (date && timeSlot) onSubmit({ type, date, timeSlot, note }); }}
      className="space-y-4"
    >
      <div>
        <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Inspection type</label>
        <div className="grid grid-cols-2 gap-2">
          {(["physical", "virtual"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setType(t)} className={`py-2.5 text-sm font-medium rounded-md border-2 transition-colors ${type === t ? "border-[var(--primary)] bg-[var(--secondary)] text-[var(--foreground)]" : "border-[var(--border)] text-[var(--muted-foreground)]"}`}>
              {t === "physical" ? "🏗 Physical visit" : "📷 Virtual / drone tour"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Preferred date</label>
        <input type="date" value={date} onChange={(e) => handleDateChange(e.target.value)} min={minDate} required className="w-full px-3 py-2.5 text-sm bg-[var(--card)] border border-[var(--border)] rounded-md" />
      </div>

      {date && (
        <div>
          <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Available time slots</label>
          {slots.length === 0 ? (
            <p className="text-xs text-[var(--muted-foreground)]">Fully booked on this date — try another day.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {slots.map((s) => (
                <button key={s} type="button" onClick={() => setTimeSlot(s)} className={`py-2 text-xs font-medium rounded-md border transition-colors ${timeSlot === s ? "border-[var(--primary)] bg-[var(--secondary)] text-[var(--foreground)]" : "border-[var(--border)] text-[var(--muted-foreground)]"}`}>
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Note to the agent (optional)</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Anything the agent should know before your visit…" className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md bg-[var(--card)] resize-none" />
      </div>

      <div className="bg-[var(--muted)] rounded-lg p-3 text-xs text-[var(--muted-foreground)]">
        <div className="font-medium text-[var(--foreground)] mb-1">Contact confirmation</div>
        We'll confirm this booking to {user?.name} at {user?.phone} ({user?.email}).
      </div>

      <button type="submit" disabled={submitting || !date || !timeSlot} className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity">
        {submitting ? "Booking…" : submitLabel}
      </button>
    </form>
  );
}
