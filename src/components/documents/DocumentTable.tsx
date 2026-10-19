// The vault's documents as a table, for wide screens (the Figma "Vault —
// Proposed"): one row per document, the plot it's about, its status, its
// verification code and the downloads. Phones get DocumentCard instead.

import { Link } from "react-router-dom";
import type { Document } from "../../data/mockData";
import { formatDay } from "../../lib/formatDate";
import { DOCUMENT_TYPE_LABELS, DocStatus, DocTypeChip, DocumentActions, VerifyLink, plotHref, plotLine } from "./DocumentCard";

export default function DocumentTable({ documents }: { documents: Document[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--card)]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[var(--muted)] text-left text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">
            <th scope="col" className="px-5 py-2.5 font-medium">Document</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Plot</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Issued</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Verification code</th>
            <th scope="col" className="px-5 py-2.5 font-medium text-right">Download</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {documents.map((doc) => {
            const plot = plotLine(doc);
            const href = plotHref(doc);
            const [plotPart, estatePart] = splitPlot(plot);
            return (
              <tr key={doc.id} className="align-middle">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <DocTypeChip type={doc.type} />
                    <div className="min-w-0">
                      <div className="font-semibold text-[var(--foreground)]">{DOCUMENT_TYPE_LABELS[doc.type]}</div>
                      {doc.number && <div className="text-xs font-mono-data text-[var(--muted-foreground)]">{doc.number}</div>}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3.5">
                  {plotPart ? (
                    <>
                      {href ? <Link to={href} className="font-medium text-[var(--foreground)] hover:underline">{plotPart}</Link> : <span className="font-medium">{plotPart}</span>}
                      {estatePart && <div className="text-xs text-[var(--muted-foreground)]">{estatePart}</div>}
                    </>
                  ) : <span className="text-[var(--muted-foreground)]">{doc.title}</span>}
                </td>
                <td className="px-3 py-3.5 whitespace-nowrap">{formatDay(doc.date)}</td>
                <td className="px-3 py-3.5">
                  <DocStatus doc={doc} />
                  {/* A refunded receipt stays valid — the money did arrive. */}
                  {doc.refundedAt && <div className="text-xs text-[var(--muted-foreground)] mt-1 whitespace-nowrap">Refunded {formatDay(doc.refundedAt)}</div>}
                </td>
                <td className="px-3 py-3.5">
                  <div className="font-mono-data text-xs text-[var(--foreground)] whitespace-nowrap">{doc.qrCode}</div>
                  <VerifyLink code={doc.qrCode} />
                </td>
                <td className="px-5 py-3.5"><DocumentActions doc={doc} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// "Block B, Plot 15, Lugbe Demo Gardens" → plot and estate. The estate is the
// last part; anything that doesn't fit the pattern is shown whole.
function splitPlot(line: string | null): [string | null, string | null] {
  if (!line) return [null, null];
  const i = line.lastIndexOf(", ");
  return i > 0 ? [line.slice(0, i), line.slice(i + 2)] : [line, null];
}
