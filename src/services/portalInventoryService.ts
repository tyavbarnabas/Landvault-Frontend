// Backend integration seam for the developer portal's estate inventory:
// blocks, price tiers and plots. See INTEGRATION.md.
//
// Endpoints live under /api/portal/estates/{id}/... alongside slice 1's
// estate lifecycle (portalEstatesService.ts); split into its own module only
// because blocks/tiers/plots is a distinct enough domain to keep both files
// readable. Scoping works the same way — enforced server-side by RLS, with
// `scope` here only so mock mode can stand in for it.
//
// TWO FIELDS THE BACKEND DELIBERATELY DOES NOT ACCEPT, and this module does
// not either:
//
//   nominalSizeSqm — a plot's nominal size IS its tier's, copied at creation.
//     Accepting one would let a caller supply a size contradicting the tier
//     the plot is priced by, leaving the invoice and the deed disagreeing
//     about what was sold. The only exception is nominalSizeSqmOverride on a
//     UNIT_TYPE tier, which has no size of its own.
//
//   actualAreaSqm — computed from the footprint on write
//     (ST_Area(footprint::geography) on a real backend; polygonAreaSqm here,
//     inside the service, standing in for it). Never an input, and never
//     derived at the display layer.

import type { Currency, PlotStatus } from "../data/mockData";

// The backend's PlotOrientation @JsonValue strings — uppercase compass points.
export type PlotOrientation = "N" | "S" | "E" | "W" | "NE" | "NW" | "SE" | "SW";
import { ApiError, apiClient } from "../lib/apiClient";
import { paginateMock, type Page, type PageParams } from "../lib/pagination";
import { polygonAreaSqm } from "../lib/geometry";
import { fetchPortalEstateById, type GeoJsonFeature, type GeoJsonFeatureCollection, type GeoJsonPolygon, type PortalScope } from "./portalEstatesService";


// ─── Blocks ──────────────────────────────────────────────────────────────────
// Deliberately thin. Blocks exist because plots are addressed as "Block C,
// Plot 4", not because they carry data of their own — so they are not
// elaborated beyond a name and an optional label.

export interface PortalBlock {
  id: string;
  estateId: string;
  name: string;
  label?: string;
}

export interface CreateBlockInput {
  name: string;
  label?: string;
}

// ─── Price tiers ─────────────────────────────────────────────────────────────

// Wire values are the backend's TierType @JsonValue strings — lowercase with
// underscores, NOT the Java constant names. "land_size" prices bare land by
// area; "unit_type" prices a built unit, where `label` ("3-bed terrace")
// carries the meaning a size would otherwise.
export type TierType = "land_size" | "unit_type";

export interface PortalPriceTier {
  id: string;
  estateId: string;
  tierType: TierType;
  // Required for LAND_SIZE, always null for UNIT_TYPE.
  sizeSqm: number | null;
  price: number;
  currency: Currency;
  label?: string;
  // How many plots point at this tier. A tier with none shows zero — the real
  // count, never an estimate. `PriceTierDto` does not carry it, so against a
  // real backend it is the server's own `.../impact` total for the tier.
  plotCount: number;
  // Display-only comparison figure. AGENTS.md is explicit that price is the
  // developer's own figure per tier and is NEVER derived from a per-sqm rate:
  // 180 sqm at ₦18,000/sqm beside 600 sqm at ₦14,500/sqm is ordinary market
  // behaviour, not an inconsistency to flag. Null for UNIT_TYPE, where a
  // per-square-metre figure has no meaning — null, not zero.
  //
  // Also null against a real backend: `PriceTierDto` carries no such figure,
  // and figures arrive computed — this module does not divide one out.
  pricePerSqm: number | null;
}

export interface CreatePriceTierInput {
  tierType: TierType;
  sizeSqm?: number;
  price: number;
  currency: Currency;
  label?: string;
}

export interface FieldError {
  field: string;
  message: string;
}

// Mirrors the backend's own check, which runs before the database constraint
// so a clean 400 comes back rather than a constraint violation. Surfaced as a
// field error, not a generic failure.
export function validatePriceTier(input: CreatePriceTierInput): FieldError | null {
  if (input.tierType === "land_size" && (input.sizeSqm === undefined || input.sizeSqm <= 0)) {
    return { field: "sizeSqm", message: "A land-size tier needs the plot size in square metres." };
  }
  if (input.tierType === "unit_type" && input.sizeSqm !== undefined) {
    return { field: "sizeSqm", message: "A unit-type tier has no size of its own — describe it with a label instead." };
  }
  if (input.tierType === "unit_type" && !input.label?.trim()) {
    return { field: "label", message: "A unit-type tier needs a label, such as \"3-bed terrace\"." };
  }
  if (!(input.price > 0)) {
    return { field: "price", message: "Enter the price for this tier." };
  }
  return null;
}

