import { useState } from "react";
import LoadError from "../../../components/LoadError";
import { useParams, Link } from "react-router-dom";
import { useFetch } from "../../../lib/useFetch";
import { formatAmount } from "../../../data/mockData";
import {
  BOUNDARY_REVIEW_THRESHOLD_PCT, EstateEditError, addEstateBoundary, correctEstateBoundary, fetchBoundaryChanges,
  estatePlace, fetchEstateGeoJson, fetchPortalEstateById, isReadOnlyForScope, withdrawBoundaryChange, type BoundaryChange,
  type EstateBoundaryResult, type GeoJsonPolygon, type PortalScope,
} from "../../../services/portalEstatesService";
import BoundaryField from "../../../components/portal/BoundaryField";
import ConflictChangesView from "../../../components/portal/ConflictChangesView";
import { Field, inputClass } from "../../../components/portal/formParts";
import { canManageEstates } from "../../../services/authService";
import { useApp } from "../../../contexts/AppContext";
import PublicationPanel from "../../../components/portal/PublicationPanel";
import StatusBadge, { boundaryChangeBadge, letterApprovalBadge, portalEstateStatusBadge, titleStatusBadge, type BadgeVariant } from "../../../components/StatusBadge";
import EstateBoundaryMap from "../../../components/map/EstateBoundaryMap";
import { usePortalScope } from "../usePortalScope";
import { ownershipLabel, useBranchNames } from "../useBranchNames";
import { ReadOnlyNotice } from "./PortalEstateInventory";
import { PHOTO_LIMIT, fetchEstatePhotos } from "../../../services/estatePhotosService";
import { fetchEstateTitle } from "../../../services/estateTitleService";
import { fetchLetterApproval } from "../../../services/lettersService";
import { DOCUMENTS_VIEW_PERMISSION } from "../../../services/authService";
import { describeChanges } from "./PortalEstateLetter";
import Page, { Loading } from "../../../components/ui/Page";
import Card from "../../../components/ui/Card";
import Alert from "../../../components/ui/Alert";
import TextLink from "../../../components/ui/TextLink";
import Button, { LinkButton } from "../../../components/ui/Button";
import SalesBar from "../../../components/portal/SalesBar";
import { CalendarIcon, FileCheckIcon, ImageIcon, ReceiptIcon, ShieldCheckIcon } from "../../../components/icons";
import { fetchPaymentPlans } from "../../../services/paymentPlansService";

