// Fees & terms › Payment plans (backend changesets 099–103, 110), from the
// Figma "Instalment plans" and "Flexible plans" proposals. The developer
// declares each plan's TERMS and HomeTrue works out every figure: what buyers
// see is the response's `quotes`, per tier, for a plot that isn't a corner plot.
//
// Two kinds of plan live in one set: an instalment plan (deposit, how many
// instalments, how often, a premium) and a flexible plan (a minimum to start,
// then any amount at any time; what the developer keeps if the buyer leaves,
// their share of any gain, and when a quiet plan may be ended).
//
// Saving replaces the whole set as a new version and takes effect straight
// away for new buyers (no HomeTrue review), so every plan is sent back every
// time. Buyers already on a plan keep their terms. "Offer outright only" sends
// an empty set.

import { useState } from "react";
import { useFetch } from "../../lib/useFetch";
import { ApiError } from "../../lib/apiClient";
import { formatMoney } from "../../lib/formatCurrency";
import {
  fetchPaymentPlans, frequencyWord, isFlexiblePlan, FLEXIBLE_LIMITS, PLAN_LIMITS, savePaymentPlans,
  type DeclaredPlan, type ExitBasis, type PlanFrequency, type PlanInput,
} from "../../services/paymentPlansService";
import { fetchPriceTiers, type PortalPriceTier } from "../../services/portalInventoryService";
import type { PortalScope } from "../../services/portalEstatesService";
import Card from "../ui/Card";
import Alert from "../ui/Alert";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import EmptyState from "../ui/EmptyState";
import Dialog, { DialogActions } from "../ui/Dialog";
import { Field, Input, Select, describedBy } from "../ui/Field";
import { Loading } from "../ui/Page";
import LoadError from "../LoadError";

interface InstalmentDraft {
  kind: "installment";
  name: string;
  depositType: "pct" | "amount";
  deposit: string;
  instalmentCount: string;
  frequency: PlanFrequency;
  premiumPct: string;
}

interface FlexibleDraft {
  kind: "flexible";
  name: string;
  depositPct: string;
  minimumContribution: string;
  premiumPct: string;
  deductionPct: string;
  appliesTo: ExitBasis;
  developerGainSharePct: string;
  inactivityMonths: string;
  noticeDays: string;
  maxMonths: string;
}

type Draft = InstalmentDraft | FlexibleDraft;

const EMPTY: InstalmentDraft = { kind: "installment", name: "", depositType: "pct", deposit: "", instalmentCount: "12", frequency: "monthly", premiumPct: "" };
// The gain share has no default: the developer must choose it.
const EMPTY_FLEXIBLE: FlexibleDraft = {
  kind: "flexible", name: "", depositPct: "10", minimumContribution: "", premiumPct: "", deductionPct: "", appliesTo: "amount_paid",
  developerGainSharePct: "", inactivityMonths: "6", noticeDays: "30", maxMonths: "",
};

const text = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

function draftFrom(p: DeclaredPlan): Draft {
  if (isFlexiblePlan(p) && p.flexible) {
    const f = p.flexible;
    return {
      kind: "flexible", name: p.name, depositPct: text(p.depositPct), minimumContribution: text(f.minimumContribution), premiumPct: p.premiumPct ? String(p.premiumPct) : "",
      deductionPct: text(f.exitDeductionPct), appliesTo: f.exitAppliesTo, developerGainSharePct: text(f.developerGainSharePct),
      inactivityMonths: text(f.inactivityMonths), noticeDays: text(f.noticeDays), maxMonths: text(f.maxMonths),
    };
  }
  return {
    kind: "installment",
    name: p.name,
    depositType: p.depositAmount !== null ? "amount" : "pct",
    deposit: String(p.depositAmount ?? p.depositPct ?? ""),
    instalmentCount: text(p.instalmentCount),
    frequency: p.frequency ?? "monthly",
    premiumPct: p.premiumPct ? String(p.premiumPct) : "",
  };
}

type Errors = Record<string, string>;

