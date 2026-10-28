// One purchase, as its buyer sees it — /purchases/:id. The status is always
// the SERVER's: a payment can be confirmed by Paystack's webhook without the
// buyer ever coming back (a tab closed during a bank transfer), so this page
// never relies on what happened in the browser.

import { useParams } from "react-router-dom";
import { formatInCurrency } from "../../data/mockData";
import { useFetch } from "../../lib/useFetch";
import LoadError from "../../components/LoadError";
import PurchaseStatusPanel from "../../components/purchases/PurchaseStatusPanel";
import PurchaseTimeline from "../../components/purchases/PurchaseTimeline";
import RefundPanel from "../../components/purchases/RefundPanel";
import ReceiptDownload from "../../components/documents/ReceiptDownload";
import Page, { Loading } from "../../components/ui/Page";
import Card from "../../components/ui/Card";
import Button, { LinkButton } from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import TextLink from "../../components/ui/TextLink";
import { purchaseBadge, purchaseTimeline, refundExpected } from "../../lib/purchaseStatus";
import { formatDay, formatDayTime } from "../../lib/formatDate";
import { ReceiptIcon } from "../../components/icons";
import { isAvailable } from "../../lib/backends";
import { fetchPurchase } from "../../services/paymentsService";
import { addressLines } from "../../services/addressService";
import OfferCard from "../../components/purchases/OfferCard";
import { fetchListingById } from "../../services/marketplaceService";
import { fetchPlotById, plotLabel } from "../../services/marketplacePlotsService";
import { fetchOwnedPlotById } from "../../services/portfolioService";
import { fetchDocumentsByPlotId } from "../../services/documentsService";
import PlanCard from "../../components/purchases/PlanCard";
import { PlanPaymentsCard, PlanScheduleCard } from "../../components/purchases/PlanScheduleCard";
import LetterCard from "../../components/purchases/LetterCard";
import { FlexibleNoticePanel, FlexiblePlanCard } from "../../components/purchases/FlexiblePlanCard";
import { PlanOptionsCard, PlanSettlementCard, StandingPanel } from "../../components/purchases/PlanStanding";
import { formatMoney } from "../../lib/formatCurrency";
import { frequencyWord } from "../../services/paymentPlansService";

