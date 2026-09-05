// Route: /marketplace/checkout/:listingId/:plotId — Parts 5–8 of the buyer
// flow: reserve intent → KYC gate → 45-minute lock → purchase intent →
// payment plan → payment → two-step verification → allocation. No sidebar,
// same convention as the existing internal /checkout route.
//
// CRITICAL, resolved sequencing (see landvault-buyer-purchase-flow in
// project memory): KYC runs BEFORE the lock starts, never inside it.

import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { formatAmount } from "../../data/mockData";
import { useApp } from "../../contexts/AppContext";
import { fetchListingById, type Listing, type PaymentPlanType } from "../../services/marketplaceService";
import { fetchPlotById, plotLabel, priceForPlot, type ListingPlot } from "../../services/marketplacePlotsService";
import { fetchKycStatus, type KycRecord } from "../../services/kycService";
import { startReservation, releaseReservation, RESERVATION_SECONDS, type Reservation } from "../../services/reservationService";
import {
  initiateTransaction, initiatePayment, confirmPayment, runFinanceVerification,
  paymentMethodsForCountry, type Transaction, type MarketplacePaymentMethod, type VirtualAccountDetails,
} from "../../services/marketplaceCheckoutService";
import CountdownTimer from "../../components/checkout/CountdownTimer";
import KycFlow from "../../components/checkout/KycFlow";
import PaymentPlanSelector, { depositFor } from "../../components/checkout/PaymentPlanSelector";
import PaymentMethodSelector from "../../components/checkout/PaymentMethodSelector";
import VerificationProgress from "../../components/checkout/VerificationProgress";

type Step = "confirm" | "kyc" | "intent" | "plan" | "payment" | "verifying" | "allocated" | "expired";

