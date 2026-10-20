// The identity check — once, before a buyer's first purchase. Used in two
// places: inside checkout (Part 5 of the buyer flow) and on its own page
// (/kyc), from the Figma "KYC, list your company, verify" proposal. Routed by
// where the buyer lives, automatically: in Nigeria a NIN and the NIN slip; abroad
// a passport and proof of address. Reuses the onboarding wizard's document row.

import { useState } from "react";
import { Link } from "react-router-dom";
import { useApp } from "../../contexts/AppContext";
import { fetchKycStatus, submitKyc, type KycRecord, type SubmitKycInput } from "../../services/kycService";
import { ApiError } from "../../lib/apiClient";
import { formatDay } from "../../lib/formatDate";
import FileUpload from "../onboarding/FileUpload";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import { ErrorText, Field, Input } from "../ui/Field";
import { CheckIcon, ClockIcon, MapPinIcon } from "../icons";
import { cx } from "../ui/cx";

interface KycFlowProps {
  record: KycRecord;
  onApproved: (record: KycRecord) => void;
  // Checkout talks about the plot hold; the page doesn't.
  context?: "checkout" | "page";
}

// "waiting": submitted and in a person's queue. The real backend reviews
// manually, so a submission comes back `submitted`, not approved — that is
// not a rejection and must not read like one.
type Step = "form" | "reviewing" | "waiting" | "rejected";

const IN_REVIEW = ["submitted", "under_review"];

const DOC_NAMES: Record<string, string> = { nin: "NIN slip", passport: "Passport", proof_of_address: "Proof of address" };