export default function PurchaseDetail() {
  const { id } = useParams<{ id: string }>();
  const loaded = useFetch(async () => {
    const purchase = id ? await fetchPurchase(id) : null;
    if (!purchase) return { purchase: null, estateName: null, plot: null, owned: null, documents: [] };
    // Paid purchases are in the portfolio (by their transaction id) with a
    // plan's progress and payments, and have their documents.
    const paid = isAvailable("portfolio") && ["awaiting_finance", "on_plan", "verified", "withdrawn", "revoked"].includes(purchase.status);
    // Names for display only. An estate taken off the market still has its
    // purchase; it just shows without them.
    const [listing, plot, owned, documents] = await Promise.all([
      fetchListingById(purchase.estateId).catch(() => undefined),
      fetchPlotById(purchase.estateId, purchase.plotId).catch(() => undefined),
      paid && (purchase.schedule || purchase.flexible) ? fetchOwnedPlotById(purchase.id).catch(() => undefined) : undefined,
      paid ? fetchDocumentsByPlotId(purchase.id).catch(() => []) : [],
    ]);
    return { purchase, estateName: listing?.name ?? null, plot: plot ?? null, owned: owned ?? null, documents };
  }, [id]);

  if (loaded.loading && !loaded.data) return <Page title="Your purchase" back={{ to: "/purchases", label: "My purchases" }}><Loading label="Loading your purchase…" /></Page>;
  if (loaded.error) return <LoadError error={loaded.errorValue} what="this purchase" onRetry={loaded.refetch} />;
  const { purchase, estateName, plot, owned, documents } = loaded.data!;
  if (!purchase) {
    return (
      <Page title="Purchase not found" back={{ to: "/purchases", label: "My purchases" }}>
        <p className="text-sm text-[var(--muted-foreground)]">We couldn't find that purchase. <TextLink to="/purchases">See all your purchases</TextLink></p>
      </Page>
    );
  }

  const p = purchase.payment;
  const showRefund = refundExpected(purchase);
  // Paid purchases are in the portfolio from the moment they await finance.
  // Its transaction id keeps opening the plot after finance verifies it, when
  // the owned plot gets an id of its own.
  const inPortfolio = isAvailable("portfolio") && ["awaiting_finance", "on_plan", "verified"].includes(purchase.status);
  const schedule = purchase.schedule;
  // The final letter once the plot is the buyer's, else a plan's provisional one.
  const letter = documents.find((d) => d.type === "allocation_letter") ?? documents.find((d) => d.type === "provisional_allocation_letter");
  const badge = purchaseBadge(purchase);
  const steps = purchaseTimeline(purchase);
  const plan = schedule ? `${schedule.planName} · ${frequencyWord(schedule.frequency)}` : purchase.flexible ? `${purchase.flexible.planName} · flexible`
    : purchase.plan === "outright" ? "Pay in full" : "Instalments";
  // While a plan is late (or under notice) its standing panel says what to do;
  // "held for you on the plan" would only compete with it.
  const late = purchase.status === "on_plan" && (!!purchase.standing?.arrears || !!purchase.standing?.revocation?.notice || !!purchase.flexibleStanding?.notice);
  const flexibleRunning = !!purchase.flexible && (purchase.status === "on_plan" || purchase.status === "verified");
  const restructure = purchase.status === "on_plan" ? purchase.standing?.restructureStatus : null;
  return (
    <Page width="xl" back={{ to: "/purchases", label: "My purchases" }} eyebrow={purchase.reference}
      title={<span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">{plot ? plotLabel(plot) : estateName ?? "Your purchase"}<span className="font-[family-name:var(--font-body)] inline-flex flex-wrap gap-1.5"><Badge label={badge.label} variant={badge.tone} />{restructure === "requested" && <Badge label="Restructure requested" variant="neutral" />}{restructure === "proposed" && <Badge label="Restructure proposed" variant="info" />}</span></span>}
      description={[plot ? estateName : null, plot?.sizeSqm ? `${plot.sizeSqm} sqm` : null, `reserved ${formatDay(purchase.createdAt)}`].filter(Boolean).join(" · ")}
      actions={inPortfolio ? <LinkButton to={`/portfolio/${purchase.id}`} variant="secondary">View in portfolio</LinkButton> : undefined}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        <div className="space-y-6 min-w-0">
          {/* A notice of revocation or arrears comes first: what's owed and what to do. */}
          <StandingPanel purchase={purchase} onPay={() => document.getElementById("plan-heading")?.scrollIntoView({ behavior: "smooth", block: "start" })} />
          <FlexibleNoticePanel purchase={purchase} onPay={() => document.getElementById("plan-heading")?.scrollIntoView({ behavior: "smooth", block: "start" })} />
          {!late && <PurchaseStatusPanel purchase={purchase} refundShown={showRefund} />}
          <PlanSettlementCard purchase={purchase} />
          {showRefund && p && <RefundPanel paymentReference={p.reference} />}
          {schedule && !["rejected", "abandoned", "withdrawn", "revoked"].includes(purchase.status) && (
            <>
              <PlanCard purchase={purchase} owned={owned} onChanged={loaded.refetch} />
              <PlanScheduleCard purchase={purchase} owned={owned} />
              <PlanPaymentsCard purchase={purchase} owned={owned} documents={documents} />
            </>
          )}

          {flexibleRunning && (
            <>
              <FlexiblePlanCard purchase={purchase} onChanged={loaded.refetch} />
              <PlanPaymentsCard purchase={purchase} owned={owned} documents={documents} />
            </>
          )}

          <Card as="section" aria-labelledby="progress-heading">
            <h2 id="progress-heading" className="font-semibold text-[var(--foreground)] mb-4">Progress</h2>
            <PurchaseTimeline steps={steps} />
          </Card>

          <Card as="section" aria-labelledby="details-heading">
            <h2 id="details-heading" className="font-semibold text-[var(--foreground)] mb-3">Purchase details</h2>
            <dl className="space-y-2.5 text-sm">
              {estateName && <Row label="Estate" value={estateName} />}
              {plot && <Row label="Plot" value={`${plotLabel(plot)}${plot.sizeSqm ? ` · ${plot.sizeSqm} sqm` : ""}`} />}
              <Row label="Agreed price" value={formatInCurrency(purchase.totalPrice, purchase.currency)} mono />
              {schedule && <Row label="Plan total" value={formatMoney(schedule.planTotal, purchase.currency)} mono />}
              {purchase.flexible && <Row label="Plan total" value={formatMoney(purchase.flexible.planTotal, purchase.currency)} mono />}
              {purchase.cornerPremiumPct !== null && <Row label="Includes corner premium" value={`${purchase.cornerPremiumPct}%`} />}
              <Row label="Payment plan" value={plan} />
              <Row label="Use" value={purchase.intent === "investment" ? "To hold as an investment" : "To build on it (development)"} />
            </dl>
            {/* The copy taken when the purchase was opened — what its letter
                prints. Never the account's current address: older purchases
                without one show nothing. */}
            {purchase.buyerAddress && (
              <div className="flex justify-between gap-4 mt-4 pt-4 border-t border-[var(--border)] text-sm">
                <div>
                  <div className="text-[var(--muted-foreground)]">Address on this purchase</div>
                  <div className="text-xs text-[var(--muted-foreground)]">As printed on its allocation letter</div>
                </div>
                <address className="not-italic text-right text-[var(--foreground)] leading-relaxed wrap-anywhere">
                  {addressLines(purchase.buyerAddress).map((line) => <div key={line}>{line}</div>)}
                </address>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {letter && <LetterCard letter={letter} />}
          <PlanOptionsCard purchase={purchase} />
          {/* A plan's payments are in its history; this is a single payment's card. */}
          {p && !schedule && !flexibleRunning && (
            <Card as="section" aria-labelledby="payment-heading">
              <h2 id="payment-heading" className="font-semibold text-[var(--foreground)] mb-3">Payment</h2>
              <dl className="space-y-2.5 text-sm">
                {p.amountPaid != null && <Row label="Amount paid" value={formatInCurrency(p.amountPaid, purchase.currency)} mono />}
                {p.paidAt && <Row label="Paid on" value={formatDayTime(p.paidAt)} />}
                <Row label="Paid with" value="Paystack" />
              </dl>
              <div className="rounded-lg bg-[var(--muted)] px-3 py-2.5 mt-3">
                <div className="text-xs text-[var(--muted-foreground)]">Payment reference</div>
                <div className="font-mono-data text-xs text-[var(--foreground)] break-all">{p.reference}</div>
              </div>
              {p.receiptId && p.receiptNumber && (
                <div className="flex items-center gap-3 border border-[var(--border)] rounded-lg px-3 py-2.5 mt-3">
                  <span className="w-8 h-8 shrink-0 rounded-lg bg-[var(--secondary)] text-[var(--secondary-foreground)] flex items-center justify-center"><ReceiptIcon size={16} /></span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[var(--foreground)]">Receipt</div>
                    <ReceiptDownload receiptId={p.receiptId} receiptNumber={p.receiptNumber} />
                  </div>
                </div>
              )}
            </Card>
          )}
          {purchase.offer && <OfferCard purchase={purchase} onChanged={loaded.refetch} />}
          <Card as="section" aria-labelledby="help-heading">
            <h2 id="help-heading" className="font-semibold text-[var(--foreground)] mb-1">Need help?</h2>
            <p className="text-sm text-[var(--muted-foreground)] mb-3">Quote <span className="font-mono-data">{purchase.reference}</span> when you contact support about this purchase.</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
              <TextLink to="/support" className="font-medium">Contact support →</TextLink>
              <Button variant="link" onClick={loaded.refetch}>Refresh status</Button>
            </div>
          </Card>
        </div>
      </div>
    </Page>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--muted-foreground)]">{label}</dt>
      <dd className={`text-right text-[var(--foreground)] ${mono ? "font-mono-data" : ""}`}>{value}</dd>
    </div>
  );
}

