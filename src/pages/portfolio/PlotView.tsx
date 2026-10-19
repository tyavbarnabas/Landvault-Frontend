// One owned plot — /portfolio/:id (an owned-plot id, or the transaction id
// while finance hasn't verified it yet). Redesigned from the Figma "Plot —
// Proposed": one page of sections instead of tabs — ownership, documents,
// details, payments — with title, payment and help on the side.

import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { formatAmount, FX_RATES, type OwnedPlot, type Document } from "../../data/mockData";
import {
  fetchOwnedPlotById, fetchInstallmentSchedule, submitInstallmentPayment, verifyInstallmentPayment, requestRestructure,
  installmentsAvailable, sizeText, type InstallmentSchedule, type PaymentRecord,
} from "../../services/portfolioService";
import { titleLabel } from "../../services/marketplaceService";
import { isAvailable, isLive } from "../../lib/backends";
import { fetchDocumentsByPlotId } from "../../services/documentsService";
import { fetchUpgradeRequestForPlot, type UpgradeRequest } from "../../services/upgradeService";
import { useFetch } from "../../lib/useFetch";
import { fetchConstructionProgress, type ConstructionProgress } from "../../services/constructionService";
import { CAPABILITIES } from "../../lib/capabilities";
import { useApp } from "../../contexts/AppContext";
import { DOCUMENT_TYPE_LABELS, DocTypeChip, DocumentActions } from "../../components/documents/DocumentCard";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { formatDay } from "../../lib/formatDate";
import { AlertIcon, BuildingIcon, CheckIcon, ChevronRightIcon, FileCheckIcon, MapPinIcon, MessageIcon, WalletIcon } from "../../components/icons";
import ReceiptDownload from "../../components/documents/ReceiptDownload";
import PlotStatusBadge from "../../components/portfolio/PlotStatusBadge";
import ArrearsBanner from "../../components/portfolio/ArrearsBanner";
import { plotTitleStatus, titleState } from "../../lib/titleState";
import PaymentSchedule from "../../components/portfolio/PaymentSchedule";
import PaymentMethodSelector from "../../components/checkout/PaymentMethodSelector";
import VerificationProgress, { type VerificationStageStatus } from "../../components/checkout/VerificationProgress";
import { paymentMethodsForCountry, initiatePayment, type MarketplacePaymentMethod, type VirtualAccountDetails } from "../../services/marketplaceCheckoutService";

type PayStep = "form" | "verifying";

interface PlotViewData {
  plot: OwnedPlot | null;
  docs: Document[];
  schedule: InstallmentSchedule | undefined;
}

