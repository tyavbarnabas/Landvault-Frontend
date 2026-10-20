// Add plots by hand, from the Figma "Portal estate setup" proposal: inside
// the setup frame, one row per plot with the rarely-needed fields behind
// "More", and a way forward (add a tier) when there's nothing to price by.

import { useState } from "react";
import LoadError from "../../../components/LoadError";
import { useParams, useNavigate } from "react-router-dom";
import { useFetch } from "../../../lib/useFetch";
import {
  PLOT_BATCH_LIMIT, createPlotsInBatches, fetchBlocks, fetchPriceTiers, planBatches, openTiers, tierDisplayLabel,
  type BatchProgress, type CreatePlotInput, type PlotOrientation, type PortalPlotStatus, type PortalPriceTier,
} from "../../../services/portalInventoryService";
import { CREATABLE_STATUSES, STATUS_LABELS } from "../../../lib/plotStatus";
import { fetchPortalEstateById, parseBoundary } from "../../../services/portalEstatesService";
import { usePortalScope } from "../usePortalScope";
import EstateSetupPage from "../../../components/portal/EstateSetupPage";
import Page, { Loading } from "../../../components/ui/Page";
import Card from "../../../components/ui/Card";
import EmptyState from "../../../components/ui/EmptyState";
import Button, { LinkButton } from "../../../components/ui/Button";
import TextLink from "../../../components/ui/TextLink";
import { ErrorText, Field, Input, Select, Textarea } from "../../../components/ui/Field";
import { cx } from "../../../components/ui/cx";
import { GridIcon, XIcon } from "../../../components/icons";

// One editable row. Deliberately NO nominal size field: a plot's nominal size
// is its tier's, copied at creation. Offering one would let a developer enter
// a size that contradicts the tier the plot is priced by — and leave the
// invoice and the deed disagreeing about what was sold.
interface PlotRow {
  key: string;
  plotNumber: string;
  blockId: string;
  priceTierId: string;
  isCorner: boolean;
  status: PortalPlotStatus;
  intent: "" | "development" | "investment";
  orientation: "" | PlotOrientation;
  // Accepted only where the chosen tier is UNIT_TYPE, which has no size of
  // its own. An apartment leaves it empty; a terrace on its own plot doesn't.
  nominalSizeSqmOverride: string;
  footprintJson: string;
}

