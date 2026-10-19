// Super Admin platform overview — the operator console's landing page,
// from the Figma console proposal. Answers "what is waiting on HomeTrue?"
// first: one card per work queue, each counted from its own screen's API
// (workQueuesService), money first. Then the companies on the platform and
// recent activity.
//
// The illustrative "preview data" zones (GMV, signups, revenue, system
// health) are gone: there is no metrics backend, so they showed made-up
// numbers even on the live console. They come back when real endpoints do.

import { Link } from "react-router-dom";
import { useApp } from "../../contexts/AppContext";
import { useFetch } from "../../lib/useFetch";
import ErrorBoundary from "../../components/ErrorBoundary";
import { fetchRecentActivity } from "../../services/platformMetricsService";
import { fetchTenants, type TenantSummary } from "../../services/tenantsService";
import { QUEUE_GROUPS, fetchWorkQueues, type QueueKind, type WorkQueue } from "../../services/workQueuesService";
import type { AuditLogEntry } from "../../services/tenantsService";
import ActivityStream from "../../components/dashboard/ActivityStream";
import ZoneSection from "../../components/dashboard/ZoneSection";
import Page, { Loading } from "../../components/ui/Page";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import { LinkButton } from "../../components/ui/Button";
import TextLink from "../../components/ui/TextLink";
import { cx } from "../../components/ui/cx";
import { AlertIcon, BriefcaseIcon, FileTextIcon, InfoIcon, MapPinIcon, ReceiptIcon, ShieldCheckIcon, UsersIcon, WalletIcon } from "../../components/icons";

const ICON: Record<QueueKind, React.ReactNode> = {
  payouts: <WalletIcon size={16} />,
  refunds: <ReceiptIcon size={16} />,
  payout_accounts: <BriefcaseIcon size={16} />,
  onboarding: <UsersIcon size={16} />,
  tenants: <BriefcaseIcon size={16} />,
  conflicts: <AlertIcon size={16} />,
  boundaries: <MapPinIcon size={16} />,
  titles: <ShieldCheckIcon size={16} />,
  letters: <FileTextIcon size={16} />,
};

