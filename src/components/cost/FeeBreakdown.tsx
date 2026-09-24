// Itemises every declared fee, grouped by WHEN it falls due. Timing is half
// the disclosure: a ₦7M levy due on construction start is a different
// proposition from one due at application, and a flat list hides that.

import MoneyRangeDisplay from "./MoneyRangeDisplay";
import type { FeeDueTrigger, PublicFee, TierCommitment } from "../../services/costDisclosureService";

const DUE_TRIGGER_LABELS: Record<FeeDueTrigger, string> = {
  at_application: "Due at application",
  at_allocation: "Due at allocation",
  on_construction_start: "Due when construction starts",
  milestone_based: "Due in stages as building progresses",
  before_occupation: "Due before occupation",
  annually: "Due every year",
};

// Chronological, not alphabetical — the order a buyer actually meets them.
const TRIGGER_ORDER: FeeDueTrigger[] = ["at_application", "at_allocation", "on_construction_start", "milestone_based", "before_occupation", "annually"];

function FeeRow({ fee }: { fee: PublicFee }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <div className="text-sm text-[var(--foreground)]">
          {fee.label}
          {!fee.isMandatory && <span className="text-xs text-[var(--muted-foreground)]"> · optional</span>}
        </div>
        {/* The developer's own stated reason the figure may move. It belongs
            next to the number, not behind a tooltip. */}
        {!fee.isFixed && fee.variationBasis && (
          <div className="text-xs text-amber-700 mt-0.5">{fee.variationBasis}</div>
        )}
        {fee.notes && <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{fee.notes}</div>}
        {/* A milestone fee is not one payment — the stages, with the
            document's own percentages, are part of the disclosure. The
            percentages are shown as written; none is turned into a naira
            figure here. */}
        {fee.milestones && fee.milestones.length > 0 && (
          <ul className="text-xs text-[var(--muted-foreground)] mt-1.5 space-y-0.5">
            {fee.milestones.map((m) => (
              <li key={m.label}>{m.pct}% — {m.label}</li>
            ))}
          </ul>
        )}
        <div className="text-xs text-[var(--muted-foreground)] mt-0.5">
          {fee.refundable ? "Refundable" : "Non-refundable"}
          {fee.isMandatory ? " · mandatory" : ""}
        </div>
      </div>
      {/* No stated figure in the source document. Said plainly — never a
          zero, never an estimate. */}
      {fee.amount === null ? (
        <span className="shrink-0 text-sm text-amber-700">Amount not stated</span>
      ) : (
        <MoneyRangeDisplay money={fee.amount} className="shrink-0 font-mono-data text-sm text-[var(--foreground)]" />
      )}
    </div>
  );
}

function FeeGroup({ title, fees, caption }: { title: string; fees: PublicFee[]; caption?: string }) {
  if (fees.length === 0) return null;
  return (
    <div className="border-t border-[var(--border)] pt-3 mt-3 first:border-t-0 first:pt-0 first:mt-0">
      <div className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide">{title}</div>
      {caption && <p className="text-xs text-[var(--muted-foreground)] mt-1">{caption}</p>}
      <div className="divide-y divide-[var(--border)] mt-1">
        {fees.map((fee) => <FeeRow key={`${fee.feeType}:${fee.label}`} fee={fee} />)}
      </div>
    </div>
  );
}

export default function FeeBreakdown({ feeSchedule, tier }: { feeSchedule: PublicFee[]; tier: TierCommitment | null }) {
  // One-off fees are everything in the schedule that isn't a yearly charge;
  // the recurring and optional lists come from the tier, which is where the
  // backend decides what sits outside the total.
  const oneOff = feeSchedule.filter((f) => f.dueTrigger !== "annually");
  const recurring = tier?.recurringFees ?? feeSchedule.filter((f) => f.dueTrigger === "annually");
  const optional = tier?.optionalFees ?? [];

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
      {TRIGGER_ORDER.filter((t) => t !== "annually").map((trigger) => (
        <FeeGroup key={trigger} title={DUE_TRIGGER_LABELS[trigger]} fees={oneOff.filter((f) => f.dueTrigger === trigger)} />
      ))}

      {/* Outside the total by design: one year of a perpetual charge is an
          arbitrary thing to add to a purchase price. */}
      <FeeGroup
        title="Ongoing, every year"
        fees={recurring}
        caption="Charged annually for as long as you hold the plot, so it is not part of the total above."
      />

      <FeeGroup
        title="Optional"
        fees={optional}
        caption="Genuinely avoidable — not included in the total above."
      />
    </div>
  );
}
