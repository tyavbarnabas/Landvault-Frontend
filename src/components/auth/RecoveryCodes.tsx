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
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import Card from "../ui/Card";

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
    const blob = new Blob([`HomeTrue recovery codes\n\nEach code works once. Keep them somewhere safe and private.\n\n${asText}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "hometrue-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card as="section" className="space-y-4" aria-labelledby="recovery-heading">
      <div>
        <h3 id="recovery-heading" className="text-sm font-semibold text-[var(--foreground)] mb-2">{title}</h3>
        <Alert>
          This is the only time these codes are shown. They can't be retrieved later — if you lose them you'll have to generate a new set,
          which replaces these. Each code works once, and any one of them gets you in if you lose your phone.
        </Alert>
      </div>

      <ul className="grid grid-cols-2 gap-2 bg-[var(--muted)] rounded-lg p-4">
        {codes.map((code) => (
          <li key={code} className="font-mono-data text-sm text-[var(--foreground)] tracking-wide">{code}</li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={copy}>{copied ? "Copied" : "Copy all"}</Button>
        <Button variant="secondary" onClick={download}>Download as a file</Button>
      </div>

      {/* An explicit acknowledgement, not just a Continue button — the cost of
          clicking past this screen is being permanently locked out. */}
      <label className="flex items-start gap-2.5 text-sm text-[var(--foreground)] border-t border-[var(--border)] pt-4">
        <input type="checkbox" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} className="mt-0.5" />
        I've saved these codes somewhere safe.
      </label>

      <Button size="lg" fullWidth onClick={onAcknowledged} disabled={!acknowledged}>Done</Button>
    </Card>
  );
}
