import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { formatAmount, type OwnedPlot, type Estate } from "../../data/mockData";
import { fetchOwnedPlotById } from "../../services/portfolioService";
import { fetchEstates, fetchPriceTiers, type PriceTier } from "../../services/estatesService";
import { toListingPlot, priceForPlot, type ListingPlot } from "../../services/marketplacePlotsService";
import { useApp } from "../../contexts/AppContext";
import PlotCanvas from "../../components/PlotCanvas";

type Step = "select" | "delta" | "review" | "submitted";
type UpgradeType = "upgrade" | "migrate";

export default function Upgrade() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currency } = useApp();
  const [ownedPlot, setOwnedPlot] = useState<OwnedPlot | null | undefined>(undefined); // undefined = loading, null = not found
  const [estates, setEstates] = useState<Estate[]>([]);
  const [estatesLoading, setEstatesLoading] = useState(true);
  const [step, setStep] = useState<Step>("select");
  const [upgradeType, setUpgradeType] = useState<UpgradeType>("upgrade");
  const [selectedNewPlot, setSelectedNewPlot] = useState<ListingPlot | null>(null);
  const [selectedNewEstate, setSelectedNewEstate] = useState<string>("");
  const [targetTiers, setTargetTiers] = useState<PriceTier[]>([]);
  const [deltaPayment, setDeltaPayment] = useState<"outright" | "installment">("outright");
  const [requestStatus, setRequestStatus] = useState<"pending" | "approved" | "declined" | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!id) { setOwnedPlot(null); return; }
    let cancelled = false;
    fetchOwnedPlotById(id).then((data) => { if (!cancelled) setOwnedPlot(data ?? null); });
    fetchEstates().then((data) => { if (!cancelled) { setEstates(data); setEstatesLoading(false); } });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    const targetId = upgradeType === "migrate" ? selectedNewEstate : ownedPlot?.estateId;
    if (!targetId) { setTargetTiers([]); return; }
    let cancelled = false;
    fetchPriceTiers(targetId).then((t) => { if (!cancelled) setTargetTiers(t); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upgradeType, selectedNewEstate, ownedPlot?.estateId]);

  if (ownedPlot === undefined || estatesLoading) return <div className="p-8 text-[var(--muted-foreground)]">Loading…</div>;
  if (!ownedPlot) return <div className="p-8">Plot not found.</div>;

  const currentEstate = estates.find((e) => e.id === ownedPlot.estateId)!;
  const targetEstate = upgradeType === "migrate"
    ? estates.find((e) => e.id === selectedNewEstate) || null
    : currentEstate;
  const targetListingPlots = targetEstate ? targetEstate.plots.map((p) => toListingPlot(targetEstate.id, p)) : [];

  const newPlotPrice = targetEstate && selectedNewPlot ? priceForPlot(selectedNewPlot, targetTiers, targetEstate.cornerPremiumPct).final : 0;
  const delta = Math.max(0, newPlotPrice - ownedPlot.paidAmount);

  const handleSubmit = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setStep("submitted");
      // Simulate async approval
      setTimeout(() => setRequestStatus("pending"), 500);
    }, 900);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <nav className="text-xs text-[var(--muted-foreground)] mb-4 flex items-center gap-1.5">
        <button onClick={() => navigate(`/portfolio/${id}`)} className="hover:text-[var(--foreground)]">Portfolio</button>
        <span>/</span>
        <button onClick={() => navigate(`/portfolio/${id}`)} className="hover:text-[var(--foreground)]">{ownedPlot.plotLabel}</button>
        <span>/</span>
        <span className="text-[var(--foreground)]">Upgrade / swap</span>
      </nav>

      <h1 className="font-display text-2xl mb-1">Upgrade or swap your plot</h1>
      <p className="text-sm text-[var(--muted-foreground)] mb-6">
        Select a new plot or migrate your equity. Your paid equity of <strong className="font-mono-data">{formatAmount(ownedPlot.paidAmount, currency)}</strong> will be credited towards the new plot.
      </p>

      {/* Progress */}
      {step !== "submitted" && (
        <div className="flex gap-1 mb-6">
          {(["select", "delta", "review"] as Step[]).map((s, i) => (
            <div key={s} className={`h-1 flex-1 rounded-full ${["select", "delta", "review"].indexOf(step) >= i ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`} />
          ))}
        </div>
      )}

      {/* Step 1 — Select new plot */}
      {step === "select" && (
        <div className="space-y-6">
          {/* Current plot summary */}
          <div className="bg-[var(--muted)] rounded-xl border border-[var(--border)] p-4">
            <div className="text-xs text-[var(--muted-foreground)] mb-1">Current plot</div>
            <div className="font-semibold">{ownedPlot.estate} — {ownedPlot.plotLabel}</div>
            <div className="text-sm text-[var(--muted-foreground)]">
              {ownedPlot.sqm} sqm · Equity paid: <span className="font-mono-data font-medium text-[var(--foreground)]">{formatAmount(ownedPlot.paidAmount, currency)}</span>
            </div>
          </div>

          {/* Upgrade type */}
          <div>
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">What would you like to do?</label>
            <div className="grid sm:grid-cols-2 gap-3">
              {([
                { id: "upgrade", label: "Upgrade within same estate", desc: "Select a different plot in the same estate. Delta computed from your current equity.", icon: "⬆" },
                { id: "migrate", label: "Migrate equity to another estate", desc: "Move 100% of your equity to an eligible estate by the same company.", icon: "🔄" },
              ] as const).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => { setUpgradeType(opt.id); setSelectedNewPlot(null); setSelectedNewEstate(""); }}
                  className={`text-left p-4 rounded-xl border-2 transition-colors ${upgradeType === opt.id ? "border-[var(--primary)] bg-[var(--secondary)]" : "border-[var(--border)]"}`}
                >
                  <div className="text-xl mb-1.5">{opt.icon}</div>
                  <div className="font-semibold text-sm">{opt.label}</div>
                  <div className="text-xs text-[var(--muted-foreground)] mt-1 leading-relaxed">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* If migrate: pick estate */}
          {upgradeType === "migrate" && (
            <div>
              <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">Target estate</label>
              <div className="grid gap-2">
                {estates.filter((e) => e.id !== ownedPlot.estateId).map((e) => (
                  <button
                    key={e.id}
                    onClick={() => { setSelectedNewEstate(e.id); setSelectedNewPlot(null); }}
                    className={`text-left p-3 rounded-lg border-2 transition-colors flex items-center gap-3 ${selectedNewEstate === e.id ? "border-[var(--primary)] bg-[var(--secondary)]" : "border-[var(--border)]"}`}
                  >
                    <div className="w-12 h-12 rounded-lg overflow-hidden bg-[var(--muted)] shrink-0">
                      <img src={e.imageUrl} alt={e.name} className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <div className="font-semibold text-sm">{e.name}</div>
                      <div className="text-xs text-[var(--muted-foreground)]">{e.location} · From {formatAmount(e.priceFrom, currency)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Plot canvas */}
          {(upgradeType === "upgrade" || (upgradeType === "migrate" && selectedNewEstate)) && targetEstate && (
            <div>
              <div className="text-xs font-medium text-[var(--muted-foreground)] mb-2">
                {upgradeType === "upgrade" ? "Select your new plot" : `Select a plot in ${targetEstate.name}`}
              </div>
              <PlotCanvas
                estateId={targetEstate.id}
                plots={targetListingPlots}
                tiers={targetTiers}
                cornerPremiumPct={targetEstate.cornerPremiumPct}
                onSelectPlot={setSelectedNewPlot}
                selectedPlotId={selectedNewPlot?.id}
                showAgisControls={false}
              />
              {selectedNewPlot && (
                <div className="mt-3 p-3 bg-[var(--secondary)] rounded-lg text-sm flex items-center justify-between border border-[var(--border)]">
                  <div>
                    <span className="font-medium">Plot {selectedNewPlot.row + 1}-{selectedNewPlot.col + 1}</span>
                    <span className="text-[var(--muted-foreground)] ml-2">{selectedNewPlot.sizeSqm} sqm · {selectedNewPlot.isCorner ? "Corner ★" : "Standard"}</span>
                  </div>
                  <span className="font-mono-data font-semibold">{formatAmount(newPlotPrice, currency)}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2">
            <button onClick={() => navigate(`/portfolio/${id}`)} className="flex-1 py-2.5 border border-[var(--border)] rounded-md text-sm text-[var(--muted-foreground)]">Cancel</button>
            <button
              onClick={() => setStep("delta")}
              disabled={!selectedNewPlot}
              className="flex-[2] py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              Review delta →
            </button>
          </div>
        </div>
      )}

      {/* Step 2 — Delta calculation */}
      {step === "delta" && selectedNewPlot && (
        <div className="space-y-5">
          <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
            <h3 className="font-semibold text-sm mb-4">Equity calculation</h3>
            <div className="space-y-2 text-sm">
              <DeltaRow label="New plot price" value={formatAmount(newPlotPrice, currency)} />
              <DeltaRow label="Your equity paid" value={`− ${formatAmount(ownedPlot.paidAmount, currency)}`} color="text-emerald-700" />
              <div className="border-t border-[var(--border)] pt-2 mt-1">
                <DeltaRow label="Amount due (delta)" value={formatAmount(delta, currency)} bold />
              </div>
            </div>
            {delta === 0 && (
              <div className="mt-3 p-3 bg-emerald-50 rounded-lg text-xs text-emerald-800">
                Your equity covers the full price of the new plot — no additional payment required.
              </div>
            )}
          </div>

          {delta > 0 && (
            <div>
              <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">How would you like to pay the delta?</label>
              <div className="grid gap-2">
                {([
                  { id: "outright", label: "Pay outright", desc: `Pay ${formatAmount(delta, currency)} today.`, icon: "⚡" },
                  { id: "installment", label: "Add to installment plan", desc: "Fold the delta into a modified monthly schedule.", icon: "📅" },
                ] as const).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setDeltaPayment(opt.id)}
                    className={`text-left p-3 rounded-lg border-2 transition-colors flex items-center gap-3 ${deltaPayment === opt.id ? "border-[var(--primary)] bg-[var(--secondary)]" : "border-[var(--border)]"}`}
                  >
                    <span className="text-xl">{opt.icon}</span>
                    <div>
                      <div className="font-semibold text-sm">{opt.label}</div>
                      <div className="text-xs text-[var(--muted-foreground)]">{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="p-4 bg-[var(--muted)] rounded-xl text-xs text-[var(--muted-foreground)] leading-relaxed">
            This request will enter a developer approval queue. Once approved and the delta is paid, your old plot will be released and the new plot allocated. Old documents will be voided; new ones will be issued automatically.
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStep("select")} className="flex-1 py-2.5 border border-[var(--border)] rounded-md text-sm text-[var(--muted-foreground)]">← Back</button>
            <button onClick={() => setStep("review")} className="flex-[2] py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 transition-opacity">
              Review & submit →
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Review */}
      {step === "review" && selectedNewPlot && (
        <div className="space-y-5">
          <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
            <h3 className="font-semibold text-sm mb-4">Request summary</h3>
            <div className="space-y-1.5 text-sm">
              <DeltaRow label="From" value={`${ownedPlot.estate} — ${ownedPlot.plotLabel}`} />
              <DeltaRow label="To" value={`${targetEstate?.name} — Plot ${selectedNewPlot.row + 1}-${selectedNewPlot.col + 1}`} />
              <DeltaRow label="New size" value={`${selectedNewPlot.sizeSqm} sqm (${selectedNewPlot.isCorner ? "corner" : "standard"})`} />
              <DeltaRow label="Delta to pay" value={formatAmount(delta, currency)} bold />
              <DeltaRow label="Payment method" value={delta === 0 ? "No payment required" : deltaPayment === "outright" ? "Outright" : "Modified installment"} />
            </div>
          </div>

          <div className="text-xs text-[var(--muted-foreground)] space-y-1 leading-relaxed">
            <p>By submitting, you acknowledge that:</p>
            <ul className="list-disc list-inside space-y-0.5 ml-1">
              <li>This request requires developer approval before any documents are reissued.</li>
              <li>Your current plot remains allocated until the upgrade is complete.</li>
              <li>Your current deed will be watermarked void/re-allocated once the upgrade completes.</li>
              <li>A new allocation letter referencing your original transaction will be issued.</li>
            </ul>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStep("delta")} className="flex-1 py-2.5 border border-[var(--border)] rounded-md text-sm text-[var(--muted-foreground)]">← Back</button>
            <button onClick={handleSubmit} disabled={loading} className="flex-[2] py-2.5 bg-[var(--accent)] text-white rounded-md text-sm font-semibold disabled:opacity-60 hover:opacity-90 transition-opacity">
              {loading ? "Submitting…" : "Submit upgrade request"}
            </button>
          </div>
        </div>
      )}

      {/* Submitted */}
      {step === "submitted" && (
        <div className="text-center py-10">
          <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-5 text-3xl">📋</div>
          <h2 className="font-display text-2xl mb-2">Request submitted</h2>
          <p className="text-sm text-[var(--muted-foreground)] max-w-sm mx-auto mb-6">
            Your upgrade request is now in the developer approval queue. You'll be notified by email and in-app when a decision is made.
          </p>

          {/* Status tracker */}
          <div className="inline-flex flex-col gap-2 text-left mb-8">
            {[
              { label: "Request submitted", done: true },
              { label: "Developer review", done: false, active: true },
              { label: "Delta payment (if approved)", done: false },
              { label: "Documents reissued", done: false },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-2.5 text-sm">
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs shrink-0 ${s.done ? "bg-emerald-500 text-white" : s.active ? "bg-amber-500 text-white" : "bg-[var(--border)] text-[var(--muted-foreground)]"}`}>
                  {s.done ? "✓" : s.active ? "…" : "○"}
                </span>
                <span className={s.done ? "text-emerald-700" : s.active ? "text-amber-700 font-medium" : "text-[var(--muted-foreground)]"}>{s.label}</span>
              </div>
            ))}
          </div>

          <div className="flex gap-3 justify-center">
            <button onClick={() => navigate(`/portfolio/${id}`)} className="px-5 py-2.5 border border-[var(--border)] rounded-md text-sm font-medium hover:bg-[var(--muted)] transition-colors">
              Back to plot
            </button>
            <button onClick={() => navigate("/portfolio")} className="px-5 py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 transition-opacity">
              Go to portfolio
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DeltaRow({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--muted-foreground)]">{label}</span>
      <span className={`font-mono-data ${bold ? "font-bold text-base" : ""} ${color || ""}`}>{value}</span>
    </div>
  );
}