const ORIENTATIONS: PlotOrientation[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

let rowSeq = 0;
const blankRow = (priceTierId = ""): PlotRow => ({
  key: `row-${++rowSeq}`,
  plotNumber: "", blockId: "", priceTierId, isCorner: false,
  status: "available-dev", intent: "", orientation: "", nominalSizeSqmOverride: "", footprintJson: "",
});

export default function CreatePortalPlots() {
  const { estateId } = useParams<{ estateId: string }>();
  const navigate = useNavigate();
  const scope = usePortalScope();

  const loaded = useFetch(async () => {
    if (!scope || !estateId) return null;
    const [estate, tiers, blocks] = await Promise.all([
      fetchPortalEstateById(estateId, scope),
      fetchPriceTiers(estateId, scope),
      fetchBlocks(estateId, scope),
    ]);
    return { estate, tiers, blocks };
  }, [scope?.tenantId, scope?.branchId, estateId]);

  const [rows, setRows] = useState<PlotRow[]>([blankRow()]);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Only open tiers: a retired one accepts no new plots (the backend refuses
  // with TIER_RETIRED), so it is never offered here.
  const allTiers = loaded.data?.tiers ?? [];
  const tiers = openTiers(allTiers);
  const blocks = loaded.data?.blocks ?? [];

  const update = (index: number, patch: Partial<PlotRow>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scope || !estateId) return;

    const payload: CreatePlotInput[] = [];
    for (const row of rows) {
      if (!row.plotNumber.trim()) { setError("Every plot needs a plot number."); return; }
      if (!row.priceTierId) { setError(`Plot ${row.plotNumber} needs a price tier — that's what prices it.`); return; }

      let footprint: CreatePlotInput["footprint"];
      if (row.footprintJson.trim()) {
        const parsed = parseBoundary(row.footprintJson);
        if ("error" in parsed) { setError(`Plot ${row.plotNumber}: ${parsed.error.message}`); return; }
        footprint = parsed.polygon;
      }

      const tier = tiers.find((t) => t.id === row.priceTierId);
      payload.push({
        plotNumber: row.plotNumber.trim(),
        blockId: row.blockId || undefined,
        priceTierId: row.priceTierId,
        isCorner: row.isCorner,
        status: row.status,
        intent: row.intent || undefined,
        orientation: row.orientation || undefined,
        // Only ever sent for a unit-type tier; the backend rejects it otherwise.
        nominalSizeSqmOverride: tier?.tierType === "unit_type" && row.nominalSizeSqmOverride
          ? Number(row.nominalSizeSqmOverride)
          : undefined,
        footprint,
      });
    }

    setSaving(true);
    setError("");
    try {
      await createPlotsInBatches(estateId, payload, scope, setProgress);
      navigate(`/portal/estates/${estateId}/inventory?tab=plots`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the plots.");
      setSaving(false);
    }
  };

  if (loaded.loading && !loaded.data) return <Page title="Add plots"><Loading label="Loading…" /></Page>;

  if (loaded.error) return <LoadError error={loaded.errorValue} what="this estate" onRetry={loaded.refetch} />;
  if (!loaded.data?.estate || !estateId) {
    return <Page title="Estate not found" back={{ to: "/portal/estates", label: "Estates" }}>{null}</Page>;
  }
  const estate = loaded.data.estate;

  if (tiers.length === 0) {
    return (
      <EstateSetupPage estate={estate} step="plots" title="Add plots">
        <Card>
          <EmptyState
            icon={<GridIcon size={24} />}
            title={allTiers.length === 0 ? "Add a price tier first" : "Every price tier is retired"}
            description={allTiers.length === 0
              ? "Every plot is priced by a tier — a plot size and its price. Add one, then add plots by hand or import your surveyor's file."
              : "A retired tier accepts no new plots. Add a new tier, or reinstate a retired one, then come back to add plots."}
            action={<LinkButton to={`/portal/estates/${estateId}/inventory`}>{allTiers.length === 0 ? "Add a price tier" : "Go to price tiers"}</LinkButton>}
          />
        </Card>
      </EstateSetupPage>
    );
  }

  const batches = planBatches(rows.length);

  return (
    <EstateSetupPage estate={estate} step="plots" title="Add plots"
      description={<>Each plot takes its size and price from the tier you choose. For a whole estate,{" "}
        <TextLink to={`/portal/estates/${estateId}/plots/import`} className="font-medium">import your surveyor's file</TextLink> instead.</>}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <Card padding="none" className="overflow-hidden">
          <div className={cx("hidden lg:grid gap-3 px-4 py-2.5 bg-[var(--muted)] text-xs font-medium text-[var(--muted-foreground)]", ROW_GRID)} aria-hidden="true">
            <span>Plot no.</span><span>Block</span><span>Price tier</span><span>Status</span><span>Corner</span><span />
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {rows.map((row, index) => (
              <PlotRowEditor key={row.key} row={row} index={index} tiers={tiers} blocks={blocks}
                onChange={(patch) => update(index, patch)}
                onRemove={rows.length > 1 ? () => setRows((prev) => prev.filter((_, i) => i !== index)) : undefined} />
            ))}
          </ul>
          <div className="px-4 py-3 border-t border-[var(--border)] flex flex-wrap items-center gap-x-4 gap-y-1">
            <Button variant="link" className="font-medium" onClick={() => setRows((prev) => [...prev, blankRow(prev[prev.length - 1]?.priceTierId ?? "")])}>+ Add another row</Button>
            <span className="text-xs text-[var(--muted-foreground)]">“More” holds intent, orientation, land area and the plot's footprint.</span>
          </div>
        </Card>

        {/* The endpoint accepts 500 per request, so a larger set is split
            rather than failing — said plainly before it happens. */}
        {batches > 1 && (
          <p className="text-xs text-[var(--muted-foreground)]">
            {rows.length} plots exceeds the {PLOT_BATCH_LIMIT}-per-request limit, so this will be sent as {batches} batches.
          </p>
        )}

        {progress && (
          <p className="text-xs text-[var(--muted-foreground)]" role="status">
            Batch {progress.batch} of {progress.totalBatches} — {progress.created} of {progress.total} plots created.
          </p>
        )}

        {error && <ErrorText>{error}</ErrorText>}

        <div className="flex gap-3">
          <Button type="submit" size="lg" disabled={saving}>{saving ? "Creating…" : `Add ${rows.length} plot${rows.length === 1 ? "" : "s"}`}</Button>
          <LinkButton to={`/portal/estates/${estateId}/inventory?tab=plots`} variant="secondary" size="lg">Cancel</LinkButton>
        </div>
      </form>
    </EstateSetupPage>
  );
}

const ROW_GRID = "lg:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1.3fr)_5.5rem_7rem]";

// One plot: the four things every plot needs on one line, the rest behind
// "More". Labels are visible on a phone, where the row stacks, and read out
// (not shown) on a desktop, where the header row names the columns.
function PlotRowEditor({ row, index, tiers, blocks, onChange, onRemove }: {
  row: PlotRow; index: number; tiers: PortalPriceTier[]; blocks: { id: string; name: string }[];
  onChange: (patch: Partial<PlotRow>) => void; onRemove?: () => void;
}) {
  const [more, setMore] = useState(false);
  const tier = tiers.find((t) => t.id === row.priceTierId);
  const label = "block text-xs font-medium text-[var(--muted-foreground)] mb-1 lg:sr-only";
  return (
    <li className="px-4 py-3">
      <div className={cx("grid grid-cols-2 gap-3 lg:items-center", ROW_GRID)}>
        <div>
          <label htmlFor={`plot-number-${index}`} className={label}>Plot number</label>
          <Input id={`plot-number-${index}`} inputSize="md" value={row.plotNumber} onChange={(e) => onChange({ plotNumber: e.target.value })} placeholder="4" />
        </div>
        <div>
          <label htmlFor={`block-${index}`} className={label}>Block (optional)</label>
          <Select id={`block-${index}`} inputSize="md" value={row.blockId} onChange={(e) => onChange({ blockId: e.target.value })}>
            <option value="">No block</option>
            {blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </div>
        <div className="col-span-2 lg:col-span-1">
          <label htmlFor={`tier-${index}`} className={label}>Price tier</label>
          <Select id={`tier-${index}`} inputSize="md" value={row.priceTierId} onChange={(e) => onChange({ priceTierId: e.target.value })}>
            <option value="">Choose a tier</option>
            {tiers.map((t) => <option key={t.id} value={t.id}>{tierDisplayLabel(t)}</option>)}
          </Select>
        </div>
        <div className="col-span-2 lg:col-span-1">
          <label htmlFor={`status-${index}`} className={label}>Status</label>
          {/* Both availability variants offered separately — the backend
              keeps them apart on purpose, and the reservation sweeper
              restores whichever one a plot had. */}
          <Select id={`status-${index}`} inputSize="md" value={row.status} onChange={(e) => onChange({ status: e.target.value as PortalPlotStatus })}>
            {CREATABLE_STATUSES.map((st) => <option key={st} value={st}>{STATUS_LABELS[st]}</option>)}
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
          <input type="checkbox" checked={row.isCorner} onChange={(e) => onChange({ isCorner: e.target.checked })} />
          Corner
        </label>
        <div className="flex items-center justify-end gap-3">
          <Button variant="linkMuted" onClick={() => setMore((m) => !m)} aria-expanded={more} aria-controls={`more-${index}`}>More {more ? "▴" : "▾"}</Button>
          {onRemove && (
            <button type="button" onClick={onRemove} aria-label={`Remove row ${index + 1}`} className="p-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
              <XIcon size={16} />
            </button>
          )}
        </div>
      </div>

      {/* The tier's own size, shown as read-only context. There is no size
          input for a land-size plot, by design. */}
      {tier && (
        <p className="text-xs text-[var(--muted-foreground)] mt-2">
          {tier.tierType === "land_size"
            ? `Sold as ${tier.sizeSqm} sqm, from this tier.`
            : "A unit-type tier has no size of its own. If this unit sits on its own plot, record its land area under More."}
        </p>
      )}

      {more && (
        <div id={`more-${index}`} className="mt-3 grid sm:grid-cols-2 gap-3 rounded-lg bg-[var(--muted)] p-3">
          <Field id={`intent-${index}`} label="Intent (optional)">
            <Select id={`intent-${index}`} inputSize="md" value={row.intent} onChange={(e) => onChange({ intent: e.target.value as PlotRow["intent"] })}>
              <option value="">Unspecified</option>
              <option value="development">Development</option>
              <option value="investment">Investment</option>
            </Select>
          </Field>
          <Field id={`orientation-${index}`} label="Orientation (optional)">
            <Select id={`orientation-${index}`} inputSize="md" value={row.orientation} onChange={(e) => onChange({ orientation: e.target.value as PlotOrientation | "" })}>
              <option value="">Unspecified</option>
              {ORIENTATIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </Select>
          </Field>
          {tier?.tierType === "unit_type" && (
            <Field id={`override-${index}`} label="Land area for this unit (sqm, optional)" hint="Leave empty for an apartment, which has no land of its own." className="sm:col-span-2">
              <Input id={`override-${index}`} inputSize="md" type="number" value={row.nominalSizeSqmOverride} onChange={(e) => onChange({ nominalSizeSqmOverride: e.target.value })} aria-describedby={`override-${index}-hint`} />
            </Field>
          )}
          <Field id={`footprint-${index}`} label="Footprint (optional)" className="sm:col-span-2"
            hint="A GeoJSON Polygon in [longitude, latitude] order. With one, the surveyed area is measured for you; without one, this plot has no surveyed area and won't appear on the map.">
            <Textarea id={`footprint-${index}`} rows={2} value={row.footprintJson} onChange={(e) => onChange({ footprintJson: e.target.value })}
              placeholder='{"type":"Polygon","coordinates":[[[7.4140,9.1070],…]]}' className="font-mono-data text-xs" aria-describedby={`footprint-${index}-hint`} />
          </Field>
        </div>
      )}
    </li>
  );
}
