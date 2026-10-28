// /purchases/:id/restructure — the buyer asks the developer to spread what
// they still owe differently (phase 5c), from the Figma "Restructure"
// proposal: ask → wait (withdraw the request) → a proposal side by side with
// today's plan, its letter read before accepting → accepted, schedule v2.
// Every figure is the backend's; the total owed never changes. Aligned with
// the Figma frames on 2026-10-25: the request in the description and the
// history, the folded list of new instalments, and what accepting did.

import { Fragment, useState } from "react";
import { useParams } from "react-router-dom";
import { useFetch } from "../../lib/useFetch";
import { formatMoney } from "../../lib/formatCurrency";
import { formatDay } from "../../lib/formatDate";
import { fetchPurchase, type Purchase } from "../../services/paymentsService";
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
import Button from "../../components/ui/Button";
import { ErrorText, Field, Input, Textarea } from "../../components/ui/Field";
import LoadError from "../../components/LoadError";

export default function RestructurePlan() {
  const { id } = useParams<{ id: string }>();
  const loaded = useFetch(async () => {
    const [purchase, r] = await Promise.all([fetchPurchase(id!), fetchRestructures(id!)]);
    return { purchase, r };
  }, [id]);
  const [override, setOverride] = useState<PlanRestructures | null>(null);
  // The restructure accepted here, this visit: say what it did instead of
  // offering to ask again straight away.
  const [accepted, setAccepted] = useState<Restructure | null>(null);
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
  const changed = (next: PlanRestructures, kind?: "accept" | "decline") => {
    setOverride(next);
    if (kind === "accept") setAccepted(next.history.find((h) => h.status === "accepted" && h.id === open?.id) ?? next.history.find((h) => h.status === "accepted") ?? null);
    loaded.refetch();
  };
  const reload = () => { setOverride(null); loaded.refetch(); };

  return (
    <Page width="lg" back={back} eyebrow={r.transactionReference}
      title={<span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">Restructure your plan{proposal && <span className="font-[family-name:var(--font-body)] inline-flex"><Badge label="Proposal to answer" variant="info" /></span>}</span>}
      description={proposal && open ? proposalIntro(open, proposal) : "Spread what you still owe differently. The total you owe stays the same."}>
      <div className="space-y-6">
        {accepted?.proposal && <AcceptedNote restructure={accepted} purchase={purchase} />}
        {!open && !accepted && r.planStatus === "on_plan" && <AskForm id={id!} onDone={changed} />}
        {!open && r.planStatus !== "on_plan" && <Alert tone="info">This plan isn't running, so it can't be restructured.</Alert>}
        {open?.status === "requested" && <Waiting id={id!} request={open} onDone={changed} />}
        {proposal && open && <ProposalView id={id!} open={open} proposal={proposal} purchase={purchase} currency={purchase?.currency ?? proposal.currency} onDone={changed} onStale={reload} />}
        <History items={r.history} openId={proposal && open ? open.id : null} />
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

function proposalIntro(open: Restructure, proposal: Proposal): string {
  const asked = `You asked on ${formatDay(open.requestedAt)} to spread what you owe ${open.preferredInstalments ? `over ${open.preferredInstalments} instalments` : "differently"}.`;
  return `${asked} The developer has proposed new terms.${proposal.expiresOn ? ` Accept by the end of ${formatDay(proposal.expiresOn)}.` : ""}`;
}

// After accepting: the new schedule's version and its first instalment, from
// the accepted proposal and the reloaded purchase — nothing worked out here.
function AcceptedNote({ restructure, purchase }: { restructure: Restructure; purchase: Purchase | null }) {
  const p = restructure.proposal!;
  const first = p.instalments[0];
  const last = p.instalments[p.instalments.length - 1];
  const money = (n: number) => formatMoney(n, purchase?.currency ?? p.currency);
  const version = purchase?.schedule?.version;
  return (
    <Alert tone="success" role="status">
      Plan restructured on {formatDay(restructure.acceptedAt ?? new Date().toISOString())}{version && version > 1 ? ` — schedule version ${version}` : ""}.
      {first && last ? ` Your next instalment is ${first.sequence} of ${last.sequence}, due ${formatDay(first.dueDate)}: ${money(first.amount)}${first.carriedPenalty > 0 ? ` plus ${money(first.carriedPenalty)} penalty carried from before the restructure` : ""}.` : ""}
    </Alert>
  );
}

// Shown before "Show all": the first few new instalments and the last.
const FOLD = 3;

function ProposalView({ id, open, proposal, purchase, currency, onDone, onStale }: {
  id: string; open: Restructure; proposal: Proposal; purchase: Purchase | null;
  currency: string; onDone: (r: PlanRestructures, kind?: "accept" | "decline") => void; onStale: () => void;
}) {
  const schedule = purchase?.schedule ?? null;
  const [read, setRead] = useState(false);
  const [all, setAll] = useState(proposal.instalments.length <= FOLD + 2);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [error, setError] = useState("");
  const money = (n: number) => formatMoney(n, currency);
  const first = proposal.instalments[0];
  const last = proposal.instalments[proposal.instalments.length - 1];
  const left = schedule ? schedule.instalments.filter((i) => i.sequence > proposal.paidInstalments) : [];
  const paidWords = proposal.paidInstalments === 0 ? "Deposit"
    : `Deposit + instalment${proposal.paidInstalments === 1 ? " 1" : `s 1–${proposal.paidInstalments}`}`;
  // What's late today, as the purchase's standing says: which instalments and
  // the penalty reached (the arrears total, not added up here).
  const standing = purchase?.standing ?? null;
  const lateSeqs = standing?.instalments.filter((i) => i.status === "overdue" || i.status === "in_arrears").map((i) => i.sequence) ?? [];
  const lateLabel = lateSeqs.length === 0 ? null
    : lateSeqs.length === 1 ? `Instalment ${lateSeqs[0]}` : `Instalments ${lateSeqs.slice(0, -1).join(", ")} and ${lateSeqs[lateSeqs.length - 1]}`;
  const shown = all ? proposal.instalments : [...proposal.instalments.slice(0, FOLD), ...proposal.instalments.slice(-1)];
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
      onDone(kind === "accept" ? await acceptRestructure(id, open.id) : await declineRestructure(id, open.id), kind);
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
            <Row label="Paid so far" value={paidWords} />
            {left.length > 0 && schedule && <Row label="Still to pay" value={`${left.length} ${frequencyWord(schedule.frequency)} instalment${left.length === 1 ? "" : "s"}`} />}
            {left[0] && <Row label="Each" value={money(left[0].amount)} mono />}
            {lateLabel && <Row label={lateLabel} value={standing?.arrears ? `late — penalty ${money(standing.arrears.penaltyAmount)}` : "late"} />}
            {left.length > 0 && <Row label="Last due" value={formatDay(left[left.length - 1].dueDate)} />}
            <Row label="You owe" value={money(proposal.balance)} mono bold />
          </dl>
        </Card>
        <Card as="section" aria-labelledby="proposed-heading" className="space-y-2">
          <div className="flex items-center justify-between gap-2"><h2 id="proposed-heading" className="font-semibold text-[var(--foreground)]">Proposed</h2><Badge label={`Schedule v${(schedule?.version ?? 1) + 1}`} variant="info" /></div>
          <dl className="space-y-1.5 text-sm">
            <Row label="Paid so far" value="stays as it is" />
            <Row label="New instalments" value={`${proposal.instalmentCount} ${frequencyWord(proposal.frequency === "quarterly" ? "quarterly" : "monthly")}${first && last ? `, numbered ${first.sequence}–${last.sequence}` : ""}`} />
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
          {shown.map((i, n) => (<Fragment key={i.sequence}>
            {!all && n === FOLD && (
              <li className="py-2"><Button variant="link" onClick={() => setAll(true)} className="text-xs">… show all {proposal.instalments.length}</Button></li>
            )}
            <li className="grid grid-cols-[1fr_auto] sm:grid-cols-[10rem_1fr_auto] items-center gap-x-4 gap-y-0.5 py-2.5">
              <span className="text-[var(--foreground)]">Instalment {i.sequence}{last ? ` of ${last.sequence}` : ""}</span>
              <span className="text-[var(--muted-foreground)] max-sm:order-3 max-sm:col-span-2 max-sm:text-xs">{formatDay(i.dueDate)}</span>
              <span className="font-mono-data text-right text-[var(--foreground)]">{money(i.amount)}{i.carriedPenalty > 0 ? ` + ${money(i.carriedPenalty)} carried penalty` : ""}</span>
            </li>
          </Fragment>))}
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

// Closed requests one line each; while a proposal waits, its request and the
// proposal too (Figma: "You asked…", "The developer proposed…"), oldest first.
function History({ items, openId }: { items: Restructure[]; openId: string | null }) {
  const lines: { at: string; key: string; text: string }[] = [];
  for (const h of items) {
    if (h.id === openId) {
      lines.push({ at: h.requestedAt, key: `${h.id}-asked`, text: `You asked: “${h.reason ?? ""}”${h.preferredInstalments ? ` Preferred: ${h.preferredInstalments} instalments.` : ""}` });
      if (h.proposal) lines.push({ at: h.proposal.proposedAt ?? h.requestedAt, key: `${h.id}-proposed`,
        text: `The developer proposed ${h.proposal.instalmentCount} ${h.proposal.frequency === "quarterly" ? "quarterly" : "monthly"} instalments from ${formatDay(h.proposal.firstDueDate)}.` });
    } else if (h.status !== "requested" && h.status !== "proposed") {
      lines.push({ at: h.closedAt ?? h.acceptedAt ?? h.requestedAt, key: h.id,
        text: `${STATUS_WORDS[h.status] ?? h.status}${h.status === "accepted" ? " — your plan was restructured" : ""}${h.closeNote && h.status !== "declined" ? ` — “${h.closeNote}”` : ""}` });
    }
  }
  if (lines.length === 0) return null;
  lines.sort((a, b) => a.at.localeCompare(b.at));
  return (
    <Card as="section" aria-labelledby="history-heading">
      <h2 id="history-heading" className="font-semibold text-[var(--foreground)] mb-2">History</h2>
      <ul className="space-y-1.5 text-sm text-[var(--muted-foreground)]">
        {lines.map((l) => <li key={l.key}>{formatDay(l.at)} · {l.text}</li>)}
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
