// Readiness, publish and unpublish for one estate (PP-1 to PP-5).
//
// Publication is INTENT — the developer's own switch. Eligibility is CURRENT
// STATE, evaluated by the server at read time. The two are shown apart because
// they can disagree: a suspended company's estates leave the marketplace
// without being unpublished, and come back on reinstatement with nobody
// touching the flag. A HIGH conflict raised after publication does the same.
//
// Every row below is one of the twelve booleans in `EstateEligibilityDto`,
// rendered as the server reported it. None is inferred, and when the server
// reported nothing each row reads "Unknown" — never met.

import { useState } from "react";
import { Link } from "react-router-dom";
import Card from "../ui/Card";
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import { ErrorText } from "../ui/Field";
import { cx } from "../ui/cx";
import { TONE_SURFACE } from "../ui/tones";
import { AlertIcon, CheckIcon, XIcon } from "../icons";
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
  hasPhoto: { label: "Add photos", path: "photos" },
  letterApproved: { label: "Preview and approve the letter", path: "letter" },
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

  const conditions = ELIGIBILITY_CONDITIONS.map((condition) => ({ condition, met: eligibility ? eligibility[condition.key] : null }));
  const metCount = conditions.filter((c) => c.met).length;
  const summary = !eligibility ? null
    : eligibility.eligible ? { tone: "success" as const, title: "Visible on the marketplace", body: `All ${conditions.length} conditions met` }
      : eligibility.published ? { tone: "warning" as const, title: "Published, but not on the marketplace", body: `${metCount} of ${conditions.length} conditions met` }
        : { tone: metCount === conditions.length ? "info" as const : "neutral" as const, title: metCount === conditions.length ? "Ready to publish" : "Not published", body: `${metCount} of ${conditions.length} conditions met` };

  return (
    <Card as="section" aria-labelledby="publication-heading">
      <h2 id="publication-heading" className="font-semibold text-[var(--foreground)] mb-3">Publication</h2>

      {summary && (
        <div className={cx("rounded-lg px-3 py-2.5 mb-3 flex items-center gap-2.5", TONE_SURFACE[summary.tone], "border")}>
          {summary.tone === "success" ? <CheckIcon size={16} /> : <AlertIcon size={16} />}
          <div>
            <div className="text-sm font-semibold">{summary.title}</div>
            <div className="text-xs">{summary.body}</div>
          </div>
        </div>
      )}

      <ul className="space-y-1.5">
        {/* Intent. Worded as a switch the developer holds, not a condition. */}
        <Row label="Published by you" met={eligibility ? eligibility.published : null} metText="On" unmetText="Off" neutralWhenUnmet />
        {conditions.map(({ condition, met }) => {
          const fix = FIX_LINKS[condition.key];
          return (
            <Row
              key={condition.key}
              label={condition.label}
              met={met}
              highlighted={refusal?.condition === condition.key}
              action={met === false && fix && canManage ? (
                <Link to={`/portal/estates/${estate.id}/${fix.path}`} className="text-xs font-semibold text-[var(--accent)] hover:underline whitespace-nowrap">
                  {fix.label} →
                </Link>
              ) : undefined}
            />
          );
        })}
      </ul>

      {!eligibility && (
        <p className="text-xs text-[var(--muted-foreground)] mt-3">
          The server didn't report readiness for this estate, so these can't be confirmed here. Publishing will name anything outstanding.
        </p>
      )}

      {/* PP-5. Said plainly when the flag and the marketplace disagree, so a
          listing going dark is not a mystery. */}
      {estate.status === "published_not_live" && (
        <Alert className="mt-3">
          <p>
            {estate.blockingReasons.join(". ")}. Your listing hasn't been unpublished — it returns to the marketplace by itself once this
            clears, with nothing for you to redo.
          </p>
          {/* FP-1. The boundary rule has no grandfathering: an estate with no
              boundary is invisible to overlap checks, so publishing without
              one was a way around them. Said plainly, as recoverable. */}
          {eligibility && !eligibility.hasBoundary && (
            <p className="mt-2">
              Every listing now needs a boundary — even ones published before the rule — because an estate without one can't be checked
              against neighbouring land. Add it under Boundary and the listing comes back straight away.
            </p>
          )}
          {/* The last photo was deleted. Estates listed before photos were
              required are exempt and never land here. */}
          {eligibility && !eligibility.hasPhoto && <p className="mt-2">Add a photo under Photos and the listing comes back straight away.</p>}
          {/* Lapsed: the conditions, wording, letterhead or fees changed after
              the director approved the letter. No exemption for live estates. */}
          {eligibility && !eligibility.letterApproved && (
            <p className="mt-2">Approve the allocation letter again under Allocation letter and the listing comes back straight away.</p>
          )}
        </Alert>
      )}

      {/* PP-3. The backend's message names every failing condition; its code
          names the first, which is the row highlighted above. A conflict
          refusal never identifies the other party. */}
      {refusal && <Alert className="mt-3" role="alert" title="Not published">{refusal.message}</Alert>}
      {warning && <Alert className="mt-3" tone="info" role="status">{warning}</Alert>}
      {error && <ErrorText className="mt-3">{error}</ErrorText>}

      {canManage && eligibility && (
        <div className="mt-4 pt-4 border-t border-[var(--border)] space-y-2">
          {/* Offered even when conditions are outstanding: the refusal is what
              names them, and re-publishing a published estate re-checks
              everything — that is how a developer asks "why isn't it live?". */}
          {(!eligibility.published || estate.status === "published_not_live") && (
            <Button fullWidth disabled={busy} onClick={() => run("publish")}>
              {busy ? "Checking…" : eligibility.published ? "Re-check and publish" : "Publish to marketplace"}
            </Button>
          )}
          {eligibility.published && (
            <Button variant="secondary" fullWidth disabled={busy} onClick={() => run("unpublish")}>Unpublish</Button>
          )}
          <p className="text-xs text-[var(--muted-foreground)]">
            {eligibility.published
              ? "Unpublishing takes this listing off the marketplace. The estate, its plots and its declared terms are untouched."
              : "Nothing is listed until you publish — creating or editing an estate never does it for you."}
          </p>
        </div>
      )}
    </Card>
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
  const state = met === null ? "unknown" : met ? "met" : neutralWhenUnmet ? "off" : "unmet";
  const icon = state === "met" ? <CheckIcon size={14} className="text-[var(--success-text)]" />
    : state === "unmet" ? <XIcon size={14} className="text-[var(--warning-text)]" />
      : <span className="w-1.5 h-1.5 mx-1 rounded-full bg-[var(--muted-foreground)]/40" />;
  return (
    <li className={cx("flex items-start gap-2 text-sm rounded-md", highlighted && "bg-[var(--warning-surface)] -mx-2 px-2 py-1")}>
      <span className="mt-0.5 shrink-0 flex items-center justify-center w-4" aria-hidden="true">{icon}</span>
      <span className={cx("flex-1 min-w-0", state === "met" ? "text-[var(--foreground)]" : state === "unmet" ? "text-[var(--foreground)] font-medium" : "text-[var(--muted-foreground)]")}>
        {label}
        <span className="sr-only">: {met === null ? "unknown" : met ? metText : unmetText}</span>
      </span>
      {action ?? (state !== "met" && <span className={cx("text-xs shrink-0", state === "unmet" ? "text-[var(--warning-text)]" : "text-[var(--muted-foreground)]")}>{met === null ? "Unknown" : unmetText}</span>)}
    </li>
  );
}
