// "Check this document is genuine" — /verify and /verify/:code, no login. The
// QR code on every receipt and allocation letter opens /verify/{code}; anyone
// holding a copy (a buyer's family, a lawyer, a bank) can check it here or
// type the printed code. It shows what HomeTrue issued, never an amount or a
// full name.
//
// Laid out from the Figma "KYC, list your company, verify" proposal: the
// code box beside who the page is for, and the answer as one result card.

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../../lib/apiClient";
import { useFetch } from "../../lib/useFetch";
import { formatDay } from "../../lib/formatDate";
import { normalizeVerifyCode, verifyDocument, type DocumentVerification } from "../../services/documentsService";
import { Loading } from "../../components/ui/Page";
import TextLink from "../../components/ui/TextLink";
import { AlertIcon, CheckIcon, ShieldCheckIcon } from "../../components/icons";
import Card from "../../components/ui/Card";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import { Field, Input, describedBy } from "../../components/ui/Field";
import LoadError from "../../components/LoadError";

const TYPE_NAMES: Record<DocumentVerification["documentType"], string> = {
  receipt: "receipt",
  allocation_letter: "allocation letter",
  provisional_allocation_letter: "provisional allocation letter",
  offer_letter: "offer letter",
};

const OFFER_STATUS: Record<string, string> = {
  issued: "Issued — not accepted yet",
  accepted: "Accepted by the buyer",
  lapsed: "Lapsed — the purchase wasn't completed",
};

export default function VerifyDocument() {
  const { code } = useParams<{ code?: string }>();
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 lg:gap-10 items-center">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl text-[var(--foreground)] mb-2">Check a HomeTrue document</h1>
          <p className="text-[var(--muted-foreground)]">
            For buyers, their families, lawyers and banks: see whether HomeTrue really issued a receipt, offer letter or allocation letter.
          </p>
        </div>
        <CodeForm />
      </div>
      {code && <Result key={code} code={code} />}
    </div>
  );
}

function Result({ code }: { code: string }) {
  const result = useFetch(async () => {
    try {
      return { verification: await verifyDocument(code), problem: null };
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) return { verification: null, problem: "not_ours" as const };
      if (err instanceof ApiError && err.status === 429) return { verification: null, problem: "rate_limited" as const };
      throw err;
    }
  }, [code]);

  if (result.loading && !result.data) return <Loading label="Checking…" />;
  if (result.error) return <LoadError error={result.errorValue} what="this check" onRetry={result.refetch} />;
  const { verification, problem } = result.data!;

  if (problem === "rate_limited") {
    return (
      <Alert tone="warning" title="Too many checks just now" role="status">
        This connection has checked a lot of codes in the last minute. Try again in a minute.
        <div className="mt-3"><Button variant="secondary" onClick={result.refetch}>Try again</Button></div>
      </Alert>
    );
  }

  if (!verification) {
    return (
      <ResultCard tone="error" icon={<AlertIcon size={22} />} role="alert"
        title="Not a document HomeTrue issued"
        sub={<>No HomeTrue document has the code <span className="font-mono-data">{formatCode(code)}</span>.</>}>
        <h2 className="text-sm font-semibold text-[var(--foreground)] mb-2">What to do</h2>
        <ul className="list-disc pl-5 space-y-1.5 text-sm text-[var(--foreground)]">
          <li>Check the code against the printed one — dashes and capitals don't matter.</li>
          <li>If it still doesn't match, don't rely on this document.</li>
          <li>Don't pay anyone because of it. HomeTrue never asks for payment into a bank account named in a letter, message or flyer.</li>
        </ul>
        <TextLink to="/support" className="inline-block text-sm font-medium mt-3">Report it to HomeTrue support →</TextLink>
      </ResultCard>
    );
  }

  const v = verification;
  const kind = TYPE_NAMES[v.documentType];
  const offer = v.documentType === "offer_letter";
  // Genuine either way — a lapsed offer just stands for nothing now.
  const lapsed = offer && v.status === "lapsed";
  return (
    <ResultCard tone={lapsed ? "warning" : "success"} icon={<ShieldCheckIcon size={22} />} role="status"
      title={lapsed ? "Genuine, but this offer has lapsed" : `Genuine — HomeTrue issued this ${kind}`}
      sub={lapsed ? "HomeTrue issued it, but the purchase wasn't completed. It gives no right to the plot." : "Checked just now against HomeTrue's records."}>
      {v.status === "refunded" && v.refundedAt && (
        <Alert tone="info" className="mb-4">
          The payment on this receipt was refunded on {formatDay(v.refundedAt)}. The receipt is genuine (the payment was made), but it no longer stands for a purchase.
        </Alert>
      )}
      <div className="grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6">
        <dl className="divide-y divide-[var(--border)] text-sm">
          <Fact label="Number"><span className="font-mono-data">{v.number}</span></Fact>
          <Fact label="Issued">{formatDay(v.issuedAt)}</Fact>
          <Fact label="Issued by">{v.issuedBy}</Fact>
          {offer && OFFER_STATUS[v.status] && <Fact label="Status">{OFFER_STATUS[v.status]}</Fact>}
          {v.developer && <Fact label={v.documentType === "receipt" ? "Seller" : "From"}>{v.developer}</Fact>}
          {v.estate && <Fact label="Estate">{[v.estate, v.location].filter(Boolean).join(", ")}</Fact>}
          {!v.estate && v.location && <Fact label="Location">{v.location}</Fact>}
          {v.plot && <Fact label="Plot">{v.plot}</Fact>}
          {v.holderInitials && <Fact label={offer ? "Buyer's initials" : "Holder's initials"}>{v.holderInitials}</Fact>}
        </dl>
        <section aria-labelledby="compare-heading" className="rounded-xl bg-[var(--muted)] p-4 self-start">
          <h2 id="compare-heading" className="text-sm font-semibold text-[var(--foreground)] mb-2">Compare with your copy</h2>
          <ul className="space-y-1.5 text-sm text-[var(--foreground)]">
            {["The number matches the one printed", v.documentType === "receipt" ? "The estate and plot are the ones paid for" : offer ? "The estate and plot are the ones you were offered" : "The estate and plot are the ones you were sold", offer ? "The buyer's initials match the buyer" : "The holder's initials match the buyer",
              ...(offer ? ["An offer is not a sale — the plot is yours only once it's paid and allocated"] : [])].map((t) => (
              <li key={t} className="flex gap-2"><span className="text-[var(--primary)] mt-0.5 shrink-0"><CheckIcon size={14} /></span>{t}</li>
            ))}
          </ul>
          <p className="text-xs text-[var(--muted-foreground)] mt-3">To protect the holder, this page never shows the amount paid or their full name.</p>
        </section>
      </div>
    </ResultCard>
  );
}

