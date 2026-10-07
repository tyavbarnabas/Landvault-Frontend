import { useState } from "react";
import LoadError from "../../../components/LoadError";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useFetch } from "../../../lib/useFetch";
import { formatAmount, type Currency } from "../../../data/mockData";
import { STATUS_COLORS, STATUS_LABELS } from "../../../lib/plotStatus";
import { useApp } from "../../../contexts/AppContext";
import { canManageEstates } from "../../../services/authService";
import { fetchEstateGeoJson, fetchPortalEstateById, isReadOnlyForScope } from "../../../services/portalEstatesService";
import {
  BULK_STATUS_LIMIT, InventoryEditError, availableCount, changePlotStatus, changePlotStatuses, countFor, createBlock,
  correctPlotBoundary, createPriceTier, fetchBlocks, fetchInventoryGeoJson, fetchPlots, fetchPriceTierImpact, fetchPriceTiers,
  isEditablePlot, movePlotToTier, setTierRetired, tierMoveTargets, withdrawPlot, type PlotBoundaryCorrection, type PlotTierChange,
  tierDisplayLabel, updateBlock, updatePriceTier, validatePriceTier, type PlotStatusChange, type PlotStatusTarget,
  type CreatePriceTierInput, type PlotCounts, type PortalBlock, type PortalPlot, type PortalPriceTier,
  type PortalPlotStatus, type PriceTierUpdate, type TierType, type UpdatePriceTierInput,
} from "../../../services/portalInventoryService";
import EstateBoundaryMap from "../../../components/map/EstateBoundaryMap";
import EmptyState from "../../../components/marketplace/EmptyState";
import StatusBadge from "../../../components/StatusBadge";
import TabBar from "../../../components/TabBar";
import { Field } from "../../../components/portal/formParts";
import BoundaryField from "../../../components/portal/BoundaryField";
import ConflictChangesView from "../../../components/portal/ConflictChangesView";
import type { GeoJsonPolygon } from "../../../services/portalEstatesService";
import { usePortalScope } from "../usePortalScope";

type Tab = "tiers" | "blocks" | "plots";

export default function PortalEstateInventory() {
  const { estateId } = useParams<{ estateId: string }>();
  const scope = usePortalScope();
  const { user } = useApp();
  const mayManage = canManageEstates(user);
  // Tab lives in the URL so it's linkable — and so returning here after
  // creating plots lands back on the plots list rather than the first tab.
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const tab: Tab = requested === "blocks" || requested === "plots" ? requested : "tiers";
  const setTab = (next: Tab) => setSearchParams(next === "tiers" ? {} : { tab: next }, { replace: true });

  const loaded = useFetch(async () => {
    if (!scope || !estateId) return null;
    const [estate, tiers, blocks, plots, boundary] = await Promise.all([
      fetchPortalEstateById(estateId, scope),
      fetchPriceTiers(estateId, scope),
      fetchBlocks(estateId, scope),
      fetchPlots(estateId, scope, {}, { limit: 500 }),
      fetchEstateGeoJson(estateId, scope),
    ]);
    const mapData = estate ? await fetchInventoryGeoJson(estateId, scope, boundary) : null;
    return { estate, tiers, blocks, plots: plots.items, total: plots.total, mapData };
  }, [scope?.tenantId, scope?.branchId, estateId]);

  // Only the FIRST load blanks the page. A refetch after an edit keeps what is
  // on screen — including the result of the edit that triggered it.
  if (loaded.loading && !loaded.data) return <div className="p-8 text-sm text-[var(--muted-foreground)]">Loading inventory…</div>;
  if (loaded.error) return <LoadError error={loaded.errorValue} what="this estate's inventory" onRetry={loaded.refetch} />;

  const estate = loaded.data?.estate;
  if (!estate || !estateId || !scope) {
    return (
      <div className="p-8">
        <p className="text-sm font-medium text-[var(--foreground)] mb-2">Estate not found.</p>
        <Link to="/portal/estates" className="text-sm text-[var(--accent)] hover:underline">Back to estates</Link>
      </div>
    );
  }

  const { tiers, blocks, plots, mapData } = loaded.data!;
  // EB-2: branch staff see a company-level estate but can't change it.
  const readOnly = isReadOnlyForScope(estate, scope);
  const canManage = mayManage && !readOnly;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link to={`/portal/estates/${estateId}`} className="text-xs text-[var(--accent)] hover:underline">← {estate.name}</Link>
      <h1 className="font-display text-3xl text-[var(--foreground)] mt-2 mb-1">Inventory</h1>
      <p className="text-sm text-[var(--muted-foreground)] mb-6">
        Price by tier, not per plot: {plots.length} plot{plots.length === 1 ? "" : "s"} priced by {tiers.length} tier{tiers.length === 1 ? "" : "s"}.
      </p>

      {readOnly && <ReadOnlyNotice />}

      <div className="border-b border-[var(--border)] mb-5">
        <TabBar
          tabs={[{ id: "tiers", label: "Price tiers" }, { id: "blocks", label: "Blocks" }, { id: "plots", label: "Plots" }]}
          active={tab}
          onActivate={setTab}
          ariaLabel="Inventory sections"
        />
      </div>

      <div id={`panel-${tab}`} role="tabpanel">
        {tab === "tiers" && <TiersPanel estateId={estateId} tiers={tiers} canManage={canManage} onCreated={loaded.refetch} />}
        {tab === "blocks" && <BlocksPanel estateId={estateId} blocks={blocks} canManage={canManage} onCreated={loaded.refetch} />}
        {tab === "plots" && <PlotsPanel estateId={estateId} plots={plots} blocks={blocks} tiers={tiers} mapData={mapData} canManage={canManage} onChanged={loaded.refetch} />}
      </div>
    </div>
  );
}

// ─── Tiers ───────────────────────────────────────────────────────────────────