// ─── Editing tiers and blocks ────────────────────────────────────────────────

// `PUT .../price-tiers/{tierId}` — UpdatePriceTierRequest. Every field is
// optional and one left out stays as it is. `tierType` and `currency` are
// accepted ONLY so a form can round-trip the current values: a different value
// is refused (TIER_TYPE_IMMUTABLE / TIER_CURRENCY_IMMUTABLE), because a
// different type or currency is a different tier, not an edit to this one.
// `label: ""` clears the label. `sizeSqm` is for land_size tiers only.
export interface UpdatePriceTierInput {
  price?: number;
  label?: string;
  sizeSqm?: number;
  tierType?: TierType;
  currency?: Currency;
}

// PriceTierSizeChange. Present ONLY when the size actually changed; null means
// the size did not change — not that nothing happened.
//
// A size change reaches available plots only. `nominal_size_sqm` is what
// appears on a deed, and a reservation locks the price but not the size, so
// changing it under a buyer who has already reserved would alter what they
// agreed to buy. `keptPreviousSize` is those plots, by status — same shape and
// same absent-means-zero rule as PlotCounts.
export interface PriceTierSizeChange {
  previousSizeSqm: number;
  newSizeSqm: number;
  plotsUpdated: number;
  keptPreviousSize: PlotCounts;
  note: string;
}

// PriceTierUpdate — the tier as it now stands (a bare PriceTierDto: no plot
// count, no per-sqm figure), plus what a size change reached.
export interface PriceTierUpdate {
  tier: PriceTierDto;
  sizeChange: PriceTierSizeChange | null;
}

// PriceTierImpact — how many plots point at this tier, by status, BEFORE an
// edit. A price change applies to all of them, though a buyer who reserved
// keeps the price captured at reservation; a size change applies to available
// plots only.
export interface PriceTierImpact {
  tierId: string;
  plots: PlotCounts;
}

// `PUT .../blocks/{blockId}` — UpdateBlockRequest. `name` must not be blank
// when sent; `label: ""` clears the label. Names are unique within the estate.
export interface UpdateBlockInput {
  name?: string;
  label?: string;
}

// An edit the server refused, pinned to the field a form should show it on.
// `code` is the server's stable code; `message` is written for people. Thrown
// identically in mock and real mode so a form branches on one shape.
export class InventoryEditError extends Error {
  field: string;
  code: string;
  constructor(field: string, code: string, message: string) {
    super(message);
    this.name = "InventoryEditError";
    this.field = field;
    this.code = code;
  }
}

// ─── Plots ───────────────────────────────────────────────────────────────────

// All three are the backend's own @JsonValue strings.
//
// PlotIntent is what the BUYER means to do with the land; ListingIntent is what
// the SELLER is offering. Different axes, both legitimate — a plot can be
// for_sale with an investment buyer intent, or for_rent with no buyer intent at
// all. Folding one into the other would lose a real distinction.
// Matches PlotCountsDto. `byStatus` carries ONLY statuses that actually occur:
// an absent status means zero, not missing data, and an estate with no plots
// gets total 0 with an empty map rather than a fabricated spread. A caller
// rendering a fixed set of chips supplies its own zero — hence countFor below.
export interface PlotCounts {
  total: number;
  byStatus: Partial<Record<PlotStatus, number>>;
}

export function countFor(counts: PlotCounts | null | undefined, status: PlotStatus): number {
  return counts?.byStatus[status] ?? 0;
}

export function availableCount(counts: PlotCounts | null | undefined): number {
  return countFor(counts, "available-dev") + countFor(counts, "available-inv");
}

export type PlotIntent = "development" | "investment";
export type PropertyType = "land" | "built";
export type ListingIntent = "for_sale" | "for_rent" | "both";

export interface CreatePlotInput {
  plotNumber: string;
  blockId?: string;
  priceTierId: string;
  isCorner?: boolean;
  status: PortalPlotStatus;
  intent?: PlotIntent;
  propertyType?: PropertyType;
  listingIntent?: ListingIntent;
  orientation?: PlotOrientation;
  // Accepted ONLY for a unit_type tier: a terrace on its own plot has a real
  // land area worth recording, while an apartment has none and leaves it null.
  nominalSizeSqmOverride?: number;
  footprint?: GeoJsonPolygon;
}

