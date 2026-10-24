// /purchases/:id/restructure — the buyer asks the developer to spread what
// they still owe differently (phase 5c), from the Figma "Restructure"
// proposal: ask → wait (withdraw the request) → a proposal side by side with
// today's plan, its letter read before accepting → accepted, schedule v2.
// Every figure is the backend's; the total owed never changes.

import { useState } from "react";
import { useParams } from "react-router-dom";
import { useFetch } from "../../lib/useFetch";
import { formatMoney } from "../../lib/formatCurrency";
import { formatDay } from "../../lib/formatDate";
import { fetchPurchase } from "../../services/paymentsService";
import {
  acceptRestructure, askRestructure, cancelRestructure, declineRestructure, fetchRestructures, planErrorCode, planErrorMessage,
  type PlanRestructures, type Proposal, type Restructure,
} from "../../services/planService";
import { frequencyWord } from "../../services/paymentPlansService";
import type { Document } from "../../data/mockData";
import { DocumentActions } from "../../components/documents/DocumentCard";
import Page, { Loading } from "../../components/ui/Page";
import Card from "../../components/ui/Card";
import Alert from "../../components/ui/Alert";
import Badge from "../../components/ui/Badge";
import Button, { LinkButton } from "../../components/ui/Button";
import { ErrorText, Field, Input, Textarea } from "../../components/ui/Field";
import LoadError from "../../components/LoadError";