export default function PlotView() {
  const { id } = useParams();
  const { currency: displayCurrency, user } = useApp();
  const { data, loading, error: loadError, refetch, setData } = useFetch<PlotViewData>(async () => {
    if (!id) return { plot: null, docs: [], schedule: undefined };
    // Live: the allocation letter first, then the receipts.
    const [plotData, docData, scheduleData] = await Promise.all([
      fetchOwnedPlotById(id),
      isAvailable("documents") ? fetchDocumentsByPlotId(id) : Promise.resolve([]),
      fetchInstallmentSchedule(id),
    ]);
    return { plot: plotData ?? null, docs: docData, schedule: scheduleData };
  }, [id]);
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

  useEffect(() => {
    if (!id || data?.plot?.status !== "upgrade_pending") { setInFlightUpgrade(null); return; }
    let cancelled = false;
    fetchUpgradeRequestForPlot(id).then((req) => { if (!cancelled) setInFlightUpgrade(req ?? null); });
    return () => { cancelled = true; };
  }, [id, data?.plot?.status]);

  if (loadError) {
    return (
      <div className="p-8 text-center">
        <p className="text-sm text-[var(--foreground)] font-medium mb-2">Couldn't load this plot.</p>
        <button onClick={refetch} className="text-sm text-[var(--accent)] hover:underline">Try again</button>
      </div>
    );
  }
  if (loading) return <div className="p-8 text-[var(--muted-foreground)]">Loading plot…</div>;
  if (!data?.plot) return <div className="p-8">Plot not found.</div>;
  const { plot, docs, schedule } = data;

  const pct = plot.totalPrice > 0 ? Math.round((plot.paidAmount / plot.totalPrice) * 100) : 0;
  const outstanding = plot.totalPrice - plot.paidAmount;
  const nextPeriod = schedule?.periods.find((p) => p.status !== "paid");
  const installments = installmentsAvailable();
  const canPay = installments && (plot.status === "installment_active" || plot.status === "in_arrears") && !!nextPeriod;
  const pending = plot.status === "pending_verification";
  const docsAvailable = isAvailable("documents");
  // A payment's receipt among this plot's documents (live: receiptId is the
  // receipt's own id). Only one with a number can be downloaded by it.
  const receiptFor = (receiptId: string | null | undefined) =>
    receiptId ? docs.find((d) => d.id === receiptId && d.type === "receipt" && d.number) : undefined;
  // Upgrades, resale and disputes have no backend yet: live, they'd run demo
  // flows against a real plot.
  const actions = { upgrade: isAvailable("upgrades"), resale: isAvailable("resale") && plot.intent === "investment", dispute: isAvailable("disputes") };
  const hasActions = actions.upgrade || actions.resale || actions.dispute;
  // With nothing to pay and no actions (every live plot today), the overview
  // takes the full width, like the cards above it.
  const sidebar = canPay || hasActions;
  const titleStatus = plotTitleStatus(plot);
  const purchasePayment = plot.payments[0];

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
        const [rawSchedule, freshDocs] = await Promise.all([fetchInstallmentSchedule(plot.id), fetchDocumentsByPlotId(plot.id)]);
        const freshSchedule = rawSchedule ? { ...rawSchedule, periods: [...rawSchedule.periods] } : undefined;
        setData((): PlotViewData => ({ plot: updatedPlot, docs: freshDocs, schedule: freshSchedule }));
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
      if (updated) setData({ ...data, plot: updated });
    } finally {
      setRestructuring(false);
    }
  };

  const docsLoaded = docsAvailable && isLive("documents");
  const hasLetter = docs.some((d) => d.type === "allocation_letter");
  const paidOff = plot.status === "completed" || (!pending && outstanding <= 0 && plot.paidAmount > 0);
  const titleRow = titleState(plot.titleType, titleStatus);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      <nav aria-label="Breadcrumb" className="text-xs text-[var(--muted-foreground)] mb-4 flex items-center gap-1.5">
        <Link to="/portfolio" className="hover:text-[var(--foreground)]">Portfolio</Link>
        <ChevronRightIcon size={12} />
        <span className="font-medium text-[var(--foreground)]" aria-current="page">{plot.plotLabel}</span>
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="font-display text-[28px] sm:text-4xl leading-tight text-[var(--foreground)]">{plot.plotLabel}</h1>
          <p className="mt-1.5 flex items-start gap-1.5 text-sm text-[var(--muted-foreground)]">
            <span className="mt-0.5"><MapPinIcon size={15} /></span>
            {[plot.estate, sizeText(plot), plot.location].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <PlotStatusBadge status={plot.status} />
            {titleRow && <Badge label={titleRow.badge} variant={titleRow.tone} />}
          </div>
        </div>
        <Link to={`/marketplace/${plot.estateId}`} className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-[var(--border)] bg-[var(--card)] text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)]">
          View estate <ChevronRightIcon size={15} />
        </Link>
      </div>

      {/* Paid, not yet verified: equity is 0 until finance signs off, so
          this shows where it is rather than a tick. */}
      {pending && (
        <div className="mb-6 bg-[var(--card)] rounded-xl border border-[var(--border)] p-5">
          <VerificationProgress
            status="awaiting_finance"
            // Live, a payment's id is its reference (LV-PAY-…) and receiptId is
            // the receipt document's id; the mock's receiptId stood for both.
            reference={(isLive("portfolio") ? purchasePayment?.id : purchasePayment?.receiptId) ?? plot.transactionId ?? ""}
            amountDue={purchasePayment?.amount ?? plot.totalPrice}
            currency={plot.currency}
            finalStageLabel="Plot allocated"
            finalStageDetail="Your equity and acquired date show here once finance confirms."
          />
        </div>
      )}

      {plot.status === "in_arrears" && plot.arrears && (
        <div className="mb-6">
          <ArrearsBanner
            arrears={plot.arrears}
            currency={plot.currency}
            restructureStatus={plot.restructureStatus}
            onRequestRestructure={installments ? handleRequestRestructure : undefined}
            requesting={restructuring}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        <div className="space-y-5 min-w-0">
          {/* Ownership — a tick when it's paid and verified; the equity bar only
              while there's still something to pay. */}
          <Section>
            <div className="flex items-center gap-3.5">
              <span className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center ${paidOff ? "bg-[var(--success-surface)] text-[var(--success-text)]" : "bg-[var(--secondary)] text-[var(--secondary-foreground)]"}`}>
                {paidOff ? <CheckIcon size={22} /> : <WalletIcon size={20} />}
              </span>
              <div>
                <h2 className="text-lg font-semibold text-[var(--foreground)]">
                  {pending ? "Paid — waiting for the developer's finance team" : paidOff ? "You own this plot" : "Paying for this plot"}
                </h2>
                <p className="text-sm text-[var(--muted-foreground)]">
                  {pending ? "Your equity and acquired date show once finance confirms the payment."
                    : paidOff ? "Paid in full and verified by the developer's finance team."
                    : `${pct}% paid · ${formatAmount(outstanding, plot.currency)} to go`}
                </p>
              </div>
            </div>
            <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t border-[var(--border)]">
              <Fact label="Paid" value={formatAmount(plot.paidAmount, plot.currency)} mono green={!pending && plot.paidAmount > 0} />
              <Fact label={paidOff ? "Price" : "Outstanding"} value={formatAmount(paidOff ? plot.totalPrice : outstanding, plot.currency)} mono />
              <Fact label="Plan" value={plot.plan === "outright" ? "Outright" : `${plot.installmentMonths}-month ${plot.plan}`} />
              <Fact label="Acquired" value={plot.acquiredDate ? formatDay(plot.acquiredDate) : "When finance verifies"} />
            </dl>
            {!paidOff && !pending && (
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="text-[var(--muted-foreground)]" id="equity-label">Equity paid</span>
                  <span className="font-mono-data font-medium">{pct}%</span>
                </div>
                <div className="h-2.5 bg-[var(--muted)] rounded-full overflow-hidden" role="progressbar" aria-labelledby="equity-label" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full bg-[var(--primary)] rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                {plot.installmentMonths && plot.installmentsPaid !== undefined && (
                  <div className="mt-2 text-xs text-[var(--muted-foreground)]">
                    Installment {plot.installmentsPaid} of {plot.installmentMonths} paid · {plot.installmentMonths - plot.installmentsPaid} remaining
                  </div>
                )}
              </div>
            )}
          </Section>

          {/* Installment schedule — fetched from the service layer, never
              synthesized client-side (see portfolioService.ts). */}
          {schedule && schedule.periods.length > 0 && (
            <Section title="Installment schedule">
              <PaymentSchedule periods={schedule.periods} currency={plot.currency} nextPayablePeriodId={nextPeriod?.id} />
            </Section>
          )}

          <Section title="Documents">
            {docs.length === 0 && !docsLoaded ? (
              <p className="text-sm text-[var(--muted-foreground)]">No documents yet. They'll appear here as they're issued.</p>
            ) : (
              <ul className="space-y-3">
                {docs.map((doc) => (
                  <li key={doc.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] px-3.5 py-3">
                    <DocTypeChip type={doc.type} />
                    <div className="flex-1 min-w-[160px]">
                      <div className="text-sm font-semibold text-[var(--foreground)]">{DOCUMENT_TYPE_LABELS[doc.type]}</div>
                      <div className="text-xs text-[var(--muted-foreground)]">
                        {doc.number && <span className="font-mono-data">{doc.number} · </span>}Issued {formatDay(doc.date)}{doc.refundedAt ? ` · Refunded ${formatDay(doc.refundedAt)}` : ""}
                      </div>
                    </div>
                    <DocumentActions doc={doc} share />
                  </li>
                ))}
                {/* Say what's missing rather than leave a gap. */}
                {docsLoaded && !hasLetter && (
                  <li className="flex items-center gap-3 rounded-lg border border-[var(--border)] px-3.5 py-3">
                    <span className="w-9 h-9 shrink-0 rounded-lg bg-[var(--muted)] text-[var(--muted-foreground)] flex items-center justify-center"><FileCheckIcon size={18} /></span>
                    <div>
                      <div className="text-sm font-semibold text-[var(--muted-foreground)]">Allocation letter</div>
                      <div className="text-xs text-[var(--muted-foreground)]">
                        {pending ? "Issued when the developer's finance team verifies the sale." : "No allocation letter was issued for this sale."}
                      </div>
                    </div>
                  </li>
                )}
              </ul>
            )}
          </Section>

          <Section title="Plot details">
            <dl className="grid sm:grid-cols-2 sm:gap-x-10 text-sm">
              {[
                ["Estate", plot.estate],
                ["Reference", plot.plotLabel],
                ["Nominal size", sizeText(plot) ?? "No land area of its own"],
                ["Surveyed area", plot.actualSqm ? `${plot.actualSqm} sqm` : "Not yet surveyed"],
                ["Type", plot.isCorner ? "Corner piece ★" : "Standard"],
                ["Intent", plot.intent === "development" ? "Development" : "Investment"],
                ["Plan", plot.plan === "outright" ? "Outright" : `${plot.installmentMonths}-month ${plot.plan}`],
                ["Acquired", plot.acquiredDate ? formatDay(plot.acquiredDate) : "When finance verifies"],
              ].map(([l, v]) => (
                <div key={l} className="flex justify-between gap-4 py-2.5 border-b border-[var(--border)]">
                  <dt className="text-[var(--muted-foreground)]">{l}</dt>
                  <dd className="font-medium text-[var(--foreground)] text-right">{v}</dd>
                </div>
              ))}
            </dl>
            {/* Only when a premium was actually applied. */}
            {plot.cornerPremiumPct !== undefined && plot.basePrice !== undefined && (
              <div className="mt-3 text-xs text-[var(--secondary-foreground)] bg-[var(--secondary)] rounded-lg p-3">
                {formatAmount(plot.basePrice, plot.currency)} + {plot.cornerPremiumPct}% corner premium = {formatAmount(plot.totalPrice, plot.currency)}
              </div>
            )}
          </Section>

          <Section title="Payments" subtitle={`Every payment is logged and can't be changed.${docsAvailable ? " Each one's receipt downloads from its number." : " Receipts aren't issued yet; quote the payment reference if you contact us."}`}>
            <div className="overflow-x-auto -mx-5 sm:-mx-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[var(--muted)] text-left text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
                    <th scope="col" className="px-5 sm:px-6 py-2.5 font-medium">Date</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Type</th>
                    <th scope="col" className="px-3 py-2.5 font-medium text-right">Amount</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                    <th scope="col" className="px-5 sm:px-6 py-2.5 font-medium text-right">{docsAvailable ? "Receipt" : "Payment reference"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {plot.payments.map((p) => (
                    <tr key={p.id}>
                      <td className="px-5 sm:px-6 py-3 whitespace-nowrap">{formatDay(p.date)}</td>
                      <td className="px-3 py-3 capitalize">{p.type}</td>
                      <td className="px-3 py-3 text-right font-mono-data font-medium whitespace-nowrap">{formatAmount(p.amount, plot.currency)}</td>
                      <td className="px-3 py-3"><PaymentStatusPill status={p.status} /></td>
                      <td className="px-5 sm:px-6 py-3 text-right">
                        {receiptFor(p.receiptId) ? (
                          <ReceiptDownload receiptId={p.receiptId!} receiptNumber={receiptFor(p.receiptId)!.number!} />
                        ) : isLive("portfolio") ? (
                          // A receipt is issued when Paystack confirms; none yet.
                          <span className="text-xs text-[var(--muted-foreground)]">—</span>
                        ) : (
                          <span className="text-xs text-[var(--muted-foreground)] font-mono-data">{p.receiptId}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {plot.payments.length > 1 && (
                  <tfoot>
                    <tr className="border-t border-[var(--border)] bg-[var(--muted)]">
                      <td colSpan={2} className="px-5 sm:px-6 py-3 text-xs font-semibold">Total paid</td>
                      <td className="px-3 py-3 text-right font-mono-data text-xs font-bold">{formatAmount(plot.paidAmount, plot.currency)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Section>

          {/* Construction — capability-gated, no fabricated data */}
          {CAPABILITIES.constructionTracking && (
            <Section title="Construction"><ConstructionTab estateId={plot.estateId} /></Section>
          )}
        </div>

        <aside className="space-y-5">
          {/* Make a payment */}
          {canPay && nextPeriod && (
            <Section title="Make a payment">
              {payStep === "form" ? (
                <form onSubmit={handlePaySubmit} className="space-y-3" noValidate>
                  <div className="bg-[var(--muted)] rounded-lg p-3">
                    <div className="text-xs text-[var(--muted-foreground)]">Next due</div>
                    <div className="font-semibold font-mono-data">{formatAmount(nextPeriod.amount, plot.currency)}</div>
                    <div className="text-xs text-[var(--muted-foreground)]">{formatDay(nextPeriod.dueDate)}</div>
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

                  {payError && <p id="pay-amount-error" role="alert" className="text-[var(--error-text)] text-xs">{payError}</p>}

                  <Button type="submit" fullWidth size="lg" disabled={payLoading}>{payLoading ? "Submitting…" : "Pay now"}</Button>
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
                    <Button variant="secondary" fullWidth onClick={resetPaymentForm} className="mt-4">
                      {verifyStatus === "rejected" ? "Try again" : "Make another payment"}
                    </Button>
                  )}
                </div>
              )}
            </Section>
          )}

          {/* Title — never the title type alone: declared, verified or not confirmed. */}
          <Section title="Title">
            {titleRow ? (
              <div className="flex gap-3">
                <span className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center ${titleRow.chip}`}>{titleRow.tone === "success" ? <CheckIcon size={14} /> : <AlertIcon size={14} />}</span>
                <div>
                  <div className="text-sm font-semibold text-[var(--foreground)]">{titleRow.head}</div>
                  <p className="text-xs text-[var(--muted-foreground)]">{titleRow.body}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">{titleLabel(plot.titleType, titleStatus)}</p>
            )}
          </Section>

          {/* Actions — upgrades, resale and disputes, where they have a backend. */}
          {hasActions && (
            <Section title="Actions">
              <div className="space-y-2">
                {actions.upgrade && (plot.status === "upgrade_pending" && inFlightUpgrade ? (
                  <Link to={`/upgrade/request/${inFlightUpgrade.id}`} className="flex items-center gap-2 w-full py-2 text-left text-sm text-[var(--warning-text)] border border-[var(--warning-border)] bg-[var(--warning-surface)] rounded-md px-3">
                    View upgrade progress
                  </Link>
                ) : (
                  <ActionLink to={`/upgrade/${plot.id}`}>Upgrade or swap plot</ActionLink>
                ))}
                {actions.resale && <ActionLink to={`/resale/list/${plot.id}`}>List for resale</ActionLink>}
                {actions.dispute && <ActionLink to={`/support?dispute=true&plot=${plot.id}`}>Raise a dispute</ActionLink>}
              </div>
            </Section>
          )}

          <Section title="Help with this plot">
            <ul className="space-y-1">
              <HelpLink to={`/marketplace/${plot.estateId}`} icon={<BuildingIcon size={18} />} head="View the estate page" sub="Fees, terms and the developer's details" />
              <HelpLink to="/support" icon={<MessageIcon size={18} />} head="Contact support" sub="Questions about your plot or documents" />
            </ul>
          </Section>
        </aside>
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title?: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5 sm:p-6">
      {title && <h2 className="text-[17px] font-semibold text-[var(--foreground)] mb-1">{title}</h2>}
      {subtitle && <p className="text-xs text-[var(--muted-foreground)] mb-3">{subtitle}</p>}
      {title && !subtitle && <div className="mb-3" />}
      {children}
    </section>
  );
}

function Fact({ label, value, mono, green }: { label: string; value: string; mono?: boolean; green?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-[var(--muted-foreground)] mb-0.5">{label}</dt>
      <dd className={`text-sm ${mono ? "font-mono-data font-medium" : "font-semibold"} ${green ? "text-[var(--success-text)]" : "text-[var(--foreground)]"}`}>{value}</dd>
    </div>
  );
}

function ActionLink({ to, children }: { to: string; children: React.ReactNode }) {
  return <Link to={to} className="flex items-center justify-between w-full py-2 text-sm text-[var(--foreground)] border border-[var(--border)] rounded-md px-3 hover:bg-[var(--muted)]">{children}<ChevronRightIcon size={15} /></Link>;
}

function HelpLink({ to, icon, head, sub }: { to: string; icon: React.ReactNode; head: string; sub: string }) {
  return (
    <li>
      <Link to={to} className="flex items-center gap-3 rounded-lg -mx-2 px-2 py-2 hover:bg-[var(--muted)]">
        <span className="w-9 h-9 shrink-0 rounded-[10px] bg-[var(--secondary)] text-[var(--secondary-foreground)] flex items-center justify-center">{icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-sm font-semibold text-[var(--foreground)]">{head}</span>
          <span className="block text-xs text-[var(--muted-foreground)]">{sub}</span>
        </span>
        <ChevronRightIcon size={16} />
      </Link>
    </li>
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
