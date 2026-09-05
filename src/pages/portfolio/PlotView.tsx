import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { formatAmount, FX_RATES, type OwnedPlot, type Document } from "../../data/mockData";
import TabBar from "../../components/TabBar";
import {
  fetchOwnedPlotById, fetchInstallmentSchedule, submitInstallmentPayment, verifyInstallmentPayment, requestRestructure,
  type InstallmentSchedule, type PaymentRecord,
} from "../../services/portfolioService";
import { fetchDocumentsByPlotId } from "../../services/documentsService";
import { fetchUpgradeRequestForPlot, type UpgradeRequest } from "../../services/upgradeService";
import { fetchConstructionProgress, type ConstructionProgress } from "../../services/constructionService";
import { CAPABILITIES } from "../../lib/capabilities";
import { useApp } from "../../contexts/AppContext";
import DocumentCard from "../../components/documents/DocumentCard";
import QRVerifyModal from "../../components/documents/QRVerifyModal";
import PlotStatusBadge from "../../components/portfolio/PlotStatusBadge";
import ArrearsBanner from "../../components/portfolio/ArrearsBanner";
import PaymentSchedule from "../../components/portfolio/PaymentSchedule";
import PaymentMethodSelector from "../../components/checkout/PaymentMethodSelector";
import VerificationProgress, { type VerificationStageStatus } from "../../components/checkout/VerificationProgress";
import { paymentMethodsForCountry, initiatePayment, type MarketplacePaymentMethod, type VirtualAccountDetails } from "../../services/marketplaceCheckoutService";
import VerifiedBadge from "../../components/marketplace/VerifiedBadge";

type Tab = "overview" | "payments" | "construction" | "documents";
type PayStep = "form" | "verifying";