export default function PortalEstateDetail() {
  const { estateId } = useParams<{ estateId: string }>();
  const scope = usePortalScope();
  const { user } = useApp();
  const mayManage = canManageEstates(user);
  const branchNames = useBranchNames(scope);

  const loaded = useFetch(async () => {
    if (!scope || !estateId) return null;
    const [estate, boundary] = await Promise.all([
      fetchPortalEstateById(estateId, scope),
      fetchEstateGeoJson(estateId, scope),
    ]);
    return { estate, boundary };
  }, [scope?.tenantId, scope?.branchId, estateId]);

  const [boundaryResult, setBoundaryResult] = useState<EstateBoundaryResult | null>(null);

  // Only the first load blanks the page — a refetch after adding a boundary
  // keeps its result on screen.
  if (loaded.loading && !loaded.data) return <Page title="Estate" back={{ to: "/portal/estates", label: "Estates" }}><Loading label="Loading estate…" /></Page>;
  if (loaded.error) return <LoadError error={loaded.errorValue} what="this estate" onRetry={loaded.refetch} />;

  const estate = loaded.data?.estate;
  if (!estate) {
    // Covers both "doesn't exist" and "not in your scope" — deliberately not
    // distinguished, since telling a branch manager an estate exists but
    // isn't theirs leaks the very thing scoping withholds.
    return (
      <Page title="Estate not found" back={{ to: "/portal/estates", label: "Estates" }}>
        <p className="text-sm text-[var(--muted-foreground)]">It doesn't exist, or it isn't one you can see.</p>
      </Page>
    );
  }

  const badge = portalEstateStatusBadge(estate.status);
  // EB-2: branch staff see a company-level estate but can't change it.
  const readOnly = isReadOnlyForScope(estate, scope);
  const canManage = mayManage && !readOnly;
  const boundary = loaded.data?.boundary ?? null;
  const facts = [estatePlace(estate), ownershipLabel(estate.branchId, branchNames), estate.areaSqm ? `${(estate.areaSqm / 10_000).toFixed(2)} ha` : null].filter(Boolean).join(" · ");
  const fees = estate.eligibility ? estate.eligibility.feesDeclared && estate.eligibility.refundTermsDeclared : null;

  return (
    <Page width="xl" back={{ to: "/portal/estates", label: "Estates" }}
      title={<span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">{estate.name}<span className="font-[family-name:var(--font-body)] inline-flex"><StatusBadge label={estate.status === "published" ? "Live on the marketplace" : badge.label} variant={badge.variant} /></span></span>}
      description={facts}
      actions={
        <div className="flex flex-wrap gap-2">
          {estate.status === "published" && <LinkButton to={`/marketplace/${estate.id}`} variant="secondary">View on marketplace</LinkButton>}
          {canManage && <LinkButton to={`/portal/estates/${estate.id}/edit`} variant="secondary">Edit details</LinkButton>}
        </div>
      }>
      <div className="space-y-6">
        {readOnly && <ReadOnlyNotice />}
        {estate.description && <p className="text-sm text-[var(--foreground)] leading-relaxed max-w-3xl">{estate.description}</p>}

        {estate.plotsWithoutBoundary > 0 && (
          <Alert role="note">
            <span className="font-semibold">
              {estate.plotsWithoutBoundary} {estate.plotsWithoutBoundary === 1 ? "plot isn't" : "plots aren't"} on the map.
            </span>{" "}
            {estate.plotsWithoutBoundary === 1 ? "It has" : "They have"} no surveyed boundary, so buyers see “boundary not surveyed” and
            HomeTrue can't check {estate.plotsWithoutBoundary === 1 ? "it" : "them"} for double allocation. Add boundaries in{" "}
            <Link to={`/portal/estates/${estate.id}/inventory`} className="underline">Inventory</Link>.
          </Alert>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
          <div className="space-y-6 min-w-0">
            <Card as="section" aria-labelledby="inventory-heading">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <h2 id="inventory-heading" className="font-semibold text-[var(--foreground)]">Inventory</h2>
                <LinkButton to={`/portal/estates/${estate.id}/inventory`} variant={estate.totalPlots === 0 ? "primary" : "secondary"}>Manage tiers &amp; plots</LinkButton>
              </div>
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Plots" value={estate.totalPlots} />
                <Stat label="Available" value={estate.availablePlots} />
                <Stat label="Reserved" value={estate.reservedPlots} />
                <Stat label="Sold" value={estate.soldPlots} />
              </dl>
              {estate.totalPlots === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)] mt-3">No plots yet. Add price tiers, then create plots priced by them.</p>
              ) : (
                <div className="mt-4">
                  <SalesBar estate={estate} />
                  <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 mt-2 text-xs text-[var(--muted-foreground)]">
                    <span>{estate.soldPlots} sold · {estate.reservedPlots} reserved · {estate.availablePlots} available{estate.withheldPlots ? ` · ${estate.withheldPlots} withheld` : ""}</span>
                    {estate.priceTo > 0 && <span className="font-mono-data text-sm text-[var(--foreground)]">{formatAmount(estate.priceFrom, estate.currency)} – {formatAmount(estate.priceTo, estate.currency)}</span>}
                  </div>
                </div>
              )}
            </Card>

            <section aria-labelledby="setup-heading">
              <h2 id="setup-heading" className="font-semibold text-[var(--foreground)] mb-3">Listing setup</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {scope && <PhotosSummary estateId={estate.id} estateName={estate.name} scope={scope} canManage={canManage} />}
                <SetupCard icon={<ReceiptIcon size={16} />} title="Fees & terms" to={`/portal/estates/${estate.id}/disclosure`} link="Fees & terms"
                  badge={fees === null ? undefined : fees ? { label: "Declared", variant: "success" } : { label: "Not declared", variant: "warning" }}
                  line={fees === false ? "A fee schedule and refund terms are needed to publish." : "Fee schedule, refund terms and default terms."}
                  hint="What a buyer sees before committing, and a preview of how it reads." />
                {scope && <PlansSummary estateId={estate.id} />}
                {scope && <TitleSummary estateId={estate.id} scope={scope} canManage={canManage} />}
                {scope && user?.permissions?.includes(DOCUMENTS_VIEW_PERMISSION) && <LetterSummary estateId={estate.id} scope={scope} />}
              </div>
            </section>

            <Card as="section" aria-labelledby="boundary-heading">
              <h2 id="boundary-heading" className="font-semibold text-[var(--foreground)] mb-3">Boundary</h2>
              {boundary ? (
                <>
                  <EstateBoundaryMap boundary={boundary} label={`${estate.name} boundary on satellite imagery`} />
                  <p className="text-xs text-[var(--muted-foreground)] mt-2">
                    Check the outline sits over the right ground. A swapped coordinate pair can still fall inside Nigeria, so the imagery is the
                    only reliable confirmation.
                  </p>
                </>
              ) : (
                // No boundary means no map — never an empty one centred on nothing.
                <>
                  <p className="text-sm text-[var(--muted-foreground)] mb-4">
                    No boundary yet. An estate can stay a draft until it's surveyed, but it can't be published without one — without a
                    boundary it can't be checked against neighbouring land.
                  </p>
                  {canManage && scope && (
                    <AddBoundary estateId={estate.id} scope={scope} onAdded={(result) => { setBoundaryResult(result); loaded.refetch(); }} />
                  )}
                </>
              )}
              {boundaryResult && <BoundaryAddedResult result={boundaryResult} />}
              {/* FP-2: correcting a boundary that's already set, and its history. */}
              {boundary && scope && (
                <BoundaryCorrection
                  estateId={estate.id}
                  published={!!estate.eligibility?.published}
                  canManage={canManage}
                  scope={scope}
                  onApplied={loaded.refetch}
                />
              )}
            </Card>
          </div>

          <div className="space-y-6">
            <PublicationPanel estate={estate} scope={scope!} canManage={canManage} onChanged={loaded.refetch} />
            <Card as="section" aria-labelledby="features-heading">
              <h2 id="features-heading" className="font-semibold text-[var(--foreground)] mb-2">Features</h2>
              <p className="text-sm font-medium text-[var(--foreground)]">Corner premium {estate.cornerPremiumPct}%</p>
              {estate.amenities.length > 0 && <p className="text-sm text-[var(--muted-foreground)] mt-1">{estate.amenities.join(" · ")}</p>}
            </Card>
          </div>
        </div>
      </div>
    </Page>
  );
}

