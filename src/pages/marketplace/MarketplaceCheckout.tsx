// Route: /marketplace/checkout/:listingId/:plotId — Parts 5–8 of the buyer
// flow: review → KYC gate → 45-minute lock → purchase details (intent and
// payment plan) → payment → two-step verification → allocation. Its own
// pared-down header instead of the marketplace navigation; the layout is the
// Figma checkout proposal (labelled steps, order summary beside every step).
//
// CRITICAL, resolved sequencing (see landvault-buyer-purchase-flow in
// project memory): KYC runs BEFORE the lock starts, never inside it.

import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { formatAmount, formatInCurrency } from "../../data/mockData";
import { useApp } from "../../contexts/AppContext";
import { useFetch } from "../../lib/useFetch";
import { fetchCostDisclosure, isGrandfathered, tierCommitmentForSize } from "../../services/costDisclosureService";
import CostDisclosureSection from "../../components/cost/CostDisclosureSection";
import CommitmentBreakdown from "../../components/cost/CommitmentBreakdown";
import ExitCostsPanel from "../../components/cost/ExitCostsPanel";
import ErrorBoundary from "../../components/ErrorBoundary";
import { fetchListingById, type PaymentPlanType } from "../../services/marketplaceService";
import { fetchPlotById, plotLabel, priceForPlot } from "../../services/marketplacePlotsService";
import { fetchKycStatus, type KycRecord } from "../../services/kycService";
import { startReservation, releaseReservation, RESERVATION_SECONDS, type Reservation } from "../../services/reservationService";
import {
  initiateTransaction, initiatePayment, confirmPayment, runFinanceVerification,
  paymentMethodsForCountry, type Transaction, type MarketplacePaymentMethod, type VirtualAccountDetails,
} from "../../services/marketplaceCheckoutService";
import { useHoldCountdown, HoldAnnouncement } from "../../components/checkout/CountdownTimer";
import KycFlow from "../../components/checkout/KycFlow";
import AddressForm from "../../components/account/AddressForm";
import LetterAddress from "../../components/account/LetterAddress";
import PaymentPlanSelector, { depositFor } from "../../components/checkout/PaymentPlanSelector";
import PaymentMethodSelector from "../../components/checkout/PaymentMethodSelector";
import VerificationProgress from "../../components/checkout/VerificationProgress";
import OrderSummary, { OrderSummaryBar } from "../../components/checkout/OrderSummary";
import OptionCard from "../../components/checkout/OptionCard";
import { CheckoutHeader, CheckoutSteps } from "../../components/checkout/CheckoutShell";
import { ApiError } from "../../lib/apiClient";
import { describeLoadError } from "../../components/LoadError";
import { isLive } from "../../lib/backends";
import PayButton from "../../components/purchases/PayButton";
import Card from "../../components/ui/Card";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import TextLink from "../../components/ui/TextLink";
import { Loading } from "../../components/ui/Page";
import { ArrowLeftIcon, MapPinIcon, BuildingIcon, CheckIcon, ClockIcon, CreditCardIcon, FileCheckIcon, ShieldCheckIcon, TrendingUpIcon } from "../../components/icons";

type Step = "confirm" | "kyc" | "details" | "payment" | "verifying" | "allocated" | "expired";
const IN_FLOW: Step[] = ["confirm", "kyc", "details", "payment"];
const HOLD_MINUTES = Math.round(RESERVATION_SECONDS / 60);

// The action row. On a phone it sticks to the bottom of the screen, so the
// next step is always in reach while the buyer reads.
const ACTIONS = "flex flex-wrap items-center gap-x-4 gap-y-2 max-lg:sticky max-lg:bottom-0 max-lg:z-10 max-lg:-mx-4 sm:max-lg:-mx-6 max-lg:px-4 sm:max-lg:px-6 max-lg:py-3 max-lg:bg-[var(--card)] max-lg:border-t max-lg:border-[var(--border)]";
const PRIMARY_WIDTH = "w-full sm:w-auto";