// The backend's PlotStatus @JsonValue strings ARE this repo's existing union
// (mockData.ts's PlotStatus) — hyphenated and lowercase, adopted from the
// frontend deliberately. So there is nothing to map.
//
// The two available variants are NOT redundant: an estate sells development
// plots and investment plots side by side, and the distinction is load-bearing
// server-side — the reservation sweeper restores a plot's PREVIOUS availability
// variant when a hold lapses, specifically so a development plot doesn't
// silently become an investment one.
export type PortalPlotStatus = PlotStatus;

export interface PortalPlot {
  id: string;
  estateId: string;
  plotNumber: string;
  blockId?: string;
  blockName?: string;
  priceTierId: string;
  tierLabel: string;
  isCorner: boolean;
  status: PortalPlotStatus;
  intent?: PlotIntent;
  propertyType?: PropertyType;
  listingIntent?: ListingIntent;
  orientation?: PlotOrientation;
  // What was SOLD: the tier's size, or the override on a UNIT_TYPE tier.
  nominalSizeSqm: number | null;
  // What the survey MEASURED, computed from the footprint. Null when there is
  // no footprint — never the nominal size as a fallback. These are different
  // numbers on purpose (a plot sold as 250 sqm may survey at 250.36) and are
  // never reconciled or presented as a discrepancy to correct.
  actualAreaSqm: number | null;
  // THREE price fields, as PlotDetailDto carries them, not just the final one:
  // showing only `price` on a corner plot shows a number matching no tier on
  // the price list, with nothing to explain the difference.
  basePrice: number;
  // Null when this plot is not a corner.
  cornerPremiumPct: number | null;
  price: number;
  currency: Currency;
  // A displayed comparison, never an input to pricing. Null whenever
  // nominalSizeSqm is — an apartment has no exclusive land area, and dividing
  // by nothing would fabricate a rate.
  pricePerSqm: number | null;
  // Geometry is NOT on this row. PlotDto carries only this flag; footprints
  // come from the estate's /geojson endpoint.
  hasFootprint: boolean;
}

// The endpoint's own cap. A larger estate is created in several requests
// rather than failing at 501.
export const PLOT_BATCH_LIMIT = 500;

export interface PlotFilters {
  status?: PortalPlotStatus;
  blockId?: string;
  priceTierId?: string;
  isCorner?: boolean;
}

// NOTE: there is deliberately no status mapper here any more. The public
// marketplace DOES collapse availability to available/unavailable — internal
// sales status is not a buyer's business — but that is a separate public
// projection (see marketplaceService.ts), never the portal's model.

// ─── Mock stores ─────────────────────────────────────────────────────────────

const mockBlocks: PortalBlock[] = [];
const mockTiers: PortalPriceTier[] = [];
const mockPlots: PortalPlot[] = [];
// Geometry lives apart from the plot row, exactly as the backend keeps it: the
// row carries only `hasFootprint`, and shapes are served from /geojson.
const mockFootprints = new Map<string, GeoJsonPolygon>();
let sequence = 0;
const nextId = (prefix: string) => `${prefix}-${++sequence}`;

async function assertInScope(estateId: string, scope: PortalScope): Promise<boolean> {
  return (await fetchPortalEstateById(estateId, scope)) !== null;
}

// ─── Wire shapes ─────────────────────────────────────────────────────────────
//
// The backend has NO list endpoint for blocks or tiers, and no /plot-counts:
// all three arrive on `GET /api/portal/estates/{id}` (EstateDetailDto). So the
// real-mode reads below take that one response apart rather than calling
// endpoints that would 404.

export interface PriceTierDto {
  id: string;
  estateId: string;
  tierType: TierType;
  sizeSqm: number | null;
  price: number;
  currency: Currency;
  label: string | null;
}

interface BlockDto {
  id: string;
  estateId: string;
  name: string;
  label: string | null;
}

interface InventoryDetailDto {
  blocks: BlockDto[] | null;
  priceTiers: PriceTierDto[] | null;
  plotCounts: PlotCounts | null;
}

function fetchInventoryDetail(estateId: string): Promise<InventoryDetailDto> {
  return apiClient.get<InventoryDetailDto>(`/api/portal/estates/${estateId}`);
}

