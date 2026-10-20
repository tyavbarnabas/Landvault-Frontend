// Create an account, from the Figma "Sign-in & landing" proposal: labelled
// steps (two live — your details, where you're based — and the demo's email
// code as a third), the password rules ticking off as you type, and Back
// beside the final button.

import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "../../contexts/AppContext";
import type { Currency } from "../../data/mockData";
import AuthShell, { AuthHeading } from "../../components/auth/AuthShell";
import CodeInput from "../../components/auth/CodeInput";
import PhoneField from "../../components/auth/PhoneField";
import { dialCountry } from "../../data/dialCodes";
import { phoneProblem, toInternational } from "../../lib/phone";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import TextLink from "../../components/ui/TextLink";
import { ErrorText, Field, Input, Select } from "../../components/ui/Field";
import { cx } from "../../components/ui/cx";
import { CheckIcon } from "../../components/icons";
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
  const { register, reloadWishlist } = useApp();
  const [step, setStep] = useState<Step>("details");
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", dialIso: "NG", password: "", country: "NG", currency: "NGN" });
  const [phoneError, setPhoneError] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleDetails = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.email || !form.password) { setError("Please fill in all required fields."); return; }
    const pw = assessPassword(form.password, form);
    if (!pw.acceptable) { setError(pw.problem ?? "Choose a stronger password."); return; }
    setError("");
    setStep("country");
  };

  const handleCountry = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    // Live sign-up needs a phone; the demo lets it be left out.
    const problem = !form.phone.trim() ? (LIVE ? "Enter your mobile number." : null) : phoneProblem(form.dialIso, form.phone);
    setPhoneError(problem ?? "");
    if (problem) return;
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
          firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim(),
          // One international number, e.g. +447700900123.
          phone: form.phone.trim() ? toInternational(form.dialIso, form.phone) : "",
          password: form.password, country: form.country, currency: form.currency as Currency,
        });

        // Complete a pending wishlist intent (see WishlistButton.tsx) before
        // returning the user to wherever they were. KYC belongs at purchase,
        // not signup — see below when there's no returnUrl to honor.
        await completePendingWishlistIntent(reloadWishlist);

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

  const steps = STEPS.filter((st) => !LIVE || st.id !== "otp");
  const current = steps.findIndex((st) => st.id === step);

  return (
    <AuthShell>
      <AuthHeading title={step === "details" ? "Create your account" : step === "country" ? "Where are you based?" : "Confirm your email"}>
        {step === "details" && <>Already have one? <TextLink to="/login" className="font-medium">Sign in</TextLink></>}
        {step === "country" && "So we can show prices in a currency you know, reach you about a purchase, and use the right identity check when you buy."}
        {step === "otp" && <>A 6-digit code was sent to <span className="font-medium text-[var(--foreground)]">{form.email}</span>. Enter it to confirm your account.</>}
      </AuthHeading>

      <ol className="flex items-center gap-3 mb-7" aria-label="Sign-up steps">
        {steps.map((st, i) => (
          <li key={st.id} className="flex items-center gap-3" aria-current={i === current ? "step" : undefined}>
            {i > 0 && <span className="w-6 sm:w-10 h-px bg-[var(--border)]" aria-hidden="true" />}
            <span className="flex items-center gap-2">
              <span className={cx("w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold",
                i <= current ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "bg-[var(--muted)] text-[var(--muted-foreground)]")}>
                {i < current ? <CheckIcon size={12} /> : i + 1}
              </span>
              {/* Three steps (demo) only fit with the current one named. */}
              <span className={cx("text-sm whitespace-nowrap", i === current ? "font-semibold text-[var(--foreground)]" : cx("text-[var(--muted-foreground)] hidden", steps.length === 2 && "sm:inline"))}>{st.label}</span>
            </span>
          </li>
        ))}
      </ol>

      {step === "details" && (
        <form onSubmit={handleDetails} className="space-y-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <Field id="reg-first" label="First name">
              <Input id="reg-first" autoComplete="given-name" value={form.firstName} onChange={set("firstName")} placeholder="Emeka" />
            </Field>
            <Field id="reg-last" label="Last name">
              <Input id="reg-last" autoComplete="family-name" value={form.lastName} onChange={set("lastName")} placeholder="Okonkwo" />
            </Field>
          </div>
          <Field id="reg-email" label="Email">
            <Input id="reg-email" type="email" autoComplete="email" value={form.email} onChange={set("email")} placeholder="emeka@example.com" />
          </Field>
          <Field id="reg-password" label="Password">
            {/* No confirm field: the eye lets you check what you typed, and a
                mistyped password is recoverable with "Forgot password". */}
            <PasswordInput id="reg-password" value={form.password} onChange={(v) => setForm((f) => ({ ...f, password: v }))}
              autoComplete="new-password" placeholder="Choose a strong password" describedBy="reg-password-guide" />
            <PasswordStrength id="reg-password-guide" assessment={assessPassword(form.password, form)} started={form.password.length > 0} />
          </Field>
          {error && <ErrorText>{error}</ErrorText>}
          <Button type="submit" size="lg" fullWidth>Continue</Button>
          <p className="text-xs text-[var(--muted-foreground)]">No documents needed now. HomeTrue checks your identity only when you buy.</p>
        </form>
      )}

      {step === "country" && (
        <form onSubmit={handleCountry} className="space-y-4" noValidate>
          <Field id="reg-country" label="Country you live in">
            <Select id="reg-country" autoComplete="country" value={form.country}
              // The dial code follows the country; it can still be changed.
              onChange={(e) => { const country = e.target.value; setForm((f) => ({ ...f, country, dialIso: dialCountry(country) ? country : f.dialIso })); }}>
              <option value="NG">Nigeria</option>
              <option value="GB">United Kingdom</option>
              <option value="US">United States</option>
              <option value="DE">Germany</option>
              <option value="CA">Canada</option>
              <option value="ZA">South Africa</option>
              {/* The backend takes a two-letter country code only. */}
              {!LIVE && <option value="OTHER">Other</option>}
            </Select>
          </Field>
          <PhoneField id="reg-phone" label={LIVE ? "Mobile number" : "Mobile number (optional)"}
            dialIso={form.dialIso} onDialIso={(iso) => setForm((f) => ({ ...f, dialIso: iso }))}
            number={form.phone} onNumber={(v) => { setForm((f) => ({ ...f, phone: v })); setPhoneError(""); }}
            error={phoneError || undefined} />
          <Field id="reg-currency" label="Show prices alongside naira in" hint="Estates price in naira. This adds an approximate amount beside it.">
            <Select id="reg-currency" value={form.currency} onChange={set("currency")} aria-describedby="reg-currency-hint">
              <option value="NGN">NGN — Nigerian naira (₦)</option>
              <option value="USD">USD — US dollar ($)</option>
              <option value="GBP">GBP — British pound (£)</option>
              <option value="EUR">EUR — Euro (€)</option>
            </Select>
          </Field>
          {form.country !== "NG" && (
            <Alert tone="info">Buying from outside Nigeria: you'll verify with your international passport when you buy. Payments are made through HomeTrue.</Alert>
          )}
          {LIVE && error && <ErrorText>{error}</ErrorText>}
          <div className="flex gap-3">
            <Button size="lg" variant="secondary" onClick={() => setStep("details")}>Back</Button>
            <Button type="submit" size="lg" className="flex-1" disabled={loading}>
              {LIVE ? (loading ? "Creating account…" : "Create account") : (loading ? "Sending code…" : "Send verification code")}
            </Button>
          </div>
        </form>
      )}

      {step === "otp" && (
        <form onSubmit={handleOtp} className="space-y-4" noValidate>
          <Field id="reg-otp" label="Verification code">
            <CodeInput id="reg-otp" value={otp} onChange={setOtp} autoFocus />
          </Field>
          {error && <ErrorText>{error}</ErrorText>}
          <Button type="submit" size="lg" fullWidth disabled={loading}>{loading ? "Creating account…" : "Confirm and create account"}</Button>
          {/* Demo only: live sign-up has no emailed code, so nothing is sent. */}
          <p className="text-xs text-[var(--muted-foreground)]">Demo mode: any 6 digits work.</p>
        </form>
      )}
    </AuthShell>
  );
}

const STEPS: { id: Step; label: string }[] = [
  { id: "details", label: "Your details" },
  { id: "country", label: "Where you're based" },
  { id: "otp", label: "Confirm your email" },
];