// One part of a listing's setup: its state, one line, and where to change it.
// The estate's payment plans: optional — with none, buyers pay in full.
function PlansSummary({ estateId }: { estateId: string }) {
  const { data } = useFetch(() => fetchPaymentPlans(estateId), [estateId]);
  const plans = data?.plans ?? [];
  return (
    <SetupCard icon={<CalendarIcon size={16} />} title="Payment plans" to={`/portal/estates/${estateId}/disclosure?tab=plans`} link="Payment plans"
      badge={data ? { label: plans.length ? `${plans.length} plan${plans.length === 1 ? "" : "s"}` : "Outright only", variant: "neutral" } : undefined}
      line={data ? (plans.length ? plans.map((p) => p.name).join(" · ") : "No instalment plans declared.") : "Loading…"}
      hint="Optional. With none declared, buyers pay in full." />
  );
}

function SetupCard({ icon, title, badge, line, hint, to, link, tone, children }: {
  icon: React.ReactNode; title: string; badge?: { label: string; variant: BadgeVariant }; line?: React.ReactNode; hint?: React.ReactNode;
  to: string; link: string; tone?: "error"; children?: React.ReactNode;
}) {
  return (
    <Card as="section" aria-label={title} className="flex flex-col">
      <div className="flex items-center gap-2.5 mb-2">
        <span className={`w-8 h-8 shrink-0 rounded-lg flex items-center justify-center ${tone === "error" ? "bg-[var(--error-surface)] text-[var(--error-text)]" : "bg-[var(--secondary)] text-[var(--secondary-foreground)]"}`}>{icon}</span>
        <h3 className="flex-1 font-semibold text-[var(--foreground)]">{title}</h3>
        {badge && <StatusBadge label={badge.label} variant={badge.variant} />}
      </div>
      {children}
      {line && <div className="text-sm font-medium text-[var(--foreground)]">{line}</div>}
      {hint && <p className="text-xs text-[var(--muted-foreground)] mt-1">{hint}</p>}
      <TextLink to={to} className="text-sm font-medium mt-auto pt-3">{link} →</TextLink>
    </Card>
  );
}

