import { useState } from "react";
import { useNavigate } from "react-router-dom";

type DocType = "nin" | "passport";
type KYCStep = "type" | "upload" | "submitted";

export default function KYC() {
  const navigate = useNavigate();
  const [step, setStep] = useState<KYCStep>("type");
  const [docType, setDocType] = useState<DocType>("nin");
  const [idFile, setIdFile] = useState<File | null>(null);
  const [addressFile, setAddressFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => { setLoading(false); setStep("submitted"); }, 900);
  };

  return (
    <div className="min-h-full bg-[var(--background)] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-lg">
        <div className="mb-8">
          <span className="font-display text-xl text-[var(--foreground)]">LandVault</span>
          <div className="text-xs text-[var(--muted-foreground)] font-mono-data mt-0.5">Identity Verification</div>
        </div>

        {step === "type" && (
          <div>
            <h2 className="font-display text-2xl mb-2">Verify your identity</h2>
            <p className="text-sm text-[var(--muted-foreground)] mb-6">We need to verify who you are before you can transact. This usually takes 1–2 business days.</p>
            <div className="grid gap-3">
              {[
                { id: "nin", label: "Nigerian NIN + Proof of Address", desc: "For residents of Nigeria. NIN slip or national ID.", flag: "🇳🇬" },
                { id: "passport", label: "International Passport + Proof of Address", desc: "For diaspora buyers. Valid passport from any country.", flag: "🌍" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => { setDocType(opt.id as DocType); setStep("upload"); }}
                  className={`text-left p-4 rounded-xl border-2 transition-colors ${docType === opt.id ? "border-[var(--primary)] bg-[var(--secondary)]" : "border-[var(--border)] hover:border-[var(--primary)]/50"}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{opt.flag}</span>
                    <div>
                      <div className="font-medium text-sm text-[var(--foreground)]">{opt.label}</div>
                      <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{opt.desc}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <button onClick={() => navigate("/dashboard")} className="mt-6 w-full py-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
              Skip for now — I'll verify later
            </button>
          </div>
        )}

        {step === "upload" && (
          <form onSubmit={handleSubmit}>
            <button type="button" onClick={() => setStep("type")} className="text-xs text-[var(--muted-foreground)] mb-6 hover:text-[var(--foreground)]">← Back</button>
            <h2 className="font-display text-2xl mb-2">
              {docType === "nin" ? "Upload your NIN" : "Upload your passport"}
            </h2>
            <p className="text-sm text-[var(--muted-foreground)] mb-6">
              Files must be JPG, PNG, or PDF and under 5MB each. All documents are encrypted at rest.
            </p>

            <div className="space-y-4">
              <UploadField
                label={docType === "nin" ? "NIN slip or national ID" : "International passport (bio page)"}
                file={idFile}
                onFile={setIdFile}
                accept=".jpg,.jpeg,.png,.pdf"
              />
              <UploadField
                label="Proof of address (utility bill or bank statement, dated within 3 months)"
                file={addressFile}
                onFile={setAddressFile}
                accept=".jpg,.jpeg,.png,.pdf"
              />
            </div>

            <div className="mt-6 p-4 bg-[var(--muted)] rounded-lg text-xs text-[var(--muted-foreground)] leading-relaxed">
              Expected review time: 1–2 business days. You'll receive an email when your status is updated. You can browse estates while your verification is under review.
            </div>

            <button
              type="submit"
              disabled={loading || !idFile || !addressFile}
              className="mt-6 w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium disabled:opacity-40 hover:opacity-90 transition-opacity"
            >
              {loading ? "Submitting…" : "Submit for review"}
            </button>
          </form>
        )}

        {step === "submitted" && (
          <div className="text-center py-8">
            <div className="w-16 h-16 rounded-full bg-[var(--secondary)] flex items-center justify-center mx-auto mb-6 text-3xl">✓</div>
            <h2 className="font-display text-2xl mb-2">Documents submitted</h2>
            <p className="text-sm text-[var(--muted-foreground)] max-w-sm mx-auto mb-8">
              Your identity documents are under review. We'll notify you within 1–2 business days. You can browse estates in the meantime.
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 mb-8">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              KYC under review
            </div>
            <br />
            <button onClick={() => navigate("/dashboard")} className="px-6 py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
              Go to dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function UploadField({ label, file, onFile, accept }: { label: string; file: File | null; onFile: (f: File) => void; accept: string }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[var(--muted-foreground)] mb-1.5">{label}</label>
      <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl px-4 py-6 cursor-pointer transition-colors ${file ? "border-[var(--primary)] bg-[var(--secondary)]" : "border-[var(--border)] hover:border-[var(--primary)]/50"}`}>
        {file ? (
          <div className="text-center">
            <div className="text-2xl mb-1">📄</div>
            <div className="text-sm font-medium text-[var(--foreground)]">{file.name}</div>
            <div className="text-xs text-[var(--muted-foreground)]">{(file.size / 1024).toFixed(0)} KB</div>
          </div>
        ) : (
          <div className="text-center">
            <div className="text-2xl mb-1 text-[var(--muted-foreground)]">⬆</div>
            <div className="text-sm text-[var(--muted-foreground)]">Click to upload or drag & drop</div>
            <div className="text-xs text-[var(--muted-foreground)] mt-0.5">JPG, PNG, PDF · max 5 MB</div>
          </div>
        )}
        <input type="file" accept={accept} className="sr-only" onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); }} />
      </label>
    </div>
  );
}