export default function MarketplaceCheckout() {
  const { listingId, plotId } = useParams<{ listingId: string; plotId: string }>();
  const navigate = useNavigate();
  const { user, currency, addNotification } = useApp();

  const [step, setStep] = useState<Step>("confirm");
  const [kycRecord, setKycRecord] = useState<KycRecord | null>(null);
  // Whether this buyer had to verify at the start. Keeps "Verify identity"
  // in the steps once they've passed it, so the count doesn't jump.
  const [kycWasNeeded, setKycWasNeeded] = useState(false);
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [purchaseIntent, setPurchaseIntent] = useState<"development" | "investment">("development");
  const [plan, setPlan] = useState<PaymentPlanType>("outright");
  const [installmentMonths, setInstallmentMonths] = useState(12);
  const [transaction, setTransaction] = useState<Transaction | null>(null);
  const [payMethod, setPayMethod] = useState<MarketplacePaymentMethod | null>(null);
  const [virtualAccount, setVirtualAccount] = useState<VirtualAccountDetails | null>(null);
  const [paymentError, setPaymentError] = useState("");
  const [loading, setLoading] = useState(false);
  // A reserve/transaction call the backend refused (plot just taken, KYC
  // needed, …): shown in place, never a spinner that never ends.
  const [stepError, setStepError] = useState("");
  // The address the allocation letter goes to: changing it, or asked for
  // because the backend said there's none (409 ADDRESS_REQUIRED — the
  // signed-in user can be stale). Saving it then carries straight on.
  const [editingAddress, setEditingAddress] = useState(false);
  const [addressRequired, setAddressRequired] = useState(false);
  // Saving the address asked for on Review, before the hold starts.
  const [savingAddress, setSavingAddress] = useState(false);
  // Live: paying happens on Paystack's page (PayButton), and only outright
  // purchases in naira can be paid online for now.
  const live = isLive("checkout");

  const { data: listingAndPlot, loading: pageLoading } = useFetch(async () => {
    if (!listingId || !plotId) return { listing: null, plot: null, disclosure: null };
    const [listing, plot, disclosure] = await Promise.all([fetchListingById(listingId), fetchPlotById(listingId, plotId), fetchCostDisclosure(listingId)]);
    return { listing: listing ?? null, plot: plot ?? null, disclosure };
  }, [listingId, plotId]);
  const listing = listingAndPlot?.listing ?? null;
  const plot = listingAndPlot?.plot ?? null;
  const disclosure = listingAndPlot?.disclosure ?? null;

  useEffect(() => {
    if (!user) return;
    fetchKycStatus(user).then((record) => {
      setKycRecord(record);
      setKycWasNeeded(record.status !== "approved");
    });
  }, [user]);

  const handleExpire = async () => {
    // Once a purchase is recorded the backend ends it itself when the hold
    // runs out (it becomes `abandoned`); there's nothing to release.
    if (reservation && !transaction) await releaseReservation(reservation.id).catch(() => {});
    setStep("expired");
  };

  // The hold keeps running after the purchase is recorded: pay before it ends.
  const countdownRunning = !!reservation && ["details", "payment"].includes(step);
  const holdSecondsLeft = useHoldCountdown(countdownRunning ? reservation!.expiresAt : null, handleExpire);

  if (pageLoading || !user) return <Shell><Loading /></Shell>;
  if (!listing || !plot) {
    return (
      <Shell>
        <p className="text-sm text-[var(--muted-foreground)]">Plot not found. <TextLink to="/marketplace">Back to marketplace</TextLink></p>
      </Shell>
    );
  }

  const tier = listing.priceTiers.find((t) => t.id === plot.tierId);
  const { base, final: totalPrice } = priceForPlot(plot, listing.priceTiers, listing.cornerPremiumPct);
  const commitment = tierCommitmentForSize(disclosure, plot.sizeSqm);
  const plotUrl = `/marketplace/${listing.id}/plots?size=${plot.sizeSqm}&plot=${plot.id}`;
  const unavailable = tier?.availability === "sold_out" || plot.status === "sold" || plot.status === "reserved";

  const startLock = async () => {
    setLoading(true);
    setStepError("");
    try {
      const res = await startReservation(listing.id, plot.id);
      setReservation(res);
      setStep("details");
    } catch (err) {
      setStepError(refusal(err, "We couldn't hold this plot."));
      setStep("confirm");
    } finally {
      setLoading(false);
    }
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

  const handleReReserve = () => {
    setReservation(null);
    setTransaction(null);
    setStep("confirm");
  };

  const goToPayment = async () => {
    if (!reservation) return;
    setLoading(true);
    setStepError("");
    const deposit = depositFor(plan, totalPrice);
    let txn: Transaction;
    try {
      txn = await initiateTransaction({
        listingId: listing.id,
        listingName: listing.name,
        plotId: plot.id,
        plotLabel: plotLabel(plot),
        sizeSqm: plot.sizeSqm,
        actualAreaSqm: plot.actualAreaSqm,
        isCorner: plot.isCorner,
        cornerPremiumPct: listing.cornerPremiumPct,
        basePrice: base,
        titleType: listing.titleType ?? "",
        location: `${listing.area}, ${listing.city}, ${listing.state}`,
        reservationId: reservation.id,
        tierId: plot.tierId,
        intent: purchaseIntent,
        plan,
        installmentMonths: plan === "outright" ? undefined : installmentMonths,
        currency,
        amountDue: deposit,
        totalPrice,
        buyer: { email: user.email, address: user.address },
      });
    } catch (err) {
      if (err instanceof ApiError && err.body?.code === "ADDRESS_REQUIRED") {
        setAddressRequired(true);
        setLoading(false);
        return;
      }
      setStepError(refusal(err, "We couldn't start your purchase."));
      setLoading(false);
      return;
    }
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
  // The journey starts on the plot map (MarketplacePlotSelection shows the same
  // steps), so choosing a plot is step 1 and already done here.
  const steps = ["Choose a plot", "Review", ...(kycWasNeeded ? ["Verify identity"] : []), "Purchase details", "Payment"];
  const stepIndex = step === "confirm" ? 1 : step === "kyc" ? 2 : step === "details" ? steps.length - 2 : steps.length - 1;
  const heading: Record<string, [string, string]> = {
    confirm: ["Review your plot", "Check the plot and its full cost. Nothing is charged here."],
    kyc: ["Verify your identity", "We check who you are before we hold a plot for you. It's needed once."],
    details: ["Purchase details", "Two quick choices, then where your letter goes."],
    payment: ["Pay for your plot", "Your plot is held while you pay."],
  };
  const summaryProps = { listing, plot, base, totalPrice, currency, commitment, holdSecondsLeft, held: !!reservation };
  const errorAlert = stepError && <Alert tone="error" role="alert">{stepError}</Alert>;
  const address = user.address ?? null;
  const askAddress = !address || editingAddress || addressRequired;
  // A buyer with no address gives it on Review, so none of the hold goes on
  // typing it (Figma "Buyer's address" proposal).
  const askOnReview = !address;
  const needsKyc = !!kycRecord && kycRecord.status !== "approved";

  const addressSaved = () => {
    const carryOn = addressRequired || !address;
    setEditingAddress(false);
    if (carryOn) {
      setAddressRequired(false);
      void goToPayment();
    }
  };

  if (!IN_FLOW.includes(step)) {
    return (
      <Shell narrow>
        <ErrorBoundary section="checkout">
          {step === "verifying" && transaction && transaction.status !== "abandoned" && (
            <VerificationProgress status={transaction.status} reference={transaction.reference} amountDue={deposit} currency={currency} rejectionReason={transaction.rejectionReason} />
          )}

          {step === "allocated" && transaction && (
            <div className="text-center py-8">
              <div className="w-20 h-20 rounded-full bg-[var(--success-surface)] text-[var(--success-text)] flex items-center justify-center mx-auto mb-6"><CheckIcon size={36} /></div>
              <h1 className="font-display text-3xl text-[var(--foreground)] mb-2">Plot allocated</h1>
              <p className="text-sm text-[var(--muted-foreground)] max-w-sm mx-auto mb-6">
                {plotLabel(plot)} at {listing.name} is now allocated to you. Your documents are ready in your vault.
              </p>
              <div className="bg-[var(--secondary)] rounded-xl p-4 text-left mb-6">
                <div className="text-xs text-[var(--muted-foreground)] mb-1.5 font-medium">Issued to your vault</div>
                <ul className="text-sm space-y-1.5 text-[var(--muted-foreground)]">
                  {["Payment receipt", "Provisional allocation letter", "Deed of assignment", "POA draft"].map((doc) => (
                    <li key={doc} className="flex items-center gap-2"><CheckIcon size={14} className="text-[var(--success-text)]" />{doc}</li>
                  ))}
                </ul>
              </div>
              <div className="flex gap-3">
                <Button variant="secondary" size="lg" className="flex-1" onClick={() => navigate("/documents")}>View documents</Button>
                <Button size="lg" className="flex-1" onClick={() => navigate("/portfolio")}>Go to portfolio</Button>
              </div>
            </div>
          )}

          {step === "expired" && (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-[var(--muted)] text-[var(--muted-foreground)] flex items-center justify-center mx-auto mb-6"><ClockIcon size={30} /></div>
              <h1 className="font-display text-3xl text-[var(--foreground)] mb-2">Your hold expired</h1>
              <p className="text-sm text-[var(--muted-foreground)] max-w-sm mx-auto mb-6">This plot may still be available — no payment was taken. You can reserve it again.</p>
              <div className="flex gap-3">
                <Button variant="secondary" size="lg" className="flex-1" onClick={() => navigate(plotUrl)}>Back to plot</Button>
                <Button size="lg" className="flex-1" onClick={handleReReserve}>Reserve again</Button>
              </div>
            </div>
          )}
        </ErrorBoundary>
      </Shell>
    );
  }

  return (
    <Shell bar={<OrderSummaryBar {...summaryProps} />}>
      <HoldAnnouncement secondsLeft={holdSecondsLeft} />
      <div className="mb-6 sm:mb-8 space-y-5">
        {/* Leaving once the hold has started would strand it, so the way
            back is only offered before then. */}
        {(step === "confirm" || step === "kyc") && (
          <TextLink to={plotUrl} muted className="inline-flex items-center gap-1.5 text-sm"><ArrowLeftIcon size={14} />Back to plot</TextLink>
        )}
        <div>
          <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">{heading[step][0]}</h1>
          <p className="text-[var(--muted-foreground)]">{heading[step][1]}</p>
        </div>
        <CheckoutSteps steps={steps} current={stepIndex} />
      </div>

      <div className="grid gap-8 lg:gap-12 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
        <div className="min-w-0 space-y-6">
          <ErrorBoundary section="checkout">
            {step === "confirm" && (unavailable ? (
              <Alert tone="error" role="alert">
                This plot is no longer available. <TextLink to={`/marketplace/${listing.id}/plots`}>Choose another plot</TextLink>
              </Alert>
            ) : (
              <>
                {/* The full cost, before the reserve action completes. Every
                    term here is already disclosed by developers — in a letter
                    issued after the buyer has paid. The failure is sequence,
                    not secrecy, and this is the last moment disclosure can
                    still change the decision. */}
                <Card as="section" className="sm:p-6">
                  <h2 className="font-semibold text-[var(--foreground)]">What this commits you to</h2>
                  <p className="text-sm text-[var(--muted-foreground)] mb-4">The full cost of this plot, before anything is held or paid.</p>
                  {disclosure && !isGrandfathered(disclosure) ? (
                    <CommitmentBreakdown disclosure={disclosure} commitment={commitment} corner={plot.isCorner} />
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-4 text-sm mb-4">
                        <span className="text-[var(--muted-foreground)]">Plot price{plot.isCorner ? `, with the ${listing.cornerPremiumPct}% corner premium` : ""}</span>
                        <span className="font-mono-data font-medium text-[var(--foreground)]">{formatAmount(totalPrice, currency)}</span>
                      </div>
                      <CostDisclosureSection disclosure={disclosure} tier={commitment} />
                    </>
                  )}
                </Card>

                {disclosure?.exitCosts && !isGrandfathered(disclosure) && (
                  <Card as="section" className="sm:p-6">
                    <h2 className="font-semibold text-[var(--foreground)] mb-3">If you change your mind</h2>
                    <ExitCostsPanel exitCosts={disclosure.exitCosts} layout="rows" />
                  </Card>
                )}

                {askOnReview && (
                  <Card as="section" aria-labelledby="review-address-heading" className="space-y-4 sm:p-6">
                    <div className="flex items-start gap-3">
                      <span className="w-9 h-9 shrink-0 rounded-lg bg-[var(--secondary)] text-[var(--primary)] flex items-center justify-center"><MapPinIcon size={18} /></span>
                      <div>
                        <h2 id="review-address-heading" className="font-semibold text-[var(--foreground)]">Where should your allocation letter go?</h2>
                        <p className="text-sm text-[var(--muted-foreground)]">
                          Your postal address, printed under your name. We ask once, now — before your plot is held — so none of your {HOLD_MINUTES} minutes go on typing. Change it later in Settings.
                        </p>
                      </div>
                    </div>
                    <AddressForm id="checkout-review-address" initial={null} actions={false} layout="wide"
                      onBusyChange={setSavingAddress} onSaved={handleConfirmReserve} />
                  </Card>
                )}

                <Alert tone="info">
                  Nothing is charged at this step. When you continue,{askOnReview ? " we save your address," : ""}{needsKyc ? " we check your identity," : ""}{askOnReview || needsKyc ? " then" : ""} we hold {plotLabel(plot)} for you for {HOLD_MINUTES} minutes while you finish.
                </Alert>
                {errorAlert}
                <div className={ACTIONS}>
                  {askOnReview ? (
                    <Button type="submit" form="checkout-review-address" size="lg" className={PRIMARY_WIDTH} disabled={loading || savingAddress || !kycRecord}>
                      {savingAddress ? "Saving your address…" : loading ? "Starting your hold…" : needsKyc ? "Save address and continue to identity check" : "Save address and hold this plot"}
                    </Button>
                  ) : (
                    <Button size="lg" className={PRIMARY_WIDTH} onClick={handleConfirmReserve} disabled={loading || !kycRecord}>
                      {loading ? "Starting your hold…" : needsKyc ? "Continue to identity check" : "Hold this plot and continue"}
                    </Button>
                  )}
                  <TextLink to={`/marketplace/${listing.id}/plots`} className="text-sm max-sm:w-full max-sm:text-center">Choose a different plot</TextLink>
                </div>
              </>
            ))}

            {step === "kyc" && kycRecord && (
              <>
                <KycFlow record={kycRecord} onApproved={handleKycApproved} />
                {errorAlert}
              </>
            )}

            {step === "details" && (
              <>
                <Card as="section" className="sm:p-6">
                  <h2 className="font-semibold text-[var(--foreground)]">How will you use this plot?</h2>
                  <p className="text-sm text-[var(--muted-foreground)] mb-4">This decides which documents and legal terms apply to your purchase.</p>
                  <div role="radiogroup" aria-label="Purchase intent" className="grid gap-3 sm:grid-cols-2">
                    <OptionCard name="intent" value="development" checked={purchaseIntent === "development"} onSelect={() => setPurchaseIntent("development")}
                      icon={<BuildingIcon size={20} />} title="To build on it" description="Your deed of assignment and allocation letter are drawn up for development use." />
                    <OptionCard name="intent" value="investment" checked={purchaseIntent === "investment"} onSelect={() => setPurchaseIntent("investment")}
                      icon={<TrendingUpIcon size={20} />} title="To hold as an investment" description="Documents drawn up for holding the land for appreciation or resale." />
                  </div>
                </Card>
                <Card as="section" className="sm:p-6">
                  <h2 className="font-semibold text-[var(--foreground)]">How will you pay?</h2>
                  <p className="text-sm text-[var(--muted-foreground)] mb-4">Choose a payment plan.</p>
                  <PaymentPlanSelector
                    availablePlans={live ? ["outright"] : listing.paymentPlans}
                    unavailablePlans={live ? listing.paymentPlans : []}
                    unavailableReason="Not available for online payment yet."
                    totalPrice={totalPrice}
                    currency={currency}
                    plan={plan}
                    onPlanChange={setPlan}
                    installmentMonths={installmentMonths}
                    onInstallmentMonthsChange={setInstallmentMonths}
                  />
                </Card>
                <Card as="section" aria-labelledby="letter-address-heading" className="space-y-4 sm:p-6">
                  {askAddress ? (
                    <>
                      <div>
                        <h2 id="letter-address-heading" className="font-semibold text-[var(--foreground)]">Where should your allocation letter go?</h2>
                        <p className="text-sm text-[var(--muted-foreground)]">This purchase keeps the address you give here. Change it for later ones in Settings.</p>
                      </div>
                      {addressRequired && (
                        <Alert tone="warning">We need your address before you buy. Nothing has been charged, and {plotLabel(plot)} is still held for you.</Alert>
                      )}
                      <AddressForm id="checkout-address" initial={address} onSaved={addressSaved} layout="wide"
                        submitLabel={addressRequired || !address ? "Save and continue" : "Save address"}
                        onCancel={address && editingAddress && !addressRequired ? () => setEditingAddress(false) : undefined} />
                    </>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h2 id="letter-address-heading" className="font-semibold text-[var(--foreground)]">Your allocation letter will be addressed to</h2>
                          <p className="text-sm text-[var(--muted-foreground)]">This purchase keeps this address, even if you change it later.</p>
                        </div>
                        <Button variant="secondary" onClick={() => setEditingAddress(true)} aria-label="Change the address on your allocation letter">Change</Button>
                      </div>
                      <LetterAddress name={user.name} phone={user.phone} address={address!} icon />
                    </>
                  )}
                </Card>
                {errorAlert}
                <div className={ACTIONS}>
                  <Button size="lg" className={PRIMARY_WIDTH} onClick={goToPayment} disabled={loading || askAddress}>
                    {loading ? "Starting your purchase…" : live ? "Continue to payment" : "Choose payment method"}
                  </Button>
                  {askAddress && <span className="text-sm text-[var(--muted-foreground)]">Save your address to continue.</span>}
                </div>
              </>
            )}

            {step === "payment" && transaction && live && (
              // Paystack's own page takes the money; it sends the buyer back to
              // /payments/return, which asks the backend what really happened.
              <>
                <Card as="section" className="sm:p-6">
                  <div className="text-sm text-[var(--muted-foreground)]">Amount to pay</div>
                  <div className="font-display text-4xl text-[var(--foreground)] my-1">{formatInCurrency(transaction.totalPrice, "NGN")}</div>
                  <div className="text-sm text-[var(--muted-foreground)]">Pay in full · {plotLabel(plot)}, {listing.name}</div>
                  <div className="text-sm text-[var(--muted-foreground)] mt-3 pt-3 border-t border-[var(--border)]">Reference <span className="font-mono-data text-[var(--foreground)]">{transaction.reference}</span></div>
                </Card>
                <NextSteps />
                <Alert tone="warning">Pay before your hold runs out. If it ends first, nothing is taken and you can reserve the plot again.</Alert>
                <div className={ACTIONS}>
                  <div className="w-full"><PayButton transactionId={transaction.id} label={`Pay ${formatInCurrency(transaction.totalPrice, "NGN")} with Paystack`} /></div>
                </div>
                <p className="text-center text-sm"><TextLink to={`/purchases/${transaction.id}`}>View this purchase</TextLink></p>
                <p className="text-xs text-[var(--muted-foreground)]">Online payment is for outright purchases only for now.</p>
              </>
            )}

            {step === "payment" && transaction && !live && (
              <>
                <Card as="section" className="sm:p-6">
                  <div className="text-sm text-[var(--muted-foreground)]">Amount due now</div>
                  <div className="font-display text-4xl text-[var(--foreground)] my-1">{formatAmount(deposit, currency)}</div>
                  <div className="text-sm text-[var(--muted-foreground)]">{plan === "outright" ? "Pay in full" : "Deposit"} · {plotLabel(plot)}, {listing.name}</div>
                  {transaction.fxRateLocked !== undefined && (
                    <div className="text-xs text-[var(--muted-foreground)] mt-2">Rate locked for your checkout window: 1 {currency} ≈ ₦{Math.round(1 / transaction.fxRateLocked).toLocaleString()}</div>
                  )}
                </Card>

                <Card as="section" className="sm:p-6">
                  <h2 className="font-semibold text-[var(--foreground)] mb-3">Payment method</h2>
                  <PaymentMethodSelector methods={paymentMethodsForCountry(user.country)} selected={payMethod} onSelect={selectPayMethod} />
                  {(payMethod === "virtual_account" || payMethod === "wire") && (
                    <div className="bg-[var(--muted)] rounded-lg p-4 mt-4 font-mono-data text-sm">
                      {virtualAccount ? (
                        <>
                          <div className="text-xs text-[var(--muted-foreground)] mb-1">Transfer to this account</div>
                          <div className="font-semibold">{virtualAccount.bankName}</div>
                          <div className="text-lg tracking-wider my-1">{virtualAccount.accountNumber}</div>
                          <div className="text-xs text-[var(--muted-foreground)]">Account name: {virtualAccount.accountName}</div>
                          <div className="mt-2 text-xs text-[var(--warning-text)]">Use this exact reference. It expires when your plot hold expires.</div>
                        </>
                      ) : <div className="text-xs text-[var(--muted-foreground)]">Generating your dedicated account number…</div>}
                    </div>
                  )}
                </Card>

                {paymentError && <Alert tone="error" role="alert">{paymentError}</Alert>}

                <div className={ACTIONS}>
                  <Button variant="secondary" size="lg" onClick={() => setStep("details")}>Back</Button>
                  <Button
                    size="lg"
                    className="flex-1 sm:flex-none"
                    onClick={handlePaymentSubmit}
                    disabled={!payMethod || (["virtual_account", "wire"].includes(payMethod ?? "") && !virtualAccount)}
                  >
                    {payMethod === "virtual_account" || payMethod === "wire" ? "I've made the transfer" : "Pay now"}
                  </Button>
                </div>
              </>
            )}
          </ErrorBoundary>
        </div>

        <div className="hidden lg:block lg:sticky lg:top-6">
          <OrderSummary {...summaryProps} />
        </div>
      </div>
    </Shell>
  );
}

// The page frame: checkout header, the phone summary bar when there is one,
// and the content width (narrow for the single-message outcome screens).
function Shell({ children, bar, narrow }: { children: React.ReactNode; bar?: React.ReactNode; narrow?: boolean }) {
  return (
    <div className="min-h-screen bg-[var(--background)]">
      <CheckoutHeader />
      {bar && <div className="lg:hidden">{bar}</div>}
      <main className={`${narrow ? "max-w-lg" : "max-w-6xl"} mx-auto px-4 sm:px-6 pt-6 sm:pt-8 pb-16 max-lg:pb-0`}>{children}</main>
    </div>
  );
}

function NextSteps() {
  const items: [React.ReactNode, string, string][] = [
    [<CreditCardIcon key="c" size={18} />, "You pay on Paystack's secure page", "You come straight back here once you've paid."],
    [<ShieldCheckIcon key="s" size={18} />, "The developer verifies your payment", "They check the money has arrived. The plot stays held for you meanwhile."],
    [<FileCheckIcon key="f" size={18} />, "Your plot is allocated to you", "Your receipt and allocation letter appear in your document vault."],
  ];
  return (
    <Card as="section" className="sm:p-6">
      <h2 className="font-semibold text-[var(--foreground)] mb-4">What happens next</h2>
      <ol className="space-y-4">
        {items.map(([icon, title, body]) => (
          <li key={title} className="flex gap-3.5">
            <span className="w-9 h-9 shrink-0 rounded-full bg-[var(--secondary)] text-[var(--secondary-foreground)] flex items-center justify-center">{icon}</span>
            <div>
              <div className="text-sm font-semibold text-[var(--foreground)]">{title}</div>
              <div className="text-sm text-[var(--muted-foreground)]">{body}</div>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

// The backend's own reason when it gave one (e.g. "Plot is no longer
// available"), otherwise what went wrong in transport terms.
function refusal(err: unknown, lead: string): string {
  if (err instanceof ApiError) return `${lead} ${err.message}`;
  return `${lead} ${describeLoadError(err).summary}`;
}