export default function MarketplaceCheckout() {
  const { listingId, plotId } = useParams<{ listingId: string; plotId: string }>();
  const navigate = useNavigate();
  const { user, currency, addNotification } = useApp();

  const [listing, setListing] = useState<Listing | null | undefined>(undefined);
  const [plot, setPlot] = useState<ListingPlot | null | undefined>(undefined);
  const [step, setStep] = useState<Step>("confirm");
  const [kycRecord, setKycRecord] = useState<KycRecord | null>(null);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [purchaseIntent, setPurchaseIntent] = useState<"development" | "investment">("development");
  const [plan, setPlan] = useState<PaymentPlanType>("outright");
  const [installmentMonths, setInstallmentMonths] = useState(12);
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [payMethod, setPayMethod] = useState<MarketplacePaymentMethod | null>(null);
  const [virtualAccount, setVirtualAccount] = useState<VirtualAccountDetails | null>(null);
  const [paymentError, setPaymentError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!listingId || !plotId) { setListing(null); setPlot(null); return; }
    let cancelled = false;
    fetchListingById(listingId).then((l) => { if (!cancelled) setListing(l ?? null); });
    fetchPlotById(listingId, plotId).then((p) => { if (!cancelled) setPlot(p ?? null); });
    return () => { cancelled = true; };
  }, [listingId, plotId]);

  useEffect(() => {
    if (!user) return;
    fetchKycStatus(user).then(setKycRecord);
  }, [user]);

  if (listing === undefined || plot === undefined || !user) return <div className="p-8 text-[var(--muted-foreground)] text-sm">Loading…</div>;
  if (!listing || !plot) return <div className="p-8 text-[var(--muted-foreground)] text-sm">Plot not found. <Link to="/marketplace" className="text-[var(--accent)] hover:underline">Back to marketplace</Link></div>;

  const tier = listing.priceTiers.find((t) => t.id === plot.tierId);
  const { base, final: totalPrice } = priceForPlot(plot, listing.priceTiers, listing.cornerPremiumPct);

  const startLock = async () => {
    setLoading(true);
    const res = await startReservation(listing.id, plot.id);
    setReservation(res);
    setLoading(false);
    setStep("intent");
  };

  const handleConfirmReserve = () => {
    if (!kycRecord) return;
    if (kycRecord.status !== "approved") setStep("kyc");
    else startLock();
  };

  const handleKycApproved = (record: KycRecord) => {
    setKycRecord(record);
    startLock();
  };

  const handleExpire = async () => {
    if (reservation) await releaseReservation(reservation.id);
    setStep("expired");
  };

  const handleReReserve = () => {
    setReservation(null);
    setStep("confirm");
  };

  const goToPayment = async () => {
    if (!reservation) return;
    setLoading(true);
    const deposit = depositFor(plan, totalPrice);
    const txn = await initiateTransaction({
      listingId: listing.id,
      listingName: listing.name,
      plotId: plot.id,
      plotLabel: plotLabel(plot),
      sizeSqm: plot.sizeSqm,
      actualAreaSqm: plot.actualAreaSqm,
      isCorner: plot.isCorner,
      cornerPremiumPct: listing.cornerPremiumPct,
      basePrice: base,
      titleType: listing.titleType,
      location: `${listing.area}, ${listing.city}, ${listing.state}`,
      reservationId: reservation.id,
      tierId: plot.tierId,
      intent: purchaseIntent,
      plan,
      installmentMonths: plan === "outright" ? undefined : installmentMonths,
      currency,
      amountDue: deposit,
      totalPrice,
    });
    setTransaction(txn);
    setLoading(false);
    setStep("payment");
  };

  const selectPayMethod = async (method: MarketplacePaymentMethod) => {
    setPayMethod(method);
    setVirtualAccount(null);
    setPaymentError("");
    if (!transaction) return;
    const result = await initiatePayment(transaction.id, method);
    if (result.requiresTransfer && result.account) setVirtualAccount(result.account);
  };

  const handlePaymentSubmit = async () => {
    if (!transaction) return;
    setPaymentError("");
    setStep("verifying");
    try {
      const received = await confirmPayment(transaction.id);
      setTransaction(received);
      const verified = await runFinanceVerification(transaction.id);
      setTransaction(verified);
      await addNotification({
        type: "approval",
        title: "Payment verified — documents issued",
        body: `${listing.name} ${plotLabel(plot)} has been allocated to you. Your receipt, allocation letter, deed, and POA draft are ready in your vault.`,
        date: new Date().toISOString().split("T")[0],
      });
      setStep("allocated");
    } catch {
      setPaymentError("Something went wrong confirming your payment. Please try again.");
      setStep("payment");
    }
  };

  const deposit = depositFor(plan, totalPrice);
  const showCountdown = reservation && !["verifying", "allocated", "expired", "confirm", "kyc"].includes(step);

  return (
    <div className="min-h-full bg-[var(--background)] py-8 px-4">
      <div className="max-w-xl mx-auto">
        <button onClick={() => navigate(-1)} className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] mb-6">← Back to plot</button>
        <h1 className="font-display text-2xl mb-1">Reserve your plot</h1>
        <p className="text-sm text-[var(--muted-foreground)] mb-6">{listing.name} — {plotLabel(plot)} · {plot.sizeSqm} sqm</p>

        {showCountdown && reservation && <div className="mb-6"><CountdownTimer expiresAt={reservation.expiresAt} onExpire={handleExpire} /></div>}

        {/* Progress */}
        {!["expired", "verifying", "allocated"].includes(step) && (
          <div className="flex gap-1 mb-6">
            {(["confirm", "kyc", "intent", "plan", "payment"] as Step[]).map((s) => (
              <div key={s} className={`h-1 flex-1 rounded-full ${["confirm", "kyc", "intent", "plan", "payment"].indexOf(step) >= ["confirm", "kyc", "intent", "plan", "payment"].indexOf(s) ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`} />
            ))}
          </div>
        )}

        {step === "confirm" && (
          <div>
            {tier?.availability === "sold_out" || plot.status === "sold" || plot.status === "reserved" ? (
              <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800 mb-6">This plot is no longer available. Please choose another.</div>
            ) : (
              <>
                <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5 mb-6">
                  <h3 className="font-semibold text-sm mb-4">Order summary</h3>
                  <div className="space-y-2 text-sm">
                    <Row label="Estate" value={listing.name} />
                    <Row label="Plot ref" value={plotLabel(plot)} mono />
                    <Row label="Size" value={`${plot.sizeSqm} sqm nominal · ${plot.actualAreaSqm} sqm surveyed`} mono />
                    <Row label="Type" value={plot.isCorner ? "Corner piece ★" : "Standard"} />
                    {plot.isCorner && <Row label="Corner premium" value={`${base.toLocaleString()} + ${listing.cornerPremiumPct}%`} mono />}
                    <div className="border-t border-[var(--border)] pt-2 mt-2">
                      <Row label="Total price" value={formatAmount(totalPrice, currency)} mono bold />
                    </div>
                  </div>
                </div>
                <button onClick={handleConfirmReserve} disabled={loading} className="w-full py-3 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">
                  {loading ? "Starting your hold…" : "Confirm & continue →"}
                </button>
              </>
            )}
          </div>
        )}

        {step === "kyc" && kycRecord && <KycFlow record={kycRecord} onApproved={handleKycApproved} />}

        {step === "intent" && (
          <div>
            <h2 className="font-semibold mb-2">Purchase intent</h2>
            <p className="text-sm text-[var(--muted-foreground)] mb-5">Your declared intent determines the documents generated and the legal terms that apply.</p>
            <div className="grid gap-3 mb-6">
              {[
                { id: "development" as const, label: "Development", desc: "You intend to build on this plot. A deed of assignment and allocation letter reflecting development use will be issued.", icon: "🏗" },
                { id: "investment" as const, label: "Investment / appreciation", desc: "You're holding for capital appreciation or resale. Investment-use documents issued.", icon: "📈" },
              ].map((opt) => (
                <button key={opt.id} onClick={() => setPurchaseIntent(opt.id)} className={`text-left p-4 rounded-xl border-2 transition-colors ${purchaseIntent === opt.id ? "border-[var(--primary)] bg-[var(--secondary)]" : "border-[var(--border)]"}`}>
                  <div className="flex items-start gap-3">
                    <span className="text-2xl mt-0.5">{opt.icon}</span>
                    <div><div className="font-semibold text-sm">{opt.label}</div><div className="text-xs text-[var(--muted-foreground)] mt-1 leading-relaxed">{opt.desc}</div></div>
                  </div>
                </button>
              ))}
            </div>
            <button onClick={() => setStep("plan")} className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 transition-opacity">Select payment plan →</button>
          </div>
        )}

        {step === "plan" && (
          <div>
            <h2 className="font-semibold mb-2">Payment plan</h2>
            <p className="text-sm text-[var(--muted-foreground)] mb-5">Choose how you'd like to pay for this plot.</p>
            <PaymentPlanSelector
              availablePlans={listing.paymentPlans}
              totalPrice={totalPrice}
              currency={currency}
              plan={plan}
              onPlanChange={setPlan}
              installmentMonths={installmentMonths}
              onInstallmentMonthsChange={setInstallmentMonths}
            />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setStep("intent")} className="flex-1 py-2.5 border border-[var(--border)] rounded-md text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">← Back</button>
              <button onClick={goToPayment} disabled={loading} className="flex-[2] py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60">Choose payment method →</button>
            </div>
          </div>
        )}

        {step === "payment" && transaction && (
          <div>
            <h2 className="font-semibold mb-2">Payment</h2>
            <p className="text-sm text-[var(--muted-foreground)] mb-5">Complete your {plan === "outright" ? "full payment" : "deposit"} to secure this plot.</p>

            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4 mb-5">
              <div className="text-xs text-[var(--muted-foreground)] mb-1">Amount due now</div>
              <div className="font-display text-2xl">{formatAmount(deposit, currency)}</div>
              {transaction.fxRateLocked !== undefined && (
                <div className="text-xs text-[var(--muted-foreground)] mt-1">Rate locked for your checkout window: 1 {currency} ≈ ₦{Math.round(1 / transaction.fxRateLocked).toLocaleString()}</div>
              )}
            </div>

            <div className="mb-5">
              <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">Payment method</label>
              <PaymentMethodSelector methods={paymentMethodsForCountry(user.country)} selected={payMethod} onSelect={selectPayMethod} />
            </div>

            {(payMethod === "virtual_account" || payMethod === "wire") && (
              <div className="bg-[var(--muted)] rounded-lg p-4 mb-5 font-mono-data text-sm">
                {virtualAccount ? (
                  <>
                    <div className="text-xs text-[var(--muted-foreground)] mb-1">Transfer to this account</div>
                    <div className="font-semibold">{virtualAccount.bankName}</div>
                    <div className="text-lg tracking-wider my-1">{virtualAccount.accountNumber}</div>
                    <div className="text-xs text-[var(--muted-foreground)]">Account name: {virtualAccount.accountName}</div>
                    <div className="mt-2 text-xs text-amber-700">Use this exact reference. It expires when your plot hold expires.</div>
                  </>
                ) : <div className="text-xs text-[var(--muted-foreground)]">Generating your dedicated account number…</div>}
              </div>
            )}

            {paymentError && <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{paymentError}</div>}

            <div className="flex gap-2">
              <button onClick={() => setStep("plan")} className="flex-1 py-2.5 border border-[var(--border)] rounded-md text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">← Back</button>
              <button
                onClick={handlePaymentSubmit}
                disabled={!payMethod || (["virtual_account", "wire"].includes(payMethod ?? "") && !virtualAccount)}
                className="flex-[2] py-2.5 bg-[var(--accent)] text-white rounded-md text-sm font-semibold disabled:opacity-60 hover:opacity-90 transition-opacity"
              >
                {payMethod === "virtual_account" || payMethod === "wire" ? "I've made the transfer →" : "Pay now →"}
              </button>
            </div>
          </div>
        )}

        {step === "verifying" && transaction && (
          <VerificationProgress status={transaction.status} reference={transaction.reference} amountDue={deposit} currency={currency} rejectionReason={transaction.rejectionReason} />
        )}

        {step === "allocated" && transaction && (
          <div className="text-center py-8">
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6 text-4xl">✅</div>
            <h2 className="font-display text-2xl mb-2">Plot allocated!</h2>
            <p className="text-sm text-[var(--muted-foreground)] max-w-sm mx-auto mb-6">
              {plotLabel(plot)} at {listing.name} is now allocated to you. Your documents are ready in your vault.
            </p>
            <div className="bg-[var(--secondary)] rounded-xl p-4 text-left mb-6">
              <div className="text-xs text-[var(--muted-foreground)] mb-1.5 font-medium">Issued to your vault</div>
              <ul className="text-sm space-y-1.5 text-[var(--muted-foreground)]">
                <li className="flex items-start gap-2"><span className="text-emerald-600 mt-0.5">✓</span>Payment receipt</li>
                <li className="flex items-start gap-2"><span className="text-emerald-600 mt-0.5">✓</span>Provisional allocation letter</li>
                <li className="flex items-start gap-2"><span className="text-emerald-600 mt-0.5">✓</span>Deed of assignment</li>
                <li className="flex items-start gap-2"><span className="text-emerald-600 mt-0.5">✓</span>POA draft</li>
              </ul>
            </div>
            <div className="flex gap-3">
              <Link to="/documents" className="flex-1 py-2.5 border border-[var(--border)] rounded-md text-sm font-medium hover:bg-[var(--muted)] transition-colors text-center">View documents</Link>
              <Link to="/portfolio" className="flex-1 py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 transition-opacity text-center">Go to portfolio</Link>
            </div>
          </div>
        )}

        {step === "expired" && (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-[var(--muted)] flex items-center justify-center mx-auto mb-6 text-3xl">⏱</div>
            <h2 className="font-display text-2xl mb-2">Your hold expired</h2>
            <p className="text-sm text-[var(--muted-foreground)] max-w-sm mx-auto mb-6">This plot may still be available — no payment was taken. You can reserve it again.</p>
            <div className="flex gap-3">
              <Link to={`/marketplace/${listing.id}/plots?size=${plot.sizeSqm}&plot=${plot.id}`} className="flex-1 py-2.5 border border-[var(--border)] rounded-md text-sm font-medium hover:bg-[var(--muted)] transition-colors text-center">Back to plot</Link>
              <button onClick={handleReReserve} className="flex-1 py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 transition-opacity">Reserve again</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, mono, bold }: { label: string; value: string; mono?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--muted-foreground)]">{label}</span>
      <span className={`${mono ? "font-mono-data" : ""} ${bold ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}
