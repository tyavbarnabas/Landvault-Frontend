// /portal — the developer portal's home, from the Figma portal proposal:
// what needs the team, the company in four numbers, live estates by sales,
// and quick actions. Each part shows only to a role that can open what it
// links to (portalOverviewService decides what it may read).

import { Link } from "react-router-dom";
import { useApp } from "../../contexts/AppContext";
import { useFetch } from "../../lib/useFetch";
import { formatInCurrency } from "../../data/mockData";
import { usePortalScope } from "./usePortalScope";
import { fetchPortalOverview, type OverviewItem, type OverviewTone } from "../../services/portalOverviewService";
import { canInviteStaff, canManageBranches, canManageEstates, canRequestStaff, DOCUMENTS_VIEW_PERMISSION, PAYMENTS_VERIFY_PERMISSION, SETTLEMENT_MANAGE_PERMISSION } from "../../services/authService";
import Page, { Loading } from "../../components/ui/Page";
import Card from "../../components/ui/Card";
import Badge from "../../components/ui/Badge";
import { LinkButton } from "../../components/ui/Button";
import TextLink from "../../components/ui/TextLink";
import LoadError from "../../components/LoadError";
import SalesBar from "../../components/portal/SalesBar";
import { cx } from "../../components/ui/cx";
import { TONE_FILL } from "../../components/ui/tones";
import { AlertIcon, BriefcaseIcon, CheckIcon, ChevronRightIcon, FileTextIcon, GridIcon, MapPinIcon, ShieldCheckIcon, UsersIcon, WalletIcon } from "../../components/icons";
import { estatePlace, type PortalEstate } from "../../services/portalEstatesService";
import type { StaffMember } from "../../services/staffService";
import type { Payout } from "../../services/financeService";

const TONE_TEXT: Record<OverviewTone, string> = {
  warning: "text-[var(--warning-text)]",
  error: "text-[var(--error-text)]",
  info: "text-[var(--info-text)]",
  neutral: "text-[var(--muted-foreground)]",
};

function itemIcon(item: OverviewItem) {
  switch (item.kind) {
    case "estate": return <AlertIcon size={20} />;
    case "staff": return <UsersIcon size={20} />;
    case "verify": case "late": return <ShieldCheckIcon size={20} />;
    default: return <WalletIcon size={20} />;
  }
}

export default function PortalOverview() {
  const scope = usePortalScope();
  const { user } = useApp();
  const perms = user?.permissions ?? [];
  const access = {
    estates: true,
    finance: perms.includes(PAYMENTS_VERIFY_PERMISSION),
    staff: canInviteStaff(user) || canRequestStaff(user),
    branches: canManageBranches(user),
  };
  const data = useFetch(async () => (scope && user ? fetchPortalOverview(scope, access, { email: user.email, permissions: user.permissions }) : null),
    [scope?.tenantId, scope?.branchId, user?.email]);

  if (!scope) return <Page title="Overview"><p className="text-sm text-[var(--muted-foreground)]">This account isn't linked to a company.</p></Page>;
  const first = user?.name.split(" ")[0];
  const actions = canManageEstates(user) ? <LinkButton to="/portal/estates/new">New estate</LinkButton> : undefined;

  return (
    <Page title={`Good ${greeting()}${first ? `, ${first}` : ""}.`} description="What needs you today across your company's estates, sales and team." actions={actions}>
      {data.loading && !data.data ? <Loading /> : data.error ? <LoadError error={data.errorValue} what="your overview" onRetry={data.refetch} /> : data.data && (
        <div className="space-y-6">
          <Attention items={data.data.items} financeClear={data.data.financeClear} />
          <Figures estates={data.data.estates} staff={data.data.staff} branchCount={data.data.branchCount} payouts={data.data.payouts} />
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
            {data.data.estates && <LiveEstates estates={data.data.estates} />}
            <QuickActions />
          </div>
        </div>
      )}
    </Page>
  );
}