// The answer, as one card: a tinted head that says it plainly, then detail.
const RESULT_TONES = {
  success: { border: "border-[var(--success-border)]", head: "bg-[var(--success-surface)]", icon: "bg-[var(--success)] text-[var(--success-foreground)]", text: "text-[var(--success-text)]" },
  warning: { border: "border-[var(--warning-border)]", head: "bg-[var(--warning-surface)]", icon: "bg-[var(--warning)] text-[var(--warning-foreground)]", text: "text-[var(--warning-text)]" },
  error: { border: "border-[var(--error-border)]", head: "bg-[var(--error-surface)]", icon: "bg-[var(--error)] text-[var(--error-foreground)]", text: "text-[var(--error-text)]" },
};

function ResultCard({ tone, icon, title, sub, role, children }: {
  tone: keyof typeof RESULT_TONES; icon: React.ReactNode; title: string; sub: React.ReactNode; role: "status" | "alert"; children: React.ReactNode;
}) {
  const t = RESULT_TONES[tone];
  return (
    <section role={role} className={`rounded-2xl border-2 overflow-hidden bg-[var(--card)] ${t.border}`}>
      <div className={`flex items-center gap-3.5 px-5 sm:px-6 py-4 ${t.head}`}>
        <span className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center ${t.icon}`}>{icon}</span>
        <div>
          <div className={`font-semibold text-lg ${t.text}`}>{title}</div>
          <div className={`text-sm ${t.text}`}>{sub}</div>
        </div>
      </div>
      <div className="px-5 sm:px-6 py-5">{children}</div>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="text-[var(--muted-foreground)]">{label}</dt>
      <dd className="font-medium text-[var(--foreground)] text-right">{children}</dd>
    </div>
  );
}

// Shown back the way it's printed: four groups of four.
function formatCode(code: string): string {
  const c = normalizeVerifyCode(code);
  return /^[0-9A-F]{16}$/.test(c) ? c.match(/.{4}/g)!.join("-") : c;
}

const HINT = "Printed beside the QR code, like D897-0A03-3C97-202D. Dashes and capitals don't matter.";

function CodeForm() {
  const navigate = useNavigate();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = normalizeVerifyCode(value);
    if (!code) {
      setError("Enter the code printed on the document.");
      return;
    }
    setError(null);
    setValue("");
    navigate(`/verify/${code}`);
  };

  return (
    <Card as="section" padding="md" aria-label="Check a code">
      <form onSubmit={submit} noValidate className="space-y-3">
        <Field id="verify-code" label="Type the code printed beside the QR code" hint={HINT} error={error ?? undefined}>
          <Input
            id="verify-code"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className="font-mono-data"
            aria-invalid={!!error}
            aria-describedby={describedBy("verify-code", { hint: HINT, error })}
          />
        </Field>
        <Button type="submit" size="lg">Check</Button>
        <p className="text-xs text-[var(--muted-foreground)]">Or point your phone's camera at the QR code — it opens this page with the answer.</p>
      </form>
    </Card>
  );
}