// "1,500,000" and "10" alike; NaN when empty or not a number.
const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(/,/g, "")));
const within = (n: number, [lo, hi]: readonly [number, number]) => Number.isFinite(n) && n >= lo && n <= hi;
const whole = (n: number, range: readonly [number, number]) => Number.isInteger(n) && within(n, range);

// The limits the backend checks, checked here first so a mistake is shown
// beside its field. The backend remains the judge (VALIDATION_ERROR, or
// INVALID_REQUEST for limits it doesn't tie to a field).
function build(drafts: Draft[]): { plans: PlanInput[]; errors: Errors } {
  const errors: Errors = {};
  const names = new Set<string>();
  const plans = drafts.map((d, i): PlanInput => {
    const e = (f: string, m: string) => { errors[`${i}.${f}`] = m; };
    const name = d.name.trim();
    if (!name) e("name", "Give the plan a name.");
    else if (names.has(name.toLowerCase())) e("name", "Each plan needs a different name.");
    names.add(name.toLowerCase());
    const premium = d.premiumPct.trim() === "" ? undefined : num(d.premiumPct);
    if (premium !== undefined && !within(premium, PLAN_LIMITS.premiumPct)) e("premiumPct", "Between 0% and 100%, or leave it empty.");

    if (d.kind === "flexible") {
      const start = num(d.depositPct);
      if (!within(start, FLEXIBLE_LIMITS.minimumToStartPct)) e("depositPct", "At least 10% of the price, and less than 100%.");
      const minimum = d.minimumContribution.trim() === "" ? undefined : num(d.minimumContribution);
      if (minimum !== undefined && !(minimum > 0)) e("minimumContribution", "More than zero, or leave it empty for any amount.");
      const keep = num(d.deductionPct);
      if (!within(keep, FLEXIBLE_LIMITS.exitPct)) e("deductionPct", "Between 0% and 100%.");
      const gain = num(d.developerGainSharePct);
      if (!within(gain, FLEXIBLE_LIMITS.gainSharePct)) e("developerGainSharePct", "Give your share of any gain, from 0 to 100%. There's no default.");
      const quiet = num(d.inactivityMonths);
      if (!whole(quiet, FLEXIBLE_LIMITS.inactivityMonths)) e("inactivityMonths", "A whole number of months, 6 to 60.");
      const notice = num(d.noticeDays);
      if (!whole(notice, FLEXIBLE_LIMITS.noticeDays)) e("noticeDays", "A whole number of days, 30 to 365.");
      const max = d.maxMonths.trim() === "" ? undefined : num(d.maxMonths);
      if (max !== undefined && !whole(max, FLEXIBLE_LIMITS.maxMonths)) e("maxMonths", "A whole number of months, 12 to 240, or leave it empty.");
      return {
        name, kind: "flexible", depositPct: start, ...(premium !== undefined ? { premiumPct: premium } : {}),
        flexible: {
          ...(minimum !== undefined ? { minimumContribution: minimum } : {}),
          exit: { deductionPct: keep, appliesTo: d.appliesTo },
          developerGainSharePct: gain, inactivityMonths: quiet, noticeDays: notice,
          ...(max !== undefined ? { maxMonths: max } : {}),
        },
      };
    }

    const deposit = num(d.deposit);
    if (!Number.isFinite(deposit)) e("deposit", "Enter the deposit.");
    else if (d.depositType === "pct" && !within(deposit, PLAN_LIMITS.depositPct)) e("deposit", "Between 1% and 99.99%.");
    else if (d.depositType === "amount" && deposit <= 0) e("deposit", "More than zero.");
    const count = num(d.instalmentCount);
    if (!whole(count, PLAN_LIMITS.instalmentCount)) e("instalmentCount", "A whole number from 1 to 60.");
    return {
      name, instalmentCount: count, frequency: d.frequency,
      ...(d.depositType === "pct" ? { depositPct: deposit } : { depositAmount: deposit }),
      ...(premium !== undefined ? { premiumPct: premium } : {}),
    };
  });
  return { plans, errors };
}

