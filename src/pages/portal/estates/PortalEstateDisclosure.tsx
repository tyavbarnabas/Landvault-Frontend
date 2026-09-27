// An estate's disclosure: fee schedule, refund terms, default terms, and a
// buyer's-eye preview (PD-1 to PD-7).
//
// Each declaration is shown as it currently stands, with its version. Anyone
// with `portal.estates.view` can read them; declaring needs `.manage`. There is
// no edit and no delete — "declare again" records the next version and keeps
// the last, because a schedule that can be quietly revised after a buyer has
// seen it is not a disclosure.

import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useFetch } from "../../../lib/useFetch";
import { useApp } from "../../../contexts/AppContext";
import { canManageEstates } from "../../../services/authService";
import { fetchPortalEstateById } from "../../../services/portalEstatesService";
import { fetchCostDisclosure } from "../../../services/costDisclosureService";
import {
  fetchDefaultTerms, fetchFeeSchedule, fetchRefundTerms, toPublicFee,
} from "../../../services/estateDisclosureService";
import TabBar from "../../../components/TabBar";
import EmptyState from "../../../components/marketplace/EmptyState";
import FeeBreakdown from "../../../components/cost/FeeBreakdown";
import FeeScheduleForm from "../../../components/portal/FeeScheduleForm";
import RefundTermsForm from "../../../components/portal/RefundTermsForm";
import DefaultTermsForm from "../../../components/portal/DefaultTermsForm";
import DisclosurePreview, { DefaultTermsSummary, RefundSummary } from "../../../components/portal/DisclosurePreview";
import { usePortalScope } from "../usePortalScope";

type Tab = "fees" | "refund" | "default" | "preview";
const TABS: Tab[] = ["fees", "refund", "default", "preview"];