function fromBlockDto(dto: BlockDto): PortalBlock {
  return { id: dto.id, estateId: dto.estateId, name: dto.name, label: dto.label ?? undefined };
}

function fromPriceTierDto(dto: PriceTierDto, plotCount: number): PortalPriceTier {
  return {
    id: dto.id,
    estateId: dto.estateId,
    tierType: dto.tierType,
    sizeSqm: dto.sizeSqm,
    price: dto.price,
    currency: dto.currency,
    label: dto.label ?? undefined,
    plotCount,
    pricePerSqm: null,
  };
}

// ─── Blocks API ──────────────────────────────────────────────────────────────

export async function fetchBlocks(estateId: string, scope: PortalScope): Promise<PortalBlock[]> {
  if (!apiClient.isMockMode) return ((await fetchInventoryDetail(estateId)).blocks ?? []).map(fromBlockDto);
  if (!(await assertInScope(estateId, scope))) return [];
  return mockBlocks.filter((b) => b.estateId === estateId);
}

export async function createBlock(estateId: string, input: CreateBlockInput, scope: PortalScope): Promise<PortalBlock> {
  if (!apiClient.isMockMode) return apiClient.post<PortalBlock>(`/api/portal/estates/${estateId}/blocks`, input);
  if (!(await assertInScope(estateId, scope))) throw new Error("Estate not found.");
  if (mockBlocks.some((b) => b.estateId === estateId && b.name.toLowerCase() === input.name.trim().toLowerCase())) {
    throw new Error(`This estate already has a block called "${input.name.trim()}".`);
  }
  const block: PortalBlock = { id: nextId("blk"), estateId, name: input.name.trim(), label: input.label?.trim() || undefined };
  mockBlocks.push(block);
  return block;
}

// Blocks are deliberately thin — nothing depends on a name beyond display — so
// a rename is low-risk. The one rule is uniqueness within the estate
// (uq_blocks_estate_name), surfaced as a message about the NAME rather than a
// constraint violation.
export async function updateBlock(estateId: string, blockId: string, input: UpdateBlockInput, scope: PortalScope): Promise<PortalBlock> {
  if (input.name !== undefined && !input.name.trim()) {
    throw new InventoryEditError("name", "INVALID_REQUEST", "A block name can't be blank.");
  }

  if (!apiClient.isMockMode) {
    try {
      return fromBlockDto(await apiClient.put<BlockDto>(`/api/portal/estates/${estateId}/blocks/${blockId}`, input));
    } catch (err) {
      throw blockEditError(err, input);
    }
  }

  if (!(await assertInScope(estateId, scope))) throw new InventoryEditError("form", "ESTATE_NOT_FOUND", "Estate not found.");
  const block = mockBlocks.find((b) => b.id === blockId && b.estateId === estateId);
  if (!block) throw new InventoryEditError("form", "RELATED_RECORD_NOT_FOUND", "This block no longer exists on this estate.");

  if (input.name !== undefined) {
    const name = input.name.trim();
    const clash = mockBlocks.some((b) => b.estateId === estateId && b.id !== blockId && b.name.toLowerCase() === name.toLowerCase());
    if (clash) throw new InventoryEditError("name", "DUPLICATE_RECORD", duplicateBlockMessage(name));
    block.name = name;
    // Plot rows carry the block's name for display; the backend joins it at
    // read time, so a rename shows everywhere at once.
    for (const plot of mockPlots) if (plot.blockId === blockId) plot.blockName = name;
  }
  if (input.label !== undefined) block.label = input.label.trim() || undefined;
  return { ...block };
}

function duplicateBlockMessage(name: string): string {
  return `Another block on this estate is already called "${name}". Block names must be unique within an estate.`;
}

function blockEditError(err: unknown, input: UpdateBlockInput): Error {
  if (!(err instanceof ApiError)) return err instanceof Error ? err : new Error("Couldn't rename the block.");
  const body = err.body;
  // 409 from either the pre-check or uq_blocks_estate_name itself. The name is
  // the only unique field on a block, so the message is about the name — never
  // the raw constraint the handler's fallback would echo.
  if (err.status === 409) return new InventoryEditError("name", "DUPLICATE_RECORD", duplicateBlockMessage(input.name?.trim() ?? ""));
  if (err.status === 404) return new InventoryEditError("form", body?.code ?? "NOT_FOUND", "This block no longer exists on this estate.");
  const fieldError = firstFieldError(body?.fieldErrors);
  if (fieldError) return new InventoryEditError(fieldError.field, "VALIDATION", fieldError.message);
  if (body?.code === "INVALID_REQUEST") return new InventoryEditError("name", body.code, body.message ?? "That block name isn't valid.");
  return new InventoryEditError("form", body?.code ?? "UNKNOWN", body?.message ?? "Couldn't rename the block.");
}