export default function KycFlow({ record, onApproved, context = "checkout" }: KycFlowProps) {
  const { user, kycChanged } = useApp();
  const [step, setStep] = useState<Step>(IN_REVIEW.includes(record.status) ? "waiting" : record.status === "rejected" ? "rejected" : "form");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const [ninNumber, setNinNumber] = useState("");
  const [ninFile, setNinFile] = useState<File | null>(null);
  const [passportFile, setPassportFile] = useState<File | null>(null);
  const [addressFile, setAddressFile] = useState<File | null>(null);
  const [latest, setLatest] = useState<KycRecord>(record);

  if (!user) return null;
  const isLocal = record.buyerType === "local";
  const inCheckout = context === "checkout";

  const canSubmit = isLocal ? ninNumber.trim().length >= 10 && !!ninFile : !!passportFile && !!addressFile;

  const settle = (result: KycRecord) => {
    setLatest(result);
    kycChanged(result.status);
    if (result.status === "approved") onApproved(result);
    else setStep(IN_REVIEW.includes(result.status) ? "waiting" : result.status === "rejected" ? "rejected" : "form");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setStep("reviewing");
    setError("");
    const input: SubmitKycInput = { ninNumber, ninFile, passportFile, proofOfAddressFile: addressFile };
    try {
      settle(await submitKyc(user, input));
    } catch (err) {
      setError(err instanceof ApiError && err.message ? err.message : "Your documents couldn't be submitted. Please try again.");
      setStep("form");
    }
  };

  const checkAgain = async () => {
    setChecking(true);
    try {
      settle(await fetchKycStatus(user));
    } finally {
      setChecking(false);
    }
  };

  if (step === "waiting") {
    return (
      <div className="space-y-4" role="status">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 shrink-0 rounded-lg bg-[var(--warning-surface)] text-[var(--warning-text)] flex items-center justify-center"><ClockIcon size={18} /></span>
          <h2 className="font-semibold text-[var(--foreground)]">Your documents are with our verification team</h2>
        </div>
        <ol className="space-y-2.5">
          <Progress state="done" label="Sent" detail={latest.submittedAt ? formatDay(latest.submittedAt) : undefined} />
          <Progress state="current" label="Being reviewed" detail="by HomeTrue's verification team" />
          <Progress state="todo" label="Verified" detail="then you can reserve and buy" />
        </ol>
        <p className="text-sm text-[var(--muted-foreground)]">
          {inCheckout
            ? "You can reserve a plot as soon as they're approved. Your plot hold hasn't started — nothing is held while you wait."
            : "You can keep browsing, saving estates and booking inspections while you wait. The result shows here."}
        </p>
        <Button variant="secondary" onClick={checkAgain} disabled={checking}>{checking ? "Checking…" : "Check again"}</Button>
      </div>
    );
  }

  if (step === "reviewing") {
    return (
      <div className="text-center py-8" role="status">
        <span className="w-12 h-12 mx-auto mb-4 rounded-full bg-[var(--secondary)] text-[var(--primary)] flex items-center justify-center animate-pulse"><ClockIcon size={22} /></span>
        <div className="font-medium text-sm mb-1">Sending your documents…</div>
        {inCheckout && <p className="text-xs text-[var(--muted-foreground)]">Your plot hold hasn't started yet — it begins right after this.</p>}
      </div>
    );
  }

  if (step === "rejected") {
    const refused = latest.documents.filter((d) => d.status === "rejected");
    return (
      <div className="space-y-4">
        <Alert tone="error" title="We couldn't verify your identity" role="alert">
          {refused.length > 0 ? (
            <ul className="space-y-1 mt-1">
              {refused.map((d) => <li key={d.type}><span className="font-medium">{DOC_NAMES[d.type] ?? d.type}:</span> {d.rejectionReason ?? "Not accepted."}</li>)}
            </ul>
          ) : "Your documents weren't accepted."}
        </Alert>
        <Button size="lg" fullWidth onClick={() => setStep("form")}>Send your documents again</Button>
      </div>
    );
  }

  return (
    <div>
      {/* Checkout's own title already says "Verify your identity". */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-[var(--muted)] px-3.5 py-3 mb-5 text-sm">
        <span className="text-[var(--primary)]"><MapPinIcon size={16} /></span>
        <span className="text-[var(--foreground)]">
          You're verifying as a buyer living {isLocal ? "in Nigeria" : "outside Nigeria"} — from your account.
        </span>
        <Link to="/settings" className="font-medium text-[var(--accent)] hover:underline">Moved? Change it in Settings →</Link>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {isLocal ? (
          <>
            <Field id="kyc-nin" label="NIN" hint="11 digits, as printed on your NIN slip.">
              <Input id="kyc-nin" value={ninNumber} onChange={(e) => setNinNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
                placeholder="11-digit National Identification Number" inputMode="numeric" autoComplete="off" className="font-mono-data" aria-describedby="kyc-nin-hint" />
            </Field>
            <FileUpload label="NIN slip or national ID" required helperText="A clear photo or scan. JPG, PNG or PDF, up to 10 MB." file={ninFile} onChange={setNinFile} />
            <Alert tone="info">Living in Nigeria, your NIN is all we need — no utility bill.</Alert>
          </>
        ) : (
          <>
            <FileUpload label="International passport" required helperText="The photo page. JPG, PNG or PDF, up to 10 MB." file={passportFile} onChange={setPassportFile} />
            <FileUpload label="Proof of address" required helperText="A utility bill or bank statement, within the last 3 months." file={addressFile} onChange={setAddressFile} />
          </>
        )}

        {error && <ErrorText>{error}</ErrorText>}
        <Button type="submit" size="lg" fullWidth disabled={!canSubmit}>{inCheckout ? "Submit and continue" : "Submit for verification"}</Button>
      </form>
    </div>
  );
}

function Progress({ state, label, detail }: { state: "done" | "current" | "todo"; label: string; detail?: string }) {
  return (
    <li className="flex items-center gap-2.5 text-sm">
      <span aria-hidden="true" className={cx("w-5 h-5 shrink-0 rounded-full flex items-center justify-center",
        state === "done" ? "bg-[var(--success-surface)] text-[var(--success-text)]" : state === "current" ? "bg-[var(--warning)]" : "bg-[var(--muted)]")}>
        {state === "done" && <CheckIcon size={11} />}
      </span>
      <span className="font-medium text-[var(--foreground)]">{label}</span>
      {detail && <span className="text-[var(--muted-foreground)]">{detail}</span>}
      <span className="sr-only">{state === "done" ? "— done" : state === "current" ? "— in progress" : "— not yet"}</span>
    </li>
  );
}