export default function PortalEstateDisclosure() {
  const { estateId } = useParams<{ estateId: string }>();
  const scope = usePortalScope();
  const { user } = useApp();
  const canManage = canManageEstates(user);
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab") as Tab | null;
  const tab: Tab = requested && TABS.includes(requested) ? requested : "fees";
  const setTab = (next: Tab) => setSearchParams(next === "fees" ? {} : { tab: next }, { replace: true });

  const loaded = useFetch(async () => {
    if (!scope || !estateId) return null;
    const estate = await fetchPortalEstateById(estateId, scope);
    if (!estate) return null;
    const [fees, refund, defaults, computed] = await Promise.all([
      fetchFeeSchedule(estateId),
      fetchRefundTerms(estateId),
      fetchDefaultTerms(estateId),
      fetchCostDisclosure(estateId),
    ]);
    return { estate, fees, refund, defaults, computed };
  }, [scope?.tenantId, scope?.branchId, estateId]);

  if (loaded.loading) return <div className="p-8 text-sm text-[var(--muted-foreground)]">Loading disclosure…</div>;

  if (!loaded.data || !estateId) {
    return (
      <div className="p-8">
        <p className="text-sm font-medium text-[var(--foreground)] mb-2">{loaded.error ? "The disclosure couldn't be loaded." : "Estate not found."}</p>
        {loaded.error
          ? <button type="button" onClick={loaded.refetch} className="text-sm text-[var(--accent)] hover:underline">Try again</button>
          : <Link to="/portal/estates" className="text-sm text-[var(--accent)] hover:underline">Back to estates</Link>}
      </div>
    );
  }

  const { estate, fees, refund, defaults, computed } = loaded.data;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link to={`/portal/estates/${estateId}`} className="text-xs text-[var(--accent)] hover:underline">← {estate.name}</Link>
      <h1 className="font-display text-3xl text-[var(--foreground)] mt-2 mb-1">Fees &amp; terms</h1>
      <p className="text-sm text-[var(--muted-foreground)] mb-6">
        Declared here, shown to buyers before they commit. The fee schedule and refund terms are required before this estate can be published.
      </p>

      <div className="border-b border-[var(--border)] mb-5">
        <TabBar
          tabs={[
            { id: "fees", label: "Fee schedule" },
            { id: "refund", label: "Refund terms" },
            { id: "default", label: "Default terms" },
            { id: "preview", label: "Buyer preview" },
          ]}
          active={tab}
          onActivate={setTab}
          ariaLabel="Disclosure sections"
        />
      </div>

      <div id={`panel-${tab}`} role="tabpanel" className="space-y-5">
        {tab === "fees" && (
          <Declaration
            key={`fees-${fees.version}`}
            canManage={canManage}
            hasCurrent={fees.declaredAt !== null}
            current={
              fees.declaredAt === null ? (
                estate.eligibility?.feesDeclared ? (
                  // Grandfathered: the server counts the estate as declared,
                  // but there is no declaration to show — and backfilling one
                  // would record something nobody said.
                  <EmptyState
                    title="Listed before fee declarations were required"
                    description="The marketplace treats this estate's fees as declared because it was listed before the requirement existed. There is no schedule on record to show. Declaring one now records version 1."
                  />
                ) : (
                  <EmptyState
                    title="No fee schedule declared"
                    description="This estate can't be published until its fees are declared — including declaring that there are none. Not declaring is not the same as declaring nothing."
                  />
                )
              ) : (
                <>
                  <VersionLine version={fees.version} declaredAt={fees.declaredAt} />
                  {fees.fees.length === 0 ? (
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 text-sm text-[var(--foreground)]">
                      Declared: no charges beyond the land price.
                    </div>
                  ) : (
                    <FeeBreakdown feeSchedule={fees.fees.map(toPublicFee)} tier={null} />
                  )}
                </>
              )
            }
            form={(done) => <FeeScheduleForm estateId={estateId} current={fees} onDeclared={() => { done(); loaded.refetch(); }} />}
            what="fee schedule"
          />
        )}

        {tab === "refund" && (
          <Declaration
            key={`refund-${refund?.version ?? 0}`}
            canManage={canManage}
            hasCurrent={refund !== null}
            current={
              refund ? (
                <>
                  <VersionLine version={refund.version} />
                  <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5"><RefundSummary refund={refund} /></div>
                </>
              ) : estate.eligibility?.refundTermsDeclared ? (
                <EmptyState
                  title="Listed before refund terms were required"
                  description="The marketplace treats this estate's refund terms as declared because it was listed before the requirement existed. There are none on record to show. Declaring them now records version 1."
                />
              ) : (
                <EmptyState title="No refund terms declared" description="Required before this estate can be published." />
              )
            }
            form={(done) => (
              <RefundTermsForm estateId={estateId} current={refund} declaredFees={fees.fees} onDeclared={() => { done(); loaded.refetch(); }} />
            )}
            what="refund terms"
          />
        )}

        {tab === "default" && (
          <Declaration
            key={`default-${defaults?.version ?? 0}`}
            canManage={canManage}
            hasCurrent={defaults !== null}
            current={
              defaults ? (
                <>
                  <VersionLine version={defaults.version} />
                  {defaults.penaltyTiers.length > 0 && (
                    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 divide-y divide-[var(--border)]">
                      {defaults.penaltyTiers.map((t) => (
                        <div key={t.monthsLate} className="flex justify-between py-2 text-sm first:pt-0 last:pb-0">
                          <span className="text-[var(--muted-foreground)]">{t.monthsLate} months late</span>
                          <span className="font-mono-data text-[var(--foreground)]">{t.penaltyPct}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <DefaultTermsSummary terms={defaults} />
                </>
              ) : (
                <EmptyState
                  title="No default terms declared"
                  description="Not required to publish, but a buyer choosing instalments can't see what falling behind costs until these are declared."
                />
              )
            }
            form={(done) => <DefaultTermsForm estateId={estateId} current={defaults} onDeclared={() => { done(); loaded.refetch(); }} />}
            what="default terms"
          />
        )}

        {tab === "preview" && <DisclosurePreview computed={computed} fees={fees} refund={refund} defaults={defaults} />}
      </div>
    </div>
  );
}

// The current declaration, then — for someone who may declare — either the
// form (nothing on record yet) or a button that opens it for the next version.
function Declaration({ canManage, hasCurrent, current, form, what }: {
  canManage: boolean;
  hasCurrent: boolean;
  current: React.ReactNode;
  form: (done: () => void) => React.ReactNode;
  what: string;
}) {
  const [open, setOpen] = useState(!hasCurrent);
  return (
    <>
      {current}
      {canManage && (open
        ? form(() => setOpen(false))
        : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="px-4 py-2 border border-[var(--border)] rounded-md text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]"
          >
            Declare a new version of the {what}
          </button>
        ))}
    </>
  );
}

function VersionLine({ version, declaredAt }: { version: number; declaredAt?: string | null }) {
  return (
    <p className="text-xs text-[var(--muted-foreground)]">
      Version {version}
      {declaredAt ? ` · declared ${new Date(declaredAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}
    </p>
  );
}
