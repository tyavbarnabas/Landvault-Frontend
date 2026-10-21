// The offer letter's files — the PDF, and every page stacked into one image
// for WhatsApp — fetched with the bearer token, as the vault's documents are.
// Used on the checkout offer step and the purchase page's offer card.
// Demo documents have no file: the letter is drawn by HomeTrue's server.

import { useState } from "react";
import type { OfferSummary } from "../../services/marketplaceCheckoutService";
import { fetchOfferFile, offerHasFile } from "../../services/offerLetterService";
import { canShareFiles, saveFile, shareFile } from "../../services/documentsService";
import Button from "../ui/Button";
import { ErrorText } from "../ui/Field";
import { DownloadIcon, ImageIcon, ShareIcon } from "../icons";

export default function OfferDownloads({ offer, compact }: { offer: Pick<OfferSummary, "id" | "number">; compact?: boolean }) {
  const [busy, setBusy] = useState<"pdf" | "jpeg" | null>(null);
  const [error, setError] = useState("");

  if (!offerHasFile()) {
    return <p className="text-xs text-[var(--muted-foreground)]">Demo mode: the letter itself is drawn by HomeTrue's server, so there's no file to open here.</p>;
  }

  const share = canShareFiles();
  const run = async (format: "pdf" | "jpeg") => {
    setBusy(format);
    setError("");
    try {
      const file = await fetchOfferFile(offer, format);
      if (format === "jpeg" && share) await shareFile(file, `Offer letter ${offer.number}`);
      else saveFile(file);
    } catch {
      setError("The download didn't work. Try again.");
    } finally {
      setBusy(null);
    }
  };

  if (compact) {
    const btn = "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[var(--border)] bg-[var(--card)] text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50";
    return (
      <div>
        <div className="flex gap-2">
          <button type="button" className={btn} disabled={busy !== null} onClick={() => run("pdf")} aria-label={`Download ${offer.number} as PDF`}><DownloadIcon size={14} />{busy === "pdf" ? "…" : "PDF"}</button>
          <button type="button" className={btn} disabled={busy !== null} onClick={() => run("jpeg")} aria-label={`${share ? "Share" : "Download"} ${offer.number} as an image`}>{share ? <ShareIcon size={14} /> : <ImageIcon size={14} />}{busy === "jpeg" ? "…" : share ? "Share" : "Image"}</button>
        </div>
        {error && <ErrorText className="mt-2">{error}</ErrorText>}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button variant="secondary" size="lg" onClick={() => run("pdf")} disabled={busy !== null}>{busy === "pdf" ? "Opening…" : "Read the offer (PDF)"}</Button>
        <Button variant="link" onClick={() => run("jpeg")} disabled={busy !== null}>{busy === "jpeg" ? "Preparing…" : share ? "Share as image" : "Save as image"}</Button>
      </div>
      {error && <ErrorText className="mt-2">{error}</ErrorText>}
    </div>
  );
}
