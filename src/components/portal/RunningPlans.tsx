// Finance › Running plans and Restructures (instalment phases 4–5c), from the
// Figma proposal. Running plans: every plan that's running, worked out for
// today by the backend, most urgent first, filterable by standing.
// Restructures: buyers' requests to answer, and proposals awaiting the buyer.
// Read-only lists; each row opens the plan page, where restructuring and —
// for the Executive Director — revocation happen.

import { useState } from "react";
import { useFetch } from "../../lib/useFetch";
import { formatMoney } from "../../lib/formatCurrency";
import { formatDay } from "../../lib/formatDate";
import {
  PLAN_STATUS_BADGE, fetchRestructureQueue, fetchRunningPlans, type RunningPlan, type RunningPlanFilter,
} from "../../services/planService";
import { ListCard } from "../ui/Card";
import Badge from "../ui/Badge";
import { LinkButton } from "../ui/Button";
import EmptyState from "../ui/EmptyState";
import { Loading } from "../ui/Page";
import LoadError from "../LoadError";

const FILTERS: { id: RunningPlanFilter | "all"; label: string }[] = [
  { id: "all", label: "All" }, { id: "late", label: "Late" }, { id: "overdue", label: "Overdue" },
  { id: "in_arrears", label: "In arrears" }, { id: "due_today", label: "Due today" }, { id: "on_track", label: "On track" },
];

export function RunningPlans() {
  const [filter, setFilter] = useState<RunningPlanFilter | "all">("all");
  const list = useFetch(() => fetchRunningPlans(filter === "all" ? undefined : filter), [filter]);
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted-foreground)]">Every plan that's running, worked out for today, most urgent first. Read-only, except restructuring and — for the Executive Director — revocation.</p>
      <div role="group" aria-label="Filter plans" className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border ${filter === f.id ? "bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]" : "bg-[var(--card)] text-[var(--foreground)] border-[var(--border)]"}`}>
            {f.label}
          </button>
        ))}
      </div>
      {list.loading && !list.data ? <Loading /> : list.error ? <LoadError error={list.errorValue} what="running plans" onRetry={list.refetch} /> : (list.data ?? []).length === 0 ? (
        <EmptyState title={filter === "all" ? "No plans running" : "Nothing here"} description={filter === "all" ? "Instalment plans appear here once a buyer's deposit is verified." : "No plan stands this way today."} />
      ) : (
        <ul className="space-y-3">{list.data!.map((p) => <PlanRow key={p.transactionId} plan={p} />)}</ul>
      )}
    </div>
  );
}

function PlanRow({ plan: p }: { plan: RunningPlan }) {
  const chip = PLAN_STATUS_BADGE[p.status];
  const rv = p.revocation;
  const money = (n: number) => formatMoney(n, p.currency);
  return (
    <ListCard className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-[var(--foreground)]">{p.estateName} — {p.plotLabel}</div>
          <div className="text-xs text-[var(--muted-foreground)]">{p.buyerEmail ?? "Buyer email not shown"} · <span className="font-mono-data">{p.transactionReference}</span> · {p.planName}</div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge label={chip.label} variant={chip.tone} />
          {rv?.notice ? <Badge label={`Notice running — deadline ${formatDay(rv.notice.deadline)}`} variant="warning" />
            : rv?.revocableNow ? <Badge label="Revocable" variant="neutral" /> : null}
        </div>
      </div>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <div><dt className="text-xs text-[var(--muted-foreground)]">Paid</dt><dd>{p.instalmentsPaid} of {p.instalmentCount}</dd></div>
        {p.arrears ? (
          <>
            <div><dt className="text-xs text-[var(--muted-foreground)]">Due now</dt><dd className="font-mono-data">{money(p.arrears.totalDue)}</dd></div>
            <div><dt className="text-xs text-[var(--muted-foreground)]">Of which penalties</dt><dd className="font-mono-data">{money(p.arrears.penaltyAmount)}</dd></div>
            <div><dt className="text-xs text-[var(--muted-foreground)]">Late since</dt><dd>{formatDay(p.arrears.overdueSince)} · {p.arrears.daysLate} days</dd></div>
          </>
        ) : (
          <>
            {p.nextDueAmount != null && <div><dt className="text-xs text-[var(--muted-foreground)]">Next</dt><dd className="font-mono-data">{money(p.nextDueAmount)}</dd></div>}
            {p.nextDueDate && <div><dt className="text-xs text-[var(--muted-foreground)]">Due</dt><dd>{formatDay(p.nextDueDate)}</dd></div>}
          </>
        )}
      </dl>
      {p.arrears && p.status === "overdue" && <p className="text-xs text-[var(--muted-foreground)]">Goes into arrears after {formatDay(p.arrears.graceEnds)}.</p>}
      {rv?.notice && <p className="text-xs text-[var(--muted-foreground)]">Notice given {formatDay(rv.notice.givenAt)}: “{rv.notice.reason}”</p>}
      <LinkButton to={`/portal/finance/plans/${p.transactionId}`} variant="secondary">Open plan</LinkButton>
    </ListCard>
  );
}

export function RestructureQueue() {
  const list = useFetch(() => fetchRestructureQueue(), []);
  if (list.loading && !list.data) return <Loading />;
  if (list.error) return <LoadError error={list.errorValue} what="restructure requests" onRetry={list.refetch} />;
  const items = list.data ?? [];
  if (items.length === 0) return <EmptyState title="No restructure requests" description="When a buyer asks to spread what they owe differently, the request appears here." />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--muted-foreground)]">Requests to answer, oldest first, and proposals waiting for the buyer.</p>
      <ul className="space-y-3">
        {items.map((r) => (
          <ListCard key={r.restructureId} className="space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-[var(--foreground)]">{r.estateName} — {r.plotLabel}</div>
                <div className="text-xs text-[var(--muted-foreground)]">{r.buyerEmail ?? "Buyer email not shown"} · {r.planName} · asked {formatDay(r.requestedAt)}{r.preferredInstalments ? ` · prefers ${r.preferredInstalments}` : ""}</div>
              </div>
              <Badge label={r.status === "proposed" ? `Proposed — answer by ${r.expiresOn ? formatDay(r.expiresOn) : "—"}` : "Requested"} variant={r.status === "proposed" ? "neutral" : "info"} />
            </div>
            {r.reason && <p className="text-sm text-[var(--foreground)]">“{r.reason}”</p>}
            <LinkButton to={`/portal/finance/plans/${r.transactionId}?section=restructure`} variant="secondary">Open plan</LinkButton>
          </ListCard>
        ))}
      </ul>
    </div>
  );
}