// POST .../boundary — only for an estate with none. Checked at once against
// every other estate; the result says whether that blocks publication.
function AddBoundary({ estateId, scope, onAdded }: { estateId: string; scope: PortalScope; onAdded: (result: EstateBoundaryResult) => void }) {
  const [polygon, setPolygon] = useState<GeoJsonPolygon | null>(null);
  const [unresolved, setUnresolved] = useState(false);
  const [error, setError] = useState("");
  const [outsideState, setOutsideState] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!polygon) return;
    setSaving(true);
    setError("");
    setOutsideState(false);
    try {
      onAdded(await addEstateBoundary(estateId, polygon, scope));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the boundary.");
      setOutsideState(err instanceof EstateEditError && err.code === "BOUNDARY_OUTSIDE_STATE");
      setSaving(false);
    }
  };

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-[var(--foreground)]">Add a boundary</h3>
      <BoundaryField
        label="Estate boundary"
        intro="A GeoJSON Polygon in [longitude, latitude] order, with the ring closed — the last coordinate repeats the first."
        onChange={(state) => { setPolygon(state.polygon); setUnresolved(state.hasUnresolvedInput); setError(""); }}
      />
      <p className="text-xs text-[var(--muted-foreground)]">
        Once saved it's checked straight away for overlaps with other estates on the platform, and it can't be changed afterwards.
        Any plots that already have shapes must sit inside it.
      </p>
      {error && <p className="text-sm text-[var(--error-text)]" role="alert">{error}</p>}
      {/* SB-1. Usually a swapped coordinate pair or the wrong state chosen.
          For a genuinely disputed border, support can verify the state by
          hand — and needs this id to do it. */}
      {outsideState && (
        <p className="text-xs text-[var(--muted-foreground)]">
          Check the coordinates aren't swapped, or correct the estate's state under Edit details. If the land genuinely sits on a
          disputed border, contact support and quote this estate's id: <span className="font-mono-data text-[var(--foreground)] select-all">{estateId}</span>
        </p>
      )}
      <Button onClick={submit} disabled={!polygon || unresolved || saving}>{saving ? "Checking and saving…" : "Save boundary"}</Button>
    </div>
  );
}

// Never names the other company — only whether publication is blocked.
function BoundaryAddedResult({ result }: { result: EstateBoundaryResult }) {
  return (
    <div className="mt-3 space-y-2" role="status">
      <p className="text-sm text-[var(--foreground)]">
        Boundary saved{result.footprintAreaSqm !== null ? ` — ${result.footprintAreaSqm.toLocaleString()} sqm` : ""}.
      </p>
      {result.publicationBlocked ? (
        <Alert>{result.blockReason ?? "This boundary overlaps land registered by another company."} It can't be published until that's resolved.</Alert>
      ) : (
        <p className="text-sm text-[var(--muted-foreground)]">No overlap with another company's land blocks publication.</p>
      )}
      {result.warningConflictCount > 0 && (
        <p className="text-xs text-[var(--muted-foreground)]">
          It overlaps {result.warningConflictCount} of your own {result.warningConflictCount === 1 ? "estate" : "estates"}. That doesn't block
          publication, but it's worth checking.
        </p>
      )}
      <ConflictChangesView changes={result.conflictChanges} />
    </div>
  );
}

// ─── Correcting a boundary (FP-2) ────────────────────────────────────────────

