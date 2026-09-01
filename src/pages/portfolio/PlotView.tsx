import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { formatAmount, type OwnedPlot, type Document } from "../../data/mockData";
import { fetchOwnedPlotById, recordPayment } from "../../services/portfolioService";
import { fetchDocumentsByPlotId } from "../../services/documentsService";
import { useApp } from "../../contexts/AppContext";

type Tab = "overview" | "payments" | "construction" | "documents";

export default function PlotView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currency } = useApp();
  const [plot, setPlot] = useState<OwnedPlot | null | undefined>(undefined); // undefined = loading, null = not found
  const [docs, setDocs] = useState<Document[]>([]);
  const [tab, setTab] = useState<Tab>("overview");
  const [payAmount, setPayAmount] = useState("");
  const [payLoading, setPayLoading] = useState(false);
  const [paySuccess, setPaySuccess] = useState(false);

  useEffect(() => {
    if (!id) { setPlot(null); return; }
    let cancelled = false;
    fetchOwnedPlotById(id).then((data) => { if (!cancelled) setPlot(data ?? null); });
    fetchDocumentsByPlotId(id).then((data) => { if (!cancelled) setDocs(data); });
    return () => { cancelled = true; };
  }, [id]);

  if (plot === undefined) return <div className="p-8 text-[var(--muted-foreground)]">Loading plot…</div>;
  if (plot === null) return <div className="p-8">Plot not found.</div>;

  const pct = Math.round((plot.paidAmount / plot.totalPrice) * 100);

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault();
    setPayLoading(true);
    try {
      const amount = Number(payAmount) || plot.nextDueAmount || 0;
      await recordPayment(plot.id, amount);
      setPaySuccess(true);
    } finally {
      setPayLoading(false);
    }
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "payments", label: "Payments" },
    { id: "construction", label: "Construction" },
    { id: "documents", label: "Documents" },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <nav className="text-xs text-[var(--muted-foreground)] mb-4 flex items-center gap-1.5">
        <button onClick={() => navigate("/portfolio")} className="hover:text-[var(--foreground)]">Portfolio</button>
        <span>/</span>
        <span className="text-[var(--foreground)]">{plot.plotLabel}</span>
      </nav>

      <div className="flex flex-wrap items-start gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <h1 className="font-display text-2xl text-[var(--foreground)]">{plot.estate}</h1>
          <p className="text-sm text-[var(--muted-foreground)]">{plot.plotLabel} · {plot.sqm} sqm · {plot.location}</p>
        </div>
        <span className={`text-xs font-medium px-3 py-1.5 rounded-full border ${plot.status === "completed" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
          {plot.status === "completed" ? "Paid off" : "Active plan"}
        </span>
      </div>

      {/* Tab bar */}
      <div className="border-b border-[var(--border)] mb-6">
        <div className="flex gap-0">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? "border-[var(--primary)] text-[var(--foreground)]" : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Overview tab */}
      {tab === "overview" && (
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            {/* Equity card */}
            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
              <h3 className="font-semibold text-sm mb-4">Equity position</h3>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <Stat label="Total price" value={formatAmount(plot.totalPrice, currency)} />
                <Stat label="Paid" value={formatAmount(plot.paidAmount, currency)} green />
                <Stat label="Outstanding" value={formatAmount(plot.totalPrice - plot.paidAmount, currency)} />
              </div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-[var(--muted-foreground)]">Equity paid</span>
                <span className="font-mono-data font-medium">{pct}%</span>
              </div>
              <div className="h-3 bg-[var(--muted)] rounded-full overflow-hidden">
                <div className="h-full bg-[var(--primary)] rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              {plot.installmentMonths && plot.installmentsPaid !== undefined && (
                <div className="mt-2 text-xs text-[var(--muted-foreground)]">
                  Installment {plot.installmentsPaid} of {plot.installmentMonths} paid · {plot.installmentMonths - plot.installmentsPaid} remaining
                </div>
              )}
            </div>

            {/* Upcoming schedule */}
            {plot.nextDueDate && (
              <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
                <h3 className="font-semibold text-sm mb-4">Upcoming schedule</h3>
                <div className="space-y-2">
                  {Array.from({ length: Math.min(4, (plot.installmentMonths || 1) - (plot.installmentsPaid || 0)) }, (_, i) => {
                    const dueDate = new Date(plot.nextDueDate!);
                    dueDate.setMonth(dueDate.getMonth() + i);
                    return (
                      <div key={i} className={`flex items-center justify-between py-2.5 px-3 rounded-lg ${i === 0 ? "bg-amber-50 border border-amber-200" : "bg-[var(--muted)]"}`}>
                        <div>
                          <div className="text-sm font-medium">Installment {(plot.installmentsPaid || 0) + i + 1}</div>
                          <div className="text-xs font-mono-data text-[var(--muted-foreground)]">{dueDate.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono-data font-semibold text-sm">{formatAmount(plot.nextDueAmount!, currency)}</div>
                          {i === 0 && <span className="text-xs text-amber-700 font-medium">Due soon</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Plot details */}
            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
              <h3 className="font-semibold text-sm mb-3">Plot details</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  { label: "Estate", value: plot.estate },
                  { label: "Reference", value: plot.plotLabel },
                  { label: "Size", value: `${plot.sqm} sqm` },
                  { label: "Intent", value: plot.intent === "development" ? "Development" : "Investment" },
                  { label: "Plan", value: plot.plan === "outright" ? "Outright" : `${plot.installmentMonths}-month installment` },
                  { label: "Acquired", value: plot.acquiredDate },
                ].map((d) => (
                  <div key={d.label} className="bg-[var(--muted)] rounded-lg p-3">
                    <div className="text-xs text-[var(--muted-foreground)] mb-0.5">{d.label}</div>
                    <div className="font-medium text-xs">{d.value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right sidebar */}
          <div className="space-y-4">
            {/* Make a payment */}
            {plot.status === "active" && (
              <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
                <h3 className="font-semibold text-sm mb-4">Make a payment</h3>
                {paySuccess ? (
                  <div className="text-center py-4">
                    <div className="text-2xl mb-2">✅</div>
                    <div className="text-sm font-medium">Payment confirmed</div>
                    <div className="text-xs text-[var(--muted-foreground)] mt-1">Receipt added to your vault.</div>
                  </div>
                ) : (
                  <form onSubmit={handlePay} className="space-y-3">
                    <div className="bg-[var(--muted)] rounded-lg p-3">
                      <div className="text-xs text-[var(--muted-foreground)]">Next due</div>
                      <div className="font-semibold font-mono-data">{formatAmount(plot.nextDueAmount!, currency)}</div>
                      <div className="text-xs font-mono-data text-[var(--muted-foreground)]">{plot.nextDueDate}</div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">Amount (NGN)</label>
                      <input
                        type="number"
                        placeholder={String(plot.nextDueAmount)}
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md bg-[var(--card)] font-mono-data"
                      />
                    </div>
                    <button type="submit" disabled={payLoading} className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium disabled:opacity-60 hover:opacity-90 transition-opacity">
                      {payLoading ? "Processing…" : "Pay now"}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
              <h3 className="font-semibold text-sm mb-3">Actions</h3>
              <div className="space-y-2">
                <Link to={`/upgrade/${plot.id}`} className="flex items-center gap-2 w-full py-2 text-left text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)] rounded-md px-3 transition-colors">
                  🔁 Upgrade or swap plot
                </Link>
                {plot.intent === "investment" && (
                  <Link to={`/resale/list/${plot.id}`} className="flex items-center gap-2 w-full py-2 text-left text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)] rounded-md px-3 transition-colors">
                    🏷 List for resale
                  </Link>
                )}
                <Link to={`/support?dispute=true&plot=${plot.id}`} className="flex items-center gap-2 w-full py-2 text-left text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)] rounded-md px-3 transition-colors">
                  💬 Raise a dispute
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payments tab */}
      {tab === "payments" && (
        <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border)]">
            <h3 className="font-semibold text-sm">Payment history</h3>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">Every payment is logged and immutable. Download any receipt from your vault.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--muted)]">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-[var(--muted-foreground)]">Date</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-[var(--muted-foreground)]">Type</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-[var(--muted-foreground)]">Amount</th>
                  <th className="text-center px-4 py-2.5 text-xs font-medium text-[var(--muted-foreground)]">Status</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-[var(--muted-foreground)]">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {plot.payments.map((p) => (
                  <tr key={p.id} className="border-t border-[var(--border)] hover:bg-[var(--muted)]/50">
                    <td className="px-4 py-3 font-mono-data text-xs">{p.date}</td>
                    <td className="px-4 py-3 text-xs capitalize">{p.type}</td>
                    <td className="px-4 py-3 text-right font-mono-data text-xs font-medium">{formatAmount(p.amount, currency)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${p.status === "confirmed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link to="/documents" className="text-xs text-[var(--accent)] hover:underline font-mono-data">{p.receiptId}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--border)] bg-[var(--muted)]">
                  <td colSpan={2} className="px-4 py-3 text-xs font-semibold">Total paid</td>
                  <td className="px-4 py-3 text-right font-mono-data text-xs font-bold">{formatAmount(plot.paidAmount, currency)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Construction tab */}
      {tab === "construction" && (
        <ConstructionTab estateId={plot.estateId} />
      )}

      {/* Documents tab */}
      {tab === "documents" && (
        <div className="space-y-3">
          {docs.length === 0 ? (
            <div className="text-center py-12 text-[var(--muted-foreground)]">
              <div className="text-3xl mb-2">📂</div>
              No documents yet. They'll appear here as they're issued.
            </div>
          ) : (
            docs.map((doc) => (
              <div key={doc.id} className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-[var(--muted)] flex items-center justify-center text-xl shrink-0">
                  {docIcon(doc.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm mb-0.5">{doc.title}</div>
                  <div className="flex gap-2 items-center text-xs text-[var(--muted-foreground)]">
                    <span className="font-mono-data">{doc.date}</span>
                    <span>·</span>
                    <span>{doc.size}</span>
                    <span>·</span>
                    <span className={doc.status === "valid" ? "text-emerald-700 font-medium" : "text-red-600 font-medium"}>
                      {doc.status === "valid" ? "✓ Valid" : "✗ " + doc.status}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button className="text-xs px-3 py-1.5 bg-[var(--muted)] hover:bg-[var(--secondary)] rounded-md transition-colors">
                    ↓ Download
                  </button>
                  <Link to="/documents" className="text-xs px-3 py-1.5 border border-[var(--border)] rounded-md text-[var(--muted-foreground)] hover:text-[var(--accent)] transition-colors">
                    Verify QR
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ConstructionTab({ estateId }: { estateId: string }) {
  const MILESTONES = [
    { label: "Site clearing", pct: 100, date: "Mar 2024", icon: "🌿" },
    { label: "Perimeter fencing", pct: 100, date: "Jun 2024", icon: "🧱" },
    { label: "Road grading & base course", pct: 78, date: "In progress", icon: "🛣" },
    { label: "Drainage system", pct: 55, date: "In progress", icon: "💧" },
    { label: "Solar street lighting", pct: 30, date: "Est. Q4 2026", icon: "💡" },
    { label: "Electrification", pct: 0, date: "Est. Q1 2027", icon: "⚡" },
  ];

  const UPDATES = [
    { date: "20 Aug 2026", title: "Road grading update", body: "Northern section road grading at 78%. Laterite compaction complete on 14 of 18 internal roads. On track for November completion.", img: "photo-1504307651254-35680f356dfd" },
    { date: "12 Jul 2026", title: "Drainage installation", body: "Phase 1 drainage trenching complete. Pipes laid on eastern grid. Phase 2 (western) begins next week.", img: "photo-1544947950-fa07a98d237f" },
    { date: "3 Jun 2026", title: "Fencing milestone complete", body: "Perimeter fencing 100% complete across all 1.2km of the estate boundary. Gates installed at all 3 entry points.", img: "photo-1581578731548-c64695cc6952" },
  ];

  return (
    <div className="space-y-6">
      {/* Infrastructure progress */}
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
        <h3 className="font-semibold text-sm mb-4">Infrastructure completion</h3>
        <div className="space-y-4">
          {MILESTONES.map((m) => (
            <div key={m.label}>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <div className="flex items-center gap-2">
                  <span>{m.icon}</span>
                  <span className="font-medium">{m.label}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[var(--muted-foreground)] font-mono-data">{m.date}</span>
                  <span className={`font-mono-data text-xs font-semibold ${m.pct === 100 ? "text-emerald-700" : m.pct > 0 ? "text-amber-700" : "text-[var(--muted-foreground)]"}`}>
                    {m.pct}%
                  </span>
                </div>
              </div>
              <div className="h-2 bg-[var(--muted)] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${m.pct === 100 ? "bg-emerald-500" : m.pct > 0 ? "bg-amber-500" : "bg-[var(--border)]"}`}
                  style={{ width: `${m.pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-[var(--border)] flex items-center justify-between text-xs text-[var(--muted-foreground)]">
          <span>Overall completion</span>
          <span className="font-mono-data font-semibold text-[var(--foreground)]">
            {Math.round(MILESTONES.reduce((s, m) => s + m.pct, 0) / MILESTONES.length)}%
          </span>
        </div>
      </div>

      {/* Drone updates */}
      <div>
        <h3 className="font-semibold text-sm mb-4">Site updates</h3>
        <div className="space-y-4">
          {UPDATES.map((u) => (
            <div key={u.date} className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden flex gap-0 flex-col sm:flex-row">
              <div className="sm:w-48 shrink-0 aspect-video sm:aspect-auto bg-[var(--muted)]">
                <img
                  src={`https://images.unsplash.com/${u.img}?w=300&h=180&fit=crop&auto=format`}
                  alt={u.title}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="p-4 flex-1">
                <div className="text-xs font-mono-data text-[var(--muted-foreground)] mb-1">{u.date}</div>
                <div className="font-semibold text-sm mb-1.5">{u.title}</div>
                <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">{u.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, green }: { label: string; value: string; green?: boolean }) {
  return (
    <div>
      <div className="text-xs text-[var(--muted-foreground)] mb-0.5">{label}</div>
      <div className={`font-semibold font-mono-data text-sm ${green ? "text-emerald-700" : ""}`}>{value}</div>
    </div>
  );
}

function docIcon(type: string) {
  const icons: Record<string, string> = { receipt: "🧾", offer_letter: "📝", allocation_letter: "📄", deed_of_assignment: "📜", poa_draft: "🔏" };
  return icons[type] || "📄";
}