function firstFieldError(fieldErrors: Record<string, string> | undefined): { field: string; message: string } | null {
  const entry = fieldErrors ? Object.entries(fieldErrors)[0] : undefined;
  return entry ? { field: entry[0], message: entry[1] } : null;
}

// ─── Price tiers API ─────────────────────────────────────────────────────────

export async function fetchPriceTiers(estateId: string, scope: PortalScope): Promise<PortalPriceTier[]> {
  if (!apiClient.isMockMode) {
    const tiers = (await fetchInventoryDetail(estateId)).priceTiers ?? [];
    // One impact read per tier — an estate has a handful of tiers, not
    // hundreds — so the count shown is the server's, never a recount of a plot
    // page that may be truncated.
    const impacts = await Promise.all(tiers.map((t) => fetchPriceTierImpact(estateId, t.id, scope)));
    return tiers.map((t, i) => fromPriceTierDto(t, impacts[i].plots.total));
  }
  if (!(await assertInScope(estateId, scope))) return [];
  return mockTiers.filter((t) => t.estateId === estateId).map(withLivePlotCount);
}

function withLivePlotCount(tier: PortalPriceTier): PortalPriceTier {
  return { ...tier, plotCount: mockPlots.filter((p) => p.priceTierId === tier.id).length };
}

// Same grouped shape the backend returns: only statuses that occur.
export async function fetchPlotCounts(estateId: string, scope: PortalScope): Promise<PlotCounts> {
  if (!apiClient.isMockMode) return (await fetchInventoryDetail(estateId)).plotCounts ?? { total: 0, byStatus: {} };
  if (!(await assertInScope(estateId, scope))) return { total: 0, byStatus: {} };
  const plots = mockPlots.filter((p) => p.estateId === estateId);
  const byStatus: Partial<Record<PlotStatus, number>> = {};
  for (const plot of plots) byStatus[plot.status] = (byStatus[plot.status] ?? 0) + 1;
  return { total: plots.length, byStatus };
}

export async function createPriceTier(estateId: string, input: CreatePriceTierInput, scope: PortalScope): Promise<PortalPriceTier> {
  const invalid = validatePriceTier(input);
  if (invalid) throw new Error(invalid.message);

  if (!apiClient.isMockMode) return apiClient.post<PortalPriceTier>(`/api/portal/estates/${estateId}/price-tiers`, input);
  if (!(await assertInScope(estateId, scope))) throw new Error("Estate not found.");

  const sizeSqm = input.tierType === "land_size" ? input.sizeSqm! : null;
  const tier: PortalPriceTier = {
    id: nextId("tier"),
    estateId,
    tierType: input.tierType,
    sizeSqm,
    price: input.price,
    currency: input.currency,
    label: input.label?.trim() || undefined,
    plotCount: 0,
    // Computed once, server-side, purely for comparison on screen.
    pricePerSqm: sizeSqm ? Math.round(input.price / sizeSqm) : null,
  };
  mockTiers.push(tier);
  return tier;
}

// Same grouped shape as PlotCounts: only statuses that occur.
function countByStatus(plots: PortalPlot[]): PlotCounts {
  const byStatus: Partial<Record<PlotStatus, number>> = {};
  for (const plot of plots) byStatus[plot.status] = (byStatus[plot.status] ?? 0) + 1;
  return { total: plots.length, byStatus };
}

const isAvailable = (status: PlotStatus) => status === "available-dev" || status === "available-inv";

export async function fetchPriceTierImpact(estateId: string, tierId: string, scope: PortalScope): Promise<PriceTierImpact> {
  if (!apiClient.isMockMode) return apiClient.get<PriceTierImpact>(`/api/portal/estates/${estateId}/price-tiers/${tierId}/impact`);
  if (!(await assertInScope(estateId, scope))) throw new Error("Estate not found.");
  if (!mockTiers.some((t) => t.id === tierId && t.estateId === estateId)) throw new Error("This tier no longer exists on this estate.");
  return { tierId, plots: countByStatus(mockPlots.filter((p) => p.priceTierId === tierId)) };
}

