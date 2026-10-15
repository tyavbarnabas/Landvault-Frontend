// One purchase, as its buyer sees it — /purchases/:id. The status is always
// the SERVER's: a payment can be confirmed by Paystack's webhook without the
// buyer ever coming back (a tab closed during a bank transfer), so this page
// never relies on what happened in the browser.

import { useParams } from "react-router-dom";
import { formatInCurrency } from "../../data/mockData";
import { useFetch } from "../../lib/useFetch";
import LoadError from "../../components/LoadError";
import PurchaseStatusPanel from "../../components/purchases/PurchaseStatusPanel";
import RefundPanel from "../../components/purchases/RefundPanel";
import Page from "../../components/ui/Page";
import Card from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import TextLink from "../../components/ui/TextLink";
import { refundExpected } from "../../lib/purchaseStatus";
import { fetchPurchase } from "../../services/paymentsService";
import { fetchListingById } from "../../services/marketplaceService";
import { fetchPlotById, plotLabel } from "../../services/marketplacePlotsService";

export default function PurchaseDetail() {
  const { id } = useParams<{ id: string }>();
  const loaded = useFetch(async () => {
    const purchase = id ? await fetchPurchase(id) : null;
    if (!purchase) return { purchase: null, estateName: null, plot: null };
    // Names for display only. An estate taken off the market still has its
    // purchase; it just shows without them.
    const [listing, plot] = await Promise.all([
      fetchListingById(purchase.estateId).catch(() => undefined),
      fetchPlotById(purchase.estateId, purchase.plotId).catch(() => undefined),
    ]);
    return { purchase, estateName: listing?.name ?? null, plot: plot ?? null };
  }, [id]);

  if (loaded.loading && !loaded.data) return <div className="p-8 text-sm text-[var(--muted-foreground)]">Loading your purchase…</div>;
  if (loaded.error) return <LoadError error={loaded.errorValue} what="this purchase" onRetry={loaded.refetch} />;
  const { purchase, estateName, plot } = loaded.data!;
  if (!purchase) {
    return (
      <div className="p-8 text-sm text-[var(--muted-foreground)]">
        We couldn't find that purchase. <TextLink to="/marketplace">Back to the marketplace</TextLink>
      </div>
    );
  }

  const p = purchase.payment;
  const showRefund = refundExpected(purchase);
  return (
    <Page title={estateName ?? "Your purchase"} eyebrow={purchase.reference} titleSize="md" width="md"
      description={plot ? `${plotLabel(plot)}${plot.sizeSqm ? ` · ${plot.sizeSqm} sqm` : ""}` : undefined}>
      <div className="space-y-6">

      <PurchaseStatusPanel purchase={purchase} refundShown={showRefund} />

      {showRefund && p && <RefundPanel paymentReference={p.reference} />}

      <Card as="dl" padding="md" className="text-sm grid grid-cols-2 gap-y-2">
        <dt className="text-[var(--muted-foreground)]">Agreed price</dt>
        <dd className="text-right font-mono-data">{formatInCurrency(purchase.totalPrice, purchase.currency)}</dd>
        {purchase.cornerPremiumPct !== null && (
          <>
            <dt className="text-[var(--muted-foreground)]">Includes corner premium</dt>
            <dd className="text-right">{purchase.cornerPremiumPct}%</dd>
          </>
        )}
        <dt className="text-[var(--muted-foreground)]">Payment plan</dt>
        <dd className="text-right capitalize">{purchase.plan}</dd>
        {p?.amountPaid != null && (
          <>
            <dt className="text-[var(--muted-foreground)]">Paystack confirmed</dt>
            <dd className="text-right font-mono-data">{formatInCurrency(p.amountPaid, purchase.currency)}</dd>
          </>
        )}
        {p?.paidAt && (
          <>
            <dt className="text-[var(--muted-foreground)]">Paid on</dt>
            <dd className="text-right">{new Date(p.paidAt).toLocaleString()}</dd>
          </>
        )}
        {p && (
          <>
            <dt className="text-[var(--muted-foreground)]">Payment reference</dt>
            <dd className="text-right font-mono-data text-xs break-all">{p.reference}</dd>
          </>
        )}
      </Card>

      <div className="flex justify-between text-sm">
        <TextLink to="/marketplace" muted>← Marketplace</TextLink>
        <Button variant="link" onClick={loaded.refetch}>Refresh status</Button>
      </div>
      </div>
    </Page>
  );
}
