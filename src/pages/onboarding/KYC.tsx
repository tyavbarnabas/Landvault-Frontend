// /kyc — verify your identity, once, before a first purchase. From the Figma
// "KYC, list your company, verify" proposal: the same check checkout runs
// (KycFlow, kycService), on its own page in the buyer app, with what happens
// next beside it. It replaces a stand-alone demo page that never submitted.

import { useApp } from "../../contexts/AppContext";
import { useFetch } from "../../lib/useFetch";
import { fetchKycStatus } from "../../services/kycService";
import KycFlow from "../../components/checkout/KycFlow";
import LoadError from "../../components/LoadError";
import Page, { Loading } from "../../components/ui/Page";
import Card from "../../components/ui/Card";
import { LinkButton } from "../../components/ui/Button";
import { LockIcon, ShieldCheckIcon } from "../../components/icons";

export default function KYC() {
  const { user } = useApp();
  const record = useFetch(async () => (user ? fetchKycStatus(user) : null), [user?.email]);

  const page = (children: React.ReactNode) => (
    <Page title="Verify your identity"
      description="Needed once, before your first purchase. Browsing, saving estates and booking inspections don't need it.">
      {children}
    </Page>
  );

  if (record.loading && !record.data) return page(<Loading label="Checking your verification…" />);
  if (record.error) return page(<LoadError error={record.errorValue} what="your verification" onRetry={record.refetch} />);
  if (!record.data) return page(null);

  if (record.data.status === "approved") {
    return page(
      <Card className="max-w-xl text-center py-10 space-y-3 border-[var(--success-border)]" role="status">
        <span className="w-12 h-12 mx-auto rounded-xl bg-[var(--success-surface)] text-[var(--success-text)] flex items-center justify-center"><ShieldCheckIcon size={24} /></span>
        <h2 className="font-display text-2xl text-[var(--foreground)]">Identity verified</h2>
        <p className="text-sm text-[var(--muted-foreground)]">You can reserve and buy plots. Nothing else to do here.</p>
        <LinkButton to="/marketplace">Browse the marketplace</LinkButton>
      </Card>,
    );
  }

  return page(
    <div className="grid lg:grid-cols-[minmax(0,1fr)_22rem] gap-6 items-start">
      <Card className="sm:p-6">
        <KycFlow key={record.data.status} record={record.data} context="page" onApproved={(r) => record.setData(r)} />
      </Card>
      <Card as="section" aria-labelledby="kyc-next" className="space-y-4">
        <h2 id="kyc-next" className="font-semibold text-[var(--foreground)]">What happens next</h2>
        <ol className="space-y-3">
          {[
            ["You send your documents", "Here, once. You can keep browsing while you wait."],
            ["HomeTrue's team checks them", "A person compares them with your account. You'll see the result on this page."],
            ["You can reserve and buy", "The badge in the menu turns to “KYC verified”."],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="w-6 h-6 shrink-0 rounded-full bg-[var(--primary)] text-[var(--primary-foreground)] text-[11px] font-semibold flex items-center justify-center">{i + 1}</span>
              <span>
                <span className="block text-sm font-medium text-[var(--foreground)]">{t}</span>
                <span className="block text-xs text-[var(--muted-foreground)]">{d}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="flex gap-2.5 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted-foreground)]">
          <span className="text-[var(--primary)] shrink-0"><LockIcon size={15} /></span>
          Your documents are seen only by HomeTrue's verification team, never by developers or other buyers.
        </p>
      </Card>
    </div>,
  );
}