function BoundaryCorrection({ estateId, published, canManage, scope, onApplied }: {
  estateId: string; published: boolean; canManage: boolean; scope: PortalScope; onApplied: () => void;
}) {
  const history = useFetch(() => fetchBoundaryChanges(estateId, scope), [estateId]);
  const [open, setOpen] = useState(false);
  const [polygon, setPolygon] = useState<GeoJsonPolygon | null>(null);
  const [unresolved, setUnresolved] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<BoundaryChange | null>(null);
  const changes = history.data ?? [];
  const pending = changes.find((c) => c.status === "pending");

  const submit = async () => {
    if (!polygon) return;
    setSaving(true);
    setError(null);
    try {
      const change = await correctEstateBoundary(estateId, polygon, reason, scope);
      setResult(change);
      setOpen(false);
      setReason("");
      history.refetch();
      if (change.status === "applied") onApplied();
    } catch (err) {
      setError(err instanceof EstateEditError ? { field: err.field, message: err.message } : { field: "boundary", message: "Couldn't change the boundary." });
    } finally {
      setSaving(false);
    }
  };

  const withdraw = async (changeId: string) => {
    setError(null);
    try {
      await withdrawBoundaryChange(estateId, changeId, scope);
      setResult(null);
      history.refetch();
    } catch (err) {
      setError({ field: "history", message: err instanceof Error ? err.message : "Couldn't withdraw it." });
    }
  };

  return (
    <div className="mt-4 space-y-4">
      {canManage && !open && !pending && (
        <Button variant="secondary" onClick={() => { setOpen(true); setResult(null); }}>Correct the boundary</Button>
      )}

      {canManage && open && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-[var(--foreground)]">Correct the boundary</h3>
          {/* Said before submitting: which corrections wait for a person. */}
          <p className="text-xs text-[var(--muted-foreground)]">
            {published
              ? `This estate is published. A small correction applies at once; if more than ${BOUNDARY_REVIEW_THRESHOLD_PCT}% of its land changes (land added plus land removed), our team reviews it first and the current boundary stays live until then.`
              : "This estate isn't published, so the correction applies at once."}{" "}
            Every plot that already has a shape must still sit inside it.
          </p>
          <BoundaryField
            inputId="correct-boundary"
            label="Corrected boundary"
            intro="A GeoJSON Polygon in [longitude, latitude] order, with the ring closed."
            onChange={(state) => { setPolygon(state.polygon); setUnresolved(state.hasUnresolvedInput); setError(null); }}
          />
          <Field id="correct-reason" label="Why did it change?" hint="Kept in the boundary history and shown to a reviewer."
            error={error?.field === "reason" ? error.message : undefined}>
            <input id="correct-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Re-survey corrected the north-east pillar" className={inputClass} />
          </Field>
          {error && error.field !== "reason" && error.field !== "history" && <p className="text-sm text-[var(--error-text)]" role="alert">{error.message}</p>}
          <div className="flex gap-3">
            <Button onClick={submit} disabled={!polygon || unresolved || saving}>{saving ? "Checking…" : "Submit correction"}</Button>
            <Button variant="secondary" onClick={() => { setOpen(false); setError(null); }}>Cancel</Button>
          </div>
        </div>
      )}

      {result && <CorrectionResult change={result} />}

      {changes.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wide mb-2">Boundary history</h3>
          {error?.field === "history" && <p className="text-sm text-[var(--error-text)] mb-2" role="alert">{error.message}</p>}
          <ul className="space-y-2">
            {changes.map((c) => {
              const badge = boundaryChangeBadge(c.status);
              return (
                <li key={c.id} className="bg-[var(--card)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge label={badge.label} variant={badge.variant} />
                    <span className="text-xs text-[var(--muted-foreground)]">{new Date(c.createdAt).toLocaleDateString()}</span>
                    {c.changedPct !== null && <span className="text-xs text-[var(--muted-foreground)] font-mono-data">{c.changedPct}% of the land changed</span>}
                    {canManage && c.status === "pending" && (
                      <Button variant="link" onClick={() => withdraw(c.id)} className="ml-auto text-xs">Withdraw</Button>
                    )}
                  </div>
                  <p className="text-[var(--foreground)]">{c.reason}</p>
                  {c.decisionNote && <p className="text-xs text-[var(--muted-foreground)]">Reviewer: {c.decisionNote}</p>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function CorrectionResult({ change }: { change: BoundaryChange }) {
  if (change.status === "pending") {
    return (
      <Alert role="status">
        Sent for review — {change.changedPct}% of the land changes, over the {BOUNDARY_REVIEW_THRESHOLD_PCT}% that a published estate can change
        without a check. The current boundary stays live until our team decides. You can withdraw it from the history below.
      </Alert>
    );
  }
  return (
    <div className="rounded-lg bg-[var(--muted)] p-3 space-y-2" role="status">
      <p className="text-sm text-[var(--foreground)]">
        Boundary corrected: {change.previousAreaSqm?.toLocaleString()} → {change.proposedAreaSqm?.toLocaleString()} sqm
        {change.changedPct !== null ? ` (${change.changedPct}% of the land changed)` : ""}.
      </p>
      {change.publicationBlocked && (
        <p className="text-sm text-[var(--warning-text)]">{change.blockReason ?? "It now overlaps another company's land, so the estate is off the marketplace."}</p>
      )}
      <ConflictChangesView changes={change.conflictChanges} />
    </div>
  );
}

// The cover and a count; managing them is its own page.
function PhotosSummary({ estateId, estateName, scope, canManage }: { estateId: string; estateName: string; scope: PortalScope; canManage: boolean }) {
  const photos = useFetch(() => fetchEstatePhotos(estateId, scope), [estateId, scope.tenantId, scope.branchId]);
  const list = photos.data ?? [];
  const cover = list.find((p) => p.cover);
  const loadingNow = photos.loading && !photos.data;
  return (
    <SetupCard icon={<ImageIcon size={16} />} title="Photos" to={`/portal/estates/${estateId}/photos`} link={canManage ? "Manage photos" : "View photos"}
      badge={loadingNow || photos.error ? undefined : cover ? { label: "Met", variant: "success" } : { label: "No photos", variant: "warning" }}
      line={loadingNow ? "Loading photos…" : photos.error ? "The photos couldn't be loaded." : cover ? `${list.length} of ${PHOTO_LIMIT} photos · cover set` : "No photos yet"}
      hint={cover ? "The cover is the main image buyers see on the marketplace." : "An estate needs at least one photo of its own land before it can be published."}>
      {cover && <img src={cover.url} alt={cover.caption ?? estateName} loading="lazy" className="w-full aspect-[16/7] object-cover rounded-md bg-[var(--muted)] mb-3" />}
    </SetupCard>
  );
}

// The declared title and where HomeTrue's review stands; changing it is its own page.
function TitleSummary({ estateId, scope, canManage }: { estateId: string; scope: PortalScope; canManage: boolean }) {
  const title = useFetch(() => fetchEstateTitle(estateId, scope), [estateId, scope.tenantId, scope.branchId]);
  const t = title.data;
  const badge = t ? titleStatusBadge(t.status) : undefined;
  return (
    <SetupCard icon={<ShieldCheckIcon size={16} />} title="Land title" to={`/portal/estates/${estateId}/title`}
      link={!canManage ? "View title" : t ? "Manage title" : "Add title"} badge={badge} tone={badge?.variant === "error" ? "error" : undefined}
      line={title.loading && !t ? "Loading title…" : title.error ? "The title couldn't be loaded." : t ? <>{t.titleType} · <span className="font-mono-data">{t.titleNumber || "No title number"}</span></> : "No title recorded"}
      hint={t ? undefined : "Buyers see \"Title not recorded\" until you add one and upload its documents for HomeTrue to check."} />
  );
}

// Whether buyers' allocation letters are approved; the setup is its own page.
function LetterSummary({ estateId, scope }: { estateId: string; scope: PortalScope }) {
  const approval = useFetch(() => fetchLetterApproval(estateId, scope), [estateId, scope.tenantId, scope.branchId]);
  const a = approval.data;
  return (
    <SetupCard icon={<FileCheckIcon size={16} />} title="Allocation letter" to={`/portal/estates/${estateId}/letter`} link="Conditions, preview and approval"
      badge={a ? letterApprovalBadge(a) : undefined}
      line={approval.loading && !a ? "Loading…" : approval.error || !a ? "The letter's status couldn't be loaded." : a.approved ? "Conditions and wording approved" : "Not approved yet"}
      hint={!a ? undefined : a.approved
        ? "Buyers get their letter when finance verifies the sale."
        : a.changedSinceApproval.length
          ? `${describeChanges(a.changedSinceApproval)} changed. Until it's approved again the estate can't be listed or sold.`
          : "Until it's approved the estate can't be listed and finance can't allocate plots."} />
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-[var(--muted)] rounded-lg px-3.5 py-3">
      <dt className="text-xs text-[var(--muted-foreground)]">{label}</dt>
      <dd className="font-display text-2xl text-[var(--foreground)]">{value}</dd>
    </div>
  );
}
