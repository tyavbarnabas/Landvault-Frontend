// What a buyer will see (PD-7), built from the same components/cost/ set the
// buyer-facing estate page and checkout use.
//
// Two cases, and they are kept visibly apart:
//
//  - The server has computed the buyer-facing disclosure. It is rendered
//    through CostDisclosureSection exactly as a buyer gets it: total
//    commitment, refund outcome and penalty ladder, in naira.
//
//  - It hasn't (nothing computes one for an estate that isn't listed yet).
//    The declarations are shown as declared — fees through FeeBreakdown,
//    refund and penalties as the percentages entered — and the naira figures
//    are named as missing rather than worked out here. Display, never
//    recompute: a second implementation of that arithmetic would drift from
//    the server's, and the two would disagree about what a buyer owes.
//
// The copy is a preview, not a warning. The terms are the same whether or not
// anyone sees them early; this platform shows them before commitment.

import { useState } from "react";
import CostDisclosureSection from "../cost/CostDisclosureSection";
import FeeBreakdown from "../cost/FeeBreakdown";
import type { EstateCostDisclosure } from "../../services/costDisclosureService";
import {
  FEE_TYPE_LABELS, toPublicFee, type DefaultTerms, type FeeSchedule, type RefundTerms,
} from "../../services/estateDisclosureService";
import { CONSENT_NOT_ENFORCED, DEADLINE_NOT_TRACKED } from "./DefaultTermsForm";

export default function DisclosurePreview({ computed, fees, refund, defaults }: {
  computed: EstateCostDisclosure | null;
  fees: FeeSchedule;
  refund: RefundTerms | null;
  defaults: DefaultTerms | null;
}) {
  const [tierIndex, setTierIndex] = useState(0);

  if (computed) {
    const tier = computed.tiers[tierIndex] ?? null;
    return (
      <div className="space-y-4">
        <p className="text-sm text-[var(--muted-foreground)]">
          This is the cost section a buyer sees on your listing and again at reservation, with the figures the server computed.
        </p>
        {computed.tiers.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Tier to preview">
            {computed.tiers.map((t, i) => (
              <button
                key={t.tierId}
                type="button"
                onClick={() => setTierIndex(i)}
                aria-pressed={i === tierIndex}
                className={`px-3 py-1.5 rounded-md border text-sm ${i === tierIndex ? "border-[var(--accent)] bg-[var(--muted)]" : "border-[var(--border)] bg-[var(--card)]"}`}
              >
                {t.sizeSqm} sqm
              </button>
            ))}
          </div>
        )}
        <CostDisclosureSection disclosure={computed} tier={tier} />
      </div>
    );
  }

  const nothingDeclared = fees.declaredAt === null && !refund && !defaults;
  if (nothingDeclared) {
    return <p className="text-sm text-[var(--muted-foreground)]">Nothing has been declared yet, so there is nothing for a buyer to see.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-[var(--muted)] border border-[var(--border)] rounded-xl p-4">
        <p className="text-sm text-[var(--foreground)]">
          Buyers see the total commitment, what a withdrawal returns and each penalty step in naira. The server computes those figures for a
          listed estate; none are available for this one yet, so your declarations are shown below exactly as entered.
        </p>
      </div>

      {fees.declaredAt === null ? (
        <p className="text-sm text-[var(--muted-foreground)]">No fee schedule declared.</p>
      ) : fees.fees.length === 0 ? (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 text-sm text-[var(--foreground)]">
          No charges beyond the land price.
        </div>
      ) : (
        <FeeBreakdown feeSchedule={fees.fees.map(toPublicFee)} tier={null} />
      )}

      {(refund || defaults) && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
            <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">If you withdraw</h3>
            {refund ? <RefundSummary refund={refund} /> : <p className="text-sm text-[var(--muted-foreground)]">No refund terms declared.</p>}
          </div>
          <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
            <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">If you fall behind on payments</h3>
            {!defaults ? (
              <p className="text-sm text-[var(--muted-foreground)]">No default terms declared.</p>
            ) : defaults.penaltyTiers.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">No late-payment penalty declared.</p>
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {defaults.penaltyTiers.map((t) => (
                  <div key={t.monthsLate} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="text-[var(--muted-foreground)]">{t.monthsLate} months late</span>
                    <span className="font-mono-data text-[var(--foreground)]">{t.penaltyPct}% <span className="text-[var(--muted-foreground)]">· naira figure not yet computed</span></span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {defaults && <DefaultTermsSummary terms={defaults} />}
    </div>
  );
}

export function RefundSummary({ refund }: { refund: RefundTerms }) {
  return (
    <dl className="space-y-2 text-sm">
      <div>
        <dt className="text-xs text-[var(--muted-foreground)]">Deduction</dt>
        <dd className="text-[var(--foreground)]">
          {refund.deductionPct}% of {refund.appliesTo === "amount_paid" ? "what the buyer has paid" : "the full price"}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-[var(--muted-foreground)]">Processing time</dt>
        <dd className="text-[var(--foreground)]">About {refund.processingDays} days</dd>
      </div>
      <div>
        <dt className="text-xs text-[var(--muted-foreground)]">Never refunded</dt>
        <dd className="text-[var(--foreground)]">
          {refund.nonRefundableFeeTypes.length === 0 ? "No fee types listed" : refund.nonRefundableFeeTypes.map((t) => FEE_TYPE_LABELS[t]).join(", ")}
        </dd>
      </div>
      {refund.notes && <p className="text-xs text-[var(--muted-foreground)]">{refund.notes}</p>}
    </dl>
  );
}

export function DefaultTermsSummary({ terms }: { terms: DefaultTerms }) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5">
      <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2">If the allocation is revoked</h3>
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-xs text-[var(--muted-foreground)]">What triggers it</dt>
          <dd className="text-[var(--foreground)]">{terms.revocationTrigger}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--muted-foreground)]">Notice given first</dt>
          <dd className="text-[var(--foreground)]">{terms.revocationNoticeDays === null ? "Not stated" : `${terms.revocationNoticeDays} days`}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--muted-foreground)]">What happens to money already paid</dt>
          <dd className="text-[var(--foreground)]">{terms.onRevocationRefund}</dd>
        </div>
        {terms.developmentDeadlineMonths !== null && (
          <div>
            <dt className="text-xs text-[var(--muted-foreground)]">Development deadline</dt>
            <dd className="text-[var(--foreground)]">{terms.developmentDeadlineMonths} months</dd>
            <dd className="text-xs text-[var(--muted-foreground)]">{DEADLINE_NOT_TRACKED}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-[var(--muted-foreground)]">Transfer to another person</dt>
          <dd className="text-[var(--foreground)]">{terms.transferRequiresConsent ? "Needs the developer's consent" : "No consent needed"}</dd>
          <dd className="text-xs text-[var(--muted-foreground)]">{CONSENT_NOT_ENFORCED}</dd>
        </div>
      </dl>
    </div>
  );
}