function Attention({ items, financeClear }: { items: OverviewItem[]; financeClear: boolean | null }) {
  if (items.length === 0) {
    return (
      <section aria-labelledby="attention-heading" className="flex items-center gap-3 rounded-xl bg-[var(--success-surface)] text-[var(--success-text)] px-4 sm:px-5 py-4">
        <span className="w-9 h-9 shrink-0 rounded-lg bg-[var(--card)] flex items-center justify-center"><CheckIcon size={18} /></span>
        <div>
          <h2 id="attention-heading" className="text-sm font-semibold">Nothing needs your attention</h2>
          <p className="text-sm">Payments to verify, estates that aren't live and staff who haven't joined will show here.</p>
        </div>
      </section>
    );
  }
  return (
    <Card as="section" aria-labelledby="attention-heading">
      <div className="flex items-center gap-2">
        <h2 id="attention-heading" className="font-semibold text-[var(--foreground)]">Needs your attention</h2>
        <Badge label={String(items.length)} variant="warning" />
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {items.map((item) => (
          <li key={item.id} className="py-4 first:pt-3 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="flex gap-3.5 flex-1 min-w-0">
              <span className={cx("w-10 h-10 shrink-0 rounded-lg flex items-center justify-center", TONE_FILL[item.tone], TONE_TEXT[item.tone])}>{itemIcon(item)}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-semibold text-[var(--foreground)] max-sm:order-2 max-sm:w-full">{item.title}</span>
                  <Badge label={item.badge} variant={item.tone} />
                </div>
                <p className="text-sm text-[var(--muted-foreground)] mt-1">{item.detail}</p>
              </div>
            </div>
            <LinkButton to={item.to} variant={item.urgent ? "primary" : "secondary"} className="shrink-0 max-sm:w-full">{item.action}</LinkButton>
          </li>
        ))}
      </ul>
      {financeClear && (
        <p className="mt-3 flex items-center gap-2 rounded-lg bg-[var(--success-surface)] text-[var(--success-text)] px-3 py-2.5 text-sm font-medium">
          <CheckIcon size={14} />No payments waiting for verification · no late payments
        </p>
      )}
    </Card>
  );
}

function Figure({ label, icon, value, sub, mono, to }: { label: string; icon: React.ReactNode; value: string; sub: string; mono?: boolean; to: string }) {
  return (
    <Link to={to} className="group block bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 sm:p-5 hover:border-[var(--accent)]/50 transition-colors">
      <div className="flex items-center justify-between text-sm text-[var(--muted-foreground)]">{label}<span aria-hidden="true">{icon}</span></div>
      <div className={mono ? "font-mono-data font-medium text-xl sm:text-2xl text-[var(--foreground)] mt-2 truncate" : "font-display text-3xl sm:text-4xl text-[var(--foreground)] mt-1"}>{value}</div>
      <div className="text-xs text-[var(--muted-foreground)] mt-1.5">{sub}</div>
    </Link>
  );
}

