// Recovery codes, shown EXACTLY ONCE.
//
// The backend returns them in plaintext at confirmation or regeneration, stores
// only hashes, and can never produce them again. A user who clicks past this
// screen has no second chance — so it doesn't let them past without saying
// they've saved them, and it offers copy and download rather than relying on
// somebody transcribing sixteen characters by hand.
//
// These are credentials: never logged, never put in a URL.

import { useState } from "react";

export default function RecoveryCodes({ codes, onAcknowledged, title = "Save your recovery codes" }: {
  codes: string[];
  onAcknowledged: () => void;
  title?: string;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [copied, setCopied] = useState(false);

  const asText = codes.join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(asText);
      setCopied(true);
    } catch {
      // Clipboard access can be refused; the codes are on screen regardless.
      setCopied(false);
    }
  };

  const download = () => {
    const blob = new Blob([`LandVault recovery codes\n\nEach code works once. Keep them somewhere safe and private.\n\n${asText}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "landvault-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-[var(--card)] border border-amber-200 rounded-xl p-5 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-1">{title}</h3>
        <p className="text-xs text-amber-800 leading-relaxed">
          This is the only time these codes are shown. They can't be retrieved later — if you lose them you'll have to generate a new set,
          which replaces these. Each code works once, and any one of them gets you in if you lose your phone.
        </p>
      </div>

      <ul className="grid grid-cols-2 gap-2 bg-[var(--muted)] rounded-lg p-4">
        {codes.map((code) => (
          <li key={code} className="font-mono-data text-sm text-[var(--foreground)] tracking-wide">{code}</li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={copy} className="px-3 py-1.5 border border-[var(--border)] rounded-md text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)]">
          {copied ? "Copied" : "Copy all"}
        </button>
        <button type="button" onClick={download} className="px-3 py-1.5 border border-[var(--border)] rounded-md text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)]">
          Download as a file
        </button>
      </div>

      {/* An explicit acknowledgement, not just a Continue button — the cost of
          clicking past this screen is being permanently locked out. */}
      <label className="flex items-start gap-2.5 text-sm text-[var(--foreground)] border-t border-[var(--border)] pt-4">
        <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5" />
        I've saved these codes somewhere safe.
      </label>

      <button
        type="button"
        onClick={onAcknowledged}
        disabled={!acknowledged}
        className="w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold disabled:opacity-40 hover:opacity-90"
      >
        Done
      </button>
    </div>
  );
}
