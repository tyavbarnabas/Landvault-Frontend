// The Super Admin's queue of developer companies asking to join, from the
// public /list-your-company form. A request becomes a tenant only through
// "Convert", which opens the tenant wizard prefilled from it.

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChevronRightIcon } from "../../../components/icons";
import { useApp } from "../../../contexts/AppContext";
import { useFetch } from "../../../lib/useFetch";
import {
  OnboardingError, contactLinks, contactMethodLabel, declineRequest, fetchOnboardingRequest, fetchOnboardingRequests, isOpenRequest, markContacted,
  type OnboardingRequest, type OnboardingRequestStatus,
} from "../../../services/onboardingRequestsService";
import LoadError from "../../../components/LoadError";
import StatusBadge, { onboardingRequestStatusBadge } from "../../../components/StatusBadge";
import Page, { Loading } from "../../../components/ui/Page";
import Card, { InfoBox, ListCard } from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import TextLink from "../../../components/ui/TextLink";
import Alert from "../../../components/ui/Alert";
import EmptyState from "../../../components/ui/EmptyState";
import TabBar from "../../../components/ui/Tabs";
import Dialog, { DialogActions } from "../../../components/ui/Dialog";
import { ErrorText, Field, Textarea } from "../../../components/ui/Field";

type Filter = OnboardingRequestStatus | "all" | "attention";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "attention", label: "Needs attention" },
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "converted", label: "Converted" },
  { id: "declined", label: "Declined" },
  { id: "all", label: "All" },
];

const MANAGE_PERMISSION = "admin.tenants.manage";

const ATTENTION_TEXT = "No contact for 2 working days";

// "attention" is the backend's attention=true (longest waiting first); every
// other tab is a status, "all" none.
function query(filter: Filter): [OnboardingRequestStatus | null, boolean] {
  if (filter === "attention") return [null, true];
  return [filter === "all" ? null : filter, false];
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";
}

const ROW_GRID = "lg:grid lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.6fr)_minmax(0,1.3fr)_7rem_6rem_16px] lg:items-center lg:gap-4";

const errorText = (err: unknown) => (err instanceof Error ? err.message : "That didn't go through.");

// ─── /admin/onboarding-requests ──────────────────────────────────────────────

