// /portal/finance/plans/:id — one running instalment plan, for the
// developer's finance (portal.payments.verify), from the Figma "Plan"
// proposals: where it stands today, answering a buyer's restructure request
// (preview on every change, then propose, reject, or withdraw a proposal),
// and — for the Executive Director (portal.plans.revoke) — revocation: what
// revoking would mean, giving notice, withdrawing it, confirming after the
// deadline. Late-payment penalties can be waived in part or in full, with a
// reason the buyer is emailed (Figma "Penalty waivers"). Every figure is the
// backend's.

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useApp } from "../../../contexts/AppContext";
import { useFetch, type UseFetchResult } from "../../../lib/useFetch";
import { formatMoney } from "../../../lib/formatCurrency";
import { formatDay } from "../../../lib/formatDate";
import { ApiError } from "../../../lib/apiClient";
import { PLANS_REVOKE_PERMISSION } from "../../../services/authService";
import {
  PLAN_STATUS_BADGE, WAIVER_REASON_MAX, cancelNotice, checkWaiver, confirmRevocation, fetchFlexiblePlans, fetchPenaltyWaivers, fetchPlanRestructures,
  fetchRevocation, fetchRunningPlan, giveNotice, planErrorCode, planErrorMessage, previewRestructure, proposeRestructure,
  rejectRestructure, scheduleLines, waivePenalty, withdrawProposal,
  type FlexiblePlanRow, type PenaltyWaivers, type RunningPlan, type PlanRestructures, type PlanRevocation, type Proposal, type ProposalTerms, type WaivablePenalty,
} from "../../../services/planService";
import Page, { Loading } from "../../../components/ui/Page";
import Card, { InfoBox } from "../../../components/ui/Card";
import Alert from "../../../components/ui/Alert";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Dialog, { DialogActions } from "../../../components/ui/Dialog";
import DisclosureTable, { TableRow } from "../../../components/ui/DisclosureTable";
import { ErrorText, Field, Input, Select, Textarea } from "../../../components/ui/Field";
import LoadError from "../../../components/LoadError";
import { planInSentence } from "../../../services/paymentPlansService";

export default function PortalPlan() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const { user } = useApp();
  const mayRevoke = !!user?.permissions?.includes(PLANS_REVOKE_PERMISSION);
  const plans = useFetch(() => fetchRunningPlan(id!), [id]);
  const plan = plans.data ?? null;
  // Fetched here so the title can say a restructure is open (Figma).
  const restructures = useFetch(() => fetchPlanRestructures(id!), [id]);
  const [rsOver, setRsOver] = useState<PlanRestructures | null>(null);
  const openRs = (rsOver ?? restructures.data)?.open ?? null;
  // A revocation ends the plan: every section reloads, so none offers what the plan no longer allows.
  const [revision, setRevision] = useState(0);
  const revocationChanged = () => { plans.refetch(); setRsOver(null); restructures.refetch(); setRevision((n) => n + 1); };
  const back = { to: "/portal/finance?tab=plans", label: "Running plans" };
  // A flexible plan isn't a running instalment plan (that route answers 404):
  // its row in Finance › Flexible plans says where it stands.
  const flexibles = useFetch(() => fetchFlexiblePlans(), [id]);
  const flexRow = flexibles.data?.find((r) => r.transactionId === id) ?? null;

  // A flexible plan that has ended is in neither list; its notices say what it was.
  const ended = useFetch(() => (mayRevoke ? fetchRevocation(id!).catch(() => null) : Promise.resolve(null)), [id, revision, flexibles.data?.length]);

  if ((plans.loading && !plans.data) || (flexibles.loading && !flexibles.data)) return <Page title="Plan" back={back}><Loading /></Page>;
  if (!plans.data && flexRow) return <FlexiblePlanView row={flexRow} mayRevoke={mayRevoke} onChanged={flexibles.refetch} />;
  if (!plans.data && ended.data && isFlexibleRevocation(ended.data)) {
    return (
      <Page width="xl" back={{ to: "/portal/finance?tab=flexible", label: "Flexible plans" }} eyebrow={ended.data.transactionReference} title="Plan"
        description={ended.data.status === "withdrawn" ? "This flexible plan has ended — the buyer left it." : "This flexible plan has ended."}>
        <RevocationSection id={id!} onChanged={revocationChanged} />
      </Page>
    );
  }
  if (plans.error) return <LoadError error={plans.errorValue} what="this plan" onRetry={plans.refetch} />;
  const money = (n: number) => formatMoney(n, plan?.currency ?? "NGN");
  const chip = plan ? PLAN_STATUS_BADGE[plan.status] : null;

  return (
    <Page width="xl" back={back} eyebrow={plan?.transactionReference ?? restructures.data?.transactionReference}
      title={<span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">{plan?.plotLabel ?? "Plan"}<span className="font-[family-name:var(--font-body)] inline-flex gap-1.5">{chip && <Badge label={chip.label} variant={chip.tone} />}{openRs?.status === "requested" && <Badge label="Restructure requested" variant="info" />}{openRs?.status === "proposed" && <Badge label="Restructure proposed" variant="neutral" />}</span></span>}
      description={plan ? [plan.estateName, plan.buyerEmail, plan.planName].filter(Boolean).join(" · ") : "This plan isn't running — it may be paid off, withdrawn or revoked."}>
      <div className="space-y-6">
        {plan && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <InfoBox label="Instalments paid"><div>{plan.instalmentsPaid} of {plan.instalmentCount}</div></InfoBox>
            {plan.arrears ? (
              <>
                <InfoBox label="Due now"><div className="font-mono-data">{money(plan.arrears.totalDue)}</div></InfoBox>
                <InfoBox label="Of which penalties"><div className="font-mono-data">{money(plan.arrears.penaltyAmount)}</div></InfoBox>
                <InfoBox label="Late since"><div>{formatDay(plan.arrears.overdueSince)} · {plan.arrears.daysLate} days</div></InfoBox>
              </>
            ) : (
              <>
                <InfoBox label="Next"><div className="font-mono-data">{plan.nextDueAmount != null ? money(plan.nextDueAmount) : "—"}</div></InfoBox>
                <InfoBox label="Due"><div>{plan.nextDueDate ? formatDay(plan.nextDueDate) : "—"}</div></InfoBox>
              </>
            )}
          </div>
        )}
        <PenaltiesSection key={revision} id={id!} onChanged={plans.refetch} />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
          <RestructureSection id={id!} focus={params.get("section") === "restructure"} loaded={restructures} over={rsOver} setOver={setRsOver} />
          {plan?.instalments && <CurrentSchedule plan={plan} />}
        </div>
        {mayRevoke && <RevocationSection id={id!} onChanged={revocationChanged} />}
      </div>
    </Page>
  );
}