// Mirrors the server's own wording, so both modes read the same.
const SIZE_NOTE_ALL = "Every plot on this tier now carries the new size.";
const SIZE_NOTE_KEPT = "Reserved and sold plots keep the size their buyer agreed to. A reserved plot "
  + "that returns to the market takes the tier's size at that point.";
const TIER_TYPE_IMMUTABLE = "A tier's type cannot change. Create a new tier and move the plots to it.";
const TIER_CURRENCY_IMMUTABLE = "A tier's currency cannot change. Create a new tier in that currency and move the plots to it.";

export async function updatePriceTier(
  estateId: string,
  tierId: string,
  input: UpdatePriceTierInput,
  scope: PortalScope,
): Promise<PriceTierUpdate> {
  // The request's own @Positive constraints, checked before the round trip.
  if (input.price !== undefined && !(input.price > 0)) throw new InventoryEditError("price", "VALIDATION", "Enter a price above zero.");
  if (input.sizeSqm !== undefined && !(input.sizeSqm > 0)) throw new InventoryEditError("sizeSqm", "VALIDATION", "Enter a size above zero.");

  if (!apiClient.isMockMode) {
    try {
      return await apiClient.put<PriceTierUpdate>(`/api/portal/estates/${estateId}/price-tiers/${tierId}`, input);
    } catch (err) {
      throw tierEditError(err, input);
    }
  }

  if (!(await assertInScope(estateId, scope))) throw new InventoryEditError("form", "ESTATE_NOT_FOUND", "Estate not found.");
  const tier = mockTiers.find((t) => t.id === tierId && t.estateId === estateId);
  if (!tier) throw new InventoryEditError("form", "RELATED_RECORD_NOT_FOUND", "This tier no longer exists on this estate.");

  if (input.tierType !== undefined && input.tierType !== tier.tierType) {
    throw new InventoryEditError("tierType", "TIER_TYPE_IMMUTABLE", TIER_TYPE_IMMUTABLE);
  }
  if (input.currency !== undefined && input.currency !== tier.currency) {
    throw new InventoryEditError("currency", "TIER_CURRENCY_IMMUTABLE", TIER_CURRENCY_IMMUTABLE);
  }
  if (input.sizeSqm !== undefined && tier.tierType !== "land_size") {
    throw new InventoryEditError("sizeSqm", "INVALID_REQUEST", "A UNIT_TYPE tier has no size of its own — its label carries the meaning.");
  }

  const previousSize = tier.sizeSqm;
  const sizeChanged = input.sizeSqm !== undefined && input.sizeSqm !== previousSize;
  if (sizeChanged && mockTiers.some((t) => t.estateId === estateId && t.id !== tierId && t.sizeSqm === input.sizeSqm)) {
    throw new InventoryEditError("sizeSqm", "DUPLICATE_RECORD", duplicateTierMessage(input.sizeSqm!));
  }

  const onTier = mockPlots.filter((p) => p.priceTierId === tierId);

  // A price change reaches every plot on the tier. A buyer who reserved is
  // unaffected — their price was captured with the hold, which mock mode
  // keeps apart from the plot row just as the backend does.
  if (input.price !== undefined && input.price !== tier.price) {
    tier.price = input.price;
    for (const plot of onTier) {
      plot.basePrice = input.price;
      plot.price = plot.cornerPremiumPct ? Math.round(input.price * (1 + plot.cornerPremiumPct / 100)) : input.price;
      plot.pricePerSqm = plot.nominalSizeSqm ? Math.round(plot.price / plot.nominalSizeSqm) : null;
    }
  }
  if (input.label !== undefined) tier.label = input.label.trim() || undefined;

  let sizeChange: PriceTierSizeChange | null = null;
  if (sizeChanged) {
    const newSize = input.sizeSqm!;
    tier.sizeSqm = newSize;
    // Available plots only: the size is what goes on a deed.
    const updated = onTier.filter((p) => isAvailable(p.status));
    for (const plot of updated) {
      plot.nominalSizeSqm = newSize;
      plot.pricePerSqm = Math.round(plot.price / newSize);
    }
    const kept = countByStatus(onTier.filter((p) => !isAvailable(p.status)));
    sizeChange = {
      previousSizeSqm: previousSize!,
      newSizeSqm: newSize,
      plotsUpdated: updated.length,
      keptPreviousSize: kept,
      note: kept.total === 0 ? SIZE_NOTE_ALL : SIZE_NOTE_KEPT,
    };
  }

  tier.pricePerSqm = tier.sizeSqm ? Math.round(tier.price / tier.sizeSqm) : null;
  for (const plot of onTier) plot.tierLabel = tierDisplayLabel(tier);

  const dto: PriceTierDto = {
    id: tier.id, estateId: tier.estateId, tierType: tier.tierType, sizeSqm: tier.sizeSqm,
    price: tier.price, currency: tier.currency, label: tier.label ?? null,
  };
  return { tier: dto, sizeChange };
}