export default function OnboardingRequests() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = (FILTERS.find((f) => f.id === searchParams.get("status"))?.id ?? "new") as Filter;
  const [items, setItems] = useState<OnboardingRequest[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState("");

  const first = useFetch(() => { const [status, attention] = query(filter); return fetchOnboardingRequests(status, {}, attention); }, [filter]);
  // Every tab's count, so a late request is noticed from any tab.
  const counts = useFetch(async () => Object.fromEntries(await Promise.all(FILTERS.map(async (f) => {
    const [status, attention] = query(f.id);
    return [f.id, (await fetchOnboardingRequests(status, { limit: 1 }, attention)).total] as const;
  }))), [filter]);
  const tabs = FILTERS.map((f) => (counts.data ? { ...f, label: `${f.label} ${counts.data[f.id] ?? 0}` } : f));
  useEffect(() => {
    if (!first.data) return;
    setItems(first.data.items);
    setCursor(first.data.cursor);
    setTotal(first.data.total);
  }, [first.data]);

  // Newest first, so "Load more" goes back in time.
  const loadMore = async () => {
    setLoadingMore(true);
    setMoreError("");
    try {
      const [status, attention] = query(filter);
      const page = await fetchOnboardingRequests(status, { cursor }, attention);
      setItems((all) => [...all, ...page.items]);
      setCursor(page.cursor);
    } catch (err) {
      setMoreError(errorText(err));
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <Page title="Onboarding requests" description="Developer companies asking to list on HomeTrue. Speak to them, then convert a request into a tenant or decline it.">
      <TabBar tabs={tabs} active={filter} onActivate={(id) => setSearchParams(id === "new" ? {} : { status: id })} ariaLabel="Request status" divider />
      <div role="tabpanel" id={`panel-${filter}`}>
        {first.error ? (
          <LoadError error={first.errorValue} what="onboarding requests" onRetry={first.refetch} />
        ) : first.loading && !first.data ? (
          <Loading label="Loading requests…" />
        ) : items.length === 0 ? (
          filter === "attention"
            ? <EmptyState title="Nothing waiting too long" description="A request still new after 2 working days appears here, longest waiting first." />
            : <EmptyState title={filter === "new" ? "No new requests" : "Nothing here"} description="Requests sent from the public “List your estates” form appear here." />
        ) : (
          <>
            <Card padding="none" className="overflow-hidden">
              <div aria-hidden="true" className={`hidden ${ROW_GRID} bg-[var(--muted)] px-5 py-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]`}>
                <span>Company</span><span>Contact</span><span>States</span><span>Sent</span><span>Status</span><span />
              </div>
              <ul className="divide-y divide-[var(--border)]">
                {items.map((r) => {
                  const badge = onboardingRequestStatusBadge(r.status);
                  return (
                    <li key={r.id}>
                      <Link to={`/admin/onboarding-requests/${r.id}`} className={`group block px-4 sm:px-5 py-3.5 hover:bg-[var(--muted)]/50 transition-colors ${ROW_GRID}`}>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-[var(--foreground)] group-hover:underline">{r.companyName}</div>
                          {r.needsAttention && <div className="mt-1"><StatusBadge label={ATTENTION_TEXT} variant="warning" /></div>}
                        </div>
                        <div className="text-sm mt-1 lg:mt-0 min-w-0">
                          <span className="text-[var(--foreground)]">{r.contactName}{r.contactRole ? `, ${r.contactRole}` : ""}</span>
                          <span className="block text-xs text-[var(--muted-foreground)]">prefers {contactMethodLabel(r.preferredContactMethod).toLowerCase()}</span>
                        </div>
                        <div className="text-sm text-[var(--foreground)] min-w-0">{r.statesOfOperation.join(", ") || "—"}</div>
                        <div className="text-sm text-[var(--muted-foreground)]">{formatDate(r.createdAt)}</div>
                        <div className="mt-1 lg:mt-0"><StatusBadge label={badge.label} variant={badge.variant} /></div>
                        <ChevronRightIcon size={16} className="hidden lg:block text-[var(--muted-foreground)]" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
            <div className="flex items-center justify-between gap-3 pt-4 text-sm text-[var(--muted-foreground)]">
              <span aria-live="polite">{items.length} of {total}</span>
              {cursor && <Button variant="secondary" onClick={loadMore} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load more"}</Button>}
            </div>
            {moreError && <ErrorText className="mt-2">{moreError}</ErrorText>}
          </>
        )}
      </div>
    </Page>
  );
}

// ─── /admin/onboarding-requests/:id ──────────────────────────────────────────

export function OnboardingRequestDetail() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useApp();
  const canManage = !!user?.permissions?.includes(MANAGE_PERMISSION);
  const loaded = useFetch(() => fetchOnboardingRequest(id), [id]);
  const [request, setRequest] = useState<OnboardingRequest | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "error" } | null>(null);
  const [declining, setDeclining] = useState(false);

  useEffect(() => { if (loaded.data) setRequest(loaded.data); }, [loaded.data]);

  const back = { to: "/admin/onboarding-requests", label: "Onboarding requests" };
  if (loaded.error) return <Page title="Onboarding request" back={back} width="lg"><LoadError error={loaded.errorValue} what="this request" onRetry={loaded.refetch} /></Page>;
  if (!request) return <Page title="Onboarding request" back={back} width="lg"><Loading /></Page>;

  const r = request;
  const badge = onboardingRequestStatusBadge(r.status);
  const open = isOpenRequest(r);
  const actor = user?.email ?? "";

  const recordContact = async () => {
    setBusy(true);
    setMessage(null);
    try {
      setRequest(await markContacted(r.id, note, actor));
      setNote("");
      setMessage({ text: "Recorded. The latest contact and note are kept; every one is in the audit log.", tone: "ok" });
    } catch (err) {
      setMessage({ text: errorText(err), tone: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page back={back} width="xl"
      title={<span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">{r.companyName}<span className="font-[family-name:var(--font-body)] inline-flex flex-wrap gap-2"><StatusBadge label={badge.label} variant={badge.variant} />{r.needsAttention && <StatusBadge label={ATTENTION_TEXT} variant="warning" />}</span></span>}
      description={`Sent ${formatDate(r.createdAt)} from the List your company form${r.statesOfOperation.length ? ` · ${r.statesOfOperation.join(", ")}` : ""}`}>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_22rem] gap-6 items-start">
        <div className="space-y-5">
          <Card as="section" className="space-y-3" aria-labelledby="req-contact">
            <h2 id="req-contact" className="font-semibold text-[var(--foreground)]">Who to speak to</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <InfoBox label="Name">{r.contactName}{r.contactRole ? `, ${r.contactRole}` : ""}</InfoBox>
              <InfoBox label="Prefers">{contactMethodLabel(r.preferredContactMethod)}{r.preferredContactTime ? ` · ${r.preferredContactTime}` : ""}</InfoBox>
              <InfoBox label="Email"><a href={`mailto:${r.contactEmail}`} className="text-[var(--accent)] hover:underline break-all">{r.contactEmail}</a></InfoBox>
              <InfoBox label="Phone"><a href={`tel:${r.contactPhone.replace(/[^+\d]/g, "")}`} className="text-[var(--accent)] hover:underline">{r.contactPhone}</a></InfoBox>
            </div>
          </Card>

          <Card as="section" className="space-y-3" aria-labelledby="req-company">
            <h2 id="req-company" className="font-semibold text-[var(--foreground)]">The company, as they described it</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <InfoBox label="RC number"><span className="font-mono-data">{r.rcNumber ?? "Not given"}</span></InfoBox>
              <InfoBox label="Estates (their estimate)">{r.estimatedEstateCount ?? "Not given"}</InfoBox>
              <InfoBox label="Office address" className="sm:col-span-2">{r.companyAddress ?? "Not given"}</InfoBox>
              <InfoBox label="States" className="sm:col-span-2">{r.statesOfOperation.length ? r.statesOfOperation.join(", ") : "Not given"}</InfoBox>
            </div>
            {r.message && <InfoBox label="Their message"><p className="whitespace-pre-line text-sm">{r.message}</p></InfoBox>}
            <p className="text-xs text-[var(--muted-foreground)]">Nothing here is checked yet — HomeTrue verifies the company only once it's onboarded.</p>
          </Card>

          <Card as="section" aria-labelledby="req-history">
            <h2 id="req-history" className="font-semibold text-[var(--foreground)] mb-3">What's happened</h2>
            <ol className="space-y-2.5 text-sm">
              <HistoryItem when={formatDate(r.createdAt)}>Request sent from the public form.</HistoryItem>
              {r.contactedAt && <HistoryItem when={formatDate(r.contactedAt)}>Contacted{r.contactNote ? `: ${r.contactNote}` : "."}</HistoryItem>}
              {r.status === "declined" && <HistoryItem when={formatDate(r.decidedAt)}>Declined: {r.declineReason}</HistoryItem>}
              {r.status === "converted" && (
                <HistoryItem when={formatDate(r.decidedAt)}>
                  Converted into a tenant.{r.organizationId && <> <TextLink to={`/admin/tenants/${r.organizationId}`} className="font-medium">Open the tenant →</TextLink></>}
                </HistoryItem>
              )}
              {r.needsAttention && <HistoryItem when="Now" warn>No contact yet — 2 working days have passed.</HistoryItem>}
            </ol>
          </Card>
        </div>

        <Card as="section" aria-labelledby="req-actions" className="space-y-4 lg:sticky lg:top-6">
          <h2 id="req-actions" className="font-semibold text-[var(--foreground)]">Next step</h2>
          {!open ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              {r.status === "converted" ? "This request has been converted into a tenant." : "This request was declined. It's kept for the record."}
            </p>
          ) : (
            <>
              <p className="text-sm text-[var(--muted-foreground)]">Contact them the way they prefer, record it, then convert or decline.</p>
              <ContactButtons request={r} />
              {canManage ? (
                <>
                  <div className="border-t border-[var(--border)] pt-4 space-y-3">
                    <Field id="req-note" label="What was said (optional)" hint="Or what they're sending next.">
                      <Textarea id="req-note" rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} aria-describedby="req-note-hint" />
                    </Field>
                    <Button variant="secondary" fullWidth onClick={recordContact} disabled={busy}>{busy ? "Saving…" : "Mark as contacted"}</Button>
                    {message && (message.tone === "error" ? <ErrorText>{message.text}</ErrorText> : <p className="text-sm text-[var(--muted-foreground)]" role="status">{message.text}</p>)}
                  </div>
                  <div className="border-t border-[var(--border)] pt-4 space-y-2">
                    <Button fullWidth onClick={() => navigate(`/admin/tenants/new?fromRequest=${encodeURIComponent(r.id)}`)}>Convert into a tenant →</Button>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      Opens the onboarding wizard filled in from this request. The company is created and its first Executive Director invited only when you submit it.
                    </p>
                    <Button variant="linkDanger" onClick={() => { setDeclining(true); setMessage(null); }}>Decline this request…</Button>
                  </div>
                </>
              ) : (
                <Alert tone="info">You can read requests but not act on them.</Alert>
              )}
            </>
          )}
        </Card>
      </div>

      {declining && (
        <DeclineDialog request={r} actor={actor} onClose={() => setDeclining(false)}
          onDeclined={(updated) => { setRequest(updated); setDeclining(false); }} />
      )}
    </Page>
  );
}

function HistoryItem({ when, warn, children }: { when: string; warn?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-baseline gap-3">
      <span aria-hidden="true" className={`w-2.5 h-2.5 shrink-0 rounded-full translate-y-0.5 ${warn ? "bg-[var(--warning)]" : "bg-[var(--primary)]"}`} />
      <span className="font-mono-data text-xs text-[var(--muted-foreground)] w-24 shrink-0">{when}</span>
      <span className={warn ? "text-[var(--warning-text)]" : "text-[var(--foreground)]"}>{children}</span>
    </li>
  );
}

// Opens the right app, already filled in — the company's preferred way first
// and highlighted. Recording what happened is still "Mark as contacted".
function ContactButtons({ request }: { request: OnboardingRequest }) {
  const links = contactLinks(request, { requestUrl: window.location.href });
  const buttons = [
    { id: "whatsapp", label: "WhatsApp", href: links.whatsapp, external: true },
    { id: "email", label: "Email", href: links.email, external: false },
    { id: "phone", label: "Call", href: links.phone, external: false },
    { id: "meeting", label: "Schedule a meeting", href: links.meeting, external: true },
  ].sort((a, b) => Number(b.id === request.preferredContactMethod) - Number(a.id === request.preferredContactMethod));
  const [first, ...rest] = buttons;
  const cls = "inline-flex items-center justify-center rounded-md px-3 py-2 text-sm";
  return (
    <div className="space-y-2">
      <a href={first.href} {...(first.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
        className={`${cls} w-full bg-[var(--primary)] text-[var(--primary-foreground)] font-semibold hover:opacity-90`}>
        {first.label}{first.id === request.preferredContactMethod ? " · their preference" : ""}
      </a>
      <div className="grid grid-cols-3 gap-2">
        {rest.map((b) => (
          <a key={b.id} href={b.href} {...(b.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className={`${cls} border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--muted)]`}>
            {b.id === "meeting" ? "Meeting" : b.label}
          </a>
        ))}
      </div>
    </div>
  );
}

function DeclineDialog({ request, actor, onClose, onDeclined }: {
  request: OnboardingRequest; actor: string; onClose: () => void; onDeclined: (r: OnboardingRequest) => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      onDeclined(await declineRequest(request.id, reason, actor));
    } catch (err) {
      setError(err instanceof OnboardingError || err instanceof Error ? err.message : "That didn't go through.");
      setBusy(false);
    }
  };

  return (
    <Dialog title={`Decline ${request.companyName}?`} onClose={onClose}>
      <Field id="decline-reason" label="Reason" hint="Kept for HomeTrue and not emailed to the company. Tell them yourself if appropriate. This is final." className="mb-3">
        <Textarea id="decline-reason" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      {error && <ErrorText className="mb-3">{error}</ErrorText>}
      <DialogActions onCancel={onClose} onConfirm={confirm} confirmLabel="Decline request" busy={busy} busyLabel="Declining…" variant="danger" />
    </Dialog>
  );
}