// A backend field path (plans[0].flexible.exit.deductionPct) as this form's
// error key ("0.deductionPct"); an instalment deposit is one field here.
export function errorKey(path: string, drafts: Pick<Draft, "kind">[]): string | null {
  const m = /plans\[?\.?(\d+)\]?\.(?:flexible\.)?(?:exit\.)?(\w+)$/.exec(path);
  if (!m) return null;
  const [, i, field] = m;
  if (drafts[Number(i)]?.kind !== "flexible" && (field === "depositPct" || field === "depositAmount")) return `${i}.deposit`;
  return `${i}.${field === "appliesTo" ? "deductionPct" : field}`;
}

export default function PaymentPlansPanel({ estateId, scope, canManage }: { estateId: string; scope: PortalScope | null; canManage: boolean }) {
  const loaded = useFetch(async () => {
    const [plans, tiers] = await Promise.all([
      fetchPaymentPlans(estateId),
      scope ? fetchPriceTiers(estateId, scope).catch(() => [] as PortalPriceTier[]) : Promise.resolve([] as PortalPriceTier[]),
    ]);
    return { plans, tiers };
  }, [estateId, scope?.tenantId, scope?.branchId]);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);

  if (loaded.loading && !loaded.data) return <Loading label="Loading payment plans…" />;
  if (loaded.error || !loaded.data) return <LoadError error={loaded.errorValue} what="the payment plans" onRetry={loaded.refetch} />;
  const { plans, tiers } = loaded.data;

  const done = () => {
    setEditing(false);
    setSaved(true);
    loaded.refetch();
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Payment plans</h2>
          {plans.plans.length > 0 ? <Badge label="Live for new buyers" variant="success" /> : <Badge label="Outright only" variant="neutral" />}
        </div>
        <p className="text-sm text-[var(--muted-foreground)] mt-1">
          Declare the terms; HomeTrue works out every figure. Saving takes effect straight away for new buyers — anyone already on a plan keeps their terms.
        </p>
      </div>
      {saved && !editing && <Alert tone="success" role="status">Saved. New buyers see these plans now.</Alert>}
      {!canManage && <Alert tone="neutral">You can see these plans but not change them. Ask someone who manages estates.</Alert>}

      {editing ? (
        <PlansForm estateId={estateId} current={plans.plans} onSaved={done} onCancel={() => setEditing(false)} />
      ) : (
        <>
          {plans.plans.length === 0 ? (
            <EmptyState title="Outright only" description="Buyers pay in full. Add a plan to let them pay a deposit and then instalments, or any amount at any time." />
          ) : (
            <ul className="space-y-4">
              {plans.plans.map((p) => (isFlexiblePlan(p) ? <FlexibleQuotes key={p.id} plan={p} /> : <PlanQuotes key={p.id} plan={p} tiers={tiers} />))}
            </ul>
          )}
          {canManage && (
            <Button variant={plans.plans.length ? "secondary" : "primary"} onClick={() => { setSaved(false); setEditing(true); }}>
              {plans.plans.length ? "Change the plans" : "Add a plan"}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

// One saved instalment plan: its terms, then what buyers see at each tier.
function PlanQuotes({ plan, tiers }: { plan: DeclaredPlan; tiers: PortalPriceTier[] }) {
  const frequency = plan.frequency ?? "monthly";
  const terms = [
    plan.depositAmount !== null ? `${formatMoney(plan.depositAmount, "NGN")} deposit` : `${plan.depositPct}% deposit`,
    `${plan.instalmentCount} ${frequencyWord(frequency)} instalment${plan.instalmentCount === 1 ? "" : "s"}`,
    plan.premiumPct ? `${plan.premiumPct}% premium` : "no premium",
  ].join(" · ");
  // A fixed deposit can leave nothing to pay at a cheap tier; the backend
  // leaves that tier out. Say so rather than hide it.
  const missing = plan.depositAmount !== null ? tiers.filter((t) => !plan.quotes.some((q) => q.tierId === t.id)) : [];
  return (
    <Card as="li" className="space-y-3">
      <div>
        <div className="font-semibold text-[var(--foreground)]">{plan.name}</div>
        <div className="text-sm text-[var(--muted-foreground)]">{terms}</div>
      </div>
      <div>
        <div className="text-xs font-medium text-[var(--muted-foreground)] mb-2">What buyers see — HomeTrue's figures for a plot that isn't a corner plot</div>
        <div className="grid gap-3 sm:grid-cols-2">
          {plan.quotes.map((q) => {
            const m = (n: number) => formatMoney(n, q.currency);
            return (
              <dl key={q.tierId} className="rounded-lg border border-[var(--border)] p-3.5 space-y-1.5 text-sm">
                <div className="font-medium text-[var(--foreground)] mb-1">{q.tierLabel}</div>
                <QRow label="Price" value={m(q.price)} />
                {q.premium > 0 && <QRow label="Premium" value={m(q.premium)} />}
                <QRow label="Deposit" value={m(q.deposit)} />
                {q.instalment !== null && <QRow label={`${q.instalmentCount} × ${frequencyWord(frequency)}`} value={m(q.instalment)} />}
                {q.lastInstalment !== null && q.lastInstalment !== q.instalment && <QRow label="Last instalment" value={m(q.lastInstalment)} />}
                <div className="border-t border-[var(--border)] pt-1.5"><QRow label="Plan total" value={m(q.planTotal)} bold /></div>
              </dl>
            );
          })}
        </div>
      </div>
      {missing.length > 0 && (
        <Alert tone="warning">
          Not quoted for {missing.map((t) => t.label ?? (t.sizeSqm ? `${t.sizeSqm} sqm` : "one tier")).join(", ")}: the fixed deposit would leave nothing to pay in instalments there (or the tier isn't open for sale), so buyers of that tier won't see this plan. Use a percentage, or a smaller deposit.
        </Alert>
      )}
    </Card>
  );
}

// One saved flexible plan: its terms in a sentence each, then what buyers see
// at each tier — the figures, what leaving returns, and the gain example.
function FlexibleQuotes({ plan }: { plan: DeclaredPlan }) {
  const f = plan.flexible;
  if (!f) return null;
  const terms = [
    `${plan.depositPct}% of the price to start, then ${f.minimumContribution ? `at least ${formatMoney(f.minimumContribution, "NGN")}` : "any amount"} at a time`,
    plan.premiumPct ? `${plan.premiumPct}% premium` : "no premium",
    `if the buyer leaves, you keep ${f.exitDeductionPct}% ${f.exitAppliesTo === "amount_paid" ? "of each payment" : "of the agreed price"}`,
    `${f.developerGainSharePct}% of any gain`,
    `notice after ${f.inactivityMonths} months without a payment (${f.noticeDays} days)`,
    f.maxMonths ? `finish within ${f.maxMonths} months` : "no finish date",
  ].join(" · ");
  return (
    <Card as="li" className="space-y-3">
      <div>
        <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-[var(--foreground)]">{plan.name}</span><Badge label="Flexible" variant="info" /></div>
        <div className="text-sm text-[var(--muted-foreground)]">{terms}</div>
      </div>
      <div>
        <div className="text-xs font-medium text-[var(--muted-foreground)] mb-2">What buyers see — HomeTrue's figures for a plot that isn't a corner plot</div>
        <div className="grid gap-3 sm:grid-cols-2">
          {plan.quotes.map((q) => {
            const m = (n: number) => formatMoney(n, q.currency);
            const x = q.flexible;
            return (
              <dl key={q.tierId} className="rounded-lg border border-[var(--border)] p-3.5 space-y-1.5 text-sm">
                <div className="font-medium text-[var(--foreground)] mb-1">{q.tierLabel}</div>
                <QRow label="Price" value={m(q.price)} />
                {q.premium > 0 && <QRow label="Premium" value={m(q.premium)} />}
                <QRow label="To start" value={m(q.deposit)} />
                {x?.minimumContribution ? <QRow label="Then at least" value={m(x.minimumContribution)} /> : null}
                <div className="border-t border-[var(--border)] pt-1.5"><QRow label="Plan total" value={m(q.planTotal)} bold /></div>
                {x && (
                  <>
                    <div className="rounded-md bg-[var(--muted)] px-2.5 py-2 mt-2 space-y-1">
                      <div className="text-xs text-[var(--muted-foreground)]">If the buyer leaves after paying</div>
                      {x.ifYouStopAfterPaying.map((r) => <QRow key={r.paid} label={m(r.paid)} value={`${m(r.youGetBack)} back`} mono />)}
                    </div>
                    <p className="rounded-md bg-[var(--info-surface)] text-[var(--info-text)] px-2.5 py-2 text-xs">
                      {x.ifSoldForMore.buyerSharePct === 0
                        ? "If HomeTrue sells it for more, you keep all of the difference."
                        : <>If HomeTrue sells it for more — e.g. {m(x.ifSoldForMore.example.soldFor)} — the buyer gets {m(x.ifSoldForMore.example.youGet)} of the {m(x.ifSoldForMore.example.difference)} difference; you keep the rest.</>}
                    </p>
                  </>
                )}
              </dl>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function QRow({ label, value, bold, mono }: { label: string; value: string; bold?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={bold ? "font-semibold text-[var(--foreground)]" : `text-[var(--muted-foreground)] ${mono ? "font-mono-data" : ""}`}>{label}</dt>
      <dd className={`font-mono-data text-[var(--foreground)] ${bold ? "font-medium" : ""}`}>{value}</dd>
    </div>
  );
}

// A labelled number box: the hint under it, the error replacing nothing.
function NumField({ id, label, hint, error, value, onChange, decimal = true }: {
  id: string; label: string; hint: string; error?: string; value: string; onChange: (v: string) => void; decimal?: boolean;
}) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <Input id={id} inputMode={decimal ? "decimal" : "numeric"} value={value} onChange={(e) => onChange(e.target.value)} className="font-mono-data"
        aria-invalid={!!error} aria-describedby={describedBy(id, { hint: true, error })} />
    </Field>
  );
}

function PlansForm({ estateId, current, onSaved, onCancel }: { estateId: string; current: DeclaredPlan[]; onSaved: () => void; onCancel: () => void }) {
  const [drafts, setDrafts] = useState<Draft[]>(current.length ? current.map(draftFrom) : [{ ...EMPTY }]);
  const [errors, setErrors] = useState<Errors>({});
  const [refusal, setRefusal] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmOutright, setConfirmOutright] = useState(false);
  const set = (i: number, patch: Partial<InstalmentDraft> | Partial<FlexibleDraft>) =>
    setDrafts((ds) => ds.map((d, j) => (j === i ? ({ ...d, ...patch } as Draft) : d)));

  const save = async (plans: PlanInput[]) => {
    setSaving(true);
    setRefusal("");
    try {
      await savePaymentPlans(estateId, plans);
      onSaved();
    } catch (err) {
      // Field errors the backend names go beside their fields; its message
      // (absent on VALIDATION_ERROR) above the save row.
      const body = err instanceof ApiError ? err.body : undefined;
      const fe = body?.fieldErrors;
      if (fe) {
        const mapped: Errors = {};
        for (const [k, v] of Object.entries(fe)) { const key = errorKey(k, drafts); if (key) mapped[key] = v; }
        setErrors(mapped);
      }
      setRefusal(body?.message || (fe ? "Nothing was changed — fix the fields marked above and save again." : "Nothing was changed. Try again."));
    } finally {
      setSaving(false);
      setConfirmOutright(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const { plans, errors: found } = build(drafts);
    setErrors(found);
    setRefusal("");
    if (Object.keys(found).length) return;
    void save(plans);
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {drafts.map((d, i) => {
        const id = (f: string) => `plan-${i}-${f}`;
        const err = (f: string) => errors[`${i}.${f}`];
        const title = d.name.trim() || `Plan ${i + 1}`;
        return (
          <Card key={i} as="section" aria-label={title} className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="flex flex-wrap items-center gap-2 font-semibold text-[var(--foreground)]">{title}{d.kind === "flexible" && <Badge label="Flexible" variant="info" />}</h3>
              <Button variant="link" onClick={() => setDrafts((ds) => ds.filter((_, j) => j !== i))} aria-label={`Remove ${d.name.trim() || `plan ${i + 1}`}`}>Remove</Button>
            </div>
            <Field id={id("name")} label="Plan name" hint="Buyers see this name. Each plan's name must be different." error={err("name")}>
              <Input id={id("name")} value={d.name} maxLength={80} onChange={(e) => set(i, { name: e.target.value })} placeholder={d.kind === "flexible" ? "Pay as you can" : "12-month plan"}
                aria-invalid={!!err("name")} aria-describedby={describedBy(id("name"), { hint: true, error: err("name") })} />
            </Field>
            {d.kind === "flexible" ? (
              <FlexibleFields d={d} id={id} err={err} set={(patch) => set(i, patch)} />
            ) : (
              <>
                <div className="space-y-2">
                  <div role="radiogroup" aria-label="Deposit" className="flex flex-wrap items-center gap-3">
                    <span className="text-sm font-medium text-[var(--foreground)]">Deposit</span>
                    <span className="inline-flex rounded-lg bg-[var(--muted)] p-1 gap-1">
                      {([["pct", "Percentage of the plan total"], ["amount", "Fixed amount"]] as const).map(([v, label]) => (
                        <button key={v} type="button" role="radio" aria-checked={d.depositType === v} onClick={() => set(i, { depositType: v, deposit: "" })}
                          className={`px-3 py-1.5 rounded-md text-sm ${d.depositType === v ? "bg-[var(--card)] border border-[var(--border)] font-semibold text-[var(--foreground)]" : "text-[var(--muted-foreground)]"}`}>
                          {label}
                        </button>
                      ))}
                    </span>
                  </div>
                  <div className="max-w-xs">
                    <NumField id={id("deposit")} label={d.depositType === "pct" ? "Deposit (%)" : "Deposit (₦)"} value={d.deposit} onChange={(v) => set(i, { deposit: v })}
                      hint={d.depositType === "pct" ? "1–99.99%, of the price plus the premium." : "In the tier's currency, the same for every tier."} error={err("deposit")} />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <NumField id={id("count")} label="Instalments" hint="1–60, after the deposit." error={err("instalmentCount")} decimal={false}
                    value={d.instalmentCount} onChange={(v) => set(i, { instalmentCount: v })} />
                  <Field id={id("freq")} label="How often">
                    <Select id={id("freq")} value={d.frequency} onChange={(e) => set(i, { frequency: e.target.value as PlanFrequency })}>
                      <option value="monthly">Monthly</option>
                      <option value="quarterly">Quarterly</option>
                    </Select>
                  </Field>
                  <NumField id={id("premium")} label="Premium for paying over time (%)" hint="0–100% of the price. Leave empty for none." error={err("premiumPct")}
                    value={d.premiumPct} onChange={(v) => set(i, { premiumPct: v })} />
                </div>
              </>
            )}
          </Card>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" disabled={drafts.length >= PLAN_LIMITS.maxPlans} onClick={() => setDrafts((ds) => [...ds, { ...EMPTY }])}>+ Add an instalment plan</Button>
        <Button variant="secondary" disabled={drafts.length >= PLAN_LIMITS.maxPlans} onClick={() => setDrafts((ds) => [...ds, { ...EMPTY_FLEXIBLE }])}>+ Add a flexible plan</Button>
        <span className="text-sm text-[var(--muted-foreground)]">Up to {PLAN_LIMITS.maxPlans} plans.</span>
      </div>
      {refusal && <Alert tone="error" role="alert" title="The plans weren't saved.">{refusal}</Alert>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
        <Button type="submit" size="lg" disabled={saving || drafts.length === 0}>{saving ? "Saving…" : "Save plans"}</Button>
        <Button variant="link" onClick={() => setConfirmOutright(true)} disabled={saving}>Offer outright only</Button>
        <Button variant="link" onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">Saving replaces every plan at once as a new version. There's no HomeTrue review. 'Offer outright only' removes every plan.</p>

      {confirmOutright && (
        <Dialog title="Offer outright only?" onClose={() => setConfirmOutright(false)}>
          <p className="text-sm text-[var(--muted-foreground)] mb-3">Every plan is removed, so new buyers pay in full. Buyers already on a plan keep their terms.</p>
          <DialogActions onCancel={() => setConfirmOutright(false)} onConfirm={() => save([])} confirmLabel="Remove every plan" busy={saving} />
        </Dialog>
      )}
    </form>
  );
}

// A flexible plan's terms, in the Figma's three groups.
function FlexibleFields({ d, id, err, set }: { d: FlexibleDraft; id: (f: string) => string; err: (f: string) => string | undefined; set: (p: Partial<FlexibleDraft>) => void }) {
  const group = (title: string, note?: string) => (
    <div className="pt-1">
      <h4 className="text-sm font-semibold text-[var(--foreground)]">{title}</h4>
      {note && <p className="text-xs text-[var(--muted-foreground)]">{note}</p>}
    </div>
  );
  return (
    <>
      <p className="text-sm text-[var(--muted-foreground)]">A minimum to start, then any amount at any time until the plan total is paid. No schedule, no due dates, no penalties.</p>
      {group("Paying")}
      <div className="grid gap-4 sm:grid-cols-3">
        <NumField id={id("start")} label="Minimum to start (%)" hint="At least 10% of the price. The premium isn't counted." error={err("depositPct")} value={d.depositPct} onChange={(v) => set({ depositPct: v })} />
        <NumField id={id("minimum")} label="Later payments at least (₦)" hint="Optional. Leave empty for any amount." error={err("minimumContribution")} value={d.minimumContribution} onChange={(v) => set({ minimumContribution: v })} />
        <NumField id={id("premium")} label="Premium for paying over time (%)" hint="0–100% of the price. Leave empty for none." error={err("premiumPct")} value={d.premiumPct} onChange={(v) => set({ premiumPct: v })} />
      </div>
      {group("If the buyer leaves", "They're refunded from escrow, less what you keep. Ending a quiet plan returns the same.")}
      <div className="grid gap-4 sm:grid-cols-3">
        <NumField id={id("keep")} label="You keep (%)" hint="0–100%." error={err("deductionPct")} value={d.deductionPct} onChange={(v) => set({ deductionPct: v })} />
        <Field id={id("basis")} label="Of" hint={d.appliesTo === "amount_paid" ? "That share of each payment they made." : "A fixed sum — that share of the agreed price — kept from their first payments."}>
          <Select id={id("basis")} value={d.appliesTo} onChange={(e) => set({ appliesTo: e.target.value as ExitBasis })} aria-describedby={`${id("basis")}-hint`}>
            <option value="amount_paid">Each payment they made</option>
            <option value="total_price">The agreed price</option>
          </Select>
        </Field>
        <NumField id={id("gain")} label="Your share of any gain (%)" hint="Required — there's no default." error={err("developerGainSharePct")} value={d.developerGainSharePct} onChange={(v) => set({ developerGainSharePct: v })} />
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">When HomeTrue next sells a plot a buyer left for more than their price, you keep this share of the difference and the buyer gets the rest, paid after your payout.</p>
      {group("Quiet plans", "You may give notice when nothing has been paid for a while, or the plan runs past its finish date.")}
      <div className="grid gap-4 sm:grid-cols-3">
        <NumField id={id("quiet")} label="Notice after no payment for (months)" hint="6–60." error={err("inactivityMonths")} decimal={false} value={d.inactivityMonths} onChange={(v) => set({ inactivityMonths: v })} />
        <NumField id={id("notice")} label="Notice period (days)" hint="30–365." error={err("noticeDays")} decimal={false} value={d.noticeDays} onChange={(v) => set({ noticeDays: v })} />
        <NumField id={id("max")} label="Finish within (months)" hint="Optional, 12–240." error={err("maxMonths")} decimal={false} value={d.maxMonths} onChange={(v) => set({ maxMonths: v })} />
      </div>
    </>
  );
}