export default function PlotView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currency: displayCurrency, user } = useApp();
  const [plot, setPlot] = useState<OwnedPlot | null | undefined>(undefined); // undefined = loading, null = not found
  const [loadError, setLoadError] = useState(false);
  const [docs, setDocs] = useState<Document[]>([]);
  const [schedule, setSchedule] = useState<InstallmentSchedule | undefined>();
  const [tab, setTab] = useState<Tab>("overview");
  const [verifyingDoc, setVerifyingDoc] = useState<Document | null>(null);
  const [restructuring, setRestructuring] = useState(false);

  // Payment form state
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<MarketplacePaymentMethod | null>(null);
  const [virtualAccount, setVirtualAccount] = useState<VirtualAccountDetails | null>(null);
  const [payError, setPayError] = useState("");
  const [payLoading, setPayLoading] = useState(false);
  const [payStep, setPayStep] = useState<PayStep>("form");
  const [pendingPayment, setPendingPayment] = useState<PaymentRecord | null>(null);
  const [verifyStatus, setVerifyStatus] = useState<VerificationStageStatus>("pending_payment");
  const [inFlightUpgrade, setInFlightUpgrade] = useState<UpgradeRequest | null>(null);

  const load = (plotId: string) => {
    setLoadError(false);
    Promise.all([fetchOwnedPlotById(plotId), fetchDocumentsByPlotId(plotId), fetchInstallmentSchedule(plotId)])
      .then(([plotData, docData, scheduleData]) => {
        setPlot(plotData ?? null);
        setDocs(docData);
        setSchedule(scheduleData);
      })
      .catch(() => setLoadError(true));
  };

  useEffect(() => {
    if (!id) { setPlot(null); return; }
    load(id);
  }, [id]);

  useEffect(() => {
    if (!id || plot?.status !== "upgrade_pending") { setInFlightUpgrade(null); return; }
    let cancelled = false;
    fetchUpgradeRequestForPlot(id).then((req) => { if (!cancelled) setInFlightUpgrade(req ?? null); });
    return () => { cancelled = true; };
  }, [id, plot?.status]);

  if (loadError) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-[var(--foreground)] font-medium mb-2">Couldn't load this plot.</p>
        <button onClick={() => id && load(id)} className="text-sm text-[var(--accent)] hover:underline">Try again</button>
      </div>
    );
  }
  if (plot === undefined) return <div className="p-8 text-[var(--muted-foreground)]">Loading plot…</div>;
  if (plot === null) return <div className="p-8">Plot not found.</div>;

  const pct = plot.totalPrice > 0 ? Math.round((plot.paidAmount / plot.totalPrice) * 100) : 0;
  const outstanding = plot.totalPrice - plot.paidAmount;
  const nextPeriod = schedule?.periods.find((p) => p.status !== "paid");
  const canPay = (plot.status === "installment_active" || plot.status === "in_arrears") && !!nextPeriod;

  const resetPaymentForm = () => {
    setPayStep("form");
    setPayAmount("");
    setPayMethod(null);
    setVirtualAccount(null);
    setPayError("");
    setPendingPayment(null);
  };

  const handleSelectMethod = async (method: MarketplacePaymentMethod) => {
    setPayMethod(method);
    setVirtualAccount(null);
    setPayError("");
    if (method === "virtual_account" || method === "wire") {
      // Reuses the same account-details generator the marketplace checkout
      // uses — a mock transactionId here is fine, it only looks one up if
      // present and otherwise just returns the account shape.
      const result = await initiatePayment(plot.id, method);
      if (result.account) setVirtualAccount(result.account);
    }
  };

  const validateAmount = (raw: string): { amount: number; error?: string } => {
    if (!raw.trim()) return { amount: 0, error: "Enter an amount." };
    const amount = Number(raw);
    if (!Number.isFinite(amount) || Number.isNaN(amount)) return { amount: 0, error: "Enter a valid number." };
    if (amount <= 0) return { amount, error: "Amount must be greater than zero." };
    if (amount > outstanding) return { amount, error: `Amount can't exceed your outstanding balance of ${formatAmount(outstanding, plot.currency)}.` };
    return { amount };
  };

  const handlePaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payMethod) { setPayError("Choose a payment method."); return; }
    if ((payMethod === "virtual_account" || payMethod === "wire") && !virtualAccount) { setPayError("Still generating your account details — one moment."); return; }
    const { amount, error } = validateAmount(payAmount);
    if (error) { setPayError(error); return; }

    setPayError("");
    setPayLoading(true);
    try {
      const submitted = await submitInstallmentPayment({ plotId: plot.id, periodId: nextPeriod?.id, amount, currency: plot.currency, method: payMethod });
      setPendingPayment(submitted);
      setPayStep("verifying");
      setVerifyStatus("payment_received");

      const { payment, plot: updatedPlot } = await verifyInstallmentPayment(plot.id, submitted.id);
      setPendingPayment(payment);

      if (payment.status === "rejected") {
        setVerifyStatus("rejected");
      } else {
        setVerifyStatus("verified");
        setPlot(updatedPlot);
        const freshSchedule = await fetchInstallmentSchedule(plot.id);
        setSchedule(freshSchedule ? { ...freshSchedule, periods: [...freshSchedule.periods] } : undefined);
        fetchDocumentsByPlotId(plot.id).then(setDocs);
      }
    } catch {
      setPayError("Something went wrong submitting your payment. Please try again.");
      setPayStep("form");
    } finally {
      setPayLoading(false);
    }
  };

  const handleRequestRestructure = async () => {
    setRestructuring(true);
    try {
      const updated = await requestRestructure(plot.id, "Buyer requested restructuring from plot detail.");
      if (updated) setPlot(updated);
    } finally {
      setRestructuring(false);
    }
  };

  const TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "payments", label: "Payments" },
    ...(CAPABILITIES.constructionTracking ? [{ id: "construction" as const, label: "Construction" }] : []),
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
        <PlotStatusBadge status={plot.status} />
      </div>

      {plot.status === "pending_verification" && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <div className="text-sm font-semibold text-amber-900 mb-1">Payment received — awaiting finance confirmation</div>
          <p className="text-xs text-amber-700">Our Finance team confirms every payment by hand before allocation and documents are finalized. This usually completes within 1 business day, and you'll be notified the moment it does.</p>
        </div>
      )}

      {plot.status === "in_arrears" && plot.arrears && (
        <div className="mb-6">
          <ArrearsBanner
            arrears={plot.arrears}
            currency={plot.currency}
            restructureStatus={plot.restructureStatus}
            onRequestRestructure={handleRequestRestructure}
            requesting={restructuring}
          />
        </div>
      )}

      {/* Tab bar */}
      <div className="border-b border-[var(--border)] mb-6">
        <TabBar tabs={TABS} active={tab} onActivate={setTab} ariaLabel="Plot sections" />
      </div>

      {/* Overview tab */}
      {tab === "overview" && (
        <div id="panel-overview" role="tabpanel" aria-labelledby="tab-overview" className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-5">
            {/* Equity card */}
            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
              <h3 className="font-semibold text-sm mb-4">Equity position</h3>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <Stat label="Total price" value={formatAmount(plot.totalPrice, plot.currency)} />
                <Stat label="Paid" value={formatAmount(plot.paidAmount, plot.currency)} green />
                <Stat label="Outstanding" value={formatAmount(outstanding, plot.currency)} />
              </div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-[var(--muted-foreground)]" id="equity-label">Equity paid</span>
                <span className="font-mono-data font-medium">{pct}%</span>
              </div>
              <div
                className="h-3 bg-[var(--muted)] rounded-full overflow-hidden"
                role="progressbar"
                aria-labelledby="equity-label"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="h-full bg-[var(--primary)] rounded-full transition-all" style={{ width: `${pct}%` }} />
              </div>
              {plot.installmentMonths && plot.installmentsPaid !== undefined && (
                <div className="mt-2 text-xs text-[var(--muted-foreground)]">
                  Installment {plot.installmentsPaid} of {plot.installmentMonths} paid · {plot.installmentMonths - plot.installmentsPaid} remaining
                </div>
              )}
            </div>

            {/* Installment schedule — fetched from the service layer, never
                synthesized client-side (see portfolioService.ts). */}
            {schedule && schedule.periods.length > 0 && (
              <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
                <h3 className="font-semibold text-sm mb-4">Installment schedule</h3>
                <PaymentSchedule periods={schedule.periods} currency={plot.currency} nextPayablePeriodId={nextPeriod?.id} />
              </div>
            )}

            {/* Plot details */}
            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
              <h3 className="font-semibold text-sm mb-3">Plot details</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  { label: "Estate", value: plot.estate },
                  { label: "Reference", value: plot.plotLabel },
                  { label: "Nominal size", value: `${plot.sqm} sqm` },
                  { label: "Actual surveyed area", value: plot.actualSqm ? `${plot.actualSqm} sqm` : "Not yet surveyed" },
                  { label: "Type", value: plot.isCorner ? "Corner piece ★" : "Standard" },
                  { label: "Intent", value: plot.intent === "development" ? "Development" : "Investment" },
                  { label: "Plan", value: plot.plan === "outright" ? "Outright" : `${plot.installmentMonths}-month ${plot.plan}` },
                  { label: "Acquired", value: plot.acquiredDate },
                ].map((d) => (
                  <div key={d.label} className="bg-[var(--muted)] rounded-lg p-3">
                    <div className="text-xs text-[var(--muted-foreground)] mb-0.5">{d.label}</div>
                    <div className="font-medium text-xs">{d.value}</div>
                  </div>
                ))}
              </div>

              {plot.isCorner && plot.basePrice && plot.cornerPremiumPct !== undefined && (
                <div className="mt-3 text-xs text-[var(--accent)] bg-[var(--secondary)] rounded-lg p-3">
                  {formatAmount(plot.basePrice, plot.currency)} + {plot.cornerPremiumPct}% corner premium = {formatAmount(plot.totalPrice, plot.currency)}
                </div>
              )}

              {plot.titleType && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-[var(--muted-foreground)]">{plot.titleType}</span>
                  {plot.titleVerified && <VerifiedBadge />}
                </div>
              )}
            </div>
          </div>

          {/* Right sidebar */}
          <div className="space-y-4">
            {/* Make a payment */}
            {canPay && nextPeriod && (
              <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
                <h3 className="font-semibold text-sm mb-4">Make a payment</h3>
                {payStep === "form" ? (
                  <form onSubmit={handlePaySubmit} className="space-y-3" noValidate>
                    <div className="bg-[var(--muted)] rounded-lg p-3">
                      <div className="text-xs text-[var(--muted-foreground)]">Next due</div>
                      <div className="font-semibold font-mono-data">{formatAmount(nextPeriod.amount, plot.currency)}</div>
                      <div className="text-xs font-mono-data text-[var(--muted-foreground)]">{nextPeriod.dueDate}</div>
                    </div>

                    <div>
                      <label htmlFor="pay-amount" className="block text-xs font-medium text-[var(--muted-foreground)] mb-1">Amount ({plot.currency})</label>
                      <input
                        id="pay-amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        placeholder={String(nextPeriod.amount)}
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        aria-invalid={!!payError}
                        aria-describedby={payError ? "pay-amount-error" : undefined}
                        className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md bg-[var(--card)] font-mono-data"
                      />
                      {displayCurrency !== plot.currency && (
                        // formatAmount() takes a raw NGN figure and converts via FX_RATES —
                        // this amount is already in plot.currency, so undo that conversion
                        // to NGN before handing it to formatAmount for the display currency.
                        <p className="text-xs text-[var(--muted-foreground)] mt-1">
                          Charged in {plot.currency} — the currency this plot is priced in. At today's rate, that's roughly{" "}
                          {formatAmount((Number(payAmount) || nextPeriod.amount) / FX_RATES[plot.currency], displayCurrency)} in your display currency.
                        </p>
                      )}
                    </div>

                    <div>
                      <span className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5" id="pay-method-label">Payment method</span>
                      <PaymentMethodSelector methods={paymentMethodsForCountry(user?.country ?? "NG")} selected={payMethod} onSelect={handleSelectMethod} />
                    </div>

                    {(payMethod === "virtual_account" || payMethod === "wire") && (
                      <div className="bg-[var(--muted)] rounded-lg p-3 font-mono-data text-xs">
                        {virtualAccount ? (
                          <>
                            <div className="text-[var(--muted-foreground)] mb-1">Transfer to this account</div>
                            <div className="font-semibold">{virtualAccount.bankName}</div>
                            <div className="text-sm tracking-wider my-1">{virtualAccount.accountNumber}</div>
                            <div className="text-[var(--muted-foreground)]">{virtualAccount.accountName}</div>
                          </>
                        ) : <div className="text-[var(--muted-foreground)]">Generating your dedicated account number…</div>}
                      </div>
                    )}

                    {payError && <p id="pay-amount-error" role="alert" className="text-red-600 text-xs">{payError}</p>}

                    <button
                      type="submit"
                      disabled={payLoading}
                      className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium disabled:opacity-60 hover:opacity-90 transition-opacity"
                    >
                      {payLoading ? "Submitting…" : "Pay now"}
                    </button>
                  </form>
                ) : (
                  <div>
                    <VerificationProgress
                      status={verifyStatus}
                      reference={pendingPayment?.receiptId ?? ""}
                      amountDue={pendingPayment?.amount ?? 0}
                      currency={plot.currency}
                      rejectionReason={pendingPayment?.rejectionReason}
                      finalStageLabel="Receipt issued"
                      finalStageDetail="Your receipt lands in your vault and your equity updates automatically."
                    />
                    {(verifyStatus === "rejected" || verifyStatus === "verified") && (
                      <button onClick={resetPaymentForm} className="mt-4 w-full py-2 text-sm border border-[var(--border)] rounded-md text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors">
                        {verifyStatus === "rejected" ? "Try again" : "Make another payment"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
              <h3 className="font-semibold text-sm mb-3">Actions</h3>
              <div className="space-y-2">
                {plot.status === "upgrade_pending" && inFlightUpgrade ? (
                  <Link to={`/upgrade/request/${inFlightUpgrade.id}`} className="flex items-center gap-2 w-full py-2 text-left text-sm text-amber-700 hover:text-amber-800 border border-amber-200 bg-amber-50 rounded-md px-3 transition-colors">
                    <span aria-hidden="true">🔁</span> View upgrade progress
                  </Link>
                ) : (
                  <Link to={`/upgrade/${plot.id}`} className="flex items-center gap-2 w-full py-2 text-left text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)] rounded-md px-3 transition-colors">
                    <span aria-hidden="true">🔁</span> Upgrade or swap plot
                  </Link>
                )}
                {plot.intent === "investment" && (
                  <Link to={`/resale/list/${plot.id}`} className="flex items-center gap-2 w-full py-2 text-left text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)] rounded-md px-3 transition-colors">
                    <span aria-hidden="true">🏷</span> List for resale
                  </Link>
                )}
                <Link to={`/support?dispute=true&plot=${plot.id}`} className="flex items-center gap-2 w-full py-2 text-left text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] border border-[var(--border)] rounded-md px-3 transition-colors">
                  <span aria-hidden="true">💬</span> Raise a dispute
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payments tab */}
      {tab === "payments" && (
        <div id="panel-payments" role="tabpanel" aria-labelledby="tab-payments" className="bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden">
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
                    <td className="px-4 py-3 text-right font-mono-data text-xs font-medium">{formatAmount(p.amount, plot.currency)}</td>
                    <td className="px-4 py-3 text-center">
                      <PaymentStatusPill status={p.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      {p.status === "confirmed" ? (
                        <Link to="/documents" className="text-xs text-[var(--accent)] hover:underline font-mono-data">{p.receiptId}</Link>
                      ) : (
                        <span className="text-xs text-[var(--muted-foreground)] font-mono-data">{p.receiptId}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--border)] bg-[var(--muted)]">
                  <td colSpan={2} className="px-4 py-3 text-xs font-semibold">Total paid</td>
                  <td className="px-4 py-3 text-right font-mono-data text-xs font-bold">{formatAmount(plot.paidAmount, plot.currency)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Construction tab — capability-gated, no fabricated data */}
      {tab === "construction" && CAPABILITIES.constructionTracking && (
        <div id="panel-construction" role="tabpanel" aria-labelledby="tab-construction">
          <ConstructionTab estateId={plot.estateId} />
        </div>
      )}

      {/* Documents tab */}
      {tab === "documents" && (
        <div id="panel-documents" role="tabpanel" aria-labelledby="tab-documents" className="space-y-3">
          {docs.length === 0 ? (
            <div className="text-center py-12 text-[var(--muted-foreground)]">
              <div className="text-3xl mb-2" aria-hidden="true">📂</div>
              No documents yet. They'll appear here as they're issued.
            </div>
          ) : (
            docs.map((doc) => <DocumentCard key={doc.id} doc={doc} onVerify={() => setVerifyingDoc(doc)} />)
          )}
        </div>
      )}

      {verifyingDoc && <QRVerifyModal doc={verifyingDoc} onClose={() => setVerifyingDoc(null)} />}
    </div>
  );
}

function PaymentStatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    confirmed: "bg-emerald-50 text-emerald-700",
    pending: "bg-amber-50 text-amber-700",
    pending_verification: "bg-amber-50 text-amber-700",
    rejected: "bg-red-50 text-red-700",
    failed: "bg-red-50 text-red-700",
  };
  const labels: Record<string, string> = {
    confirmed: "Confirmed",
    pending: "Pending",
    pending_verification: "Pending verification",
    rejected: "Rejected",
    failed: "Failed",
  };
  return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles[status] ?? "bg-[var(--muted)] text-[var(--muted-foreground)]"}`}>{labels[status] ?? status}</span>;
}

function ConstructionTab({ estateId }: { estateId: string }) {
  const [progress, setProgress] = useState<ConstructionProgress | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetchConstructionProgress(estateId).then((data) => { if (!cancelled) setProgress(data ?? null); });
    return () => { cancelled = true; };
  }, [estateId]);

  if (progress === undefined) return <div className="text-sm text-[var(--muted-foreground)] py-8">Loading construction progress…</div>;

  if (progress === null) {
    return (
      <div className="text-center py-12 text-[var(--muted-foreground)] bg-[var(--card)] rounded-xl border border-dashed border-[var(--border)]">
        <div className="text-3xl mb-2" aria-hidden="true">🚧</div>
        This estate hasn't published construction progress yet. Check back later, or contact the developer directly.
      </div>
    );
  }

  const overall = Math.round(progress.milestones.reduce((s, m) => s + m.percentComplete, 0) / progress.milestones.length);

  return (
    <div className="space-y-6">
      <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
        <h3 className="font-semibold text-sm mb-4">Infrastructure completion</h3>
        <div className="space-y-4">
          {progress.milestones.map((m) => (
            <div key={m.id}>
              <div className="flex items-center justify-between text-sm mb-1.5">
                <span className="font-medium" id={`milestone-${m.id}`}>{m.label}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[var(--muted-foreground)] font-mono-data">{m.expectedOrCompletedDate}</span>
                  <span className={`font-mono-data text-xs font-semibold ${m.percentComplete === 100 ? "text-emerald-700" : m.percentComplete > 0 ? "text-amber-700" : "text-[var(--muted-foreground)]"}`}>
                    {m.percentComplete}%
                  </span>
                </div>
              </div>
              <div
                className="h-2 bg-[var(--muted)] rounded-full overflow-hidden"
                role="progressbar"
                aria-labelledby={`milestone-${m.id}`}
                aria-valuenow={m.percentComplete}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className={`h-full rounded-full transition-all ${m.percentComplete === 100 ? "bg-emerald-500" : m.percentComplete > 0 ? "bg-amber-500" : "bg-[var(--border)]"}`}
                  style={{ width: `${m.percentComplete}%` }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-[var(--border)] flex items-center justify-between text-xs text-[var(--muted-foreground)]">
          <span>Overall completion</span>
          <span className="font-mono-data font-semibold text-[var(--foreground)]">{overall}%</span>
        </div>
      </div>

      {progress.updates.length > 0 && (
        <div>
          <h3 className="font-semibold text-sm mb-4">Site updates</h3>
          <div className="space-y-4">
            {progress.updates.map((u) => (
              <div key={u.id} className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4">
                <div className="text-xs font-mono-data text-[var(--muted-foreground)] mb-1">{u.date}</div>
                <div className="font-semibold text-sm mb-1.5">{u.title}</div>
                <p className="text-xs text-[var(--muted-foreground)] leading-relaxed">{u.body}</p>
              </div>
            ))}
          </div>
        </div>
      )}
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