function TiersPanel({ estateId, tiers, canManage, onCreated }: {
  estateId: string; tiers: PortalPriceTier[]; canManage: boolean; onCreated: () => void;
}) {
  const scope = usePortalScope();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lastEdit, setLastEdit] = useState<{ tierName: string; update: PriceTierUpdate } | null>(null);
  const editing = tiers.find((t) => t.id === editingId) ?? null;
  const [retiringId, setRetiringId] = useState<string | null>(null);
  const retiring = tiers.find((t) => t.id === retiringId) ?? null;
  const [retireError, setRetireError] = useState("");
  const [retireBusy, setRetireBusy] = useState(false);

  // Retire asks first (it changes what new plots may use); reinstating is
  // harmless and immediate.
  const setRetired = async (tier: PortalPriceTier, retired: boolean) => {
    if (!scope) return;
    setRetireBusy(true);
    setRetireError("");
    try {
      await setTierRetired(estateId, tier.id, retired, scope);
      setRetiringId(null);
      onCreated();
    } catch (err) {
      setRetireError(err instanceof Error ? err.message : "Couldn't change the tier.");
    } finally {
      setRetireBusy(false);
    }
  };
  const [tierType, setTierType] = useState<TierType>("land_size");
  const [sizeSqm, setSizeSqm] = useState("");
  const [price, setPrice] = useState("");
  const [currency, setCurrency] = useState<Currency>("NGN");
  const [label, setLabel] = useState("");
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scope) return;
    const input: CreatePriceTierInput = {
      tierType,
      // Never sent for a unit type — the backend rejects it, and the database
      // constraint behind it would too.
      sizeSqm: tierType === "land_size" ? Number(sizeSqm) || undefined : undefined,
      price: Number(price) || 0,
      currency,
      label: label.trim() || undefined,
    };
    const invalid = validatePriceTier(input);
    if (invalid) { setFieldError(invalid); return; }

    setSaving(true);
    setFieldError(null);
    try {
      await createPriceTier(estateId, input, scope);
      setSizeSqm(""); setPrice(""); setLabel("");
      onCreated();
    } catch (err) {
      setFieldError({ field: "form", message: err instanceof Error ? err.message : "Couldn't create the tier." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {tiers.length === 0 ? (
        <EmptyState title="No price tiers yet" description="A 450-plot estate needs four to six tiers, not 450 prices. Add the first one below." />
      ) : (
        <div>
          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--muted)] text-left">
                  <th scope="col" className="px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Tier</th>
                  <th scope="col" className="px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Price</th>
                  <th scope="col" className="px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Per sqm</th>
                  <th scope="col" className="px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Plots priced by it</th>
                  {canManage && <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] bg-[var(--card)]">
                {tiers.map((tier) => (
                  <tr key={tier.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-[var(--foreground)]">{tierDisplayLabel(tier)}</div>
                      <div className="text-xs text-[var(--muted-foreground)]">{tier.tierType === "land_size" ? "Land size" : "Unit type"}</div>
                      {/* Retired: no new plots, but its existing plots stay on
                          sale at this price — withholding is how to take those off. */}
                      {tier.retiredAt && <div className="mt-1"><StatusBadge label="Retired — no new plots" variant="neutral" /></div>}
                    </td>
                    <td className="px-4 py-3 font-mono-data text-[var(--foreground)]">{formatAmount(tier.price, tier.currency)}</td>
                    {/* Display-only comparison. A tier's price is the developer's
                        own figure; it is never derived from a per-sqm rate, and
                        differing rates across tiers are normal. */}
                    <td className="px-4 py-3 font-mono-data text-[var(--muted-foreground)]">
                      {tier.pricePerSqm === null ? "—" : `${formatAmount(tier.pricePerSqm, tier.currency)}/sqm`}
                    </td>
                    <td className="px-4 py-3 font-mono-data text-[var(--foreground)]">{tier.plotCount}</td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => { setEditingId(tier.id); setLastEdit(null); }}
                            disabled={editingId === tier.id}
                            className="text-sm text-[var(--accent)] hover:underline disabled:opacity-50 disabled:no-underline"
                          >
                            Edit
                          </button>
                          {tier.retiredAt ? (
                            <button type="button" onClick={() => setRetired(tier, false)} disabled={retireBusy}
                              className="text-sm text-[var(--accent)] hover:underline disabled:opacity-50">
                              Reinstate
                            </button>
                          ) : (
                            <button type="button" onClick={() => { setRetiringId(tier.id); setRetireError(""); }} disabled={retiringId === tier.id}
                              className="text-sm text-[var(--muted-foreground)] hover:underline disabled:opacity-50">
                              Retire
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-[var(--muted-foreground)] mt-2.5">
            Per-sqm is shown for comparison only — each tier's price is your own figure, so rates differing between sizes is normal.
            Changing a tier's price changes every plot priced by it.
          </p>
        </div>
      )}

      {retiring && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-3" role="dialog" aria-label={`Retire ${tierDisplayLabel(retiring)}`}>
          <p className="text-sm font-semibold text-[var(--foreground)]">Retire {tierDisplayLabel(retiring)}?</p>
          <p className="text-sm text-[var(--muted-foreground)]">
            No new plots can be added to it, imported into it or moved to it. Its {retiring.plotCount} existing{" "}
            {retiring.plotCount === 1 ? "plot keeps" : "plots keep"} it, and any that are available stay on sale at its price — to take
            them off the market, withhold them on the Plots tab. You can reinstate it at any time.
          </p>
          {retireError && <p className="text-sm text-red-700" role="alert">{retireError}</p>}
          <div className="flex gap-3">
            <button type="button" onClick={() => setRetired(retiring, true)} disabled={retireBusy}
              className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-60">
              {retireBusy ? "Retiring…" : "Retire tier"}
            </button>
            <button type="button" onClick={() => setRetiringId(null)}
              className="px-4 py-2 border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] hover:bg-[var(--muted)]">
              Cancel
            </button>
          </div>
        </div>
      )}
      {!retiring && retireError && <p className="text-sm text-red-700" role="alert">{retireError}</p>}

      {editing && scope && (
        <TierEditor
          key={editing.id}
          estateId={estateId}
          tier={editing}
          onCancel={() => setEditingId(null)}
          onSaved={(update) => {
            setLastEdit({ tierName: tierDisplayLabel(editing), update });
            setEditingId(null);
            onCreated();
          }}
        />
      )}

      {lastEdit && <TierEditResult tierName={lastEdit.tierName} update={lastEdit.update} onDismiss={() => setLastEdit(null)} />}

      {canManage && <form onSubmit={submit} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">Add a price tier</h2>

        <div>
          <label htmlFor="tier-type" className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Tier type</label>
          <select id="tier-type" value={tierType} onChange={(e) => { setTierType(e.target.value as TierType); setSizeSqm(""); setFieldError(null); }} className={inputClass}>
            <option value="land_size">Land size — bare land priced by area</option>
            <option value="unit_type">Unit type — a built unit, described by its label</option>
          </select>
        </div>

        {/* Size belongs to a land-size tier only. A unit type has none of its
            own, which is what its label is for. */}
        {tierType === "land_size" && (
          <TierField id="sizeSqm" label="Size (sqm)" type="number" value={sizeSqm} onChange={setSizeSqm} error={fieldError} />
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <TierField id="price" label="Price" type="number" value={price} onChange={setPrice} error={fieldError} />
          <div>
            <label htmlFor="currency" className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Currency</label>
            <select id="currency" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className={inputClass}>
              {(["NGN", "USD", "GBP", "EUR"] as Currency[]).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        <TierField
          id="label"
          label={tierType === "unit_type" ? "Label (required)" : "Label (optional)"}
          value={label}
          onChange={setLabel}
          error={fieldError}
          placeholder={tierType === "unit_type" ? "3-bed terrace" : "Standard"}
        />

        {fieldError?.field === "form" && <p className="text-sm text-red-700">{fieldError.message}</p>}

        <button type="submit" disabled={saving} className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-60">
          {saving ? "Adding…" : "Add tier"}
        </button>
      </form>}
    </div>
  );
}

// ─── Blocks ──────────────────────────────────────────────────────────────────

function BlocksPanel({ estateId, blocks, canManage, onCreated }: {
  estateId: string; blocks: PortalBlock[]; canManage: boolean; onCreated: () => void;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const scope = usePortalScope();
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scope || !name.trim()) return;
    setSaving(true);
    setError("");
    try {
      await createBlock(estateId, { name, label: label || undefined }, scope);
      setName(""); setLabel("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the block.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--muted-foreground)]">
        Blocks exist so plots can be addressed as "Block C, Plot 4". They're optional — an estate need not use them.
      </p>

      {blocks.length > 0 && (
        <ul className="bg-[var(--card)] border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]">
          {blocks.map((block) => (
            <li key={block.id} className="px-4 py-2.5 text-sm text-[var(--foreground)]">
              {renamingId === block.id ? (
                <BlockRenameForm
                  estateId={estateId}
                  block={block}
                  onCancel={() => setRenamingId(null)}
                  onSaved={() => { setRenamingId(null); onCreated(); }}
                />
              ) : (
                <div className="flex items-center gap-3">
                  <span>
                    {block.name}{block.label ? <span className="text-[var(--muted-foreground)]"> · {block.label}</span> : null}
                  </span>
                  {canManage && (
                    <button type="button" onClick={() => setRenamingId(block.id)} className="ml-auto text-sm text-[var(--accent)] hover:underline">
                      Rename
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && <form onSubmit={submit} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">Add a block</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <TierField id="block-name" label="Name" value={name} onChange={setName} placeholder="Block C" />
          <TierField id="block-label" label="Label (optional)" value={label} onChange={setLabel} />
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={saving || !name.trim()} className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-60">
          {saving ? "Adding…" : "Add block"}
        </button>
      </form>}
    </div>
  );
}

// ─── Plots ───────────────────────────────────────────────────────────────────

function PlotsPanel({ estateId, plots, blocks, tiers, mapData, canManage, onChanged }: {
  estateId: string; plots: PortalPlot[]; blocks: PortalBlock[]; tiers: PortalPriceTier[];
  mapData: { type: "FeatureCollection"; features: unknown[] } | null;
  canManage: boolean; onChanged: () => void;
}) {
  const scope = usePortalScope();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rowError, setRowError] = useState("");
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  // Kept here, not in the bar: applying clears the selection (unmounting the
  // bar), and what was skipped — and why — must stay on screen.
  const [lastBulk, setLastBulk] = useState<PlotStatusChange | null>(null);
  const [editingPlotId, setEditingPlotId] = useState<string | null>(null);
  const editingPlot = plots.find((p) => p.id === editingPlotId) ?? null;
  const [withdrawn, setWithdrawn] = useState<string | null>(null);
  const [status, setStatus] = useState<PortalPlotStatus | "">("");
  const [blockId, setBlockId] = useState("");
  const [tierId, setTierId] = useState("");
  const [cornerOnly, setCornerOnly] = useState(false);

  // Filtering a page already in hand — the service applies the same filters
  // server-side when the list is larger than one page.
  const visible = plots.filter((p) =>
    (!status || p.status === status) &&
    (!blockId || p.blockId === blockId) &&
    (!tierId || p.priceTierId === tierId) &&
    (!cornerOnly || p.isCorner));

  const hasFootprints = plots.some((p) => p.hasFootprint);
  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected.has(p.id));
  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const toggleAllVisible = () => setSelected((prev) => {
    const next = new Set(prev);
    for (const p of visible) { if (allVisibleSelected) next.delete(p.id); else next.add(p.id); }
    return next;
  });

  // One plot: withhold an available plot, or return a withheld one to the
  // variant it had. Reserved and sold offer nothing — only checkout moves them.
  const quickChange = async (plot: PortalPlot, target: PlotStatusTarget) => {
    if (!scope) return;
    setRowBusy(plot.id);
    setRowError("");
    try {
      await changePlotStatus(estateId, plot.id, { status: target }, scope);
      onChanged();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : "Couldn't change that plot.");
    } finally {
      setRowBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-[var(--muted-foreground)]">{plots.length} plot{plots.length === 1 ? "" : "s"} on this estate.</p>
        <div className="flex items-center gap-3 shrink-0">
          {canManage && (
            <Link to={`/portal/estates/${estateId}/plots/import`} className="px-4 py-2 border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] hover:bg-[var(--muted)]">
              Import from file
            </Link>
          )}
          {canManage && (
            <Link to={`/portal/estates/${estateId}/plots/new`} className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90">
              Add plots
            </Link>
          )}
        </div>
      </div>

      {canManage && selected.size > 0 && scope && (
        <BulkStatusBar
          estateId={estateId}
          plotIds={[...selected]}
          plots={plots}
          onClear={() => setSelected(new Set())}
          onApplied={(change) => { setLastBulk(change); setSelected(new Set()); onChanged(); }}
        />
      )}
      {lastBulk && selected.size === 0 && (
        <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 space-y-2">
          <BulkResult result={lastBulk} plots={plots} />
          <button type="button" onClick={() => setLastBulk(null)} className="text-xs text-[var(--muted-foreground)] hover:underline">Dismiss</button>
        </div>
      )}
      {rowError && <p className="text-sm text-red-700" role="alert">{rowError}</p>}
      {withdrawn && (
        <p className="text-sm text-[var(--muted-foreground)]" role="status">
          {withdrawn} was withdrawn. Its plot number can be used again.{" "}
          <button type="button" onClick={() => setWithdrawn(null)} className="text-xs underline">Dismiss</button>
        </p>
      )}
      {editingPlot && scope && (
        <PlotEditor
          key={editingPlot.id}
          estateId={estateId}
          plot={editingPlot}
          tiers={tiers}
          onClose={() => setEditingPlotId(null)}
          onChanged={onChanged}
          onWithdrawn={(label) => { setEditingPlotId(null); setWithdrawn(label); onChanged(); }}
        />
      )}

      {tiers.length === 0 && (
        <p className="text-sm text-amber-700">Add at least one price tier first — every plot is priced by one.</p>
      )}

      {/* Plots with a footprint, over the estate boundary. A plot without one
          is simply absent from the map rather than drawn at a guessed spot. */}
      {mapData && hasFootprints && (
        <div>
          <EstateBoundaryMap
            boundary={mapData as never}
            label="Plots over the estate boundary"
            styleForFeature={(props) =>
              props.kind === "plot"
                ? { color: STATUS_COLORS[props.canonicalStatus as keyof typeof STATUS_COLORS] ?? "#64748b", weight: 1, fillOpacity: 0.55 }
                : { color: "#f59e0b", weight: 2, fillOpacity: 0.05 }}
            legend={Object.entries(STATUS_LABELS).map(([key, label]) => ({ color: STATUS_COLORS[key as keyof typeof STATUS_COLORS], label }))}
          />
          <p className="text-xs text-[var(--muted-foreground)] mt-2">
            {plots.filter((p) => p.hasFootprint).length} of {plots.length} plots have a surveyed footprint; the rest aren't on the map.
          </p>
        </div>
      )}

      {plots.length === 0 ? (
        <EmptyState title="No plots yet" description="Create plots in a batch once your price tiers are in place." />
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            <select value={status} onChange={(e) => setStatus(e.target.value as PortalPlotStatus | "")} aria-label="Filter by status" className={filterClass}>
              <option value="">All statuses</option>
              {/* Both availability variants, distinctly: an estate sells
                  development and investment plots side by side. */}
              {(Object.keys(STATUS_LABELS) as PortalPlotStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
            </select>
            <select value={blockId} onChange={(e) => setBlockId(e.target.value)} aria-label="Filter by block" className={filterClass}>
              <option value="">All blocks</option>
              {blocks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select value={tierId} onChange={(e) => setTierId(e.target.value)} aria-label="Filter by tier" className={filterClass}>
              <option value="">All tiers</option>
              {tiers.map((t) => <option key={t.id} value={t.id}>{tierDisplayLabel(t)}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
              <input type="checkbox" checked={cornerOnly} onChange={(e) => setCornerOnly(e.target.checked)} />
              Corner only
            </label>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--muted)] text-left">
                  {canManage && (
                    <th scope="col" className="pl-4 py-2.5 w-8">
                      <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} aria-label="Select every plot shown" />
                    </th>
                  )}
                  <th scope="col" className="px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Plot</th>
                  <th scope="col" className="px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Tier</th>
                  {/* Two separate columns, deliberately: what was sold, and what
                      the ground measures. Neither corrects the other. */}
                  <th scope="col" className="px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Nominal (sold as)</th>
                  <th scope="col" className="px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Surveyed</th>
                  <th scope="col" className="px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Price</th>
                  <th scope="col" className="px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Status</th>
                  {canManage && <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] bg-[var(--card)]">
                {visible.map((plot) => (
                  <tr key={plot.id}>
                    {canManage && (
                      <td className="pl-4 py-3">
                        <input type="checkbox" checked={selected.has(plot.id)} onChange={() => toggle(plot.id)}
                          aria-label={`Select ${plot.blockName ? `${plot.blockName}, ` : ""}Plot ${plot.plotNumber}`} />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="font-medium text-[var(--foreground)]">
                        {plot.blockName ? `${plot.blockName}, ` : ""}Plot {plot.plotNumber}{plot.isCorner ? " ★" : ""}
                      </div>
                      {plot.orientation && <div className="text-xs text-[var(--muted-foreground)]">Faces {plot.orientation}</div>}
                    </td>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">{plot.tierLabel}</td>
                    <td className="px-4 py-3 font-mono-data text-[var(--foreground)]">{plot.nominalSizeSqm === null ? "—" : `${plot.nominalSizeSqm} sqm`}</td>
                    {/* Null when there's no footprint — never the nominal size
                        standing in for a measurement nobody took. */}
                    <td className="px-4 py-3 font-mono-data text-[var(--muted-foreground)]">{plot.actualAreaSqm === null ? "Not surveyed" : `${plot.actualAreaSqm} sqm`}</td>
                    <td className="px-4 py-3 font-mono-data text-[var(--foreground)]">
                      {formatAmount(plot.price, plot.currency)}
                      {/* A corner plot's price matches no tier on the price
                          list, so the base and the premium are shown with it
                          rather than leaving the difference unexplained. */}
                      {plot.cornerPremiumPct !== null && (
                        <div className="text-xs text-[var(--muted-foreground)]">
                          {formatAmount(plot.basePrice, plot.currency)} + {plot.cornerPremiumPct}% corner
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
                        <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: STATUS_COLORS[plot.status] }} aria-hidden="true" />
                        {STATUS_LABELS[plot.status]}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {(plot.status === "available-dev" || plot.status === "available-inv") && (
                          <button type="button" onClick={() => quickChange(plot, "withheld")} disabled={rowBusy === plot.id}
                            className="text-xs text-[var(--accent)] hover:underline disabled:opacity-50">
                            Withhold
                          </button>
                        )}
                        {plot.status === "withheld" && (
                          <button type="button" onClick={() => quickChange(plot, "available")} disabled={rowBusy === plot.id}
                            className="text-xs text-[var(--accent)] hover:underline disabled:opacity-50">
                            Return to market
                          </button>
                        )}
                        {/* Reserved and sold: what a buyer agreed to — nothing to edit. */}
                        {(isEditablePlot(plot) || plot.status === "withheld") && (
                          <button type="button" onClick={() => setEditingPlotId(plot.id)} disabled={editingPlotId === plot.id}
                            className="ml-3 text-xs text-[var(--accent)] hover:underline disabled:opacity-50">
                            Edit
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {visible.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">No plots match those filters.</p>}
        </>
      )}
    </div>
  );
}

// ─── One plot: move tier, correct boundary, withdraw (IE-9..IE-11) ────────────

function PlotEditor({ estateId, plot, tiers, onClose, onChanged, onWithdrawn }: {
  estateId: string; plot: PortalPlot; tiers: PortalPriceTier[];
  onClose: () => void; onChanged: () => void; onWithdrawn: (label: string) => void;
}) {
  const label = `${plot.blockName ? `${plot.blockName}, ` : ""}Plot ${plot.plotNumber}`;
  const editable = isEditablePlot(plot);
  return (
    <div className="bg-[var(--card)] border border-[var(--accent)] rounded-xl p-5 space-y-6" aria-label={`Edit ${label}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[var(--foreground)]">{label} · {STATUS_LABELS[plot.status]}</p>
        <button type="button" onClick={onClose} className="text-xs text-[var(--muted-foreground)] hover:underline">Close</button>
      </div>
      {editable ? (
        <>
          <MovePlotTier estateId={estateId} plot={plot} tiers={tiers} onChanged={onChanged} />
          <CorrectPlotBoundary estateId={estateId} plot={plot} onChanged={onChanged} />
        </>
      ) : (
        <p className="text-sm text-[var(--muted-foreground)]">
          A withheld plot's tier and boundary can't be changed. Return it to the market first, then edit it.
        </p>
      )}
      <WithdrawPlot estateId={estateId} plot={plot} label={label} onWithdrawn={onWithdrawn} />
    </div>
  );
}

function MovePlotTier({ estateId, plot, tiers, onChanged }: { estateId: string; plot: PortalPlot; tiers: PortalPriceTier[]; onChanged: () => void }) {
  const scope = usePortalScope();
  const targets = tierMoveTargets(plot, tiers);
  const [chosenTierId, setTierId] = useState(targets[0]?.id ?? "");
  const [override, setOverride] = useState("");
  const [result, setResult] = useState<PlotTierChange | null>(null);
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  // After a move the plot's own tier changes, so the targets do too. A choice
  // that is no longer a target falls back to the first one that is — never a
  // select showing one tier while the button acts on none.
  const tierId = targets.some((t) => t.id === chosenTierId) ? chosenTierId : (targets[0]?.id ?? "");
  const target = targets.find((t) => t.id === tierId);
  const tierName = (id: string) => { const t = tiers.find((x) => x.id === id); return t ? tierDisplayLabel(t) : "another tier"; };

  const move = async () => {
    if (!scope || !target) return;
    setBusy(true);
    setError(null);
    try {
      const change = await movePlotToTier(estateId, plot.id, {
        tierId: target.id,
        // Only for a unit-type tier; a land-size tier sets the size itself.
        ...(target.tierType === "unit_type" && override ? { nominalSizeSqmOverride: Number(override) } : {}),
      }, scope);
      setResult(change);
      onChanged();
    } catch (err) {
      setError(err instanceof InventoryEditError ? { field: err.field, message: err.message } : { field: "form", message: "Couldn't move the plot." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-[var(--foreground)]">Move to another tier</h3>
      {targets.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          No tier to move it to. It can only move to an open tier of the same kind and currency.
        </p>
      ) : (
        <>
          <p className="text-xs text-[var(--muted-foreground)]">
            For a plot put in the wrong tier. It changes the plot's price{target?.tierType === "land_size" ? " and its size — the size on the deed" : ""}.
            Only open tiers of the same kind and currency are offered.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field id="move-tier" label="New tier" error={error?.field === "tierId" ? error.message : undefined}>
              <select id="move-tier" value={tierId} onChange={(e) => { setTierId(e.target.value); setResult(null); }} className={inputClass}>
                {targets.map((t) => <option key={t.id} value={t.id}>{tierDisplayLabel(t)} — {formatAmount(t.price, t.currency)}</option>)}
              </select>
            </Field>
            {target?.tierType === "unit_type" && (
              <Field id="move-override" label="Land area (sqm, optional)" hint="Left blank, the plot keeps its current size."
                error={error?.field === "nominalSizeSqmOverride" ? error.message : undefined}>
                <input id="move-override" type="number" min={0} value={override} onChange={(e) => setOverride(e.target.value)} className={inputClass} />
              </Field>
            )}
          </div>
          {error?.field === "form" && <p className="text-sm text-red-700" role="alert">{error.message}</p>}
          <button type="button" onClick={move} disabled={busy || !target}
            className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-60">
            {busy ? "Moving…" : "Move plot"}
          </button>
          {result && (
            <div className="rounded-lg bg-[var(--muted)] p-3 text-sm text-[var(--foreground)] space-y-1" role="status">
              <p>Moved from {tierName(result.previousTierId)} to {tierName(result.tierId)}.</p>
              <p className="font-mono-data text-xs">
                Price {formatAmount(result.previousPrice, result.currency)} → {formatAmount(result.price, result.currency)}
                {" · "}Size {result.previousNominalSizeSqm ?? "—"} → {result.nominalSizeSqm ?? "—"} sqm
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function CorrectPlotBoundary({ estateId, plot, onChanged }: { estateId: string; plot: PortalPlot; onChanged: () => void }) {
  const scope = usePortalScope();
  const [polygon, setPolygon] = useState<GeoJsonPolygon | null>(null);
  const [unresolved, setUnresolved] = useState(false);
  const [result, setResult] = useState<PlotBoundaryCorrection | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!scope || !polygon) return;
    setBusy(true);
    setError("");
    try {
      setResult(await correctPlotBoundary(estateId, plot.id, polygon, scope));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't correct the boundary.");
    } finally {
      setBusy(false);
    }
  };

  const overlapChange = result && result.plotOverlapsInEstateBefore !== result.plotOverlapsInEstateAfter;
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-[var(--foreground)]">{plot.hasFootprint ? "Correct the boundary" : "Add a boundary"}</h3>
      <BoundaryField
        inputId={`plot-boundary-${plot.id}`}
        label="Plot boundary"
        intro="A GeoJSON Polygon in [longitude, latitude] order, inside the estate's boundary. A boundary can be replaced but not removed; the surveyed area is recalculated."
        stateChecked={false}
        onChange={(state) => { setPolygon(state.polygon); setUnresolved(state.hasUnresolvedInput); setError(""); setResult(null); }}
      />
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      <button type="button" onClick={save} disabled={busy || !polygon || unresolved}
        className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-60">
        {busy ? "Saving…" : "Save boundary"}
      </button>
      {result && (
        <div className="rounded-lg bg-[var(--muted)] p-3 text-sm text-[var(--foreground)] space-y-1" role="status">
          <p className="font-mono-data text-xs">
            Surveyed area {result.previousActualAreaSqm === null ? "not surveyed" : `${result.previousActualAreaSqm} sqm`} → {result.actualAreaSqm} sqm
          </p>
          {/* Same-company plot overlaps warn; they never block publication. */}
          <p className="text-xs text-[var(--muted-foreground)]">
            Overlapping plot pairs on this estate: {result.plotOverlapsInEstateBefore} before, {result.plotOverlapsInEstateAfter} after
            {overlapChange ? (result.plotOverlapsInEstateAfter < result.plotOverlapsInEstateBefore ? " — this correction cleared one." : " — this correction created one; it's recorded for review.") : "."}
          </p>
          {/* Which ones — a correction that silently created a conflict would
              otherwise only surface at publication. */}
          <ConflictChangesView changes={result.conflictChanges} />
        </div>
      )}
    </section>
  );
}

function WithdrawPlot({ estateId, plot, label, onWithdrawn }: { estateId: string; plot: PortalPlot; label: string; onWithdrawn: (label: string) => void }) {
  const scope = usePortalScope();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const withdraw = async () => {
    if (!scope) return;
    setBusy(true);
    setError("");
    try {
      await withdrawPlot(estateId, plot.id, scope);
      onWithdrawn(label);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't withdraw the plot.");
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 border-t border-[var(--border)] pt-5">
      <h3 className="text-sm font-semibold text-[var(--foreground)]">Withdraw this plot</h3>
      <p className="text-xs text-[var(--muted-foreground)]">
        Removes a plot entered by mistake. Only possible if it has never been reserved or bought — even a lapsed hold counts — and has
        never been in a boundary conflict. Otherwise, withhold it instead.
      </p>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      {confirming ? (
        <div className="flex gap-3">
          <button type="button" onClick={withdraw} disabled={busy}
            className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-60">
            {busy ? "Withdrawing…" : `Withdraw ${label}`}
          </button>
          <button type="button" onClick={() => setConfirming(false)}
            className="px-4 py-2 border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] hover:bg-[var(--muted)]">
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setConfirming(true)}
          className="px-4 py-2 border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] hover:bg-[var(--muted)]">
          Withdraw…
        </button>
      )}
    </section>
  );
}

// ─── Bulk status (IE-8) ──────────────────────────────────────────────────────

const BULK_ACTIONS: { value: PlotStatusTarget; label: string }[] = [
  { value: "withheld", label: "Withhold — take off the market" },
  { value: "available", label: "Return to market (as before)" },
  { value: "available-dev", label: "Make available — development" },
  { value: "available-inv", label: "Make available — investment" },
];

// Skip and report, never all or nothing: one reserved plot must not block a
// 200-plot launch. A preview (dryRun) reports without writing, and applying
// re-checks every plot at the moment it changes — so a buyer reserving at
// that instant keeps their hold, and the result may differ from the preview.
function BulkStatusBar({ estateId, plotIds, plots, onClear, onApplied }: {
  estateId: string; plotIds: string[]; plots: PortalPlot[]; onClear: () => void; onApplied: (change: PlotStatusChange) => void;
}) {
  const scope = usePortalScope();
  const [target, setTarget] = useState<PlotStatusTarget>("withheld");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<PlotStatusChange | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const tooMany = plotIds.length > BULK_STATUS_LIMIT;

  const run = async (dryRun: boolean) => {
    if (!scope) return;
    setBusy(true);
    setError("");
    try {
      const change = await changePlotStatuses(estateId, { plotIds, status: target, reason: reason.trim() || undefined, dryRun }, scope);
      if (dryRun) setResult(change);
      else onApplied(change);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change those plots.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-[var(--card)] border border-[var(--accent)] rounded-xl p-5 space-y-4" aria-label="Change selected plots">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-[var(--foreground)]">{plotIds.length} {plotIds.length === 1 ? "plot" : "plots"} selected</p>
        <button type="button" onClick={onClear} className="text-xs text-[var(--muted-foreground)] hover:underline">Clear selection</button>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field id="bulk-action" label="Change to">
          <select id="bulk-action" value={target} onChange={(e) => { setTarget(e.target.value as PlotStatusTarget); setResult(null); }} className={inputClass}>
            {BULK_ACTIONS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </select>
        </Field>
        <Field id="bulk-reason" label="Reason (optional)" hint="Kept in the audit log.">
          <input id="bulk-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Survey dispute" className={inputClass} />
        </Field>
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">
        Reserved and sold plots are never changed here — only checkout moves them — and are skipped with a reason. On the marketplace a
        withheld plot simply shows as unavailable.
      </p>
      {tooMany && <p className="text-sm text-red-700">At most {BULK_STATUS_LIMIT} plots at once — narrow the selection.</p>}
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}

      {result && <div className="rounded-lg bg-[var(--muted)] p-4"><BulkResult result={result} plots={plots} /></div>}

      <div className="flex gap-3">
        <button type="button" onClick={() => run(true)} disabled={busy || tooMany}
          className="px-4 py-2 border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-60">
          Preview
        </button>
        <button type="button" onClick={() => run(false)} disabled={busy || tooMany}
          className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-60">
          {busy ? "Working…" : "Apply"}
        </button>
      </div>
    </div>
  );
}

function BulkResult({ result, plots }: { result: PlotStatusChange; plots: PortalPlot[] }) {
  const nameOf = (plotId: string, fallback: string | null) => {
    const plot = plots.find((p) => p.id === plotId);
    return plot ? `${plot.blockName ? `${plot.blockName}, ` : ""}Plot ${plot.plotNumber}` : fallback ? `Plot ${fallback}` : "Unknown plot";
  };
  return (
    <div className="space-y-2" role="status">
      <p className="text-sm text-[var(--foreground)]">
        {result.dryRun ? "Preview: " : ""}{result.changed.length} of {result.requested} {result.dryRun ? "would change" : "changed"}
        {result.skipped.length > 0 ? `, ${result.skipped.length} skipped` : ""}.
      </p>
      {result.skipped.length > 0 && (
        <ul className="text-xs text-[var(--muted-foreground)] space-y-0.5">
          {result.skipped.map((s) => <li key={s.plotId}>{nameOf(s.plotId, s.plotNumber)} — {s.reason}</li>)}
        </ul>
      )}
      {result.dryRun && <p className="text-xs text-[var(--muted-foreground)]">Applying checks every plot again at the moment it changes.</p>}
    </div>
  );
}

// ─── Tier editing ────────────────────────────────────────────────────────────

const CURRENCIES: Currency[] = ["NGN", "USD", "GBP", "EUR"];

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

// The reach of an edit, shown BEFORE it can be saved: "this affects 120 plots,
// 8 of which are reserved" is what makes a price edit safe to make. The counts
// are the server's; an absent status is zero, never missing data.
function TierImpactPreview({ tier, plots }: { tier: PortalPriceTier; plots: PlotCounts }) {
  const available = availableCount(plots);
  const reserved = countFor(plots, "reserved");
  const sold = countFor(plots, "sold");
  const withheld = countFor(plots, "withheld");

  if (plots.total === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        No plots are priced by this tier yet, so an edit here changes the tier and nothing else.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-[var(--foreground)]">
        This tier prices <span className="font-semibold">{plural(plots.total, "plot")}</span>
        {reserved > 0 ? <>, {reserved} of which {reserved === 1 ? "is" : "are"} reserved</> : null}.
      </p>
      <div className="flex flex-wrap gap-2">
        <StatusBadge label={`${available} available`} variant="success" />
        <StatusBadge label={`${reserved} reserved`} variant={reserved > 0 ? "warning" : "neutral"} />
        <StatusBadge label={`${sold} sold`} variant="neutral" />
        {/* Only when present: most estates never withhold a plot. */}
        {withheld > 0 && <StatusBadge label={`${withheld} withheld`} variant="neutral" />}
      </div>
      <ul className="text-xs text-[var(--muted-foreground)] space-y-1 list-disc pl-4">
        <li>
          A new price applies to all {plural(plots.total, "plot")}. A buyer who has already reserved keeps the price captured
          at reservation — an edit never reaches into a reservation or a sale.
        </li>
        {tier.tierType === "land_size" && (
          <li>
            A new size applies to available plots only ({available} now). Reserved and sold plots keep the size on their deed
            {withheld > 0 ? "; withheld plots take the tier's size when they return to the market" : ""}.
          </li>
        )}
      </ul>
    </div>
  );
}

function TierEditor({ estateId, tier, onCancel, onSaved }: {
  estateId: string; tier: PortalPriceTier; onCancel: () => void; onSaved: (update: PriceTierUpdate) => void;
}) {
  const scope = usePortalScope();
  const [price, setPrice] = useState(String(tier.price));
  const [label, setLabel] = useState(tier.label ?? "");
  const [sizeSqm, setSizeSqm] = useState(tier.sizeSqm === null ? "" : String(tier.sizeSqm));
  // Round-tripped with the rest. The server accepts the current value and
  // refuses any other, and that refusal is shown on the field itself.
  const [tierType, setTierType] = useState<TierType>(tier.tierType);
  const [currency, setCurrency] = useState<Currency>(tier.currency);
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const impact = useFetch(async () => (scope ? fetchPriceTierImpact(estateId, tier.id, scope) : null), [estateId, tier.id]);
  const plots = impact.data?.plots ?? null;

  const isLand = tier.tierType === "land_size";
  const priceChanged = Number(price) !== tier.price;
  const sizeChanged = isLand && sizeSqm !== "" && Number(sizeSqm) !== tier.sizeSqm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scope || !plots) return;
    const input: UpdatePriceTierInput = {
      price: Number(price),
      // An empty string clears the label, as the endpoint defines.
      label: label.trim(),
      tierType,
      currency,
      ...(isLand ? { sizeSqm: Number(sizeSqm) } : {}),
    };
    setSaving(true);
    setFieldError(null);
    try {
      onSaved(await updatePriceTier(estateId, tier.id, input, scope));
    } catch (err) {
      // An error for a field this form doesn't render falls back to the form,
      // so no refusal is ever silently swallowed.
      const shown = ["price", "label", "tierType", "currency", ...(isLand ? ["sizeSqm"] : [])];
      setFieldError(err instanceof InventoryEditError
        ? { field: shown.includes(err.field) ? err.field : "form", message: err.message }
        : { field: "form", message: err instanceof Error ? err.message : "Couldn't update the tier." });
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-[var(--card)] border border-[var(--accent)] rounded-xl p-5 space-y-4" aria-label={`Edit ${tierDisplayLabel(tier)}`}>
      <h2 className="text-sm font-semibold text-[var(--foreground)]">Edit {tierDisplayLabel(tier)}</h2>

      {/* Before the form: the reach of an edit has to be known before it's made. */}
      <div className="rounded-lg bg-[var(--muted)] p-4">
        {impact.loading && <p className="text-sm text-[var(--muted-foreground)]">Checking which plots this tier reaches…</p>}
        {impact.error && (
          <div className="text-sm text-red-700">
            Couldn't load which plots this tier reaches, so it can't be edited yet.{" "}
            <button type="button" onClick={impact.refetch} className="underline">Try again</button>
          </div>
        )}
        {plots && <TierImpactPreview tier={tier} plots={plots} />}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <TierField id="edit-price" errorKey="price" label={`Price (${tier.currency})`} type="number" value={price} onChange={setPrice} error={fieldError} />
        {isLand && <TierField id="edit-sizeSqm" errorKey="sizeSqm" label="Size (sqm)" type="number" value={sizeSqm} onChange={setSizeSqm} error={fieldError} />}
      </div>

      <TierField id="edit-label" errorKey="label" label={isLand ? "Label (optional)" : "Label"} value={label} onChange={setLabel} error={fieldError} />

      <div className="grid sm:grid-cols-2 gap-4">
        <Field id="edit-tier-type" label="Tier type" error={fieldError?.field === "tierType" ? fieldError.message : undefined}>
          <select id="edit-tier-type" value={tierType} onChange={(e) => setTierType(e.target.value as TierType)} className={inputClass}>
            <option value="land_size">Land size</option>
            <option value="unit_type">Unit type</option>
          </select>
        </Field>
        <Field id="edit-currency" label="Currency" error={fieldError?.field === "currency" ? fieldError.message : undefined}>
          <select id="edit-currency" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className={inputClass}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </div>

      {fieldError?.field === "form" && <p className="text-sm text-red-700" role="alert">{fieldError.message}</p>}

      {/* What saving will do, in the server's own counts. */}
      {plots && plots.total > 0 && (priceChanged || sizeChanged) && (
        <p className="text-xs text-[var(--foreground)]">
          Saving will{priceChanged ? ` reprice all ${plural(plots.total, "plot")}` : ""}
          {priceChanged && sizeChanged ? " and" : ""}
          {sizeChanged ? ` resize ${plural(availableCount(plots), "available plot")}` : ""}.
        </p>
      )}

      <div className="flex gap-3">
        <button type="submit" disabled={saving || !plots} className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-60">
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] hover:bg-[var(--muted)]">
          Cancel
        </button>
      </div>
    </form>
  );
}

// After a save. `sizeChange` is null when the size did not change — which
// says nothing about the price or label, so no plot count is claimed then.
function TierEditResult({ tierName, update, onDismiss }: { tierName: string; update: PriceTierUpdate; onDismiss: () => void }) {
  const change = update.sizeChange;
  const keptReserved = change ? countFor(change.keptPreviousSize, "reserved") : 0;
  const keptSold = change ? countFor(change.keptPreviousSize, "sold") : 0;
  const keptWithheld = change ? countFor(change.keptPreviousSize, "withheld") : 0;

  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-3" role="status">
      <div className="flex items-center gap-3">
        <StatusBadge label="Saved" variant="success" />
        <p className="text-sm font-medium text-[var(--foreground)]">{tierName} updated.</p>
        <button type="button" onClick={onDismiss} className="ml-auto text-xs text-[var(--muted-foreground)] hover:underline">Dismiss</button>
      </div>

      {change && (
        <div className="space-y-2">
          <p className="text-sm text-[var(--foreground)]">
            Size changed from {change.previousSizeSqm} sqm to {change.newSizeSqm} sqm.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-[var(--border)] p-3">
              <div className="text-xs text-[var(--muted-foreground)]">Updated to {change.newSizeSqm} sqm</div>
              <div className="font-mono-data text-lg text-[var(--foreground)]">{change.plotsUpdated}</div>
              <div className="text-xs text-[var(--muted-foreground)]">available {change.plotsUpdated === 1 ? "plot" : "plots"}</div>
            </div>
            <div className="rounded-lg border border-[var(--border)] p-3">
              <div className="text-xs text-[var(--muted-foreground)]">Kept {change.previousSizeSqm} sqm</div>
              <div className="font-mono-data text-lg text-[var(--foreground)]">{change.keptPreviousSize.total}</div>
              <div className="text-xs text-[var(--muted-foreground)]">
                {keptReserved} reserved · {keptSold} sold{keptWithheld > 0 ? ` · ${keptWithheld} withheld` : ""}
              </div>
            </div>
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">{change.note}</p>
          {change.keptPreviousSize.total > 0 && (
            <p className="text-xs text-[var(--muted-foreground)]">
              Why: a plot's size is what appears on its deed. Changing it under a buyer who has already reserved would alter
              what they agreed to buy — even though their price is locked.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Block rename ────────────────────────────────────────────────────────────

function BlockRenameForm({ estateId, block, onCancel, onSaved }: {
  estateId: string; block: PortalBlock; onCancel: () => void; onSaved: () => void;
}) {
  const scope = usePortalScope();
  const [name, setName] = useState(block.name);
  const [label, setLabel] = useState(block.label ?? "");
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scope) return;
    setSaving(true);
    setError(null);
    try {
      // An empty label clears it, as the endpoint defines.
      await updateBlock(estateId, block.id, { name, label: label.trim() }, scope);
      onSaved();
    } catch (err) {
      setError(err instanceof InventoryEditError
        ? { field: err.field === "name" || err.field === "label" ? err.field : "form", message: err.message }
        : { field: "form", message: err instanceof Error ? err.message : "Couldn't rename the block." });
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 py-1" aria-label={`Rename ${block.name}`}>
      <div className="grid sm:grid-cols-2 gap-3">
        <TierField id="rename-name" errorKey="name" label="Name" value={name} onChange={setName} error={error} />
        <TierField id="rename-label" errorKey="label" label="Label (optional)" value={label} onChange={setLabel} error={error} />
      </div>
      {error?.field === "form" && <p className="text-sm text-red-700" role="alert">{error.message}</p>}
      <div className="flex gap-3">
        <button type="submit" disabled={saving} className="px-3 py-1.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-60">
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onCancel} className="px-3 py-1.5 border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] hover:bg-[var(--muted)]">
          Cancel
        </button>
      </div>
    </form>
  );
}

const inputClass = "w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--accent)]";
const filterClass = "px-3 py-1.5 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--accent)]";

// `errorKey` is the field name an error arrives under ("price", "name"…),
// kept apart from the DOM id so two forms on one page never share an id.
function TierField({ id, errorKey = id, label, value, onChange, type = "text", placeholder, error }: {
  id: string; errorKey?: string; label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; error?: { field: string; message: string } | null;
}) {
  const invalid = error?.field === errorKey;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-[var(--foreground)] mb-1.5">{label}</label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-error` : undefined}
        className={`${inputClass} ${invalid ? "border-red-400" : ""}`}
      />
      {invalid && <p id={`${id}-error`} className="text-xs text-red-700 mt-1">{error!.message}</p>}
    </div>
  );
}

// EB-2. Said once at the top rather than leaving a branch user to discover it
// action by action.
export function ReadOnlyNotice() {
  return (
    <p className="text-sm text-[var(--muted-foreground)] bg-[var(--muted)] rounded-lg px-4 py-3 mb-5" role="note">
      This estate belongs to the company rather than a branch. You can see it, but only company-wide staff can change it.
    </p>
  );
}
