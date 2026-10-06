// Readiness, publish and unpublish for one estate (PP-1 to PP-5).
//
// Publication is INTENT — the developer's own switch. Eligibility is CURRENT
// STATE, evaluated by the server at read time. The two are shown apart because
// they can disagree: a suspended company's estates leave the marketplace
// without being unpublished, and come back on reinstatement with nobody
// touching the flag. A HIGH conflict raised after publication does the same.
//
// Every row below is one of the ten booleans in `EstateEligibilityDto`,
// rendered as the server reported it. None is inferred, and when the server
// reported nothing each row reads "Unknown" — never met.

import { useState } from "react";
import { Link } from "react-router-dom";
import {
  ELIGIBILITY_CONDITIONS, publishEstate, refusalFromError, unpublishEstate,
  type EligibilityConditionKey, type PortalEstate, type PortalScope, type PublicationRefusal,
} from "../../services/portalEstatesService";

// Where a developer goes to fix each condition they can fix themselves. The
// company-level ones are not fixable from an estate page and get no link.
// A missing boundary gets no link yet: adding one to an existing estate
// (POST .../boundary) has no screen so far.
const FIX_LINKS: Partial<Record<EligibilityConditionKey, { label: string; path: string }>> = {
  feesDeclared: { label: "Declare fees", path: "disclosure?tab=fees" },
  refundTermsDeclared: { label: "Declare refund terms", path: "disclosure?tab=refund" },
  hasPlots: { label: "Add plots", path: "inventory?tab=plots" },
};

interface PublicationPanelProps {
  estate: PortalEstate;
  scope: PortalScope;
  canManage: boolean;
  onChanged: () => void;
}

export default function PublicationPanel({ estate, scope, canManage, onChanged }: PublicationPanelProps) {
  const [refusal, setRefusal] = useState<PublicationRefusal | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const eligibility = estate.eligibility;

  const run = async (action: "publish" | "unpublish") => {
    setBusy(true);
    setRefusal(null);
    setWarning(null);
    setError(null);
    try {
      const result = action === "publish" ? await publishEstate(estate.id, scope) : await unpublishEstate(estate.id, scope);
      setWarning(result.warning);
      onChanged();
    } catch (err) {
      const named = refusalFromError(err);
      if (named) setRefusal(named);
      else setError(err instanceof Error ? err.message : "That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-8">
      <h2 className="text-sm font-semibold text-[var(--foreground)] mb-3">Publication</h2>

      <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]">
        {/* Intent. Worded as a switch the developer holds, not a condition. */}
        <Row label="Published by you" met={eligibility ? eligibility.published : null} metText="On" unmetText="Off" neutralWhenUnmet />

        {ELIGIBILITY_CONDITIONS.map((condition) => {
          const met = eligibility ? eligibility[condition.key] : null;
          const fix = FIX_LINKS[condition.key];
          return (
            <Row
              key={condition.key}
              label={condition.label}
              met={met}
              highlighted={refusal?.condition === condition.key}
              action={met === false && fix && canManage ? (
                <Link to={`/portal/estates/${estate.id}/${fix.path}`} className="text-xs font-semibold text-[var(--accent)] hover:underline">
                  {fix.label} →
                </Link>
              ) : undefined}
            />
          );
        })}

        {/* Current state: the server's own conjunction, which is exactly what
            the public feed filters on. */}
        <Row label="Visible on the marketplace now" met={eligibility ? eligibility.eligible : null} metText="Yes" unmetText="No" />
      </div>

      {!eligibility && (
        <p className="text-xs text-[var(--muted-foreground)] mt-2">
          The server didn't report readiness for this estate, so these can't be confirmed here. Publishing will name anything outstanding.
        </p>
      )}

      {/* PP-5. Said plainly when the flag and the marketplace disagree, so a
          listing going dark is not a mystery. */}
      {estate.status === "published_not_live" && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="text-xs font-semibold text-amber-900 mb-0.5">Published, but not on the marketplace right now</div>
          <p className="text-xs text-amber-800 leading-relaxed">
            {estate.blockingReasons.join(". ")}. Your listing hasn't been unpublished — it returns to the marketplace by itself once this
            clears, with nothing for you to redo.
          </p>
          {/* FP-1. The boundary rule has no grandfathering: an estate with no
              boundary is invisible to overlap checks, so publishing without
              one was a way around them. Said plainly, as recoverable. */}
          {eligibility && !eligibility.hasBoundary && (
            <p className="text-xs text-amber-800 leading-relaxed mt-2">
              Every listing now needs a boundary — even ones published before the rule — because an estate without one can't be checked
              against neighbouring land. Add it in the Boundary section below and the listing comes back straight away.
            </p>
          )}
        </div>
      )}

      {/* PP-3. The backend's message names every failing condition; its code
          names the first, which is the row highlighted above. A conflict
          refusal never identifies the other party. */}
      {refusal && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg" role="alert">
          <div className="text-xs font-semibold text-amber-900 mb-0.5">Not published</div>
          <p className="text-xs text-amber-800 leading-relaxed">{refusal.message}</p>
        </div>
      )}

      {warning && (
        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg" role="status">
          <p className="text-xs text-blue-800 leading-relaxed">{warning}</p>
        </div>
      )}

      {error && <p className="text-sm text-red-700 mt-3" role="alert">{error}</p>}

      {canManage && eligibility && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {/* Offered even when conditions are outstanding: the refusal is what
              names them, and re-publishing a published estate re-checks
              everything — that is how a developer asks "why isn't it live?". */}
          {(!eligibility.published || estate.status === "published_not_live") && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run("publish")}
              className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-60"
            >
              {busy ? "Checking…" : eligibility.published ? "Re-check and publish" : "Publish to marketplace"}
            </button>
          )}
          {eligibility.published && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run("unpublish")}
              className="px-4 py-2 border border-[var(--border)] rounded-md text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-60"
            >
              Unpublish
            </button>
          )}
          <p className="text-xs text-[var(--muted-foreground)] basis-full">
            {eligibility.published
              ? "Unpublishing takes this listing off the marketplace. The estate, its plots and its declared terms are untouched."
              : "Nothing is listed until you publish — creating or editing an estate never does it for you."}
          </p>
        </div>
      )}
    </section>
  );
}

// `met: null` means the server didn't say. Grey and "Unknown" — never met,
// and never a failure either.
function Row({ label, met, metText = "Met", unmetText = "Not met", neutralWhenUnmet, highlighted, action }: {
  label: string;
  met: boolean | null;
  metText?: string;
  unmetText?: string;
  neutralWhenUnmet?: boolean;
  highlighted?: boolean;
  action?: React.ReactNode;
}) {
  const unmetDot = neutralWhenUnmet ? "bg-[var(--muted-foreground)]/40" : "bg-amber-500";
  const unmetTextClass = neutralWhenUnmet ? "text-[var(--muted-foreground)]" : "text-amber-700";
  const dot = met === null ? "bg-[var(--muted-foreground)]/40" : met ? "bg-emerald-500" : unmetDot;
  const text = met === null ? "text-[var(--muted-foreground)]" : met ? "text-emerald-700" : unmetTextClass;
  return (
    <div className={`flex items-center gap-2.5 px-4 py-2.5 ${highlighted ? "bg-amber-50" : ""}`}>
      <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
      <span className="text-sm text-[var(--foreground)]">{label}</span>
      <span className="ml-auto flex items-center gap-3">
        {action}
        <span className={`text-xs font-medium ${text}`}>{met === null ? "Unknown" : met ? metText : unmetText}</span>
      </span>
    </div>
  );
}
