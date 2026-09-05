import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { formatAmount, type OwnedPlot, type Estate } from "../../data/mockData";
import { fetchOwnedPlotById } from "../../services/portfolioService";
import { fetchEstates, fetchPriceTiers, type PriceTier } from "../../services/estatesService";
import { toListingPlot, priceForPlot, type ListingPlot } from "../../services/marketplacePlotsService";
import {
  getUpgradeEligibility, computeUpgradeQuote, requestUpgrade, fetchUpgradeRequest, fetchUpgradeRequestForPlot,
  type UpgradeQuote, type UpgradeRequest, type DeltaPaymentMethod,
} from "../../services/upgradeService";
import { paymentMethodsForCountry } from "../../services/marketplaceCheckoutService";
import { useApp } from "../../contexts/AppContext";
import PlotCanvas from "../../components/PlotCanvas";
import PaymentMethodSelector from "../../components/checkout/PaymentMethodSelector";
import UpgradeProgress from "../../components/upgrade/UpgradeProgress";

type Step = "select" | "delta" | "review";
type UpgradeType = "upgrade" | "migrate";
const INSTALLMENT_OPTIONS = [6, 9, 12, 18, 24];

export default function Upgrade() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currency, user } = useApp();
  const [ownedPlot, setOwnedPlot] = useState<OwnedPlot | null | undefined>(undefined); // undefined = loading, null = not found
  const [estates, setEstates] = useState<Estate[]>([]);
  const [estatesLoading, setEstatesLoading] = useState(true);
  const [inFlightRequest, setInFlightRequest] = useState<UpgradeRequest | null | undefined>(undefined); // undefined = not checked yet

  const [step, setStep] = useState<Step>("select");
  const [upgradeType, setUpgradeType] = useState<UpgradeType>("upgrade");
  const [selectedNewPlot, setSelectedNewPlot] = useState<ListingPlot | null>(null);
  const [selectedNewEstate, setSelectedNewEstate] = useState<string>("");
  const [targetTiers, setTargetTiers] = useState<PriceTier[]>([]);
  const [deltaPaymentMethod, setDeltaPaymentMethod] = useState<DeltaPaymentMethod>("outright");
  const [installmentMonths, setInstallmentMonths] = useState(12);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!id) { setOwnedPlot(null); return; }
    let cancelled = false;
    fetchOwnedPlotById(id).then((data) => { if (!cancelled) setOwnedPlot(data ?? null); });
    fetchEstates().then((data) => { if (!cancelled) { setEstates(data); setEstatesLoading(false); } });
    fetchUpgradeRequestForPlot(id).then((req) => { if (!cancelled) setInFlightRequest(req ?? null); });
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

  if (ownedPlot === undefined || estatesLoading || inFlightRequest === undefined) {
    return <div className="p-8 text-[var(--muted-foreground)]">Loading…</div>;
  }
  if (!ownedPlot) return <div className="p-8">Plot not found.</div>;

  const eligibility = getUpgradeEligibility(ownedPlot);
  if (!eligibility.eligible) {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <div className="text-sm font-semibold text-red-900 mb-1">This plot can't start an upgrade right now</div>
          <p className="text-xs text-red-800 mb-4">{eligibility.reason}</p>
          <div className="flex flex-col gap-2 items-start">
            {ownedPlot.status === "in_arrears" && (
              <Link to={`/portfolio/${ownedPlot.id}`} className="text-xs font-medium text-red-800 hover:underline">Request restructuring →</Link>
            )}
            {ownedPlot.status === "upgrade_pending" && inFlightRequest && (
              <Link to={`/upgrade/request/${inFlightRequest.id}`} className="text-xs font-medium text-red-800 hover:underline">View upgrade progress →</Link>
            )}
            <Link to={`/portfolio/${ownedPlot.id}`} className="text-xs font-medium text-red-800 hover:underline">Back to plot →</Link>
          </div>
        </div>
      </div>
    );
  }

  const currentEstate = estates.find((e) => e.id === ownedPlot.estateId)!;
  const targetEstate = upgradeType === "migrate"
    ? estates.find((e) => e.id === selectedNewEstate) || null
    : currentEstate;
  const targetListingPlots = targetEstate ? targetEstate.plots.map((p) => toListingPlot(targetEstate.id, p)) : [];

  const quote: UpgradeQuote | null = targetEstate && selectedNewPlot
    ? computeUpgradeQuote(ownedPlot, selectedNewPlot, targetTiers, targetEstate)
    : null;

  // Eligible migration targets: not the current estate, and not entirely
  // sold out (a real backend would also filter by tenant cross-migration
  // policy — not modeled here since no such policy exists in this repo yet).
  const migrationTargets = estates.filter((e) => e.id !== ownedPlot.estateId && e.availablePlots > 0);

  const handleSubmit = async () => {
    if (!targetEstate || !selectedNewPlot || !quote || !user) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const request = await requestUpgrade({
        ownedPlot,
        targetEstate,
        targetPlot: selectedNewPlot,
        targetTiers,
        quote,
        deltaPaymentMethod,
        installmentMonths: deltaPaymentMethod === "installment" ? installmentMonths : undefined,
        buyerName: user.name,
      });
      navigate(`/upgrade/request/${request.id}`);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong submitting your upgrade request.");
      setSubmitting(false);
    }
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
        Select a new plot or migrate your equity. Your paid equity of <strong className="font-mono-data">{formatAmount(ownedPlot.paidAmount, ownedPlot.currency)}</strong> carries forward to the new plot.
      </p>

      {/* Progress */}
      <div className="flex gap-1 mb-6">
        {(["select", "delta", "review"] as Step[]).map((s, i) => (
          <div key={s} className={`h-1 flex-1 rounded-full ${["select", "delta", "review"].indexOf(step) >= i ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`} />
        ))}
      </div>

      {/* Step 1 — Select new plot */}
      {step === "select" && (
        <div className="space-y-6">
          {/* Current plot summary */}
          <div className="bg-[var(--muted)] rounded-xl border border-[var(--border)] p-4">
            <div className="text-xs text-[var(--muted-foreground)] mb-1">Current plot</div>
            <div className="font-semibold">{ownedPlot.estate} — {ownedPlot.plotLabel}</div>
            <div className="text-sm text-[var(--muted-foreground)]">
              {ownedPlot.sqm} sqm · Equity paid: <span className="font-mono-data font-medium text-[var(--foreground)]">{formatAmount(ownedPlot.paidAmount, ownedPlot.currency)}</span>
              {ownedPlot.totalPrice > ownedPlot.paidAmount && (
                <> · Outstanding: <span className="font-mono-data font-medium text-[var(--foreground)]">{formatAmount(ownedPlot.totalPrice - ownedPlot.paidAmount, ownedPlot.currency)}</span> (retired if you upgrade, not carried forward)</>
              )}
            </div>
          </div>

          {/* Upgrade type */}
          <div>
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">What would you like to do?</label>
            <div className="grid sm:grid-cols-2 gap-3">
              {([
                { id: "upgrade" as const, label: "Upgrade within same estate", desc: "Select a different plot in the same estate. Delta computed from your current equity.", icon: "⬆" },
                { id: "migrate" as const, label: "Migrate equity to another estate", desc: "Move your equity to an eligible estate by the same company.", icon: "🔄" },
              ]).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => { setUpgradeType(opt.id); setSelectedNewPlot(null); setSelectedNewEstate(""); }}
                  className={`text-left p-4 rounded-xl border-2 transition-colors ${upgradeType === opt.id ? "border-[var(--primary)] bg-[var(--secondary)]" : "border-[var(--border)]"}`}
                >
                  <div className="text-xl mb-1.5" aria-hidden="true">{opt.icon}</div>
                  <div className="font-semibold text-sm">{opt.label}</div>
                  <div className="text-xs text-[var(--muted-foreground)] mt-1 leading-relaxed">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* If migrate: pick estate — only genuinely eligible targets */}
          {upgradeType === "migrate" && (
            <div>
              <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">Target estate</label>
              {migrationTargets.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">No other estates currently have available plots to migrate to.</p>
              ) : (
                <div className="grid gap-2">
                  {migrationTargets.map((e) => (
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
              )}
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
              {selectedNewPlot && quote && (
                <div className="mt-3 p-3 bg-[var(--secondary)] rounded-lg text-sm flex items-center justify-between border border-[var(--border)]">
                  <div>
                    <span className="font-medium">Plot {selectedNewPlot.row + 1}-{selectedNewPlot.col + 1}</span>
                    <span className="text-[var(--muted-foreground)] ml-2">{selectedNewPlot.sizeSqm} sqm · {selectedNewPlot.isCorner ? "Corner ★" : "Standard"}</span>
                  </div>
                  <span className="font-mono-data font-semibold">{formatAmount(quote.newPlotTotalPrice, quote.currency)}</span>
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
      {step === "delta" && selectedNewPlot && quote && (
        <div className="space-y-5">
          <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
            <h3 className="font-semibold text-sm mb-4">Equity calculation</h3>
            <div className="space-y-2 text-sm">
              <DeltaRow label="Current plot price" value={formatAmount(quote.currentPlotPrice, quote.currency)} />
              <DeltaRow label="Your equity paid" value={`− ${formatAmount(quote.equityPaid, quote.currency)}`} color="text-emerald-700" />
              {quote.outstandingOnCurrent > 0 && (
                <DeltaRow label="Outstanding on current (retired, not carried forward)" value={formatAmount(quote.outstandingOnCurrent, quote.currency)} />
              )}
              <div className="border-t border-[var(--border)] pt-2 mt-1">
                <DeltaRow label="New plot base price" value={formatAmount(quote.newPlotBasePrice, quote.currency)} />
                {quote.cornerPremium > 0 && <DeltaRow label="Corner premium" value={`+ ${formatAmount(quote.cornerPremium, quote.currency)}`} />}
                <DeltaRow label="New plot total price" value={formatAmount(quote.newPlotTotalPrice, quote.currency)} bold />
              </div>
              {quote.adminFee > 0 && (
                <div className="border-t border-[var(--border)] pt-2 mt-1">
                  <DeltaRow label="Processing fee" value={`+ ${formatAmount(quote.adminFee, quote.currency)}`} />
                </div>
              )}
              <div className="border-t border-[var(--border)] pt-2 mt-1">
                <DeltaRow
                  label={quote.direction === "downgrade" ? "Credit due to you" : "Amount due (delta)"}
                  value={quote.direction === "downgrade" ? formatAmount(Math.abs(quote.delta), quote.currency) : formatAmount(quote.delta + quote.adminFee, quote.currency)}
                  bold
                  color={quote.direction === "downgrade" ? "text-emerald-700" : undefined}
                />
              </div>
            </div>

            {quote.direction === "even" && (
              <div className="mt-3 p-3 bg-emerald-50 rounded-lg text-xs text-emerald-800">
                Your equity covers the full price of the new plot exactly — no additional payment required.
              </div>
            )}
            {quote.direction === "downgrade" && (
              <div className="mt-3 p-3 bg-emerald-50 rounded-lg text-xs text-emerald-800">
                You've paid more into your current plot than the new one costs. Once this completes, you'll receive{" "}
                <strong className="font-mono-data">{formatAmount(Math.abs(quote.delta), quote.currency)}</strong> back — nothing is absorbed or left unaccounted for.{" "}
                {UPGRADE_POLICY_NOTE}
              </div>
            )}
          </div>

          {quote.direction === "upgrade" && (
            <div>
              <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">How would you like to pay the delta?</label>
              <div className="grid gap-2 mb-3">
                {([
                  { id: "outright" as const, label: "Pay outright", desc: `Pay ${formatAmount(quote.delta + quote.adminFee, quote.currency)} today.`, icon: "⚡" },
                  { id: "installment" as const, label: "Add to installment plan", desc: "Fold the delta into a new modified monthly schedule on the new plot.", icon: "📅" },
                ]).map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => setDeltaPaymentMethod(opt.id)}
                    className={`text-left p-3 rounded-lg border-2 transition-colors flex items-center gap-3 ${deltaPaymentMethod === opt.id ? "border-[var(--primary)] bg-[var(--secondary)]" : "border-[var(--border)]"}`}
                  >
                    <span className="text-xl" aria-hidden="true">{opt.icon}</span>
                    <div>
                      <div className="font-semibold text-sm">{opt.label}</div>
                      <div className="text-xs text-[var(--muted-foreground)]">{opt.desc}</div>
                    </div>
                  </button>
                ))}
              </div>

              {deltaPaymentMethod === "installment" && (
                <div className="bg-[var(--muted)] rounded-lg p-3">
                  <label htmlFor="installment-months" className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Duration</label>
                  <select
                    id="installment-months"
                    value={installmentMonths}
                    onChange={(e) => setInstallmentMonths(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md bg-[var(--card)] mb-2"
                  >
                    {INSTALLMENT_OPTIONS.map((m) => <option key={m} value={m}>{m} months</option>)}
                  </select>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Modified schedule preview: <strong className="font-mono-data text-[var(--foreground)]">{formatAmount(Math.round((quote.delta + quote.adminFee) / installmentMonths), quote.currency)}/month</strong> for {installmentMonths} months.
                  </p>
                </div>
              )}

              {user && (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">Payment method (charged once approved)</label>
                  <PaymentMethodSelector methods={paymentMethodsForCountry(user.country)} selected={null} onSelect={() => {}} />
                  <p className="text-xs text-[var(--muted-foreground)] mt-1.5">You'll be charged once the developer approves this request — not before.</p>
                </div>
              )}
            </div>
          )}

          <div className="p-4 bg-[var(--muted)] rounded-xl text-xs text-[var(--muted-foreground)] leading-relaxed">
            This request enters a developer approval queue. Your current plot stays allocated to you, unchanged, until the reallocation actually executes — {quote.direction === "upgrade" ? "and the delta above is verified by Finance" : "and Finance verifies the credit above"}. Old documents will be voided; new ones issued automatically, each referencing what it replaces.
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
      {step === "review" && selectedNewPlot && quote && targetEstate && (
        <div className="space-y-5">
          <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
            <h3 className="font-semibold text-sm mb-4">Request summary</h3>
            <div className="space-y-1.5 text-sm">
              <DeltaRow label="From" value={`${ownedPlot.estate} — ${ownedPlot.plotLabel}`} />
              <DeltaRow label="To" value={`${targetEstate.name} — Plot ${selectedNewPlot.row + 1}-${selectedNewPlot.col + 1}`} />
              <DeltaRow label="New size" value={`${selectedNewPlot.sizeSqm} sqm (${selectedNewPlot.isCorner ? "corner" : "standard"})`} />
              <DeltaRow
                label={quote.direction === "downgrade" ? "Credit due to you" : "Delta to pay"}
                value={quote.direction === "downgrade" ? formatAmount(Math.abs(quote.delta), quote.currency) : formatAmount(quote.delta + quote.adminFee, quote.currency)}
                bold
              />
              {quote.direction === "upgrade" && (
                <DeltaRow label="Payment method" value={deltaPaymentMethod === "outright" ? "Outright" : `Modified installment (${installmentMonths} months)`} />
              )}
              {targetEstate.id !== ownedPlot.estateId && <DeltaRow label="Type" value="Cross-estate migration" />}
            </div>
          </div>

          <div className="text-xs text-[var(--muted-foreground)] space-y-1 leading-relaxed">
            <p>By submitting, you acknowledge that:</p>
            <ul className="list-disc list-inside space-y-0.5 ml-1">
              <li>This request requires developer approval before any documents are reissued.</li>
              <li>Your current plot remains allocated to you, unchanged, until the upgrade completes.</li>
              <li>Your current deed and allocation letter will be voided — never deleted — once the upgrade completes.</li>
              <li>A new deed and amended allocation letter, each referencing this request, will be issued for your new plot.</li>
              {quote.direction === "downgrade" && <li>Your credit will be {UPGRADE_POLICY_NOTE_PLAIN}.</li>}
            </ul>
          </div>

          {submitError && <p role="alert" className="text-sm text-red-600">{submitError}</p>}

          <div className="flex gap-2">
            <button onClick={() => setStep("delta")} className="flex-1 py-2.5 border border-[var(--border)] rounded-md text-sm text-[var(--muted-foreground)]">← Back</button>
            <button onClick={handleSubmit} disabled={submitting} className="flex-[2] py-2.5 bg-[var(--accent)] text-white rounded-md text-sm font-semibold disabled:opacity-60 hover:opacity-90 transition-opacity">
              {submitting ? "Submitting…" : "Submit upgrade request"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const UPGRADE_POLICY_NOTE_PLAIN = "issued as a credit note redeemable against a future payment";
const UPGRADE_POLICY_NOTE = `The credit will be ${UPGRADE_POLICY_NOTE_PLAIN}.`;

function DeltaRow({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--muted-foreground)]">{label}</span>
      <span className={`font-mono-data ${bold ? "font-bold text-base" : ""} ${color || ""}`}>{value}</span>
    </div>
  );
}

// ─── Upgrade request detail — reachable later from the portfolio ───────────

export function UpgradeRequestDetail() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const { addNotification } = useApp();
  const [request, setRequest] = useState<UpgradeRequest | null | undefined>(undefined);
  const notifiedRef = useRef(false);

  useEffect(() => {
    if (!requestId) { setRequest(null); return; }
    let cancelled = false;
    // Clone on every poll — fetchUpgradeRequest returns the same mutated
    // object reference each tick in mock mode, and React bails out of a
    // setState with an unchanged reference (Object.is), so the UI would
    // otherwise freeze on the first-rendered stage forever. Same fix
    // ResaleTransferDetail needed.
    const poll = () => fetchUpgradeRequest(requestId).then((r) => { if (!cancelled) setRequest(r ? { ...r } : null); });
    poll();
    const interval = setInterval(poll, 1200);
    return () => { cancelled = true; clearInterval(interval); };
  }, [requestId]);

  useEffect(() => {
    if (request?.status === "completed" && !notifiedRef.current) {
      notifiedRef.current = true;
      addNotification({
        type: "approval",
        title: "Upgrade complete — new plot allocated",
        body: `${request.toEstateName}, ${request.toPlotLabel} is now yours. Your documents are ready in your vault.`,
        date: new Date().toISOString().split("T")[0],
      });
    }
  }, [request, addNotification]);

  if (request === undefined) return <div className="p-8 text-[var(--muted-foreground)] text-sm">Loading…</div>;
  if (request === null) return <div className="p-8 text-[var(--muted-foreground)] text-sm">Upgrade request not found. <Link to="/portfolio" className="text-[var(--accent)] hover:underline">Back to portfolio</Link></div>;

  return (
    <div className="p-6 max-w-xl mx-auto">
      <button onClick={() => navigate("/portfolio")} className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] mb-6">← Back to portfolio</button>
      <h1 className="font-display text-2xl mb-1">{request.fromEstateName} → {request.toEstateName}</h1>
      <p className="text-sm text-[var(--muted-foreground)] mb-6">Upgrade request for {request.fromPlotLabel}</p>
      <UpgradeProgress request={request} />
      {request.status === "completed" && request.newOwnedPlotId && (
        <Link to={`/portfolio/${request.newOwnedPlotId}`} className="mt-6 block text-center py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 transition-opacity">
          View your new plot →
        </Link>
      )}
    </div>
  );
}
