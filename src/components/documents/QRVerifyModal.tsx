// Extracted from Vault.tsx so PlotView.tsx's documents tab can open the same
// verification modal instead of only linking out to /documents.

import type { Document } from "../../data/mockData";
import { DOCUMENT_TYPE_LABELS } from "./DocumentCard";

export default function QRVerifyModal({ doc, onClose }: { doc: Document; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-[var(--card)] rounded-2xl border border-[var(--border)] p-6 max-w-sm w-full shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold">Document verification</h3>
          <button onClick={onClose} className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] text-xl leading-none">×</button>
        </div>

        <div className="w-32 h-32 mx-auto bg-[var(--foreground)] rounded-lg mb-4 grid grid-cols-8 gap-px p-2">
          {Array.from({ length: 64 }, (_, i) => (
            <div key={i} className={`rounded-sm ${Math.random() > 0.5 ? "bg-[var(--background)]" : "bg-[var(--foreground)]"}`} />
          ))}
        </div>

        <div className="text-center mb-4">
          <div className="text-xs font-mono-data text-[var(--muted-foreground)] mb-1">{doc.qrCode}</div>
        </div>

        <div className={`rounded-lg p-3 mb-4 flex items-start gap-2.5 ${doc.status === "valid" ? "bg-emerald-50 border border-emerald-200" : "bg-red-50 border border-red-200"}`}>
          <span className="text-lg mt-0.5">{doc.status === "valid" ? "✅" : "❌"}</span>
          <div>
            <div className={`text-sm font-semibold ${doc.status === "valid" ? "text-emerald-900" : "text-red-900"}`}>
              {doc.status === "valid" ? "Document verified" : "Document invalid"}
            </div>
            <div className={`text-xs mt-0.5 ${doc.status === "valid" ? "text-emerald-700" : "text-red-700"}`}>
              {doc.status === "valid"
                ? "This document is authentic and has not been altered. Issued by LandVault Ltd."
                : "This document has been voided or superseded. Do not accept as valid."}
            </div>
          </div>
        </div>

        <div className="text-xs text-[var(--muted-foreground)] space-y-1">
          <div className="flex justify-between"><span>Document</span><span className="font-medium text-[var(--foreground)]">{DOCUMENT_TYPE_LABELS[doc.type] || doc.type}</span></div>
          <div className="flex justify-between"><span>Issued</span><span className="font-mono-data">{doc.date}</span></div>
          <div className="flex justify-between"><span>Status</span><span className={`capitalize font-medium ${doc.status === "valid" ? "text-emerald-700" : "text-red-600"}`}>{doc.status}</span></div>
        </div>

        <button onClick={onClose} className="mt-5 w-full py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
          Close
        </button>
      </div>
    </div>
  );
}
