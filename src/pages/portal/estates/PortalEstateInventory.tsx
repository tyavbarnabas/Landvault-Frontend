import { useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { useFetch } from "../../../lib/useFetch";
import { formatAmount, type Currency } from "../../../data/mockData";
import { STATUS_COLORS, STATUS_LABELS } from "../../../lib/plotStatus";
import { useApp } from "../../../contexts/AppContext";
import { canManageEstates } from "../../../services/authService";
import { fetchEstateGeoJson, fetchPortalEstateById } from "../../../services/portalEstatesService";
import {
  InventoryEditError, availableCount, countFor, createBlock, createPriceTier, fetchBlocks, fetchInventoryGeoJson,
  fetchPlots, fetchPriceTierImpact, fetchPriceTiers, tierDisplayLabel, updateBlock, updatePriceTier, validatePriceTier,
  type CreatePriceTierInput, type PlotCounts, type PortalBlock, type PortalPlot, type PortalPriceTier,
  type PortalPlotStatus, type PriceTierUpdate, type TierType, type UpdatePriceTierInput,
} from "../../../services/portalInventoryService";
import EstateBoundaryMap from "../../../components/map/EstateBoundaryMap";
import EmptyState from "../../../components/marketplace/EmptyState";
import StatusBadge from "../../../components/StatusBadge";
import TabBar from "../../../components/TabBar";
import { Field } from "../../../components/portal/formParts";
import { usePortalScope } from "../usePortalScope";

type Tab = "tiers" | "blocks" | "plots";

export default function PortalEstateInventory() {
  const { estateId } = useParams<{ estateId: string }>();
  const scope = usePortalScope();
  const { user } = useApp();
  const canManage = canManageEstates(user);
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

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link to={`/portal/estates/${estateId}`} className="text-xs text-[var(--accent)] hover:underline">← {estate.name}</Link>
      <h1 className="font-display text-3xl text-[var(--foreground)] mt-2 mb-1">Inventory</h1>
      <p className="text-sm text-[var(--muted-foreground)] mb-6">
        Price by tier, not per plot: {plots.length} plot{plots.length === 1 ? "" : "s"} priced by {tiers.length} tier{tiers.length === 1 ? "" : "s"}.
      </p>

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
        {tab === "plots" && <PlotsPanel estateId={estateId} plots={plots} blocks={blocks} tiers={tiers} mapData={mapData} />}
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
                        <button
                          type="button"
                          onClick={() => { setEditingId(tier.id); setLastEdit(null); }}
                          disabled={editingId === tier.id}
                          className="text-sm text-[var(--accent)] hover:underline disabled:opacity-50 disabled:no-underline"
                        >
                          Edit
                        </button>
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

      <form onSubmit={submit} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4">
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
      </form>
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

      <form onSubmit={submit} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">Add a block</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <TierField id="block-name" label="Name" value={name} onChange={setName} placeholder="Block C" />
          <TierField id="block-label" label="Label (optional)" value={label} onChange={setLabel} />
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={saving || !name.trim()} className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-60">
          {saving ? "Adding…" : "Add block"}
        </button>
      </form>
    </div>
  );
}

// ─── Plots ───────────────────────────────────────────────────────────────────

function PlotsPanel({ estateId, plots, blocks, tiers, mapData }: {
  estateId: string; plots: PortalPlot[]; blocks: PortalBlock[]; tiers: PortalPriceTier[];
  mapData: { type: "FeatureCollection"; features: unknown[] } | null;
}) {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-[var(--muted-foreground)]">{plots.length} plot{plots.length === 1 ? "" : "s"} on this estate.</p>
        <Link to={`/portal/estates/${estateId}/plots/new`} className="shrink-0 px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90">
          Add plots
        </Link>
      </div>

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
                  <th scope="col" className="px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Plot</th>
                  <th scope="col" className="px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Tier</th>
                  {/* Two separate columns, deliberately: what was sold, and what
                      the ground measures. Neither corrects the other. */}
                  <th scope="col" className="px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Nominal (sold as)</th>
                  <th scope="col" className="px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Surveyed</th>
                  <th scope="col" className="px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Price</th>
                  <th scope="col" className="px-4 py-2.5 font-medium text-[var(--muted-foreground)]">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)] bg-[var(--card)]">
                {visible.map((plot) => (
                  <tr key={plot.id}>
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
      </div>
      <ul className="text-xs text-[var(--muted-foreground)] space-y-1 list-disc pl-4">
        <li>
          A new price applies to all {plural(plots.total, "plot")}. A buyer who has already reserved keeps the price captured
          at reservation — an edit never reaches into a reservation or a sale.
        </li>
        {tier.tierType === "land_size" && (
          <li>
            A new size applies to available plots only ({available} now). Reserved and sold plots keep the size on their deed.
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
              <div className="text-xs text-[var(--muted-foreground)]">{keptReserved} reserved · {keptSold} sold</div>
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
