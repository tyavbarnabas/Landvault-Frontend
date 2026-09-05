import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useApp } from "../../contexts/AppContext";
import { completePendingWishlistIntent } from "../../lib/pendingWishlist";
import { consumePendingIntent } from "../../lib/pendingIntent";

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, toggleWishlistItem } = useApp();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError("Enter your email and password."); return; }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setStep("otp");
    }, 800);
  };

  const handleOtp = (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) { setError("Enter the 6-digit code."); return; }
    setLoading(true);
    setTimeout(async () => {
      try {
        const loggedInUser = await login(email, password);

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
        navigate(returnUrl || (loggedInUser.role === "super_admin" ? "/admin/dashboard" : "/dashboard"));
      } catch {
        setLoading(false);
        setError("Sign-in failed. Please try again.");
      }
    }, 700);
  };

  return (
    <AuthShell>
      <div className="w-full max-w-sm mx-auto">
        <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">Sign in</h1>
        <p className="text-[var(--muted-foreground)] text-sm mb-8">
          New here? <Link to="/register" className="text-[var(--accent)] hover:underline">Create an account</Link>
        </p>


        {step === "credentials" ? (
          <form onSubmit={handleCredentials} className="space-y-4">
            <Field label="Email or phone" type="text" value={email} onChange={setEmail} placeholder="emeka@example.com" />
            <Field label="Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" />
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <div className="text-right">
              <Link to="/forgot-password" className="text-xs text-[var(--muted-foreground)] hover:text-[var(--accent)]">Forgot password?</Link>
            </div>
            <button type="submit" disabled={loading} className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium disabled:opacity-60 hover:opacity-90 transition-opacity">
              {loading ? "Verifying…" : "Continue"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtp} className="space-y-4">
            <div className="bg-[var(--secondary)] rounded-lg p-4 text-sm text-[var(--muted-foreground)]">
              A 6-digit code was sent to <span className="font-medium text-[var(--foreground)]">{email}</span>. Enter it below to complete sign-in.
            </div>
            <Field label="One-time code" type="text" value={otp} onChange={setOtp} placeholder="000000" maxLength={6} />
            {error && <p className="text-red-600 text-sm">{error}</p>}
            <button type="submit" disabled={loading} className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium disabled:opacity-60 hover:opacity-90 transition-opacity">
              {loading ? "Signing in…" : "Confirm & sign in"}
            </button>
            <button type="button" onClick={() => setStep("credentials")} className="w-full py-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
              ← Back
            </button>
          </form>
        )}
      </div>
    </AuthShell>
  );
}

function Field({ label, type, value, onChange, placeholder, maxLength }: { label: string; type: string; value: string; onChange: (v: string) => void; placeholder: string; maxLength?: number }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className="w-full px-3 py-2.5 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]"
      />
    </div>
  );
}

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full grid lg:grid-cols-2">
      {/* Form side */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <Link to="/" className="flex items-center gap-2 mb-10">
            <span className="font-display text-xl text-[var(--foreground)]">LandVault</span>
          </Link>
          {children}
        </div>
      </div>

      {/* Image side */}
      <div className="hidden lg:block relative bg-[var(--primary)] overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1486325212027-8081e485255e?w=900&h=1200&fit=crop&auto=format"
          alt="Aerial view of an estate"
          className="w-full h-full object-cover opacity-40"
        />
        <div className="absolute inset-0 flex flex-col justify-end p-12">
          <div className="text-white">
            <p className="font-display text-2xl leading-relaxed mb-3">Verified titles. Live plot maps. One record, start to finish.</p>
            <p className="text-white/60 text-sm">Every reservation, payment, and document is tracked from allocation through to title transfer.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