function duplicateTierMessage(sizeSqm: number): string {
  return `Another tier on this estate is already ${sizeSqm} sqm. Each size can have only one tier.`;
}

function tierEditError(err: unknown, input: UpdatePriceTierInput): Error {
  if (!(err instanceof ApiError)) return err instanceof Error ? err : new Error("Couldn't update the tier.");
  const body = err.body;
  if (body?.code === "TIER_TYPE_IMMUTABLE") return new InventoryEditError("tierType", body.code, body.message ?? TIER_TYPE_IMMUTABLE);
  if (body?.code === "TIER_CURRENCY_IMMUTABLE") return new InventoryEditError("currency", body.code, body.message ?? TIER_CURRENCY_IMMUTABLE);
  // Size is the only unique field on a tier (uq_price_tiers_estate_size).
  if (err.status === 409) {
    return new InventoryEditError("sizeSqm", "DUPLICATE_RECORD",
      input.sizeSqm !== undefined ? duplicateTierMessage(input.sizeSqm) : "Another tier on this estate already has that size.");
  }
  if (err.status === 404) return new InventoryEditError("form", body?.code ?? "NOT_FOUND", "This tier no longer exists on this estate.");
  const fieldError = firstFieldError(body?.fieldErrors);
  if (fieldError) return new InventoryEditError(fieldError.field, "VALIDATION", fieldError.message);
  return new InventoryEditError("form", body?.code ?? "UNKNOWN", body?.message ?? "Couldn't update the tier.");
}

// ─── Plots API ───────────────────────────────────────────────────────────────

export async function fetchPlots(
  estateId: string,
  scope: PortalScope,
  filters: PlotFilters = {},
  params: PageParams = {},
): Promise<Page<PortalPlot>> {
  if (!apiClient.isMockMode) {
    const qp = new URLSearchParams({ ...(filters as Record<string, string>), ...(params as Record<string, string>) });
    return apiClient.get<Page<PortalPlot>>(`/api/portal/estates/${estateId}/plots?${qp}`);
  }
  if (!(await assertInScope(estateId, scope))) return { items: [], total: 0, hasMore: false };

  let source = mockPlots.filter((p) => p.estateId === estateId);
  if (filters.status) source = source.filter((p) => p.status === filters.status);
  if (filters.blockId) source = source.filter((p) => p.blockId === filters.blockId);
  if (filters.priceTierId) source = source.filter((p) => p.priceTierId === filters.priceTierId);
  if (filters.isCorner !== undefined) source = source.filter((p) => p.isCorner === filters.isCorner);
  return paginateMock(source, params);
}

// One request, matching the endpoint exactly — including its cap, so a caller
// that ignores the limit fails here the same way the server would.
export async function createPlotBatch(estateId: string, plots: CreatePlotInput[], scope: PortalScope): Promise<PortalPlot[]> {
  if (plots.length > PLOT_BATCH_LIMIT) {
    throw new Error(`A single request accepts at most ${PLOT_BATCH_LIMIT} plots. Use createPlotsInBatches for more.`);
  }
  if (!apiClient.isMockMode) return apiClient.post<PortalPlot[]>(`/api/portal/estates/${estateId}/plots`, { plots });
  if (!(await assertInScope(estateId, scope))) throw new Error("Estate not found.");

  // The estate's own corner premium is what turns a tier's base price into a
  // corner plot's price, so it is resolved once per batch rather than looked up
  // from a static fixture list (which would miss anything created at runtime).
  const estate = await fetchPortalEstateById(estateId, scope);
  const created = plots.map((input) => materialisePlot(estateId, input, estate?.cornerPremiumPct ?? 0));
  mockPlots.push(...created);
  return created;
}

export interface BatchProgress {
  batch: number;
  totalBatches: number;
  created: number;
  total: number;
}

