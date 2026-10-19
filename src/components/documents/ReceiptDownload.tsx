// A payment's receipt, by its number, as a download — for the places that
// know a payment's `receiptId`/`receiptNumber` but not the whole document (the
// purchase page, a plot's payment history). Fetched with the bearer token.

import { useState } from "react";
import Button from "../ui/Button";
import { fetchReceiptFile, saveFile } from "../../services/documentsService";

export default function ReceiptDownload({ receiptId, receiptNumber }: { receiptId: string; receiptNumber: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      saveFile(await fetchReceiptFile(receiptId, receiptNumber));
    } catch (err) {
      setError(err instanceof Error ? err.message : "The download didn't work. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-end">
      <Button variant="link" onClick={download} disabled={busy} aria-label={`Download receipt ${receiptNumber} (PDF)`} className="font-mono-data">
        {busy ? "Downloading…" : receiptNumber}
      </Button>
      {error && <span role="alert" className="text-xs text-[var(--error-text)]">{error}</span>}
    </span>
  );
}
