import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useFetch } from "../../../lib/useFetch";
import {
  PLOT_BATCH_LIMIT, createPlotsInBatches, fetchBlocks, fetchPriceTiers, planBatches, tierDisplayLabel,
  type BatchProgress, type CreatePlotInput, type PlotOrientation, type PortalPlotStatus,
} from "../../../services/portalInventoryService";
import { STATUS_LABELS } from "../../../lib/plotStatus";
import { fetchPortalEstateById, parseBoundary } from "../../../services/portalEstatesService";
import RepeatableFieldList from "../../../components/onboarding/RepeatableFieldList";
import { usePortalScope } from "../usePortalScope";

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

  const tiers = loaded.data?.tiers ?? [];
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

  if (loaded.loading) return <div className="p-8 text-sm text-[var(--muted-foreground)]">Loading…</div>;
  if (!loaded.data?.estate || !estateId) {
    return (
      <div className="p-8">
        <p className="text-sm font-medium text-[var(--foreground)] mb-2">Estate not found.</p>
        <Link to="/portal/estates" className="text-sm text-[var(--accent)] hover:underline">Back to estates</Link>
      </div>
    );
  }

  if (tiers.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Link to={`/portal/estates/${estateId}/inventory`} className="text-xs text-[var(--accent)] hover:underline">← Inventory</Link>
        <h1 className="font-display text-3xl text-[var(--foreground)] mt-2 mb-2">Add plots</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          This estate has no price tiers yet, and every plot is priced by one. Add a tier first.
        </p>
      </div>
    );
  }

  const batches = planBatches(rows.length);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link to={`/portal/estates/${estateId}/inventory`} className="text-xs text-[var(--accent)] hover:underline">← Inventory</Link>
      <h1 className="font-display text-3xl text-[var(--foreground)] mt-2 mb-1">Add plots</h1>
      <p className="text-sm text-[var(--muted-foreground)] mb-6">
        Each plot takes its size and price from the tier you choose. Importing a surveyor's file for a whole estate comes in a later
        release — this form is for creating plots by hand.
      </p>

      <form onSubmit={submit} className="space-y-5">
        <RepeatableFieldList
          items={rows}
          onAdd={() => setRows((prev) => [...prev, blankRow(prev[prev.length - 1]?.priceTierId ?? "")])}
          onRemove={(index) => setRows((prev) => prev.filter((_, i) => i !== index))}
          addLabel="Add another plot"
          minItems={1}
          getKey={(row) => row.key}
          renderItem={(row, index) => {
            const tier = tiers.find((t) => t.id === row.priceTierId);
            return (
              <div className="space-y-3">
                <div className="grid sm:grid-cols-3 gap-3">
                  <Field id={`plot-number-${index}`} label="Plot number" value={row.plotNumber} onChange={(v) => update(index, { plotNumber: v })} placeholder="4" />
                  <Select id={`block-${index}`} label="Block (optional)" value={row.blockId} onChange={(v) => update(index, { blockId: v })}
                    options={[{ value: "", label: "No block" }, ...blocks.map((b) => ({ value: b.id, label: b.name }))]} />
                  <Select id={`tier-${index}`} label="Price tier" value={row.priceTierId} onChange={(v) => update(index, { priceTierId: v })}
                    options={[{ value: "", label: "Choose a tier" }, ...tiers.map((t) => ({ value: t.id, label: tierDisplayLabel(t) }))]} />
                </div>

                {/* The tier's own size, shown as read-only context. There is no
                    size input for a land-size plot, by design. */}
                {tier && (
                  <p className="text-xs text-[var(--muted-foreground)]">
                    {tier.tierType === "land_size"
                      ? `Sold as ${tier.sizeSqm} sqm, from this tier. Size comes from the tier, so there's nothing to enter here.`
                      : "A unit-type tier has no size of its own. If this unit sits on its own plot, record that land area below."}
                  </p>
                )}

                <div className="grid sm:grid-cols-3 gap-3">
                  {/* Both availability variants offered separately — the
                      backend keeps them apart on purpose, and the reservation
                      sweeper restores whichever one a plot had. */}
                  <Select id={`status-${index}`} label="Status" value={row.status} onChange={(v) => update(index, { status: v as PortalPlotStatus })}
                    options={(Object.keys(STATUS_LABELS) as PortalPlotStatus[]).map((s) => ({ value: s, label: STATUS_LABELS[s] }))} />
                  <Select id={`intent-${index}`} label="Intent (optional)" value={row.intent} onChange={(v) => update(index, { intent: v as PlotRow["intent"] })}
                    options={[{ value: "", label: "Unspecified" }, { value: "development", label: "Development" }, { value: "investment", label: "Investment" }]} />
                  <Select id={`orientation-${index}`} label="Orientation (optional)" value={row.orientation}
                    onChange={(v) => update(index, { orientation: v as PlotOrientation | "" })}
                    options={[{ value: "", label: "Unspecified" }, ...ORIENTATIONS.map((o) => ({ value: o, label: o }))]} />
                </div>

                {tier?.tierType === "unit_type" && (
                  <Field id={`override-${index}`} label="Land area for this unit (sqm, optional)" type="number"
                    value={row.nominalSizeSqmOverride} onChange={(v) => update(index, { nominalSizeSqmOverride: v })}
                    hint="Leave empty for an apartment, which has no land of its own." />
                )}

                <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                  <input type="checkbox" checked={row.isCorner} onChange={(e) => update(index, { isCorner: e.target.checked })} />
                  Corner plot
                </label>

                <div>
                  <label htmlFor={`footprint-${index}`} className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Footprint (optional)</label>
                  <textarea
                    id={`footprint-${index}`}
                    rows={2}
                    value={row.footprintJson}
                    onChange={(e) => update(index, { footprintJson: e.target.value })}
                    placeholder='{"type":"Polygon","coordinates":[[[7.4140,9.1070],…]]}'
                    className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-xs font-mono-data focus:outline-none focus:border-[var(--accent)]"
                  />
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">
                    A GeoJSON Polygon in [longitude, latitude] order. With one, the surveyed area is measured for you; without one, this
                    plot has no surveyed area and won't appear on the map.
                  </p>
                </div>
              </div>
            );
          }}
        />

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

        {error && <p className="text-sm text-red-700">{error}</p>}

        <button type="submit" disabled={saving} className="w-full py-3 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-60">
          {saving ? "Creating…" : `Create ${rows.length} plot${rows.length === 1 ? "" : "s"}`}
        </button>
      </form>
    </div>
  );
}

const inputClass = "w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--accent)]";

function Field({ id, label, value, onChange, type = "text", placeholder, hint }: {
  id: string; label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-[var(--foreground)] mb-1.5">{label}</label>
      <input id={id} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className={inputClass} />
      {hint && <p className="text-xs text-[var(--muted-foreground)] mt-1">{hint}</p>}
    </div>
  );
}

function Select({ id, label, value, onChange, options }: {
  id: string; label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-[var(--foreground)] mb-1.5">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
