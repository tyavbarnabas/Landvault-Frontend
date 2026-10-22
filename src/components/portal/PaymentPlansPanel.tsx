// Fees & terms › Payment plans (backend changesets 099–103), from the Figma
// "Instalment plans" proposal. The developer declares each plan's TERMS —
// name, deposit (a percentage of the plan total, or a fixed amount), how many
// instalments and how often, and any premium for paying over time — and
// HomeTrue works out every figure: what buyers see is the response's
// `quotes`, per tier, for a plot that isn't a corner plot.
//
// Saving replaces the whole set as a new version and takes effect straight
// away for new buyers (no HomeTrue review). Buyers already on a plan keep
// their schedule. "Offer outright only" sends an empty set.

import { useState } from "react";
import { useFetch } from "../../lib/useFetch";
import { ApiError } from "../../lib/apiClient";
import { formatMoney } from "../../lib/formatCurrency";
import {
  fetchPaymentPlans, frequencyWord, PLAN_LIMITS, savePaymentPlans,
  type DeclaredPlan, type PlanFrequency, type PlanInput,
} from "../../services/paymentPlansService";
import { fetchPriceTiers, type PortalPriceTier } from "../../services/portalInventoryService";
import type { PortalScope } from "../../services/portalEstatesService";
import Card from "../ui/Card";
import Alert from "../ui/Alert";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import EmptyState from "../ui/EmptyState";
import Dialog, { DialogActions } from "../ui/Dialog";
import { ErrorText, Field, Input, Select, describedBy } from "../ui/Field";
import { Loading } from "../ui/Page";
import LoadError from "../LoadError";

interface Draft {
  name: string;
  depositType: "pct" | "amount";
  deposit: string;
  instalmentCount: string;
  frequency: PlanFrequency;
  premiumPct: string;
}

const EMPTY: Draft = { name: "", depositType: "pct", deposit: "", instalmentCount: "12", frequency: "monthly", premiumPct: "" };

function draftFrom(p: DeclaredPlan): Draft {
  return {
    name: p.name,
    depositType: p.depositAmount !== null ? "amount" : "pct",
    deposit: String(p.depositAmount ?? p.depositPct ?? ""),
    instalmentCount: String(p.instalmentCount),
    frequency: p.frequency,
    premiumPct: p.premiumPct ? String(p.premiumPct) : "",
  };
}

type Errors = Record<string, string>;