export default function AdminDashboard() {
  const { user } = useApp();
  const permissions = user?.permissions ?? [];
  const queues = useFetch(() => fetchWorkQueues(permissions), [permissions.join(",")]);
  const tenants = useFetch(() => (permissions.includes("admin.tenants.view") ? fetchTenants({}, { limit: 100 }) : Promise.resolve(null)), [permissions.join(",")]);
  const activity = useFetch<AuditLogEntry[]>(() => fetchRecentActivity(10), []);
  const first = user?.name.split(" ")[0];
  const waiting = (queues.data ?? []).filter((q) => (q.count ?? 0) > 0).length;

  return (
    <Page title={`Good ${greeting()}${first ? `, ${first}` : ""}.`} description="What's waiting on HomeTrue across companies, listings and money."
      actions={permissions.includes("admin.tenants.manage") ? <LinkButton to="/admin/tenants/new">Onboard company</LinkButton> : undefined}>
      <ErrorBoundary section="work queues">
        <section aria-labelledby="queues-heading" className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <h2 id="queues-heading" className="font-semibold text-[var(--foreground)]">Work queues</h2>
            {queues.data && <Badge label={waiting ? `${waiting} waiting` : "All clear"} variant={waiting ? "warning" : "success"} />}
          </div>
          {queues.loading && !queues.data ? <Loading label="Checking the queues…" /> : (
            <div className="space-y-5">
              {QUEUE_GROUPS.map((g) => {
                const list = (queues.data ?? []).filter((q) => q.group === g.id);
                if (!list.length) return null;
                return (
                  <div key={g.id}>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)] mb-2">{g.label}</h3>
                    <ul className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                      {list.map((q) => <QueueCard key={q.kind} queue={q} />)}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </ErrorBoundary>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        {tenants.data && <CompaniesCard tenants={tenants.data.items} total={tenants.data.total} />}
        <ZoneSection capability="activityLog" title="Recent activity">
          <Card><ActivityStream entries={activity.data ?? []} loading={activity.loading} error={activity.error} /></Card>
        </ZoneSection>
      </div>

      <p className="mt-6 flex items-start gap-2 rounded-lg bg-[var(--muted)] px-4 py-3 text-sm text-[var(--muted-foreground)]">
        <InfoIcon size={16} className="mt-0.5 shrink-0" />
        GMV, signups, revenue and system health come back when a metrics backend exists — until then they aren't shown, rather than shown as illustrations.
      </p>
    </Page>
  );
}

function QueueCard({ queue: q }: { queue: WorkQueue }) {
  const busy = (q.count ?? 0) > 0;
  const tone = q.urgent ? "error" : busy ? "warning" : "neutral";
  return (
    <li>
      <Link to={q.href} className={cx(
        "group flex h-full flex-col gap-2 rounded-xl border bg-[var(--card)] p-4 transition-colors hover:border-[var(--accent)]/50",
        q.urgent ? "border-[var(--error-border)]" : "border-[var(--border)]",
      )}>
        <div className="flex items-center justify-between">
          <span className={cx("w-8 h-8 rounded-lg flex items-center justify-center",
            tone === "error" ? "bg-[var(--error-surface)] text-[var(--error-text)]" : tone === "warning" ? "bg-[var(--warning-surface)] text-[var(--warning-text)]" : "bg-[var(--muted)] text-[var(--muted-foreground)]")}>
            {ICON[q.kind]}
          </span>
          <span className={cx("font-display text-3xl", busy ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]")}>{q.count ?? "—"}</span>
        </div>
        <span className={cx("text-sm font-semibold", busy ? "text-[var(--foreground)] group-hover:underline" : "text-[var(--muted-foreground)]")}>{q.label}</span>
        <span className="text-xs text-[var(--muted-foreground)]">{q.detail}</span>
        {busy && <span className="mt-auto text-sm font-medium text-[var(--accent)]">Open →</span>}
      </Link>
    </li>
  );
}

// The companies on the platform, by where verification stands.
function CompaniesCard({ tenants, total }: { tenants: TenantSummary[]; total: number }) {
  const verified = tenants.filter((t) => t.verificationState === "verified").length;
  const reviewing = tenants.filter((t) => t.verificationState === "documents_submitted" || t.verificationState === "under_review").length;
  const suspended = tenants.filter((t) => t.status === "suspended").length;
  const rejected = tenants.filter((t) => t.verificationState === "rejected").length;
  const parts: [number, string][] = [[verified, "bg-[var(--primary)]"], [reviewing, "bg-[var(--accent)]"], [rejected, "bg-[var(--error)]"]];
  const shown = tenants.length || 1;
  return (
    <Card as="section" aria-labelledby="companies-heading">
      <div className="flex items-center justify-between mb-3">
        <h2 id="companies-heading" className="font-semibold text-[var(--foreground)]">Companies on HomeTrue</h2>
        <TextLink to="/admin/tenants" className="text-sm font-medium">All tenants →</TextLink>
      </div>
      <div className="flex items-baseline gap-2 mb-3">
        <span className="font-display text-4xl text-[var(--foreground)]">{total}</span>
        <span className="text-sm text-[var(--muted-foreground)]">tenant{total === 1 ? "" : "s"}</span>
      </div>
      <div className="h-2 rounded-full bg-[var(--muted)] overflow-hidden flex" aria-hidden="true">
        {parts.map(([n, c], i) => n > 0 && <span key={i} className={`h-full ${c}`} style={{ width: `${(n / shown) * 100}%` }} />)}
      </div>
      <p className="text-sm text-[var(--muted-foreground)] mt-2">
        {[`${verified} verified`, reviewing ? `${reviewing} under review` : null, rejected ? `${rejected} rejected` : null, suspended ? `${suspended} with the account suspended` : null].filter(Boolean).join(" · ")}
      </p>
    </Card>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
