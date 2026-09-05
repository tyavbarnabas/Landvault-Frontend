// The ONE plot-selection canvas, for both /estates and /marketplace — merged
// from what used to be two components (this file, and
// components/marketplace/PlotCanvas.tsx, now deleted). Base is this file's
// old block/street layout and AGIS overlay; folded in from the marketplace
// version: zoom, click-drag panning, keyboard access, the size-tier filter
// chip row, and the `mode` prop. See landvault-catalogue-unification-plan in
// project memory.
//
// Renders ListingPlot data (marketplacePlotsService.ts) — the one canonical
// plot shape both surfaces now share, converted from mockData's internal
// Plot at the service boundary (or directly via toListingPlot() when a
// caller already has a full Estate, like EstateDetail.tsx).
//
// TODO (backend): Leaflet/Mapbox is the eventual target once real plot
// geometry (PostGIS polygons) exists. This is a clean SVG/CSS grid rendering
// behind the same component interface in the meantime — swapping the
// renderer later shouldn't require touching callers.

import { useRef, useState } from "react";
import { useApp } from "../contexts/AppContext";
import { formatAmount } from "../data/mockData";
import { CAPABILITIES } from "../lib/capabilities";
import { AGIS_LAYER_LABELS, AGIS_LAYER_COLORS, isAffected, type AGISLayer } from "../services/agisService";
import { plotLabel, type ListingPlot, type PlotStatus } from "../services/marketplacePlotsService";
import type { PriceTier } from "../services/marketplaceService";

export type PlotCanvasMode = "browse" | "select" | "readonly";

interface PlotCanvasProps {
  // Which canonical estate these plots belong to — keys the AGIS overlay
  // (agisService.ts) and the per-plot "saved" star-ring (AppContext's
  // savedPlots, keyed `${estateId}:${plotId}`).
  estateId: string;
  plots: ListingPlot[];
  tiers: PriceTier[];
  cornerPremiumPct: number;
  selectedPlotId?: string;
  onSelectPlot?: (plot: ListingPlot | null) => void;
  selectedSizeSqm?: number | null;
  // Presence shows the clickable size-tier filter chip row above the
  // legend — omit when a caller already has its own tier selector (e.g.
  // EstateDetail.tsx's PriceTierTable) and only wants dimming, not a second
  // way to change the size filter.
  onSelectSizeSqm?: (sqm: number) => void;
  mode?: PlotCanvasMode;
  // Only /estates passes true — the AGIS overlay is estate-inventory detail,
  // not part of the cross-company marketplace browse experience. Still
  // gated behind CAPABILITIES.agisOverlay regardless (fabricated data — see
  // agisService.ts).
  showAgisControls?: boolean;
}

const STATUS_COLORS: Record<PlotStatus, string> = {
  "available-dev": "#16A34A",
  "available-inv": "#2563EB",
  reserved: "#D97706",
  sold: "#DC2626",
};

const STATUS_LABELS: Record<PlotStatus, string> = {
  "available-dev": "Available — development",
  "available-inv": "Available — investment",
  reserved: "Reserved / pending",
  sold: "Sold / allocated",
};

const CELL_SIZE = 22;
const GAP = 3;
const BLOCK_ROWS = 4;
const BLOCK_COLS = 4;
const STREET_WIDTH = 15;
const TOP_MARGIN = 18;
const SIDE_MARGIN = 6;
const BLOCK_W = BLOCK_COLS * (CELL_SIZE + GAP) + GAP;
const BLOCK_H = BLOCK_ROWS * (CELL_SIZE + GAP) + GAP;
const STREET_COLOR = "#9CA0A6";
const STREET_LINE_COLOR = "#F4E7BE";
const BLOCK_GROUND_COLOR = "rgba(255,255,255,0.55)";

const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2.2;
const ZOOM_STEP = 0.2;

function plotXY(row: number, col: number) {
  const br = Math.floor(row / BLOCK_ROWS);
  const bc = Math.floor(col / BLOCK_COLS);
  const withinRow = row % BLOCK_ROWS;
  const withinCol = col % BLOCK_COLS;
  return {
    x: SIDE_MARGIN + bc * (BLOCK_W + STREET_WIDTH) + withinCol * (CELL_SIZE + GAP) + GAP,
    y: TOP_MARGIN + br * (BLOCK_H + STREET_WIDTH) + withinRow * (CELL_SIZE + GAP) + GAP,
  };
}

