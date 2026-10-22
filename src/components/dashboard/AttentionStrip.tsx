// The buyer dashboard's "what should I do?" list, from the Figma dashboard
// proposal: one row per item, with an icon, a status badge, what's going on,
// and one button. Nothing here is a statistic.
//
// Distinct from AttentionPanel.tsx, which is the Super Admin console's
// equivalent (counts of queued platform work, not a single person's to-do
// list). Both share the same discipline: when there's nothing to do, say so
// plainly rather than padding the space with numbers.

import Card from "../ui/Card";
import Badge from "../ui/Badge";
import { LinkButton } from "../ui/Button";
import { cx } from "../ui/cx";
import { TONE_FILL, type Tone } from "../ui/tones";
import { AlertIcon, CheckIcon, ClockIcon, CreditCardIcon, FileCheckIcon, ReceiptIcon, ShieldCheckIcon, TrendingUpIcon, WalletIcon } from "../icons";
import type { AttentionItem, AttentionType, PurchaseStage } from "../../services/attentionService";

interface Look {
  badge: string;
  tone: Tone;
  icon: React.ReactNode;
  action: string;
}

const PURCHASE_LOOK: Record<PurchaseStage, Omit<Look, "action">> = {
  pay: { badge: "Awaiting payment", tone: "warning", icon: <CreditCardIcon size={20} /> },
  payment_failed: { badge: "Payment didn't go through", tone: "error", icon: <CreditCardIcon size={20} /> },
  verifying: { badge: "Being verified", tone: "info", icon: <ShieldCheckIcon size={20} /> },
  on_plan: { badge: "On instalment plan", tone: "info", icon: <CreditCardIcon size={20} /> },
  under_review: { badge: "Under review", tone: "info", icon: <ShieldCheckIcon size={20} /> },
  refund: { badge: "Refund", tone: "warning", icon: <ReceiptIcon size={20} /> },
};

const LOOK: Record<Exclude<AttentionType, "purchase">, (item: AttentionItem) => Look> = {
  arrears: () => ({ badge: "Overdue", tone: "error", icon: <AlertIcon size={20} />, action: "View options" }),
  payment_due: (item) => ({ badge: item.severity === "urgent" ? "Payment due" : "Due soon", tone: item.severity === "urgent" ? "warning" : "neutral", icon: <ClockIcon size={20} />, action: "Pay now" }),
  upgrade_delta_due: () => ({ badge: "Payment due", tone: "warning", icon: <WalletIcon size={20} />, action: "Complete payment" }),
  document_issued: () => ({ badge: "New", tone: "info", icon: <FileCheckIcon size={20} />, action: "Open vault" }),
  price_change: () => ({ badge: "Price change", tone: "info", icon: <TrendingUpIcon size={20} />, action: "View listing" }),
};

function lookFor(item: AttentionItem): Look {
  if (item.type === "purchase") {
    const stage = PURCHASE_LOOK[item.stage ?? "verifying"];
    return { ...stage, action: item.actionLabel ?? "View purchase" };
  }
  return LOOK[item.type](item);
}

// The icon tile's text colour, per tone.
const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-[var(--muted-foreground)]",
  info: "text-[var(--info-text)]",
  warning: "text-[var(--warning-text)]",
  success: "text-[var(--success-text)]",
  error: "text-[var(--error-text)]",
};

function AttentionRow({ item }: { item: AttentionItem }) {
  const look = lookFor(item);
  // Money owed or a clock running gets the solid button; the rest a quiet one.
  const primary = item.severity === "urgent";
  return (
    <li className="py-4 first:pt-2 last:pb-0 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
      <div className="flex gap-3.5 flex-1 min-w-0">
        <span className={cx("w-10 h-10 shrink-0 rounded-lg flex items-center justify-center", TONE_FILL[look.tone], TONE_TEXT[look.tone])}>{look.icon}</span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-[var(--foreground)] max-sm:order-2 max-sm:w-full">{item.title}</span>
            <Badge label={look.badge} variant={look.tone} />
          </div>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">{item.detail}</p>
        </div>
      </div>
      <LinkButton to={item.targetRoute} variant={primary ? "primary" : "secondary"} className="shrink-0 max-sm:w-full">{look.action}</LinkButton>
    </li>
  );
}

export default function AttentionStrip({ items, loading, error }: { items: AttentionItem[]; loading: boolean; error: boolean }) {
  // An empty dashboard is the correct result, not a gap to fill with
  // statistics — see the rule at the top of Dashboard.tsx.
  if (!loading && !error && items.length === 0) {
    return (
      <section aria-labelledby="attention-heading" className="flex items-center gap-3 rounded-xl bg-[var(--success-surface)] text-[var(--success-text)] px-4 sm:px-5 py-4">
        <span className="w-9 h-9 shrink-0 rounded-lg bg-[var(--card)] flex items-center justify-center"><CheckIcon size={18} /></span>
        <div>
          <h2 id="attention-heading" className="text-sm font-semibold">You're all caught up</h2>
          <p className="text-sm">Nothing needs your attention. Payments due, purchases in progress and new documents will show here.</p>
        </div>
      </section>
    );
  }

  return (
    <Card as="section" aria-labelledby="attention-heading">
      <div className="flex items-center gap-2">
        <h2 id="attention-heading" className="font-semibold text-[var(--foreground)]">Needs your attention</h2>
        {!loading && !error && <Badge label={String(items.length)} variant="warning" />}
      </div>
      {loading && <p className="text-sm text-[var(--muted-foreground)] mt-3">Checking…</p>}
      {!loading && error && <p className="text-sm text-[var(--muted-foreground)] mt-3">Couldn't check what needs your attention right now.</p>}
      {!loading && !error && (
        <ul className="divide-y divide-[var(--border)]">
          {items.map((item) => <AttentionRow key={item.id} item={item} />)}
        </ul>
      )}
    </Card>
  );
}