// The limits the backend checks, checked here first so a mistake is shown
// beside its field. The backend remains the judge (VALIDATION_ERROR).
function build(drafts: Draft[]): { plans: PlanInput[]; errors: Errors } {
  const errors: Errors = {};
  const names = new Set<string>();
  const plans = drafts.map((d, i) => {
    const name = d.name.trim();
    if (!name) errors[`${i}.name`] = "Give the plan a name.";
    else if (names.has(name.toLowerCase())) errors[`${i}.name`] = "Each plan needs a different name.";
    names.add(name.toLowerCase());
    const deposit = Number(d.deposit);
    if (d.deposit.trim() === "" || !Number.isFinite(deposit)) errors[`${i}.deposit`] = "Enter the deposit.";
    else if (d.depositType === "pct" && (deposit < PLAN_LIMITS.depositPct[0] || deposit > PLAN_LIMITS.depositPct[1])) errors[`${i}.deposit`] = "Between 1% and 99.99%.";
    else if (d.depositType === "amount" && deposit <= 0) errors[`${i}.deposit`] = "More than zero.";
    const count = Number(d.instalmentCount);
    if (!Number.isInteger(count) || count < PLAN_LIMITS.instalmentCount[0] || count > PLAN_LIMITS.instalmentCount[1]) errors[`${i}.instalmentCount`] = "A whole number from 1 to 60.";
    const premium = d.premiumPct.trim() === "" ? undefined : Number(d.premiumPct);
    if (premium !== undefined && (!Number.isFinite(premium) || premium < 0 || premium > 100)) errors[`${i}.premiumPct`] = "Between 0% and 100%, or leave it empty.";
    return {
      name, instalmentCount: count, frequency: d.frequency,
      ...(d.depositType === "pct" ? { depositPct: deposit } : { depositAmount: deposit }),
      ...(premium !== undefined ? { premiumPct: premium } : {}),
    };
  });
  return { plans, errors };
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
          Declare the terms; HomeTrue works out every figure. Saving takes effect straight away for new buyers — anyone already on a plan keeps their schedule.
        </p>
      </div>
      {saved && !editing && <Alert tone="success" role="status">Saved. New buyers see these plans now.</Alert>}
      {!canManage && <Alert tone="neutral">You can see these plans but not change them. Ask someone who manages estates.</Alert>}

      {editing ? (
        <PlansForm estateId={estateId} current={plans.plans} onSaved={done} onCancel={() => setEditing(false)} />
      ) : (
        <>
          {plans.plans.length === 0 ? (
            <EmptyState title="Outright only" description="Buyers pay in full. Add a plan to let them pay a deposit and then instalments." />
          ) : (
            <ul className="space-y-4">
              {plans.plans.map((p) => <PlanQuotes key={p.id} plan={p} tiers={tiers} />)}
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

// One saved plan: its terms, then what buyers see at each tier.
function PlanQuotes({ plan, tiers }: { plan: DeclaredPlan; tiers: PortalPriceTier[] }) {
  const terms = [
    plan.depositAmount !== null ? `${formatMoney(plan.depositAmount, "NGN")} deposit` : `${plan.depositPct}% deposit`,
    `${plan.instalmentCount} ${frequencyWord(plan.frequency)} instalment${plan.instalmentCount === 1 ? "" : "s"}`,
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
                <QRow label={`${q.instalmentCount} × ${frequencyWord(plan.frequency)}`} value={m(q.instalment)} />
                {q.lastInstalment !== q.instalment && <QRow label="Last instalment" value={m(q.lastInstalment)} />}
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

function QRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={bold ? "font-semibold text-[var(--foreground)]" : "text-[var(--muted-foreground)]"}>{label}</dt>
      <dd className={`font-mono-data text-[var(--foreground)] ${bold ? "font-medium" : ""}`}>{value}</dd>
    </div>
  );
}

function PlansForm({ estateId, current, onSaved, onCancel }: { estateId: string; current: DeclaredPlan[]; onSaved: () => void; onCancel: () => void }) {
  const [drafts, setDrafts] = useState<Draft[]>(current.length ? current.map(draftFrom) : [{ ...EMPTY }]);
  const [errors, setErrors] = useState<Errors>({});
  const [serverError, setServerError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmOutright, setConfirmOutright] = useState(false);
  const set = (i: number, patch: Partial<Draft>) => setDrafts((ds) => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));

  const save = async (plans: PlanInput[]) => {
    setSaving(true);
    setServerError("");
    try {
      await savePaymentPlans(estateId, plans);
      onSaved();
    } catch (err) {
      // Field errors the backend names, beside their fields where we can place them.
      const fe = err instanceof ApiError ? err.body?.fieldErrors : undefined;
      if (fe) {
        const mapped: Errors = {};
        for (const [k, v] of Object.entries(fe)) {
          const m = /plans\[?\.?(\d+)\]?\.(\w+)/.exec(k);
          if (m) mapped[`${m[1]}.${m[2] === "depositPct" || m[2] === "depositAmount" ? "deposit" : m[2]}`] = v;
        }
        setErrors(mapped);
      }
      setServerError(err instanceof Error && err.message ? err.message : "The plans weren't saved. Try again.");
    } finally {
      setSaving(false);
      setConfirmOutright(false);
    }
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const { plans, errors: found } = build(drafts);
    setErrors(found);
    if (Object.keys(found).length) return;
    void save(plans);
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {drafts.map((d, i) => {
        const id = (f: string) => `plan-${i}-${f}`;
        const err = (f: string) => errors[`${i}.${f}`];
        return (
          <Card key={i} as="section" aria-label={d.name.trim() || `Plan ${i + 1}`} className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold text-[var(--foreground)]">{d.name.trim() || `Plan ${i + 1}`}</h3>
              <Button variant="link" onClick={() => setDrafts((ds) => ds.filter((_, j) => j !== i))} aria-label={`Remove ${d.name.trim() || `plan ${i + 1}`}`}>Remove</Button>
            </div>
            <Field id={id("name")} label="Plan name" hint="Buyers see this name. Each plan's name must be different." error={err("name")}>
              <Input id={id("name")} value={d.name} maxLength={80} onChange={(e) => set(i, { name: e.target.value })} placeholder="12-month plan"
                aria-invalid={!!err("name")} aria-describedby={describedBy(id("name"), { hint: true, error: err("name") })} />
            </Field>
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
              <Field id={id("deposit")} label={d.depositType === "pct" ? "Deposit (%)" : "Deposit (₦)"} className="max-w-xs"
                hint={d.depositType === "pct" ? "1–99.99%, of the price plus the premium." : "In the tier's currency, the same for every tier."} error={err("deposit")}>
                <Input id={id("deposit")} inputMode="decimal" value={d.deposit} onChange={(e) => set(i, { deposit: e.target.value })} className="font-mono-data"
                  aria-invalid={!!err("deposit")} aria-describedby={describedBy(id("deposit"), { hint: true, error: err("deposit") })} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id={id("count")} label="Instalments" hint="1–60, after the deposit." error={err("instalmentCount")}>
                <Input id={id("count")} inputMode="numeric" value={d.instalmentCount} onChange={(e) => set(i, { instalmentCount: e.target.value })} className="font-mono-data"
                  aria-invalid={!!err("instalmentCount")} aria-describedby={describedBy(id("count"), { hint: true, error: err("instalmentCount") })} />
              </Field>
              <Field id={id("freq")} label="How often">
                <Select id={id("freq")} value={d.frequency} onChange={(e) => set(i, { frequency: e.target.value as PlanFrequency })}>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                </Select>
              </Field>
              <Field id={id("premium")} label="Premium for paying over time (%)" hint="0–100% of the price. Leave empty for none." error={err("premiumPct")}>
                <Input id={id("premium")} inputMode="decimal" value={d.premiumPct} onChange={(e) => set(i, { premiumPct: e.target.value })} className="font-mono-data"
                  aria-invalid={!!err("premiumPct")} aria-describedby={describedBy(id("premium"), { hint: true, error: err("premiumPct") })} />
              </Field>
            </div>
          </Card>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" disabled={drafts.length >= PLAN_LIMITS.maxPlans} onClick={() => setDrafts((ds) => [...ds, { ...EMPTY }])}>+ Add a plan</Button>
        <span className="text-sm text-[var(--muted-foreground)]">Up to {PLAN_LIMITS.maxPlans} plans.</span>
      </div>
      {serverError && <ErrorText>{serverError}</ErrorText>}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
        <Button type="submit" size="lg" disabled={saving || drafts.length === 0}>{saving ? "Saving…" : "Save plans"}</Button>
        <Button variant="link" onClick={() => setConfirmOutright(true)} disabled={saving}>Offer outright only</Button>
        <Button variant="link" onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">Saving replaces every plan at once as a new version. There's no HomeTrue review.</p>

      {confirmOutright && (
        <Dialog title="Offer outright only?" onClose={() => setConfirmOutright(false)}>
          <p className="text-sm text-[var(--muted-foreground)] mb-3">Every plan is removed, so new buyers pay in full. Buyers already on a plan keep their schedule.</p>
          <DialogActions onCancel={() => setConfirmOutright(false)} onConfirm={() => save([])} confirmLabel="Remove every plan" busy={saving} />
        </Dialog>
      )}
    </form>
  );
}