export default function PlotCanvas({
  estateId, plots, tiers, cornerPremiumPct, selectedPlotId, onSelectPlot,
  selectedSizeSqm = null, onSelectSizeSqm, mode = "select", showAgisControls = false,
}: PlotCanvasProps) {
  const { savedPlots, currency } = useApp();
  // The AGIS overlay is fabricated (see agisService.ts) — never shown unless
  // the capability is explicitly turned on, regardless of what the caller
  // requests via showAgisControls.
  const agisEnabled = showAgisControls && CAPABILITIES.agisOverlay;

  const [hovered, setHovered] = useState<ListingPlot | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [agisOpen, setAgisOpen] = useState(false);
  const [activeLayers, setActiveLayers] = useState<Set<AGISLayer>>(new Set());
  const containerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);

  if (plots.length === 0) {
    return <div className="p-8 text-center text-sm text-[var(--muted-foreground)] border border-dashed border-[var(--border)] rounded-xl">No plot data available for this estate yet.</div>;
  }

  const maxRow = Math.max(...plots.map((p) => p.row));
  const maxCol = Math.max(...plots.map((p) => p.col));
  const numBlockRows = Math.floor(maxRow / BLOCK_ROWS) + 1;
  const numBlockCols = Math.floor(maxCol / BLOCK_COLS) + 1;
  const svgWidth = SIDE_MARGIN * 2 + numBlockCols * BLOCK_W + (numBlockCols - 1) * STREET_WIDTH;
  const svgHeight = TOP_MARGIN + SIDE_MARGIN + numBlockRows * BLOCK_H + (numBlockRows - 1) * STREET_WIDTH;

  const blocks: { br: number; bc: number; label: string }[] = [];
  const seenBlocks = new Set<string>();
  for (const p of plots) {
    const br = Math.floor(p.row / BLOCK_ROWS);
    const bc = Math.floor(p.col / BLOCK_COLS);
    const key = `${br}-${bc}`;
    if (seenBlocks.has(key)) continue;
    seenBlocks.add(key);
    blocks.push({ br, bc, label: p.block });
  }

  const availableCount = plots.filter((p) => p.status === "available-dev" || p.status === "available-inv").length;

  const toggleLayer = (l: AGISLayer) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      next.has(l) ? next.delete(l) : next.add(l);
      return next;
    });
  };

  const handleMouseMove = (e: React.MouseEvent<SVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({ x: (e.clientX - rect.left) / zoom + 12, y: (e.clientY - rect.top) / zoom - 8 });
  };

  const zoomIn = () => setZoom((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)));
  const zoomOut = () => setZoom((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)));
  const zoomReset = () => setZoom(1);
  const handleWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return; // plain wheel scrolls the container natively
    e.preventDefault();
    setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +(z - e.deltaY * 0.001).toFixed(2))));
  };

  // Desktop click-drag panning — touch devices already pan natively via the
  // container's overflow:auto + touch-action.
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!containerRef.current || e.pointerType === "touch") return;
    dragState.current = { startX: e.clientX, startY: e.clientY, scrollLeft: containerRef.current.scrollLeft, scrollTop: containerRef.current.scrollTop };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState.current || !containerRef.current) return;
    containerRef.current.scrollLeft = dragState.current.scrollLeft - (e.clientX - dragState.current.startX);
    containerRef.current.scrollTop = dragState.current.scrollTop - (e.clientY - dragState.current.startY);
  };
  const handlePointerUp = () => { dragState.current = null; };

  return (
    <div className="relative">
      {/* Size-tier filter — switch tiers without leaving the page. Only shown
          when the caller wants this canvas to own size selection. */}
      {onSelectSizeSqm && (
        <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label="Filter by plot size">
          {tiers.map((t) => {
            const active = t.sizeSqm === selectedSizeSqm;
            return (
              <button
                key={t.id}
                type="button"
                disabled={t.availability === "sold_out"}
                onClick={() => onSelectSizeSqm(t.sizeSqm)}
                aria-pressed={active}
                className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${active ? "bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]" : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
              >
                {t.sizeSqm} sqm
              </button>
            );
          })}
        </div>
      )}

      {/* Legend + AGIS toggle + zoom controls */}
      <div className="flex flex-wrap items-center gap-3 mb-3 justify-between">
        <div className="flex flex-wrap gap-3">
          {(Object.keys(STATUS_LABELS) as PlotStatus[]).map((k) => (
            <div key={k} className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: STATUS_COLORS[k] }} aria-hidden="true" />
              {STATUS_LABELS[k]}
            </div>
          ))}
          <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: STREET_COLOR }} aria-hidden="true" />
            Street
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {agisEnabled && (
            <button
              onClick={() => setAgisOpen(!agisOpen)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors ${agisOpen || activeLayers.size > 0 ? "bg-[var(--secondary)] border-[var(--primary)] text-[var(--primary)]" : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
            >
              <span aria-hidden="true">🗺</span> AGIS overlay
              {activeLayers.size > 0 && <span className="ml-0.5 bg-[var(--primary)] text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">{activeLayers.size}</span>}
            </button>
          )}
          <div className="flex items-center gap-1" role="group" aria-label="Zoom controls">
            <button type="button" onClick={zoomOut} aria-label="Zoom out" className="w-7 h-7 flex items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]">−</button>
            <button type="button" onClick={zoomReset} aria-label="Reset zoom" className="text-xs px-2 h-7 rounded-md border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] font-mono-data">{Math.round(zoom * 100)}%</button>
            <button type="button" onClick={zoomIn} aria-label="Zoom in" className="w-7 h-7 flex items-center justify-center rounded-md border border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]">+</button>
          </div>
        </div>
      </div>

      {/* AGIS layer picker */}
      {agisEnabled && agisOpen && (
        <div className="mb-3 p-3 bg-[var(--card)] border border-[var(--border)] rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-[var(--foreground)]">FCT / AGIS municipal layers</span>
            <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              ⚠ Indicative — pending manual verification for plots not yet surveyed
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(AGIS_LAYER_LABELS) as AGISLayer[]).map((l) => (
              <label key={l} className="flex items-center gap-2 text-xs cursor-pointer select-none">
                <input type="checkbox" checked={activeLayers.has(l)} onChange={() => toggleLayer(l)} className="rounded" />
                <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: AGIS_LAYER_COLORS[l].replace(/[\d.]+\)$/, "0.9)") }} />
                {AGIS_LAYER_LABELS[l]}
              </label>
            ))}
          </div>
          {activeLayers.size > 0 && (
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">
              Highlighted cells may be affected by the selected municipal features. Verify with AGIS before purchase.
            </p>
          )}
        </div>
      )}

      {/* Canvas */}
      <div
        ref={containerRef}
        className="overflow-auto rounded-lg border border-[var(--border)] p-3 cursor-grab active:cursor-grabbing"
        style={{ backgroundColor: STREET_COLOR, touchAction: "pan-x pan-y", maxHeight: 480 }}
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <svg
          width={svgWidth * zoom}
          height={svgHeight * zoom}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHovered(null)}
          style={{ display: "block" }}
          role="img"
          aria-label="Estate plot map"
        >
          <rect x={0} y={0} width={svgWidth} height={svgHeight} fill={STREET_COLOR} />

          {Array.from({ length: numBlockRows - 1 }).map((_, i) => {
            const cy = TOP_MARGIN + (i + 1) * BLOCK_H + i * STREET_WIDTH + STREET_WIDTH / 2;
            return <line key={`h-${i}`} x1={0} y1={cy} x2={svgWidth} y2={cy} stroke={STREET_LINE_COLOR} strokeWidth={1.5} strokeDasharray="6 5" />;
          })}
          {Array.from({ length: numBlockCols - 1 }).map((_, i) => {
            const cx = SIDE_MARGIN + (i + 1) * BLOCK_W + i * STREET_WIDTH + STREET_WIDTH / 2;
            return <line key={`v-${i}`} x1={cx} y1={0} x2={cx} y2={svgHeight} stroke={STREET_LINE_COLOR} strokeWidth={1.5} strokeDasharray="6 5" />;
          })}

          {blocks.map((b) => {
            const bx = SIDE_MARGIN + b.bc * (BLOCK_W + STREET_WIDTH);
            const by = TOP_MARGIN + b.br * (BLOCK_H + STREET_WIDTH);
            return (
              <g key={`block-${b.label}`}>
                <rect x={bx} y={by} width={BLOCK_W} height={BLOCK_H} rx={4} fill={BLOCK_GROUND_COLOR} stroke="rgba(255,255,255,0.6)" strokeWidth={1} />
                <text x={bx + 3} y={by - 5} fontSize={9} fontWeight={600} fill="var(--foreground)" opacity={0.75}>Block {b.label}</text>
              </g>
            );
          })}

          {plots.map((plot) => {
            const { x, y } = plotXY(plot.row, plot.col);
            const isSelected = selectedPlotId === plot.id;
            const isSaved = savedPlots.includes(`${estateId}:${plot.id}`);
            const inSelectedTier = selectedSizeSqm == null || plot.sizeSqm === selectedSizeSqm;
            const isClickable = mode !== "readonly" && inSelectedTier && (plot.status === "available-dev" || plot.status === "available-inv");
            const affectingLayers = agisEnabled ? Array.from(activeLayers).filter((l) => isAffected(estateId, l, plot.row, plot.col)) : [];

            return (
              <g key={plot.id} opacity={inSelectedTier ? 1 : 0.28}>
                <rect
                  x={x} y={y}
                  width={CELL_SIZE} height={CELL_SIZE}
                  rx={3}
                  fill={STATUS_COLORS[plot.status]}
                  opacity={hovered?.id === plot.id ? 0.85 : 0.92}
                  stroke={isSelected ? "#C4922A" : isSaved ? "#8B5CF6" : "none"}
                  strokeWidth={isSelected ? 2.5 : isSaved ? 1.5 : 0}
                  style={{ cursor: isClickable ? "pointer" : "default", transition: "opacity 0.1s" }}
                  onMouseEnter={() => setHovered(plot)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => isClickable && onSelectPlot?.(isSelected ? null : plot)}
                  role={isClickable ? "button" : undefined}
                  aria-label={isClickable ? `${plotLabel(plot)}, ${plot.sizeSqm} sqm, ${plot.isCorner ? "corner plot" : "standard plot"}` : undefined}
                  tabIndex={isClickable ? 0 : undefined}
                  onKeyDown={(e) => { if (isClickable && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelectPlot?.(isSelected ? null : plot); } }}
                />

                {affectingLayers.map((l) => (
                  <rect key={l} x={x} y={y} width={CELL_SIZE} height={CELL_SIZE} rx={3} fill={AGIS_LAYER_COLORS[l]} style={{ pointerEvents: "none" }} />
                ))}
                {affectingLayers.length > 0 && (
                  <circle cx={x + CELL_SIZE - 5} cy={y + 5} r={3} fill="#F59E0B" style={{ pointerEvents: "none" }} />
                )}
                {plot.isCorner && affectingLayers.length === 0 && (
                  <circle cx={x + CELL_SIZE - 4} cy={y + 4} r={2.5} fill="rgba(255,255,255,0.7)" style={{ pointerEvents: "none" }} />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Tooltip */}
      {hovered && (() => {
        const tier = tiers.find((t) => t.id === hovered.tierId);
        const price = tier ? (hovered.isCorner ? tier.price * (1 + cornerPremiumPct / 100) : tier.price) : undefined;
        const layers = agisEnabled ? Array.from(activeLayers).filter((l) => isAffected(estateId, l, hovered.row, hovered.col)) : [];
        return (
          <div
            className="absolute z-20 pointer-events-none bg-[var(--foreground)] text-[var(--background)] text-xs rounded-md px-3 py-2 shadow-lg"
            style={{ left: tooltipPos.x, top: tooltipPos.y, maxWidth: 220 }}
          >
            <div className="font-semibold mb-0.5">
              {plotLabel(hovered)}
              {hovered.isCorner && <span className="ml-1 text-[var(--accent)]">★ Corner (+{cornerPremiumPct}%)</span>}
            </div>
            <div className="text-white/70">{hovered.sizeSqm} sqm nominal · {hovered.actualAreaSqm} sqm surveyed · {hovered.orientation}</div>
            {price !== undefined && <div className="font-mono-data mt-0.5">{formatAmount(price, currency)}</div>}
            <div className="mt-0.5" style={{ color: STATUS_COLORS[hovered.status] }}>{STATUS_LABELS[hovered.status]}</div>
            {layers.length > 0 && (
              <div className="mt-1.5 pt-1.5 border-t border-white/20 text-amber-300">⚠ AGIS: {layers.map((l) => AGIS_LAYER_LABELS[l]).join(", ")}</div>
            )}
          </div>
        );
      })()}

      {/* Footer */}
      <div className="mt-2 text-xs text-[var(--muted-foreground)] font-mono-data">
        {plots.length} plots · {availableCount} available{selectedSizeSqm != null ? ` · filtered to ${selectedSizeSqm} sqm` : ""} · drag to pan, Ctrl/⌘+scroll or the zoom buttons to zoom
      </div>
    </div>
  );
}