// ─── A flexible plan (Figma "Flexible plans" › plan page) ────────────────────
//
// What's paid, what's left, when the buyer last paid and the date to finish
// by — then, for the Executive Director, giving notice on a quiet plan or one
// past its finish date, withdrawing it, and ending the plan after it runs out.

function FlexiblePlanView({ row, mayRevoke, onChanged }: { row: FlexiblePlanRow; mayRevoke: boolean; onChanged: () => void }) {
  const s = row.standing;
  const money = (n: number) => formatMoney(n, row.currency);
  const pastFinish = s.noticeReason === "finish_by" || s.notice?.trigger === "finish_by";
  const quiet = !pastFinish && (s.noticeReason === "inactivity" || s.notice?.trigger === "inactivity");
  return (
    <Page width="xl" back={{ to: "/portal/finance?tab=flexible", label: "Flexible plans" }} eyebrow={row.transactionReference}
      title={<span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">{row.plotLabel}<span className="font-[family-name:var(--font-body)] inline-flex gap-1.5">
        {pastFinish ? <Badge label="Past its finish date" variant="warning" /> : quiet ? <Badge label="Quiet" variant="warning" /> : <Badge label="Paying" variant="success" />}
        {s.notice ? <Badge label="Notice running" variant="neutral" /> : s.noticeReason ? <Badge label="Can give notice" variant="neutral" /> : null}
      </span></span>}
      description={[row.estateName, row.buyerEmail, planInSentence(row.planName).replace(/^the /, "")].filter(Boolean).join(" · ")}>
      <div className="space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <InfoBox label="Paid"><div className="font-mono-data">{money(s.paid)} <span className="text-xs text-[var(--muted-foreground)]">of {money(row.planTotal)}</span></div></InfoBox>
          <InfoBox label="Left to pay"><div className="font-mono-data">{money(s.remaining)}</div></InfoBox>
          <InfoBox label="Last payment"><div>{s.lastPaymentOn ? formatDay(s.lastPaymentOn) : "None yet"}</div></InfoBox>
          <InfoBox label="Finish by"><div>{s.finishBy ? `${formatDay(s.finishBy)}${pastFinish ? " · passed" : ""}` : "No date"}</div></InfoBox>
        </div>
        {s.awaitingFinance !== null && (
          <Alert tone="info" role="status"><span className="font-mono-data">{money(s.awaitingFinance)}</span> from the buyer is waiting for your verification in Finance › Awaiting verification.</Alert>
        )}
        {mayRevoke ? <RevocationSection id={row.transactionId} onChanged={onChanged} />
          : <Alert tone="neutral">Only the Executive Director can give notice on a plan or end it.</Alert>}
      </div>
    </Page>
  );
}

// ─── Where each instalment stands today (Figma "Current schedule") ───────────

