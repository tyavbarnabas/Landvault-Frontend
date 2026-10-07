import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "../../contexts/AppContext";
import type { Currency } from "../../data/mockData";
import { AuthShell } from "./Login";
import { completePendingWishlistIntent } from "../../lib/pendingWishlist";
import { consumePendingIntent } from "../../lib/pendingIntent";
import { isLive } from "../../lib/backends";
import { ApiError } from "../../lib/apiClient";
import { assessPassword } from "../../lib/passwordPolicy";
import PasswordInput from "../../components/auth/PasswordInput";
import PasswordStrength from "../../components/auth/PasswordStrength";

// The backend has no sign-up code step: an account is created straight from
// the details, and phone is required. The emailed-code step is the mock's.
const LIVE = isLive("auth");

type Step = "details" | "country" | "otp";

export default function Register() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { register, toggleWishlistItem } = useApp();
  const [step, setStep] = useState<Step>("details");
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", password: "", country: "NG", currency: "NGN" });
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.email || !form.password || (LIVE && !form.phone.trim())) { setError("Please fill in all required fields."); return; }
    const pw = assessPassword(form.password, form);
    if (!pw.acceptable) { setError(pw.problem ?? "Choose a stronger password."); return; }
    setError("");
    setStep("country");
  };

  const handleCountry = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (LIVE) { void createAccount(); return; }
    setLoading(true);
    setTimeout(() => { setLoading(false); setStep("otp"); }, 600);
  };

  const handleOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) { setError("Enter the 6-digit code."); return; }
    setLoading(true);
    setTimeout(() => void createAccount(), 700);
  };

  const createAccount = async () => {
      setLoading(true);
      try {
        await register({
          firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim(), phone: form.phone.trim(),
          password: form.password, country: form.country, currency: form.currency as Currency,
        });

        // Complete a pending wishlist intent (see WishlistButton.tsx) before
        // returning the user to wherever they were. KYC belongs at purchase,
        // not signup — see below when there's no returnUrl to honor.
        await completePendingWishlistIntent(toggleWishlistItem);

        // Resume a Reserve/Inspect/Enquire/Make-an-offer intent (see
        // pendingIntent.ts) by jumping straight to the target action, not
        // just back to the listing.
        const pendingAction = consumePendingIntent();
        if (pendingAction) {
          if (pendingAction.action === "reserve") { navigate(`/marketplace/checkout/${pendingAction.listingId}/${pendingAction.plotId}`); return; }
          if (pendingAction.action === "inspect") { navigate(`/inspections/new?listingId=${pendingAction.listingId}&plotId=${pendingAction.plotId}`); return; }
          if (pendingAction.action === "enquire") {
            const returnUrl = searchParams.get("returnUrl");
            navigate(`${returnUrl ?? `/marketplace/${pendingAction.listingId}`}${returnUrl?.includes("?") ? "&" : "?"}enquire=1`);
            return;
          }
          if (pendingAction.action === "resale_offer") {
            const returnUrl = searchParams.get("returnUrl");
            navigate(`${returnUrl ?? `/marketplace/resale/${pendingAction.listingId}`}${returnUrl?.includes("?") ? "&" : "?"}offer=1`);
            return;
          }
        }

        const returnUrl = searchParams.get("returnUrl");
        navigate(returnUrl || "/marketplace?welcome=1");
      } catch (err) {
        setLoading(false);
        // The backend's reason (e.g. the email is already registered) beats a
        // generic retry message.
        setError(err instanceof ApiError && err.message ? err.message : "Registration failed. Please try again.");
      }
  };

  return (
    <AuthShell>
      <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">Create account</h1>
      <p className="text-[var(--muted-foreground)] text-sm mb-8">
        Already registered? <Link to="/login" className="text-[var(--accent)] hover:underline">Sign in</Link>
      </p>

      {/* Progress */}
      <div className="flex gap-1.5 mb-8">
        {(["details", "country", "otp"] as Step[]).map((s, i) => (
          <div key={s} className={`h-1 flex-1 rounded-full transition-colors ${i <= ["details", "country", "otp"].indexOf(step) ? "bg-[var(--primary)]" : "bg-[var(--border)]"}`} />
        ))}
      </div>

      {step === "details" && (
        <form onSubmit={handleDetails} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">First name</label>
              <input value={form.firstName} onChange={set("firstName")} placeholder="Emeka" className="w-full px-3 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Last name</label>
              <input value={form.lastName} onChange={set("lastName")} placeholder="Okonkwo" className="w-full px-3 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Email address</label>
            <input type="email" value={form.email} onChange={set("email")} placeholder="emeka@example.com" className="w-full px-3 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">{LIVE ? "Phone" : "Phone (optional)"}</label>
            <input value={form.phone} onChange={set("phone")} placeholder="+44 7700 900123" className="w-full px-3 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm" />
          </div>
          <div>
            <label htmlFor="reg-password" className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Password</label>
            {/* No confirm field: the eye lets you check what you typed, and a
                mistyped password is recoverable with "Forgot password". */}
            <PasswordInput id="reg-password" value={form.password} onChange={(v) => setForm((f) => ({ ...f, password: v }))}
              autoComplete="new-password" placeholder="Choose a strong password" describedBy="reg-password-guide" />
            <PasswordStrength id="reg-password-guide" assessment={assessPassword(form.password, form)} started={form.password.length > 0} />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
            Continue
          </button>
        </form>
      )}

      {step === "country" && (
        <form onSubmit={handleCountry} className="space-y-4">
          <p className="text-sm text-[var(--muted-foreground)]">Tell us where you're based so we can show the right pricing and onboarding path.</p>
          <div>
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Country of residence</label>
            <select value={form.country} onChange={set("country")} className="w-full px-3 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm">
              <option value="NG">Nigeria</option>
              <option value="GB">United Kingdom</option>
              <option value="US">United States</option>
              <option value="DE">Germany</option>
              <option value="CA">Canada</option>
              <option value="ZA">South Africa</option>
              {/* The backend takes a two-letter country code only. */}
              {!LIVE && <option value="OTHER">Other</option>}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Display currency</label>
            <select value={form.currency} onChange={set("currency")} className="w-full px-3 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm">
              <option value="NGN">NGN — Nigerian Naira (₦)</option>
              <option value="USD">USD — US Dollar ($)</option>
              <option value="GBP">GBP — British Pound (£)</option>
              <option value="EUR">EUR — Euro (€)</option>
            </select>
          </div>
          {form.country !== "NG" && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              Diaspora path selected. You'll verify with an international passport, and can pay in your chosen currency.
            </div>
          )}
          <button type="submit" disabled={loading} className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium disabled:opacity-60 hover:opacity-90 transition-opacity">
            {LIVE ? (loading ? "Creating account…" : "Create account") : (loading ? "Sending code…" : "Send verification code")}
          </button>
          {LIVE && error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="button" onClick={() => setStep("details")} className="w-full py-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">← Back</button>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={handleOtp} className="space-y-4">
          <div className="bg-[var(--secondary)] rounded-lg p-4 text-sm text-[var(--muted-foreground)]">
            A 6-digit code was sent to <span className="font-medium text-[var(--foreground)]">{form.email}</span>. Enter it to confirm your account.
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">Verification code</label>
            <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="000000" maxLength={6} className="w-full px-3 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm font-mono-data tracking-widest text-center text-lg" />
          </div>
          {error && <p className="text-red-600 text-sm">{error}</p>}
          <button type="submit" disabled={loading} className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium disabled:opacity-60 hover:opacity-90 transition-opacity">
            {loading ? "Creating account…" : "Confirm & create account"}
          </button>
          <p className="text-xs text-center text-[var(--muted-foreground)]">Didn't receive it? <button type="button" className="text-[var(--accent)] hover:underline">Resend code</button></p>
        </form>
      )}
    </AuthShell>
  );
}
