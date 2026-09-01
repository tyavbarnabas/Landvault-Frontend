import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { formatAmount, getPlotBlockLabel, type PaymentPlan, type Estate, type Plot } from "../../data/mockData";
import { fetchEstateById } from "../../services/estatesService";
import { reservePlot, initiatePayment, confirmPayment, finalizePurchase, type PaymentMethod, type VirtualAccountDetails } from "../../services/checkoutService";
import { useApp } from "../../contexts/AppContext";

type Step = "reserve" | "intent" | "plan" | "payment" | "confirmed";

export default function Checkout() {
  const { estateId, plotId } = useParams();
  const navigate = useNavigate();
  const { currency } = useApp();
  const [estate, setEstate] = useState<Estate | null | undefined>(undefined); // undefined = loading, null = not found
  const [step, setStep] = useState<Step>("reserve");
  const [intent, setIntent] = useState<"development" | "investment">("development");
  const [plan, setPlan] = useState<PaymentPlan>("installment");
  const [installmentMonths, setInstallmentMonths] = useState(12);
  const [payMethod, setPayMethod] = useState<PaymentMethod>("paystack");
  const [loading, setLoading] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [countdown, setCountdown] = useState(2700); // 45 min in seconds, overwritten once the real reservation comes back
  const [reservationId, setReservationId] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [virtualAccount, setVirtualAccount] = useState<VirtualAccountDetails | null>(null);

  useEffect(() => {
    if (!estateId) { setEstate(null); return; }
    let cancelled = false;
    fetchEstateById(estateId).then((data) => { if (!cancelled) setEstate(data ?? null); });
    return () => { cancelled = true; };
  }, [estateId]);

  // Reserve the plot through the service once it's loaded (a real backend
  // takes out a short-lived lock here — see checkoutService.ts).
  useEffect(() => {
    if (!estateId || !plotId) return;
    let cancelled = false;
    reservePlot(estateId, plotId).then((res) => {
      if (cancelled) return;
      setReservationId(res.reservationId);
      setCountdown(res.expiresInSeconds);
    });
    return () => { cancelled = true; };
  }, [estateId, plotId]);

  if (estate === undefined) return <div className="p-8 text-[var(--muted-foreground)]">Loading…</div>;

  const plot: Plot | undefined = estate?.plots.find((p) => p.id === plotId);
  if (!estate || !plot) return <div className="p-8 text-[var(--muted-foreground)]">Plot not found.</div>;

  const plotLabel = getPlotBlockLabel(estate, plot).label;
  const deposit = plan === "outright" ? plot.price : plot.price * 0.2;
  const remaining = plot.price - deposit;
  const installmentAmount = plan === "installment" ? remaining / installmentMonths : 0;

  const handleNext = () => {
    const steps: Step[] = ["reserve", "intent", "plan", "payment", "confirmed"];
    const idx = steps.indexOf(step);
    if (idx < steps.length - 1 && step !== "payment") {
      setStep(steps[idx + 1]);
    }
  };

  const handlePaymentSubmit = async () => {
    if (!reservationId) return;
    setLoading(true);
    setPaymentError("");
    try {
      // Virtual-account details were already fetched when the method was
      // selected (see the effect below) — otherwise (paystack/wire) initiate now.
      const activePaymentId = paymentId ?? (await initiatePayment({ reservationId, amount: deposit, currency, method: payMethod })).paymentId;
      const { confirmed } = await confirmPayment(activePaymentId);
      if (!confirmed) throw new Error("Payment was not confirmed. Please try again.");
      await finalizePurchase({ estate, plot, intent, plan, installmentMonths, depositAmount: deposit, currency });
      setStep("confirmed");
    } catch (err) {
      setPaymentError(err instanceof Error ? err.message : "Payment failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Eagerly fetch virtual-account details as soon as that method is picked,
  // so the transfer instructions on screen come from the service, not a
  // hardcoded string.
  useEffect(() => {
    if (step !== "payment" || payMethod !== "virtual" || !reservationId) return;
    let cancelled = false;
    initiatePayment({ reservationId, amount: deposit, currency, method: "virtual" }).then((res) => {
      if (cancelled) return;
      setPaymentId(res.paymentId);
      setVirtualAccount(res.account ?? null);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, payMethod, reservationId]);

  const handleBack = () => {
    const steps: Step[] = ["reserve", "intent", "plan", "payment", "confirmed"];
    const idx = steps.indexOf(step);
    if (idx > 0) setStep(steps[idx - 1]);
  };

  const mins = Math.floor(countdown / 60);
  const secs = countdown % 60;

  return (
    <div className="min-h-full bg-[var(--background)] py-8 px-4">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <button onClick={() => navigate(-1)} className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] mb-6 flex items-center gap-1">
          ← Back to estate
        </button>
        <h1 className="font-display text-2xl mb-1">Reserve your plot</h1>
        <p className="text-sm text-[var(--muted-foreground)] mb-6">{estate.name} — {plotLabel} · {plot.sqm} sqm</p>

        {/* Progress */}
        {step !== "confirmed" && (
          <div className="flex gap-1 mb-6">
            {(["reserve", "intent", "plan", "payment"] as Step[]).map((s, i) => (
              <div key={s} className={`h-1 flex-1 rounded-full ${["reserve", "intent", "plan", "payment", "confirmed"].indexOf(step) >= i ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`} />
            ))}
          </div>
        )}

        {/* Reserve step */}
        {step === "reserve" && (
          <div>
            {/* Timer */}
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3">
              <span className="text-xl">⏱</span>
              <div>
                <div className="text-sm font-semibold text-amber-900">Plot held for {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}</div>
                <div className="text-xs text-amber-700">This plot is reserved for 45 minutes while you check out. It will return to the pool if not purchased.</div>
              </div>
            </div>

            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-5 mb-6">
              <h3 className="font-semibold text-sm mb-4">Order summary</h3>
              <div className="space-y-2 text-sm">
                <Row label="Estate" value={estate.name} />
                <Row label="Plot ref" value={plotLabel} mono />
                <Row label="Size" value={`${plot.sqm} sqm`} mono />
                <Row label="Type" value={plot.type === "corner" ? "Corner piece ★" : "Standard"} />
                <Row label="Orientation" value={plot.orientation} />
                <div className="border-t border-[var(--border)] pt-2 mt-2">
                  <Row label="Plot price" value={formatAmount(plot.price, currency)} mono bold />
                </div>
              </div>
            </div>

            <button onClick={handleNext} className="w-full py-3 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 transition-opacity">
              Proceed to purchase intent →
            </button>
          </div>
        )}

        {/* Intent step */}
        {step === "intent" && (
          <div>
            <h2 className="font-semibold mb-2">Purchase intent</h2>
            <p className="text-sm text-[var(--muted-foreground)] mb-5">Your declared intent determines the documents generated and the legal terms that apply.</p>
            <div className="grid gap-3 mb-6">
              {[
                { id: "development", label: "Development", desc: "You intend to build on this plot. A deed of assignment and allocation letter reflecting development use will be issued.", icon: "🏗" },
                { id: "investment", label: "Investment / appreciation", desc: "You're holding for capital appreciation or resale on the secondary market. Investment-use documents issued.", icon: "📈" },
              ].map((opt) => (
                <button key={opt.id} onClick={() => setIntent(opt.id as any)} className={`text-left p-4 rounded-xl border-2 transition-colors ${intent === opt.id ? "border-[var(--primary)] bg-[var(--secondary)]" : "border-[var(--border)]"}`}>
                  <div className="flex items-start gap-3">
                    <span className="text-2xl mt-0.5">{opt.icon}</span>
                    <div>
                      <div className="font-semibold text-sm">{opt.label}</div>
                      <div className="text-xs text-[var(--muted-foreground)] mt-1 leading-relaxed">{opt.desc}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={handleBack} className="flex-1 py-2.5 border border-[var(--border)] rounded-md text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">← Back</button>
              <button onClick={handleNext} className="flex-[2] py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 transition-opacity">Select payment plan →</button>
            </div>
          </div>
        )}

        {/* Plan step */}
        {step === "plan" && (
          <div>
            <h2 className="font-semibold mb-2">Payment plan</h2>
            <p className="text-sm text-[var(--muted-foreground)] mb-5">Choose how you'd like to pay for this plot.</p>
            <div className="grid gap-3 mb-4">
              {([
                { id: "outright", label: "Outright payment", desc: `Pay ${formatAmount(plot.price, currency)} today and documents are issued immediately.`, icon: "⚡" },
                { id: "installment", label: "Installment plan", desc: `20% deposit now, balance spread over your chosen period.`, icon: "📅" },
              ] as const).map((opt) => (
                <button key={opt.id} onClick={() => setPlan(opt.id)} className={`text-left p-4 rounded-xl border-2 transition-colors ${plan === opt.id ? "border-[var(--primary)] bg-[var(--secondary)]" : "border-[var(--border)]"}`}>
                  <div className="flex items-start gap-3">
                    <span className="text-xl mt-0.5">{opt.icon}</span>
                    <div>
                      <div className="font-semibold text-sm">{opt.label}</div>
                      <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{opt.desc}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {plan === "installment" && (
              <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4 mb-4">
                <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">Duration</label>
                <select value={installmentMonths} onChange={(e) => setInstallmentMonths(Number(e.target.value))} className="w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md bg-[var(--card)]">
                  {[6, 9, 12, 18, 24].map((m) => <option key={m} value={m}>{m} months</option>)}
                </select>
                <div className="mt-3 space-y-1.5 text-sm">
                  <Row label="Deposit today (20%)" value={formatAmount(deposit, currency)} mono />
                  <Row label="Monthly installment" value={formatAmount(installmentAmount, currency)} mono />
                  <Row label="Total" value={formatAmount(plot.price, currency)} mono bold />
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={handleBack} className="flex-1 py-2.5 border border-[var(--border)] rounded-md text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">← Back</button>
              <button onClick={handleNext} className="flex-[2] py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 transition-opacity">Choose payment method →</button>
            </div>
          </div>
        )}

        {/* Payment step */}
        {step === "payment" && (
          <div>
            <h2 className="font-semibold mb-2">Payment</h2>
            <p className="text-sm text-[var(--muted-foreground)] mb-5">Complete your {plan === "outright" ? "full payment" : "deposit"} to secure this plot.</p>

            <div className="bg-[var(--card)] rounded-xl border border-[var(--border)] p-4 mb-5">
              <div className="text-xs text-[var(--muted-foreground)] mb-1">Amount due now</div>
              <div className="font-display text-2xl">{formatAmount(deposit, currency)}</div>
              {plan === "installment" && <div className="text-xs text-[var(--muted-foreground)] mt-0.5">20% deposit · balance in {installmentMonths} monthly installments of {formatAmount(installmentAmount, currency)}</div>}
            </div>

            <div className="mb-5">
              <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-2">Payment method</label>
              <div className="grid gap-2">
                {[
                  { id: "paystack", label: "Paystack / Monnify", desc: "NGN via card, bank transfer, or USSD", flag: "🇳🇬" },
                  { id: "virtual", label: "Virtual account", desc: "Dedicated account number for bank transfer (diaspora)", flag: "🏦" },
                  { id: "wire", label: "International wire", desc: "USD / GBP / EUR via SWIFT (diaspora)", flag: "🌍" },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setPayMethod(m.id as PaymentMethod); setPaymentId(null); setVirtualAccount(null); setPaymentError(""); }}
                    className={`text-left p-3 rounded-lg border-2 transition-colors flex items-center gap-3 ${payMethod === m.id ? "border-[var(--primary)] bg-[var(--secondary)]" : "border-[var(--border)]"}`}
                  >
                    <span className="text-xl">{m.flag}</span>
                    <div>
                      <div className="text-sm font-medium">{m.label}</div>
                      <div className="text-xs text-[var(--muted-foreground)]">{m.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {payMethod === "virtual" && (
              <div className="bg-[var(--muted)] rounded-lg p-4 mb-5 font-mono-data text-sm">
                {virtualAccount ? (
                  <>
                    <div className="text-xs text-[var(--muted-foreground)] mb-1">Transfer to this account</div>
                    <div className="font-semibold">{virtualAccount.bankName}</div>
                    <div className="text-lg tracking-wider my-1">{virtualAccount.accountNumber}</div>
                    <div className="text-xs text-[var(--muted-foreground)]">Account name: {virtualAccount.accountName}</div>
                    <div className="mt-2 text-xs text-amber-700">Use this exact account number. It expires when your plot hold expires.</div>
                  </>
                ) : (
                  <div className="text-xs text-[var(--muted-foreground)]">Generating your dedicated account number…</div>
                )}
              </div>
            )}

            {paymentError && (
              <div className="mb-5 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">{paymentError}</div>
            )}

            <div className="flex gap-2">
              <button onClick={handleBack} className="flex-1 py-2.5 border border-[var(--border)] rounded-md text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">← Back</button>
              <button
                onClick={handlePaymentSubmit}
                disabled={loading || (payMethod === "virtual" && !virtualAccount)}
                className="flex-[2] py-2.5 bg-[var(--accent)] text-white rounded-md text-sm font-semibold disabled:opacity-60 hover:opacity-90 transition-opacity"
              >
                {loading ? "Confirming payment…" : payMethod === "paystack" ? "Pay now →" : "I've made the transfer →"}
              </button>
            </div>
          </div>
        )}

        {/* Confirmed */}
        {step === "confirmed" && (
          <div className="text-center py-8">
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-6 text-4xl">✅</div>
            <h2 className="font-display text-2xl mb-2">Plot secured!</h2>
            <p className="text-sm text-[var(--muted-foreground)] max-w-sm mx-auto mb-6">
              Your deposit of <strong>{formatAmount(deposit, currency)}</strong> has been confirmed. {plotLabel} at {estate.name} is now allocated to you.
            </p>
            <div className="bg-[var(--secondary)] rounded-xl p-4 text-left mb-6">
              <div className="text-xs text-[var(--muted-foreground)] mb-1.5 font-medium">What happens next</div>
              <ul className="text-sm space-y-1.5 text-[var(--muted-foreground)]">
                <li className="flex items-start gap-2"><span className="text-emerald-600 mt-0.5">✓</span>Offer letter generated — available in your vault now</li>
                <li className="flex items-start gap-2"><span className="text-emerald-600 mt-0.5">✓</span>Allocation letter issued within 24 hours</li>
                {plan === "installment" && <li className="flex items-start gap-2"><span className="text-emerald-600 mt-0.5">✓</span>First installment of {formatAmount(installmentAmount, currency)} due in 30 days</li>}
              </ul>
            </div>
            <div className="flex gap-3">
              <button onClick={() => navigate("/documents")} className="flex-1 py-2.5 border border-[var(--border)] rounded-md text-sm font-medium hover:bg-[var(--muted)] transition-colors">View documents</button>
              <button onClick={() => navigate("/portfolio")} className="flex-1 py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 transition-opacity">Go to portfolio</button>
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