// Splits a larger set across as many requests as the cap requires, reporting
// progress so the UI can say what is happening rather than appearing to hang.
export async function createPlotsInBatches(
  estateId: string,
  plots: CreatePlotInput[],
  scope: PortalScope,
  onProgress?: (progress: BatchProgress) => void,
): Promise<PortalPlot[]> {
  const batches: CreatePlotInput[][] = [];
  for (let i = 0; i < plots.length; i += PLOT_BATCH_LIMIT) batches.push(plots.slice(i, i + PLOT_BATCH_LIMIT));

  const created: PortalPlot[] = [];
  for (let i = 0; i < batches.length; i++) {
    created.push(...(await createPlotBatch(estateId, batches[i], scope)));
    onProgress?.({ batch: i + 1, totalBatches: batches.length, created: created.length, total: plots.length });
  }
  return created;
}

export function planBatches(plotCount: number): number {
  return Math.ceil(plotCount / PLOT_BATCH_LIMIT);
}

function materialisePlot(estateId: string, input: CreatePlotInput, estateCornerPremiumPct: number): PortalPlot {
  const tier = mockTiers.find((t) => t.id === input.priceTierId);
  if (!tier) throw new Error("That price tier doesn't exist on this estate.");

  // The nominal size comes FROM THE TIER — never from the caller. The override
  // is honoured only where the tier has no size of its own.
  const nominalSizeSqm = tier.tierType === "land_size" ? tier.sizeSqm : (input.nominalSizeSqmOverride ?? null);

  // Stands in for ST_Area(footprint::geography) on write. Null with no
  // footprint — never the nominal size as a fallback.
  const actualAreaSqm = input.footprint ? round2(polygonAreaSqm(input.footprint.coordinates[0].map(([lng, lat]) => ({ lat, lng })))) : null;

  const block = input.blockId ? mockBlocks.find((b) => b.id === input.blockId) : undefined;

  // Stands in for the backend's own pricing: the tier's price is the base, and
  // a corner plot carries the ESTATE's premium on top. A corner plot whose
  // price silently equalled its tier's would contradict the price list.
  const cornerPremiumPct = input.isCorner ? estateCornerPremiumPct : null;
  const basePrice = tier.price;
  const price = cornerPremiumPct ? Math.round(basePrice * (1 + cornerPremiumPct / 100)) : basePrice;

  const id = nextId("plot");
  if (input.footprint) mockFootprints.set(id, input.footprint);

  return {
    id,
    estateId,
    plotNumber: input.plotNumber.trim(),
    blockId: input.blockId,
    blockName: block?.name,
    priceTierId: tier.id,
    tierLabel: tierDisplayLabel(tier),
    isCorner: input.isCorner ?? false,
    status: input.status,
    intent: input.intent,
    propertyType: input.propertyType,
    listingIntent: input.listingIntent,
    orientation: input.orientation,
    nominalSizeSqm,
    actualAreaSqm,
    basePrice,
    cornerPremiumPct,
    price,
    currency: tier.currency,
    pricePerSqm: nominalSizeSqm ? Math.round(price / nominalSizeSqm) : null,
    hasFootprint: input.footprint !== undefined,
  };
}

export function tierDisplayLabel(tier: PortalPriceTier): string {
  if (tier.tierType === "unit_type") return tier.label ?? "Unit";
  return tier.label ? `${tier.label} (${tier.sizeSqm} sqm)` : `${tier.sizeSqm} sqm`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ─── Map data ────────────────────────────────────────────────────────────────

// The estate boundary plus every plot that HAS a footprint. A plot without one
// is omitted entirely rather than carrying null geometry — same as the backend.
export async function fetchInventoryGeoJson(
  estateId: string,
  scope: PortalScope,
  boundary: GeoJsonFeatureCollection | null,
): Promise<GeoJsonFeatureCollection> {
  const plotFeatures: GeoJsonFeature[] = (await fetchPlots(estateId, scope, {}, { limit: PLOT_BATCH_LIMIT * 20 })).items
    // A plot without a footprint is omitted entirely rather than carrying null
    // geometry — same as the backend.
    .filter((plot) => plot.hasFootprint && mockFootprints.has(plot.id))
    .map((plot) => ({
      type: "Feature",
      geometry: mockFootprints.get(plot.id)!,
      properties: {
        kind: "plot",
        plotNumber: plot.plotNumber,
        canonicalStatus: plot.status,
      },
    }));

  const boundaryFeatures = (boundary?.features ?? []).map((f) => ({ ...f, properties: { ...f.properties, kind: "boundary" } }));
  return { type: "FeatureCollection", features: [...boundaryFeatures, ...plotFeatures] };
}
