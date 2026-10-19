// "Check this document is genuine" — /verify and /verify/:code, no login. The
// QR code on every receipt and allocation letter opens /verify/{code}; anyone
// holding a copy (a buyer's family, a lawyer, a bank) can check it here or
// type the printed code. It shows what HomeTrue issued, never an amount or a
// full name.

import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../../lib/apiClient";
import { useFetch } from "../../lib/useFetch";
import { formatDay } from "../../lib/formatDate";
import { normalizeVerifyCode, verifyDocument, type DocumentVerification } from "../../services/documentsService";
import Page, { Loading } from "../../components/ui/Page";
import Card from "../../components/ui/Card";
import Alert from "../../components/ui/Alert";
import Button from "../../components/ui/Button";
import { Field, Input, describedBy } from "../../components/ui/Field";
import LoadError from "../../components/LoadError";

const TYPE_NAMES: Record<DocumentVerification["documentType"], string> = {
  receipt: "receipt",
  allocation_letter: "allocation letter",
};

export default function VerifyDocument() {
  const { code } = useParams<{ code?: string }>();
  return (
    <Page
      title="Check a HomeTrue document"
      description="Scan the QR code on a receipt or allocation letter, or type the code printed beside it."
    >
      <div className="space-y-6">
        {code && <Result key={code} code={code} />}
        <CodeForm />
      </div>
    </Page>
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
      <Alert tone="error" title="This is not a document HomeTrue issued." role="alert">
        <p>No HomeTrue receipt or allocation letter has the code <span className="font-mono-data">{formatCode(code)}</span>.</p>
        <p className="mt-2">Check the code against the printed one. If it still doesn't match, don't rely on this document, and don't pay anyone because of it.</p>
      </Alert>
    );
  }

  const v = verification;
  const kind = TYPE_NAMES[v.documentType];
  return (
    <div className="space-y-3">
      <Alert tone="success" title={`Genuine HomeTrue ${kind}`} role="status">
        HomeTrue issued this {kind}. Compare the details below with the copy you were shown.
      </Alert>
      {v.status === "refunded" && v.refundedAt && (
        <Alert tone="info" role="status">
          The payment on this receipt was refunded on {formatDay(v.refundedAt)}. The receipt is genuine (the payment was made), but it no longer stands for a purchase.
        </Alert>
      )}
      <Card as="dl" padding="md" className="text-sm grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
        <Fact label="Number"><span className="font-mono-data">{v.number}</span></Fact>
        <Fact label="Issued">{formatDay(v.issuedAt)}</Fact>
        <Fact label="Issued by">{v.issuedBy}</Fact>
        {v.developer && <Fact label={v.documentType === "receipt" ? "Seller" : "From"}>{v.developer}</Fact>}
        {v.estate && <Fact label="Estate">{v.estate}</Fact>}
        {v.location && <Fact label="Location">{v.location}</Fact>}
        {v.plot && <Fact label="Plot">{v.plot}</Fact>}
        {v.holderInitials && <Fact label="Holder's initials">{v.holderInitials}</Fact>}
      </Card>
      <p className="text-xs text-[var(--muted-foreground)]">
        To protect the holder, this page never shows the amount paid or their full name.
      </p>
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-[var(--muted-foreground)]">{label}</dt>
      <dd className="text-[var(--foreground)] text-right sm:text-left">{children}</dd>
    </>
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
    <Card as="section" padding="md">
      <form onSubmit={submit} noValidate className="space-y-3">
        <Field id="verify-code" label="Verification code" hint={HINT} error={error ?? undefined}>
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
        <Button type="submit">Check</Button>
      </form>
    </Card>
  );
}
