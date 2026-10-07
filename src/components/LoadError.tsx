// A screen whose data didn't load says WHY, rather than rendering blank or
// pretending the record doesn't exist. Two different failures, two fixes:
//   ApiError          the backend answered with an error — a refusal, a
//                     missing record, or a contract mismatch (its code says)
//   ApiTransportError no readable answer — backend down, wrong port, or CORS
//                     refusing this page's origin

import { ApiError, ApiTimeoutError, ApiTransportError } from "../lib/apiClient";

export default function LoadError({ error, what = "this page", onRetry }: { error: unknown; what?: string; onRetry?: () => void }) {
  const detail = describeLoadError(error);
  return (
    <div className="p-8 max-w-2xl" role="alert">
      <p className="text-sm font-medium text-[var(--foreground)] mb-1">Couldn't load {what}.</p>
      <p className="text-sm text-[var(--muted-foreground)] mb-2">{detail.summary}</p>
      {detail.request && (
        <p className="text-xs font-mono-data text-[var(--muted-foreground)] mb-3 break-all">{detail.request}</p>
      )}
      {onRetry && <button onClick={onRetry} className="text-sm text-[var(--accent)] hover:underline">Try again</button>}
    </div>
  );
}

export function describeLoadError(error: unknown): { summary: string; request?: string } {
  if (error instanceof ApiTransportError) {
    return {
      summary: "The backend couldn't be reached — it may be down, on a different port, or refusing this page's origin (CORS).",
      request: `${error.request.service} · ${error.request.method} ${error.request.path} · no response`,
    };
  }
  if (error instanceof ApiError) {
    const code = error.body?.code;
    const summary = error.status === 401 ? "Your session has ended or isn't valid for this request."
      : error.status === 403 ? "You don't have access to this."
      : error.status >= 500 ? "The backend hit an error."
      : error.message || "The backend refused the request.";
    return {
      summary,
      request: error.request ? `${error.request.service} · ${error.request.method} ${error.request.path} · ${error.status}${code ? ` ${code}` : ""}` : `${error.status}${code ? ` ${code}` : ""}`,
    };
  }
  if (error instanceof ApiTimeoutError) return { summary: "The request timed out." };
  return { summary: error instanceof Error ? error.message : "Something went wrong." };
}