function scheduleBadge(status: string, daysLate: number): { label: string; variant: "success" | "warning" | "info" | "neutral" } {
  if (status === "paid") return { label: "Paid", variant: "success" };
  if (status === "in_arrears") return { label: `In arrears · ${daysLate} day${daysLate === 1 ? "" : "s"}`, variant: "warning" };
  if (status === "overdue") return { label: `Overdue · ${daysLate} day${daysLate === 1 ? "" : "s"}`, variant: "warning" };
  if (status === "due_today") return { label: "Due today", variant: "info" };
  if (status === "awaiting_verification") return { label: "Awaiting verification", variant: "info" };
  return { label: "Upcoming", variant: "neutral" };
}

function CurrentSchedule({ plan }: { plan: RunningPlan }) {
  const lines = scheduleLines(plan.instalments ?? []);
  return (
    <Card as="section" aria-labelledby="schedule-heading" className="space-y-3">
      <h2 id="schedule-heading" className="font-semibold text-[var(--foreground)]">Current schedule</h2>
      <ul className="space-y-2.5 text-sm">
        {plan.deposit && (
          <li className="flex items-center justify-between gap-3">
            <span className="text-[var(--foreground)]">Deposit</span>
            <Badge label="Paid" variant="success" />
          </li>
        )}
        {lines.map((l) => {
          const b = scheduleBadge(l.status, l.daysLate);
          return (
            <li key={l.label} className="flex items-center justify-between gap-3">
              <span className="text-[var(--foreground)]">{l.label}</span>
              <Badge label={b.label} variant={b.variant} />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// ─── Late-payment penalties: waiving ────────────────────────────────────────

const PENALTY_GRID = "lg:grid-cols-[minmax(0,1fr)_5.25rem_6rem_4.75rem_4.5rem_5.5rem_5rem]";

const INSTALMENT_STATUS: Record<string, { label: string; variant: "warning" | "info" | "neutral" }> = {
  overdue: { label: "Overdue", variant: "warning" },
  in_arrears: { label: "In arrears", variant: "warning" },
  due_today: { label: "Due today", variant: "info" },
  upcoming: { label: "Upcoming", variant: "neutral" },
};

// The waiver errors carry the backend's own words; show them.
function waiverError(err: unknown): string {
  return err instanceof Error && err.message ? err.message : planErrorMessage(err);
}

// First on the page, so Running plans' "Waive penalty" (?section=penalties) lands on it.
function PenaltiesSection({ id, onChanged }: { id: string; onChanged: () => void }) {
  const loaded = useFetch(() => fetchPenaltyWaivers(id), [id]);
  const [over, setOver] = useState<PenaltyWaivers | null>(null);
  const [openSeq, setOpenSeq] = useState<number | null>(null);
  const [done, setDone] = useState("");
  const [stale, setStale] = useState("");

  if (loaded.loading && !loaded.data) return <Card><Loading label="Loading penalties…" /></Card>;
  if (loaded.error || !loaded.data) {
    if (planErrorCode(loaded.errorValue) === "NOT_IN_DEMO") {
      return <Card as="section" className="space-y-2"><h2 className="font-semibold text-[var(--foreground)]">Late-payment penalties</h2><Alert tone="info">{planErrorMessage(loaded.errorValue)}</Alert></Card>;
    }
    // A plan with no penalties at all (a flexible plan) has no waivers route.
    if (loaded.errorValue instanceof ApiError && loaded.errorValue.status === 404) return null;
    return <LoadError error={loaded.errorValue} what="penalties" onRetry={loaded.refetch} />;
  }
  const w = over ?? loaded.data;
  const money = (n: number) => formatMoney(n, w.currency);
  const running = w.planStatus === "on_plan";
  const waived = (next: PenaltyWaivers, message: string) => { setOver(next); setOpenSeq(null); setStale(""); setDone(message); onChanged(); };
  const refresh = (message: string) => { setOpenSeq(null); setStale(message); setOver(null); loaded.refetch(); };

  return (
    <section aria-labelledby="penalties-heading" className="space-y-4">
      <div>
        <h2 id="penalties-heading" className="font-semibold text-[var(--foreground)]">Late-payment penalties</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          {running ? "Penalties not yet paid, worked out today. You can waive some or all of one — the buyer is emailed your reason." : "This plan has ended, so penalties can no longer be waived. Past waivers are shown below."}
        </p>
      </div>
      {done && <Alert tone="success" role="status">{done}</Alert>}
      {stale && <Alert tone="warning" role="status">{stale}</Alert>}
      {running && (w.penalties.length === 0 ? (
        <Card><p className="text-sm text-[var(--muted-foreground)]">No penalties to waive on this plan.</p></Card>
      ) : (
        <DisclosureTable columns={["Instalment", "Due", "Status", "Reached", "Waived", "Outstanding"]} grid={PENALTY_GRID} label="Penalties">
          {w.penalties.map((p) => {
            const st = INSTALMENT_STATUS[p.instalmentStatus] ?? { label: p.instalmentStatus, variant: "neutral" as const };
            const carried = p.instalmentStatus === "upcoming" || p.instalmentStatus === "due_today";
            return (
              <TableRow key={p.instalmentSequence} grid={PENALTY_GRID}
                cells={[
                  <div className="text-sm text-[var(--foreground)]">Instalment {p.instalmentSequence}{carried && <div className="text-xs text-[var(--muted-foreground)]">Penalty carried from before the restructure</div>}</div>,
                  <div className="text-sm text-[var(--muted-foreground)]"><span className="lg:hidden">Due </span>{formatDay(p.dueDate)}</div>,
                  <Badge label={st.label} variant={st.variant} />,
                  <Figure label="Reached" value={money(p.reached)} />,
                  <Figure label="Waived" value={money(p.waived)} />,
                  <Figure label="Outstanding" value={money(p.outstanding)} strong />,
                ]}
                action={openSeq === p.instalmentSequence ? null : p.outstanding <= 0 ? <span className="text-xs text-[var(--muted-foreground)]">Fully waived</span> : <Button variant="secondary" onClick={() => { setOpenSeq(p.instalmentSequence); setDone(""); setStale(""); }}>Waive</Button>}
                below={openSeq === p.instalmentSequence ? (
                  <WaiveForm id={id} penalty={p} money={money} onCancel={() => setOpenSeq(null)} onWaived={waived} onStale={refresh} />
                ) : undefined}
              />
            );
          })}
        </DisclosureTable>
      ))}
      <Card as="section" aria-labelledby="waivers-heading" className="space-y-3">
        <h3 id="waivers-heading" className="font-semibold text-[var(--foreground)]">Waivers on this plan</h3>
        {w.waivers.length === 0 ? <p className="text-sm text-[var(--muted-foreground)]">None yet.</p> : (
          <ul className="divide-y divide-[var(--border)]">
            {w.waivers.map((v) => (
              <li key={v.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium text-[var(--foreground)]">Instalment {v.instalmentSequence} · {formatDay(v.waivedAt)}{v.scheduleVersion > 1 ? ` · schedule version ${v.scheduleVersion}` : ""}</span>
                  <span className="font-mono-data text-sm text-[var(--foreground)]">{money(v.amount)}</span>
                </div>
                <p className="text-sm text-[var(--muted-foreground)]">“{v.reason}”</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="lg:hidden text-[var(--muted-foreground)]">{label}</span>
      <span className={`font-mono-data text-[var(--foreground)] ${strong ? "font-medium" : ""}`}>{value}</span>
    </div>
  );
}

function WaiveForm({ id, penalty: p, money, onCancel, onWaived, onStale }: {
  id: string; penalty: WaivablePenalty; money: (n: number) => string;
  onCancel: () => void; onWaived: (w: PenaltyWaivers, message: string) => void; onStale: (message: string) => void;
}) {
  // Prefilled with all of it, written as people read money ("28,125").
  const [amountText, setAmountText] = useState(p.outstanding.toLocaleString("en-NG", { maximumFractionDigits: 2 }));
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<{ amount?: string; reason?: string }>({});
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const fid = `waive-${p.instalmentSequence}`;
  const checked = checkWaiver(amountText, reason, p.outstanding);

  const ask = () => {
    if (checked.errors) { setErrors(checked.errors); return; }
    setErrors({});
    setError("");
    setConfirming(checked.amount);
  };
  const go = async () => {
    if (confirming == null) return;
    setBusy(true);
    try {
      const next = await waivePenalty(id, { instalmentSequence: p.instalmentSequence, amount: confirming, reason });
      onWaived(next, `Waived ${money(confirming)} on instalment ${p.instalmentSequence}. The buyer has been emailed your reason.`);
    } catch (err) {
      setConfirming(null);
      const code = planErrorCode(err);
      if (code === "PENALTY_NOT_WAIVABLE") { onStale(waiverError(err)); return; }
      if (code === "WAIVER_TOO_LARGE") setErrors({ amount: waiverError(err) });
      else if (code === "VALIDATION_ERROR" && err instanceof ApiError && err.body?.fieldErrors) {
        const fe = err.body.fieldErrors;
        setErrors({ amount: fe.amount, reason: fe.reason });
        if (!fe.amount && !fe.reason) setError(waiverError(err));
      } else setError(waiverError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg bg-[var(--muted)] p-4 space-y-3">
      <h4 className="text-sm font-semibold text-[var(--foreground)]">Waive the penalty on instalment {p.instalmentSequence}</h4>
      <Field id={`${fid}-amount`} label="Amount to waive" hint={`Up to ${money(p.outstanding)}, what is still owed on this penalty. Prefilled with all of it.`} error={errors.amount}>
        <Input id={`${fid}-amount`} inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} className="font-mono-data" aria-invalid={!!errors.amount} />
      </Field>
      <Field id={`${fid}-reason`} label="Reason" hint={`The buyer is emailed this reason. Up to ${WAIVER_REASON_MAX} characters.`} error={errors.reason}>
        <Textarea id={`${fid}-reason`} rows={2} maxLength={WAIVER_REASON_MAX} value={reason} onChange={(e) => setReason(e.target.value)} aria-invalid={!!errors.reason} />
      </Field>
      <p className="text-xs text-[var(--muted-foreground)]">A waiver is a fixed amount. If the instalment stays unpaid and reaches a higher penalty step, the difference is owed.</p>
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button onClick={ask}>{checked.amount != null ? `Waive ${money(checked.amount)}…` : "Waive…"}</Button>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
      {confirming != null && (
        <Dialog title={`Waive ${money(confirming)} of the penalty on instalment ${p.instalmentSequence}?`} onClose={busy ? () => {} : () => setConfirming(null)}>
          <p className="text-sm text-[var(--muted-foreground)] mb-3">The buyer will be emailed your reason. If the instalment stays unpaid and reaches a higher penalty step, the difference is owed.</p>
          <DialogActions onCancel={() => setConfirming(null)} onConfirm={go} confirmLabel={`Waive ${money(confirming)}`} busy={busy} />
        </Dialog>
      )}
    </div>
  );
}

// ─── Restructure ────────────────────────────────────────────────────────────

function RestructureSection({ id, focus, loaded, over, setOver }: {
  id: string; focus: boolean; loaded: UseFetchResult<PlanRestructures>;
  over: PlanRestructures | null; setOver: (r: PlanRestructures | null) => void;
}) {
  if (loaded.loading && !loaded.data) return <Card><Loading label="Loading restructure requests…" /></Card>;
  if (loaded.error || !loaded.data) return <LoadError error={loaded.errorValue} what="restructure requests" onRetry={loaded.refetch} />;
  const r = over ?? loaded.data;
  const open = r.open;
  const done = (next: PlanRestructures) => { setOver(next); loaded.refetch(); };
  return (
    <Card as="section" aria-labelledby="restructure-heading" className={`space-y-4 ${focus ? "ring-2 ring-[var(--ring)]" : ""}`}>
      <h2 id="restructure-heading" className="font-semibold text-[var(--foreground)]">Restructuring</h2>
      {!open && <p className="text-sm text-[var(--muted-foreground)]">{r.planStatus === "on_plan" ? "No restructure request is open. A buyer asks from their purchase page; you answer here." : "This plan has ended, so it can't be restructured."}</p>}
      {open?.status === "requested" && (
        <>
          <div className="rounded-lg bg-[var(--muted)] p-3.5 text-sm space-y-1">
            <div className="font-medium text-[var(--foreground)]">The buyer's request</div>
            {open.reason && <p className="text-[var(--foreground)]">“{open.reason}”</p>}
            <p className="text-xs text-[var(--muted-foreground)]">Asked {formatDay(open.requestedAt)}{open.preferredInstalments ? ` · prefers ${open.preferredInstalments} instalments` : ""}</p>
          </div>
          <ProposeForm id={id} onDone={done} />
        </>
      )}
      {open?.status === "proposed" && open.proposal && <ProposedState id={id} proposal={open.proposal} onDone={done} />}
      {r.history.filter((h) => h.status !== "requested" && h.status !== "proposed").length > 0 && (
        <ul className="text-xs text-[var(--muted-foreground)] space-y-1 border-t border-[var(--border)] pt-3">
          {r.history.filter((h) => h.status !== "requested" && h.status !== "proposed").map((h) => (
            <li key={h.id}>{formatDay(h.closedAt ?? h.acceptedAt ?? h.requestedAt)} · {h.status}{h.closeNote ? ` — “${h.closeNote}”` : ""}</li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ProposeForm({ id, onDone }: { id: string; onDone: (r: PlanRestructures) => void }) {
  const [count, setCount] = useState("");
  const [frequency, setFrequency] = useState<"monthly" | "quarterly">("monthly");
  const [first, setFirst] = useState("");
  const [preview, setPreview] = useState<Proposal | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const terms: ProposalTerms | null = Number.isInteger(Number(count)) && Number(count) > 0 && first ? { instalmentCount: Number(count), frequency, firstDueDate: first } : null;
  const key = terms ? `${terms.instalmentCount}|${terms.frequency}|${terms.firstDueDate}` : "";

  // Preview on every change: nothing is written; the figures are HomeTrue's.
  useEffect(() => {
    if (!terms) { setPreview(null); return; }
    let stale = false;
    const t = setTimeout(() => {
      previewRestructure(id, terms).then((p) => { if (!stale) { setPreview(p); setPreviewError(""); } })
        .catch((err) => { if (!stale) { setPreview(null); setPreviewError(planErrorMessage(err)); } });
    }, 350);
    return () => { stale = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, key]);

  const propose = async () => {
    if (!terms) return;
    setBusy(true);
    setError("");
    try {
      onDone(await proposeRestructure(id, terms));
    } catch (err) {
      setError(planErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const money = (n: number) => formatMoney(n, preview?.currency ?? "NGN");
  const firstI = preview?.instalments[0];
  const lastI = preview?.instalments[preview.instalments.length - 1];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-[var(--foreground)]">Propose new terms</h3>
        <p className="text-xs text-[var(--muted-foreground)]">Spread what the buyer still owes. HomeTrue works out every figure; the total owed never changes, and penalties already reached are kept on the first new instalment.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="rs-count" label="Instalments" hint="At most 60 in all, counting those paid.">
          <Input id="rs-count" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} className="font-mono-data" />
        </Field>
        <Field id="rs-freq" label="How often">
          <Select id="rs-freq" value={frequency} onChange={(e) => setFrequency(e.target.value as "monthly" | "quarterly")}>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
          </Select>
        </Field>
        <Field id="rs-first" label="First due date" hint="After today, within 3 months.">
          <Input id="rs-first" type="date" value={first} onChange={(e) => setFirst(e.target.value)} />
        </Field>
      </div>
      {previewError && <Alert tone="warning">{previewError}</Alert>}
      {preview && (
        <dl className="rounded-lg bg-[var(--muted)] p-3.5 text-sm space-y-1.5" aria-live="polite">
          <div className="font-semibold text-[var(--foreground)] mb-1">Preview — nothing is sent yet</div>
          <Row label="Still owed" value={money(preview.balance)} />
          {firstI && <Row label={`${preview.instalmentCount} ${preview.frequency} instalments of`} value={money(firstI.amount)} />}
          {lastI && firstI && lastI.amount !== firstI.amount && <Row label="The last" value={money(lastI.amount)} />}
          {preview.carriedPenalty > 0 && firstI && <Row label={`Penalty carried onto instalment ${firstI.sequence}`} value={money(preview.carriedPenalty)} />}
          {firstI && lastI && <Row label="Numbered" value={`${firstI.sequence} to ${lastI.sequence}, from ${formatDay(preview.firstDueDate)}`} />}
        </dl>
      )}
      {error && <ErrorText>{error}</ErrorText>}
      <div className="flex flex-col sm:flex-row gap-3">
        <Button onClick={propose} disabled={!preview || busy}>{busy ? "Proposing…" : "Propose — issue the restructure letter"}</Button>
        <Button variant="secondary" onClick={() => setRejecting(true)}>Reject the request</Button>
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">Proposing issues a restructure letter on your letterhead and emails the buyer, who has 14 days to accept.</p>
      {rejecting && (
        <ReasonDialog title="Reject this request?" label="Why? (the buyer reads this)" confirm="Reject the request" onClose={() => setRejecting(false)}
          action={(reason) => rejectRestructure(id, reason)} onDone={(r) => { setRejecting(false); onDone(r as PlanRestructures); }} required />
      )}
    </div>
  );
}

function ProposedState({ id, proposal, onDone }: { id: string; proposal: Proposal; onDone: (r: PlanRestructures) => void }) {
  const [withdrawing, setWithdrawing] = useState(false);
  return (
    <div className="space-y-3">
      <Alert tone="info" role="status">
        Proposed {proposal.proposedAt ? formatDay(proposal.proposedAt) : ""}{proposal.letterNumber ? ` — letter ${proposal.letterNumber}` : ""}. {proposal.instalmentCount} {proposal.frequency} instalments from {formatDay(proposal.firstDueDate)}.
        {proposal.expiresOn ? ` The buyer has until the end of ${formatDay(proposal.expiresOn)}.` : ""}
      </Alert>
      <Button variant="link" onClick={() => setWithdrawing(true)}>Withdraw the proposal</Button>
      <p className="text-xs text-[var(--muted-foreground)]">Withdrawing keeps the buyer's request open, so you can propose different terms.</p>
      {withdrawing && (
        <ReasonDialog title="Withdraw this proposal?" label="Note (optional)" confirm="Withdraw the proposal" onClose={() => setWithdrawing(false)}
          action={(note) => withdrawProposal(id, note)} onDone={(r) => { setWithdrawing(false); onDone(r as PlanRestructures); }} />
      )}
    </div>
  );
}

// ─── Revocation (Executive Director) ────────────────────────────────────────

function RevocationSection({ id, onChanged }: { id: string; onChanged: () => void }) {
  const loaded = useFetch(() => fetchRevocation(id), [id]);
  const [over, setOver] = useState<PlanRevocation | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  if (loaded.loading && !loaded.data) return <Card><Loading label="Loading revocation…" /></Card>;
  if (loaded.error || !loaded.data) {
    const code = planErrorCode(loaded.errorValue);
    if (code === "REVOCATION_REQUIRES_COMPANY_WIDE_SCOPE" || code === "REVOCATION_TERMS_MISSING" || code === "NOT_IN_DEMO") {
      return <Card as="section" className="space-y-2"><h2 className="font-semibold text-[var(--foreground)]">Revocation</h2><Alert tone="info">{planErrorMessage(loaded.errorValue)}</Alert></Card>;
    }
    return <LoadError error={loaded.errorValue} what="revocation" onRetry={loaded.refetch} />;
  }
  const rv = over ?? loaded.data;
  const s = rv.settlement;
  const money = (n: number) => formatMoney(n, s?.currency ?? "NGN");
  const notice = rv.notice && rv.notice.status === "notice" ? rv.notice : null;
  const today = new Date().toISOString().slice(0, 10);
  const confirmable = !!notice && today >= notice.confirmableFrom;
  const done = (next: PlanRevocation) => { setOver(next); setReason(""); loaded.refetch(); onChanged(); };
  // A flexible plan: nothing is ever overdue; notice is for a quiet plan or one
  // past its finish date, and ending it returns exactly what leaving does.
  const fx = rv.flexible ?? null;
  // Once a flexible plan ends its standing is gone; its notices still say what they were for.
  const isFlex = !!fx || isFlexibleRevocation(rv);
  const fxFinish = notice?.trigger === "finish_by" || (!notice && fx?.noticeReason === "finish_by");
  // The backend keeps noticeReason set while a notice runs: offer notice only without one.
  const canGive = rv.status === "on_plan" && !rv.notice && (fx ? !!fx.noticeReason : !isFlex && rv.revocableNow);
  const words = isFlex ? FLEXIBLE_NOTICE_WORDS : NOTICE_WORDS;

  const give = async () => {
    if (!reason.trim()) { setError("Give a reason — the buyer reads it."); return; }
    setBusy(true);
    setError("");
    try {
      done(await giveNotice(id, reason));
    } catch (err) {
      setError(planErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card as="section" aria-labelledby="revocation-heading" className="space-y-4">
      <h2 id="revocation-heading" className="font-semibold text-[var(--foreground)]">{isFlex ? "Ending the plan" : "Revocation"}</h2>
      {!fx && isFlex ? (
        <p className="text-sm text-[var(--foreground)]">
          Under the terms on this purchase you may give {rv.noticeDays} days' written notice when nothing has been paid for {rv.afterMonthsUnpaid} months, or the plan isn't finished by its date.
          {rv.status === "revoked" ? " This plan was ended." : rv.status === "withdrawn" ? " The buyer left the plan." : ""}
        </p>
      ) : fx ? (
        <p className="text-sm text-[var(--foreground)]">
          Under the terms on this purchase you may give {rv.noticeDays} days' written notice when nothing has been paid for {rv.afterMonthsUnpaid} months{fx.finishBy ? `, or the plan isn't finished by ${formatDay(fx.finishBy)}` : ""}.
          {rv.status === "revoked" ? " This plan was ended." : rv.notice ? "" : fx.noticeReason === "finish_by" ? " This plan passed its finish date, so you can give notice now. Only finishing the plan ends this notice."
            : fx.noticeReason === "inactivity" ? ` Nothing has been paid${fx.lastPaymentOn ? ` since ${formatDay(fx.lastPaymentOn)}` : ""}, so you can give notice now.`
            : fx.quietFrom ? ` If nothing is paid, that's from ${formatDay(fx.quietFrom)}.` : ""}
        </p>
      ) : (
        <p className="text-sm text-[var(--foreground)]">
          Under the terms on this purchase, a plan can be revoked once an instalment is {rv.afterMonthsUnpaid} months unpaid, after {rv.noticeDays} days' written notice.
          {rv.status === "revoked" ? " This plan was revoked." : rv.notice ? "" : rv.revocableNow ? " You can give notice now." : rv.revocableFrom ? ` If nothing is paid, that's from ${formatDay(rv.revocableFrom)}.` : " Nothing is late enough for that."}
        </p>
      )}
      {s && (
        <dl className="rounded-lg bg-[var(--muted)] p-3.5 text-sm space-y-1.5">
          <div className="font-semibold text-[var(--foreground)] mb-1">{rv.status === "revoked" || rv.status === "withdrawn" ? "What was settled" : isFlex ? "What ending it now would mean" : "What revoking now would mean"}</div>
          <Row label="The buyer has paid" value={money(s.paid)} />
          <Row label="Refunded to the buyer" value={money(s.refund)} />
          <Row label="You keep" value={money(s.developerKeeps)} />
          <p className="text-xs text-[var(--muted-foreground)]">{isFlex
            ? "Exactly what leaving returns. The plot goes back on sale; if HomeTrue sells it for more than the buyer's price, they get their share of the difference from your payout."
            : "Exactly what withdrawing returns. The plot goes back on sale."}</p>
        </dl>
      )}

      {notice ? (
        <>
          <Alert tone="warning" title="Notice running" role="status">
            {fx
              ? <>Given {formatDay(notice.givenAt)} ({fxFinish ? "past its finish date" : `no payment for ${rv.afterMonthsUnpaid} months`}) · deadline {formatDay(notice.deadline)}. You can end the plan from {formatDay(notice.confirmableFrom)} {fxFinish ? "if it still isn't finished" : "if nothing has been paid by then"}.</>
              : <>Given {formatDay(notice.givenAt)} · deadline {formatDay(notice.deadline)}. You can confirm from {formatDay(notice.confirmableFrom)} if the buyer is still {rv.afterMonthsUnpaid} months behind.</>}
            <div className="mt-1">“{notice.reason}”</div>
          </Alert>
          {error && <ErrorText>{error}</ErrorText>}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button onClick={() => setConfirming(true)} disabled={!confirmable}>{fx ? "End the plan" : "Confirm revocation"}</Button>
            <Button variant="secondary" onClick={() => setCancelling(true)}>Withdraw the notice</Button>
          </div>
        </>
      ) : canGive ? (
        <>
          <Field id="rv-reason" label="Reason (the buyer reads this)">
            <Textarea id="rv-reason" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          {error && <ErrorText>{error}</ErrorText>}
          <Button onClick={give} disabled={busy}>{busy ? "Giving notice…" : `Give ${rv.noticeDays} days' notice`}</Button>
          <p className="text-xs text-[var(--muted-foreground)]">{fx
            ? `The buyer is emailed the reason, the deadline and what ending the plan would return. ${fxFinish ? "A smaller payment doesn't end this notice — only paying what's left does." : "Any payment you verify before the deadline ends the notice."} Nothing else changes now.`
            : "The buyer is emailed the reason, what's overdue, the deadline and what a revocation would return. Paying what's overdue before the deadline ends the notice. Nothing else changes now."}</p>
        </>
      ) : null}

      {rv.history.length > 0 && (
        <ul className="text-xs text-[var(--muted-foreground)] space-y-1 border-t border-[var(--border)] pt-3">
          {rv.history.map((n) => (
            <li key={n.id}>{formatDay(n.closedAt ?? n.givenAt)} · {words[n.status] ?? n.status}{n.closeNote ? ` — “${n.closeNote}”` : ""}</li>
          ))}
        </ul>
      )}

      {confirming && (
        <Dialog title={fx ? "End this plan?" : "Revoke this plan?"} onClose={() => setConfirming(false)}>
          <p className="text-sm text-[var(--muted-foreground)] mb-3">
            This ends the buyer's plan and puts the plot back on sale.{s ? ` The buyer is refunded ${money(s.refund)} — exactly what ${fx ? "leaving" : "withdrawing"} returns${fx ? ", and is told about any share if HomeTrue later sells it for more" : ""}.` : ""} It can't be undone.
          </p>
          <DialogActions onCancel={() => setConfirming(false)} variant="danger" confirmLabel={fx ? "End the plan" : "Revoke the plan"}
            onConfirm={async () => { try { done(await confirmRevocation(id)); setConfirming(false); } catch (err) { setError(planErrorMessage(err)); setConfirming(false); } }} />
        </Dialog>
      )}
      {cancelling && (
        <ReasonDialog title="Withdraw the notice?" label="Note (optional) — the buyer is emailed" confirm="Withdraw the notice" onClose={() => setCancelling(false)}
          action={(note) => cancelNotice(id, note)} onDone={(r) => { setCancelling(false); done(r as PlanRevocation); }} />
      )}
    </Card>
  );
}

// A flexible plan's revocation: its standing while it runs, or — once ended —
// notices given because nothing was paid or the plan ran past its date.
function isFlexibleRevocation(rv: PlanRevocation): boolean {
  return !!rv.flexible || [rv.notice, ...rv.history].some((n) => n?.trigger === "inactivity" || n?.trigger === "finish_by");
}

const FLEXIBLE_NOTICE_WORDS: Record<string, string> = {
  notice: "Notice running", cancelled: "Withdrawn by you", cleared: "Cleared",
  withdrawn: "Ended — the buyer left the plan", revoked: "Ended by you",
};

const NOTICE_WORDS: Record<string, string> = {
  notice: "Notice running", cancelled: "Withdrawn by you", cleared: "Cleared — the buyer is no longer behind",
  withdrawn: "Ended — the buyer withdrew", revoked: "Revoked",
};

function ReasonDialog({ title, label, confirm, onClose, action, onDone, required }: {
  title: string; label: string; confirm: string; onClose: () => void;
  action: (text: string) => Promise<unknown>; onDone: (result: unknown) => void; required?: boolean;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const go = async () => {
    if (required && !text.trim()) { setError("This is required."); return; }
    setBusy(true);
    setError("");
    try {
      onDone(await action(text));
    } catch (err) {
      setError(planErrorMessage(err));
      setBusy(false);
    }
  };
  return (
    <Dialog title={title} onClose={busy ? () => {} : onClose}>
      <Field id="reason-dialog" label={label}>
        <Textarea id="reason-dialog" rows={3} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      {error && <ErrorText className="mt-2">{error}</ErrorText>}
      <div className="mt-4"><DialogActions onCancel={onClose} onConfirm={go} confirmLabel={confirm} busy={busy} /></div>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[var(--muted-foreground)]">{label}</dt>
      <dd className="font-mono-data text-[var(--foreground)] text-right">{value}</dd>
    </div>
  );
}
