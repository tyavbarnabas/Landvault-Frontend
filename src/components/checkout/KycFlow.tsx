// Reusable KYC gate — Part 5 of the buyer flow. Embedded inside checkout
// (not a standalone page like the older onboarding/KYC.tsx, which is a
// different, opt-in-anytime flow) and routed by buyer type automatically —
// no "which document type" choice, per spec. Reuses the onboarding wizard's
// FileUpload component rather than redefining upload UI.

import { useState } from "react";
import { useApp } from "../../contexts/AppContext";
import { submitKyc, type KycRecord, type SubmitKycInput } from "../../services/kycService";
import FileUpload from "../onboarding/FileUpload";

interface KycFlowProps {
  record: KycRecord;
  onApproved: (record: KycRecord) => void;
}

type Step = "form" | "reviewing" | "rejected";

export default function KycFlow({ record, onApproved }: KycFlowProps) {
  const { user } = useApp();
  const [step, setStep] = useState<Step>("form");
  const [ninNumber, setNinNumber] = useState("");
  const [ninFile, setNinFile] = useState<File | null>(null);
  const [passportFile, setPassportFile] = useState<File | null>(null);
  const [addressFile, setAddressFile] = useState<File | null>(null);
  const [latest, setLatest] = useState<KycRecord>(record);

  if (!user) return null;
  const isLocal = record.buyerType === "local";

  const canSubmit = isLocal ? ninNumber.trim().length >= 10 && !!ninFile : !!passportFile && !!addressFile;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setStep("reviewing");
    const input: SubmitKycInput = { ninNumber, ninFile, passportFile, proofOfAddressFile: addressFile };
    const result = await submitKyc(user, input);
    setLatest(result);
    if (result.status === "approved") onApproved(result);
    else setStep("rejected");
  };

  if (step === "reviewing") {
    return (
      <div className="text-center py-8">
        <div className="w-14 h-14 rounded-full bg-[var(--secondary)] flex items-center justify-center mx-auto mb-4 text-2xl animate-pulse">🔍</div>
        <div className="font-medium text-sm mb-1">Verifying your identity…</div>
        <p className="text-xs text-[var(--muted-foreground)]">This is quick for most buyers. Your plot hold hasn't started yet — it begins right after this.</p>
      </div>
    );
  }

  if (step === "rejected") {
    return (
      <div>
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="text-sm font-semibold text-red-900 mb-1">We couldn't verify your identity</div>
          {latest.documents.filter((d) => d.status === "rejected").map((d) => (
            <p key={d.type} className="text-xs text-red-700">{d.rejectionReason}</p>
          ))}
        </div>
        <button onClick={() => setStep("form")} className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
          Re-upload and try again
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2 className="font-semibold text-base mb-1">Verify your identity</h2>
      <p className="text-sm text-[var(--muted-foreground)] mb-5">
        {isLocal
          ? "Required before your first purchase. We only need your NIN — no utility bill."
          : "Required before your first purchase. Diaspora buyers verify with an international passport and proof of address."}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {isLocal ? (
          <>
            <div>
              <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">NIN</label>
              <input
                value={ninNumber}
                onChange={(e) => setNinNumber(e.target.value.replace(/\D/g, "").slice(0, 11))}
                placeholder="11-digit National Identification Number"
                inputMode="numeric"
                className="w-full px-3 py-2.5 text-sm border border-[var(--border)] rounded-md bg-[var(--card)] font-mono-data"
              />
            </div>
            <FileUpload label="NIN slip or national ID photo" required file={ninFile} onChange={setNinFile} />
          </>
        ) : (
          <>
            <FileUpload label="International passport (bio page)" required file={passportFile} onChange={setPassportFile} />
            <FileUpload label="Proof of address (utility bill or bank statement, within 3 months)" required file={addressFile} onChange={setAddressFile} />
          </>
        )}

        <button type="submit" disabled={!canSubmit} className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity">
          Submit &amp; continue
        </button>
      </form>
    </div>
  );
}