export default function RestructurePlan() {
  const { id } = useParams<{ id: string }>();
  const loaded = useFetch(async () => {
    const [purchase, r] = await Promise.all([fetchPurchase(id!), fetchRestructures(id!)]);
    return { purchase, r };
  }, [id]);
  const [override, setOverride] = useState<PlanRestructures | null>(null);
  const back = { to: `/purchases/${id}`, label: "Your purchase" };

  if (loaded.loading && !loaded.data) return <Page title="Restructure your plan" back={back} width="lg"><Loading /></Page>;
  if (loaded.error || !loaded.data) {
    if (planErrorCode(loaded.errorValue) === "NOT_IN_DEMO") return <Page title="Restructure your plan" back={back} width="lg"><Alert tone="info">{planErrorMessage(loaded.errorValue)}</Alert></Page>;
    return <LoadError error={loaded.errorValue} what="your plan" onRetry={loaded.refetch} />;
  }
  const { purchase } = loaded.data;
  const r = override ?? loaded.data.r;
  const open = r.open;
  const proposal = open?.status === "proposed" ? open.proposal : null;
  const changed = (next: PlanRestructures) => { setOverride(next); loaded.refetch(); };
  const reload = () => { setOverride(null); loaded.refetch(); };

  return (
    <Page width="lg" back={back} eyebrow={r.transactionReference}
      title={<span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">Restructure your plan{proposal && <span className="font-[family-name:var(--font-body)] inline-flex"><Badge label="Proposal to answer" variant="info" /></span>}</span>}
      description={proposal?.expiresOn ? `Accept by the end of ${formatDay(proposal.expiresOn)}.` : "Spread what you still owe differently. The total you owe stays the same."}>
      <div className="space-y-6">
        {!open && r.planStatus === "on_plan" && <AskForm id={id!} onDone={changed} />}
        {!open && r.planStatus !== "on_plan" && <Alert tone="info">This plan isn't running, so it can't be restructured.</Alert>}
        {open?.status === "requested" && <Waiting id={id!} request={open} onDone={changed} />}
        {proposal && open && <ProposalView id={id!} open={open} proposal={proposal} schedule={purchase?.schedule ?? null} currency={purchase?.currency ?? proposal.currency} onDone={changed} onStale={reload} />}
        <History items={r.history} />
        <LinkButton to={back.to} variant="secondary">Back to your purchase</LinkButton>
      </div>
    </Page>
  );
}

function AskForm({ id, onDone }: { id: string; onDone: (r: PlanRestructures) => void }) {
  const [reason, setReason] = useState("");
  const [preferred, setPreferred] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) { setError("Tell the developer what's changed for you."); return; }
    const n = preferred.trim() ? Number(preferred) : undefined;
    if (n !== undefined && (!Number.isInteger(n) || n < 1 || n > 60)) { setError("Preferred instalments: a whole number from 1 to 60, or leave it empty."); return; }
    setBusy(true);
    setError("");
    try {
      onDone(await askRestructure(id, reason, n));
    } catch (err) {
      setError(planErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card as="section" aria-labelledby="ask-heading"><form onSubmit={submit} className="space-y-4" noValidate>
      <div>
        <h2 id="ask-heading" className="font-semibold text-[var(--foreground)]">Need more time?</h2>
        <p className="text-sm text-[var(--muted-foreground)]">Ask the developer to spread what you still owe differently. The total stays the same; they'll reply with new terms or a reason.</p>
      </div>
      <Field id="ask-reason" label="What's changed for you?" hint="The developer reads this.">
        <Textarea id="ask-reason" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Field id="ask-preferred" label="Instalments you'd prefer (optional)" className="max-w-xs">
        <Input id="ask-preferred" inputMode="numeric" value={preferred} onChange={(e) => setPreferred(e.target.value)} className="font-mono-data" />
      </Field>
      {error && <ErrorText>{error}</ErrorText>}
      <Button type="submit" disabled={busy}>{busy ? "Sending…" : "Ask to restructure"}</Button>
    </form></Card>
  );
}

function Waiting({ id, request, onDone }: { id: string; request: Restructure; onDone: (r: PlanRestructures) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const cancel = async () => {
    setBusy(true);
    setError("");
    try {
      onDone(await cancelRestructure(id));
    } catch (err) {
      setError(planErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <Alert tone="info" title="Waiting for the developer" role="status">
        You asked on {formatDay(request.requestedAt)}{request.preferredInstalments ? ` for ${request.preferredInstalments} instalments` : ""}. You'll get an email when they reply. Keep paying while you wait — an instalment that's late still counts.
      </Alert>
      {error && <ErrorText>{error}</ErrorText>}
      <Button variant="link" onClick={cancel} disabled={busy}>{busy ? "Withdrawing…" : "Withdraw the request"}</Button>
    </div>
  );
}

function ProposalView({ id, open, proposal, schedule, currency, onDone, onStale }: {
  id: string; open: Restructure; proposal: Proposal; schedule: { instalments: { sequence: number; amount: number; dueDate: string }[]; planName: string; version?: number } | null;
  currency: string; onDone: (r: PlanRestructures) => void; onStale: () => void;
}) {
  const [read, setRead] = useState(false);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState("");
  const money = (n: number) => formatMoney(n, currency);
  const first = proposal.instalments[0];
  const last = proposal.instalments[proposal.instalments.length - 1];
  const left = schedule ? schedule.instalments.filter((i) => i.sequence > proposal.paidInstalments) : [];
  const letter: Document | null = proposal.letterId && proposal.letterNumber ? {
    id: proposal.letterId, type: "restructure_letter", title: `Restructure letter ${proposal.letterNumber}`, date: proposal.proposedAt ?? "", status: "issued",
    qrCode: "", size: null, number: proposal.letterNumber,
    pdfUrl: `/api/documents/restructure-letters/${proposal.letterId}/pdf`, jpegUrl: `/api/documents/restructure-letters/${proposal.letterId}/jpeg`,
  } : null;

  const answer = async (kind: "accept" | "decline") => {
    setBusy(kind);
    setError("");
    try {
      // Always the id of the proposal on screen.
      onDone(kind === "accept" ? await acceptRestructure(id, open.id) : await declineRestructure(id, open.id));
    } catch (err) {
      const code = planErrorCode(err);
      setError(planErrorMessage(err));
      if (code === "RESTRUCTURE_NOT_FOUND" || code === "RESTRUCTURE_LAPSED" || code === "RESTRUCTURE_OUT_OF_DATE") onStale();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 items-start">
        <Card as="section" aria-labelledby="now-heading" className="space-y-2">
          <div className="flex items-center justify-between gap-2"><h2 id="now-heading" className="font-semibold text-[var(--foreground)]">Now</h2><Badge label={`Schedule v${schedule?.version ?? 1}`} variant="neutral" /></div>
          <dl className="space-y-1.5 text-sm">
            <Row label="Paid so far" value={`${proposal.paidInstalments} instalment${proposal.paidInstalments === 1 ? "" : "s"}`} />
            {left.length > 0 && <Row label="Still to pay" value={`${left.length} instalment${left.length === 1 ? "" : "s"}`} />}
            {left[0] && <Row label="Each" value={money(left[0].amount)} mono />}
            {left.length > 0 && <Row label="Last due" value={formatDay(left[left.length - 1].dueDate)} />}
            <Row label="You owe" value={money(proposal.balance)} mono bold />
          </dl>
        </Card>
        <Card as="section" aria-labelledby="proposed-heading" className="space-y-2">
          <div className="flex items-center justify-between gap-2"><h2 id="proposed-heading" className="font-semibold text-[var(--foreground)]">Proposed</h2><Badge label={`Schedule v${(schedule?.version ?? 1) + 1}`} variant="info" /></div>
          <dl className="space-y-1.5 text-sm">
            <Row label="New instalments" value={`${proposal.instalmentCount} ${frequencyWord(proposal.frequency === "quarterly" ? "quarterly" : "monthly")}${first && last ? `, ${first.sequence}–${last.sequence}` : ""}`} />
            {first && <Row label="Each" value={money(first.amount)} mono />}
            {last && first && last.amount !== first.amount && <Row label="The last" value={money(last.amount)} mono />}
            <Row label="First due" value={formatDay(proposal.firstDueDate)} />
            <Row label="You owe" value={money(proposal.balance)} mono bold />
          </dl>
          <p className="text-xs text-[var(--muted-foreground)]">
            {proposal.carriedPenalty > 0 && first ? `${money(proposal.carriedPenalty)} of penalties already reached is payable with instalment ${first.sequence}. ` : ""}The total you owe is unchanged: {money(proposal.balance)}.
          </p>
        </Card>
      </div>

      <Card as="section" aria-labelledby="new-heading">
        <h2 id="new-heading" className="font-semibold text-[var(--foreground)] mb-2">The new instalments</h2>
        <ul className="divide-y divide-[var(--border)] text-sm">
          {proposal.instalments.map((i) => (
            <li key={i.sequence} className="flex items-center justify-between gap-3 py-2">
              <span className="text-[var(--foreground)]">Instalment {i.sequence} <span className="text-[var(--muted-foreground)]">· {formatDay(i.dueDate)}</span></span>
              <span className="font-mono-data text-right">{money(i.amount)}{i.carriedPenalty > 0 ? <span className="block text-xs text-[var(--muted-foreground)] font-sans">+ {money(i.carriedPenalty)} penalty carried from before the restructure</span> : null}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card as="section" aria-labelledby="letter-heading" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="letter-heading" className="font-semibold text-[var(--foreground)]">Restructure letter</h2>
            {proposal.letterNumber && <div className="text-xs font-mono-data text-[var(--muted-foreground)]">{proposal.letterNumber} · on the developer's letterhead</div>}
          </div>
          {letter && <DocumentActions doc={letter} />}
        </div>
        <p className="text-sm text-[var(--muted-foreground)]">Read the letter before you accept: it sets out the new dates and amounts, and that everything else in your offer stays the same.</p>
        <label className="flex items-start gap-2.5 cursor-pointer text-sm font-medium text-[var(--foreground)]">
          <input type="checkbox" checked={read} onChange={(e) => setRead(e.target.checked)} className="mt-0.5 w-4 h-4 shrink-0 accent-[var(--primary)]" />
          I've read the restructure letter and accept the new terms
        </label>
        {error && <ErrorText>{error}</ErrorText>}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button size="lg" onClick={() => answer("accept")} disabled={!read || busy !== null}>{busy === "accept" ? "Accepting…" : "Accept the new terms"}</Button>
          <Button size="lg" variant="secondary" onClick={() => answer("decline")} disabled={busy !== null}>{busy === "decline" ? "Declining…" : "Decline"}</Button>
        </div>
      </Card>
    </div>
  );
}

const STATUS_WORDS: Record<string, string> = {
  accepted: "Accepted", rejected: "Rejected", declined: "Declined by you", cancelled: "Withdrawn by you",
  withdrawn: "Withdrawn by the developer", lapsed: "Lapsed — not answered in time", requested: "Requested", proposed: "Proposed",
};

function History({ items }: { items: Restructure[] }) {
  const past = items.filter((i) => i.status !== "requested" && i.status !== "proposed");
  if (past.length === 0) return null;
  return (
    <Card as="section" aria-labelledby="history-heading">
      <h2 id="history-heading" className="font-semibold text-[var(--foreground)] mb-2">History</h2>
      <ul className="space-y-1.5 text-sm text-[var(--muted-foreground)]">
        {past.map((h) => (
          <li key={h.id}>
            {formatDay(h.closedAt ?? h.acceptedAt ?? h.requestedAt)} · {STATUS_WORDS[h.status] ?? h.status}
            {h.status === "accepted" ? " — your plan was restructured" : ""}
            {h.closeNote ? ` — “${h.closeNote}”` : ""}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Row({ label, value, mono, bold }: { label: string; value: string; mono?: boolean; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={bold ? "font-semibold text-[var(--foreground)]" : "text-[var(--muted-foreground)]"}>{label}</dt>
      <dd className={`text-right text-[var(--foreground)] ${mono ? "font-mono-data" : ""} ${bold ? "font-medium" : ""}`}>{value}</dd>
    </div>
  );
}