function Figures({ estates, staff, branchCount, payouts }: { estates: PortalEstate[] | null; staff: StaffMember[] | null; branchCount: number | null; payouts: Payout[] | null }) {
  const figures: React.ReactNode[] = [];
  if (estates) {
    const live = estates.filter((e) => e.status === "published").length;
    const notLive = estates.filter((e) => e.status === "published_not_live").length;
    const unpublished = estates.filter((e) => !e.published).length;
    figures.push(<Figure key="estates" label="Estates" icon={<MapPinIcon size={16} />} value={String(estates.length)} to="/portal/estates"
      sub={[`${live} live`, notLive ? `${notLive} published, not live` : null, unpublished ? `${unpublished} not published` : null].filter(Boolean).join(" · ")} />);
    const sum = (k: "totalPlots" | "soldPlots" | "reservedPlots" | "availablePlots") => estates.reduce((n, e) => n + e[k], 0);
    figures.push(<Figure key="plots" label="Plots" icon={<GridIcon size={16} />} value={String(sum("totalPlots"))} to="/portal/estates"
      sub={`${sum("soldPlots")} sold · ${sum("reservedPlots")} reserved · ${sum("availablePlots")} available`} />);
  }
  if (payouts) {
    // Per currency, never added across currencies; naira first.
    const paid = payouts.filter((p) => p.status === "success");
    const byCurrency = [...new Set(paid.map((p) => p.currency))].sort((a) => (a === "NGN" ? -1 : 1));
    const main = byCurrency[0] ?? "NGN";
    const total = paid.filter((p) => p.currency === main).reduce((n, p) => n + p.amount, 0);
    figures.push(<Figure key="paid" label="Paid out to you" icon={<WalletIcon size={16} />} value={formatInCurrency(total, main)} mono to="/portal/finance?tab=payouts"
      sub={paid.length ? `${paid.length} transfer${paid.length === 1 ? "" : "s"}${byCurrency.length > 1 ? ` · also in ${byCurrency.slice(1).join(", ")}` : ""}` : "Nothing paid out yet"} />);
  }
  if (staff) {
    const active = staff.filter((s) => s.status === "active").length;
    const pending = staff.filter((s) => s.status === "pending_verification").length;
    figures.push(<Figure key="team" label="Team" icon={<UsersIcon size={16} />} value={String(staff.length)} to="/portal/staff"
      sub={[`${active} active`, pending ? `${pending} not activated` : null, branchCount !== null ? `${branchCount} branch${branchCount === 1 ? "" : "es"}` : null].filter(Boolean).join(" · ")} />);
  }
  if (!figures.length) return null;
  return <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${figures.length >= 4 ? "lg:grid-cols-4" : figures.length === 3 ? "lg:grid-cols-3" : ""}`}>{figures}</div>;
}

function LiveEstates({ estates }: { estates: PortalEstate[] }) {
  const live = estates.filter((e) => e.status === "published").sort((a, b) => b.soldPlots - a.soldPlots || b.totalPlots - a.totalPlots).slice(0, 6);
  return (
    <Card as="section" aria-labelledby="live-heading">
      <div className="flex items-center justify-between mb-2">
        <h2 id="live-heading" className="font-semibold text-[var(--foreground)]">Live estates</h2>
        <TextLink to="/portal/estates" className="text-sm font-medium">All estates →</TextLink>
      </div>
      {live.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)] mt-2">None of your estates is on the marketplace yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {live.map((e) => (
            <li key={e.id}>
              <Link to={`/portal/estates/${e.id}`} className="group grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-x-6 gap-y-2 items-center py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-[var(--foreground)] group-hover:underline truncate">{e.name}</div>
                  <div className="text-xs text-[var(--muted-foreground)] truncate">{e.totalPlots} plot{e.totalPlots === 1 ? "" : "s"} · {estatePlace(e)}</div>
                </div>
                <div>
                  <SalesBar estate={e} />
                  <div className="text-xs text-[var(--muted-foreground)] mt-1.5">{e.soldPlots} sold · {e.reservedPlots} reserved · {e.availablePlots} available</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function QuickActions() {
  const { user } = useApp();
  const perms = user?.permissions ?? [];
  const actions: [React.ReactNode, string, string, string, boolean][] = [
    [<MapPinIcon key="e" size={17} />, "New estate", "Add land, its boundary and plots", "/portal/estates/new", canManageEstates(user)],
    [<UsersIcon key="s" size={17} />, canInviteStaff(user) ? "Invite staff" : "Request staff", "Give a colleague a role and a branch", "/portal/staff/new", canInviteStaff(user) || canRequestStaff(user)],
    [<FileTextIcon key="l" size={17} />, "Letters", "Letterheads, signatures and wording", "/portal/letters", perms.includes(DOCUMENTS_VIEW_PERMISSION)],
    [<BriefcaseIcon key="p" size={17} />, "Payout account", "Where HomeTrue sends your money", "/portal/payout-account", perms.includes(SETTLEMENT_MANAGE_PERMISSION)],
  ];
  const shown = actions.filter((a) => a[4]);
  if (!shown.length) return null;
  return (
    <Card as="section" aria-labelledby="quick-heading">
      <h2 id="quick-heading" className="font-semibold text-[var(--foreground)] mb-1">Quick actions</h2>
      <ul className="divide-y divide-[var(--border)]">
        {shown.map(([icon, title, hint, to]) => (
          <li key={to}>
            <Link to={to} className="group flex items-center gap-3 py-3 last:pb-0">
              <span className="w-9 h-9 shrink-0 rounded-lg bg-[var(--secondary)] text-[var(--secondary-foreground)] flex items-center justify-center">{icon}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-[var(--foreground)] group-hover:underline">{title}</span>
                <span className="block text-xs text-[var(--muted-foreground)]">{hint}</span>
              </span>
              <ChevronRightIcon size={16} className="text-[var(--muted-foreground)]" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}
