import { useState, useRef } from "react";
import type { Plot, Estate } from "../data/mockData";
import { formatAmount, BLOCK_ROWS, BLOCK_COLS, getPlotBlockLabel } from "../data/mockData";
import { useApp } from "../contexts/AppContext";

interface Props {
  estate: Estate;
  onSelectPlot?: (plot: Plot | null) => void;
  selectedPlotId?: string;
  highlightedPlotIds?: string[];
  showAgisControls?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  "available-dev": "#16A34A",
  "available-inv": "#2563EB",
  reserved: "#D97706",
  sold: "#9CA3AF",
};

const STATUS_LABELS: Record<string, string> = {
  "available-dev": "Available — development",
  "available-inv": "Available — investment",
  reserved: "Reserved / pending",
  sold: "Sold / allocated",
};

// ─── Layout geometry: plots grouped into blocks, separated by streets ──────

const CELL_SIZE = 24;
const GAP = 3;
const STREET_WIDTH = 16;
const TOP_MARGIN = 18;
const SIDE_MARGIN = 6;

const BLOCK_W = BLOCK_COLS * (CELL_SIZE + GAP) + GAP;
const BLOCK_H = BLOCK_ROWS * (CELL_SIZE + GAP) + GAP;

const STREET_COLOR = "#9CA0A6";
const STREET_LINE_COLOR = "#F4E7BE";
const BLOCK_GROUND_COLOR = "rgba(255,255,255,0.55)";

function plotXY(row: number, col: number) {
  const br = Math.floor(row / BLOCK_ROWS);
  const bc = Math.floor(col / BLOCK_COLS);
  const withinRow = row % BLOCK_ROWS;
  const withinCol = col % BLOCK_COLS;
  const x = SIDE_MARGIN + bc * (BLOCK_W + STREET_WIDTH) + withinCol * (CELL_SIZE + GAP) + GAP;
  const y = TOP_MARGIN + br * (BLOCK_H + STREET_WIDTH) + withinRow * (CELL_SIZE + GAP) + GAP;
  return { x, y, br, bc };
}

type AGISLayer = "roads" | "sewer" | "greenverge" | "setback";

const AGIS_LAYER_LABELS: Record<AGISLayer, string> = {
  roads: "Planned roads",
  sewer: "Sewer lines",
  greenverge: "Green verges",
  setback: "Building setback zones",
};

const AGIS_LAYER_COLORS: Record<AGISLayer, string> = {
  roads: "rgba(251,191,36,0.55)",
  sewer: "rgba(59,130,246,0.45)",
  greenverge: "rgba(34,197,94,0.45)",
  setback: "rgba(239,68,68,0.35)",
};

// Deterministic "affected" cells per layer (seeded by position)
function isAffected(layer: AGISLayer, row: number, col: number): boolean {
  if (layer === "roads") return row === 4 || row === 10;
  if (layer === "sewer") return col === 2 || col === 7;
  if (layer === "greenverge") return (row === 0 || row === 1) && col % 3 === 0;
  if (layer === "setback") return row === 0 || col === 0;
  return false;
}

export default function PlotCanvas({ estate, onSelectPlot, selectedPlotId, highlightedPlotIds = [], showAgisControls = false }: Props) {
  const { savedPlots } = useApp();
  const { currency } = useApp();
  const [hoveredPlot, setHoveredPlot] = useState<Plot | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [agisOpen, setAgisOpen] = useState(false);
  const [activeLayers, setActiveLayers] = useState<Set<AGISLayer>>(new Set());
  const svgRef = useRef<SVGSVGElement>(null);

  const numBlockRows = Math.ceil(estate.rows / BLOCK_ROWS);
  const numBlockCols = Math.ceil(estate.cols / BLOCK_COLS);

  const svgWidth = SIDE_MARGIN * 2 + numBlockCols * BLOCK_W + (numBlockCols - 1) * STREET_WIDTH;
  const svgHeight = TOP_MARGIN + SIDE_MARGIN + numBlockRows * BLOCK_H + (numBlockRows - 1) * STREET_WIDTH;

  // Blocks present, with the actual plot extent inside each (edge blocks may be smaller)
  const blocks: { br: number; bc: number; label: string; w: number; h: number }[] = [];
  for (let br = 0; br < numBlockRows; br++) {
    for (let bc = 0; bc < numBlockCols; bc++) {
      const rowsInBlock = Math.min(BLOCK_ROWS, estate.rows - br * BLOCK_ROWS);
      const colsInBlock = Math.min(BLOCK_COLS, estate.cols - bc * BLOCK_COLS);
      if (rowsInBlock <= 0 || colsInBlock <= 0) continue;
      const blockIndex = br * numBlockCols + bc;
      const label = blockIndex < 26
        ? String.fromCharCode(65 + blockIndex)
        : String.fromCharCode(65 + Math.floor(blockIndex / 26) - 1) + String.fromCharCode(65 + (blockIndex % 26));
      blocks.push({
        br, bc, label,
        w: colsInBlock * (CELL_SIZE + GAP) + GAP,
        h: rowsInBlock * (CELL_SIZE + GAP) + GAP,
      });
    }
  }
  const lastBlockLabel = blocks[blocks.length - 1]?.label ?? "A";

  const toggleLayer = (l: AGISLayer) => {
    setActiveLayers((prev) => {
      const next = new Set(prev);
      next.has(l) ? next.delete(l) : next.add(l);
      return next;
    });
  };

  const handleMouseMove = (e: React.MouseEvent<SVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({ x: e.clientX - rect.left + 12, y: e.clientY - rect.top - 8 });
  };

  return (
    <div className="relative">
      {/* Top controls */}
      <div className="flex flex-wrap items-center gap-3 mb-3 justify-between">
        {/* Legend */}
        <div className="flex flex-wrap gap-3">
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <div key={k} className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
              <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: STATUS_COLORS[k] }} />
              {v}
            </div>
          ))}
          <div className="flex items-center gap-1.5 text-xs text-[var(--muted-foreground)]">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: STREET_COLOR }} />
            Street
          </div>
        </div>

        {/* AGIS toggle */}
        {showAgisControls && (
          <button
            onClick={() => setAgisOpen(!agisOpen)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors ${agisOpen || activeLayers.size > 0 ? "bg-[var(--secondary)] border-[var(--primary)] text-[var(--primary)]" : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
          >
            <span>🗺</span>
            AGIS overlay
            {activeLayers.size > 0 && <span className="ml-0.5 bg-[var(--primary)] text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">{activeLayers.size}</span>}
          </button>
        )}
      </div>

      {/* AGIS layer picker */}
      {showAgisControls && agisOpen && (
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
                <input
                  type="checkbox"
                  checked={activeLayers.has(l)}
                  onChange={() => toggleLayer(l)}
                  className="rounded"
                />
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
      <div className="overflow-auto rounded-lg border border-[var(--border)] p-3" style={{ backgroundColor: STREET_COLOR }}>
        <svg
          ref={svgRef}
          width={svgWidth}
          height={svgHeight}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoveredPlot(null)}
          style={{ display: "block", minWidth: svgWidth }}
        >
          {/* Street base */}
          <rect x={0} y={0} width={svgWidth} height={svgHeight} fill={STREET_COLOR} />

          {/* Dashed road center-lines between block rows/cols */}
          {Array.from({ length: numBlockRows - 1 }).map((_, i) => {
            const cy = TOP_MARGIN + (i + 1) * BLOCK_H + i * STREET_WIDTH + STREET_WIDTH / 2;
            return <line key={`hline-${i}`} x1={0} y1={cy} x2={svgWidth} y2={cy} stroke={STREET_LINE_COLOR} strokeWidth={1.5} strokeDasharray="6 5" />;
          })}
          {Array.from({ length: numBlockCols - 1 }).map((_, i) => {
            const cx = SIDE_MARGIN + (i + 1) * BLOCK_W + i * STREET_WIDTH + STREET_WIDTH / 2;
            return <line key={`vline-${i}`} x1={cx} y1={0} x2={cx} y2={svgHeight} stroke={STREET_LINE_COLOR} strokeWidth={1.5} strokeDasharray="6 5" />;
          })}

          {/* Blocks — land parcels grouping plots, with a label */}
          {blocks.map((b) => {
            const bx = SIDE_MARGIN + b.bc * (BLOCK_W + STREET_WIDTH);
            const by = TOP_MARGIN + b.br * (BLOCK_H + STREET_WIDTH);
            return (
              <g key={`block-${b.label}`}>
                <rect
                  x={bx} y={by}
                  width={b.w} height={b.h}
                  rx={4}
                  fill={BLOCK_GROUND_COLOR}
                  stroke="rgba(255,255,255,0.6)"
                  strokeWidth={1}
                />
                <text x={bx + 3} y={by - 5} fontSize={9} fontWeight={600} fill="var(--foreground)" opacity={0.75}>
                  Block {b.label}
                </text>
              </g>
            );
          })}

          {/* Plots */}
          {estate.plots.map((plot) => {
            const { x, y } = plotXY(plot.row, plot.col);
            const isSelected = selectedPlotId === plot.id;
            const isSaved = savedPlots.includes(`${estate.id}:${plot.id}`);
            const isClickable = plot.status === "available-dev" || plot.status === "available-inv";

            // Find which active AGIS layers affect this cell
            const affectingLayers = Array.from(activeLayers).filter((l) => isAffected(l, plot.row, plot.col));

            return (
              <g key={plot.id}>
                {/* Base plot cell */}
                <rect
                  x={x} y={y}
                  width={CELL_SIZE} height={CELL_SIZE}
                  rx={3}
                  fill={STATUS_COLORS[plot.status]}
                  opacity={hoveredPlot?.id === plot.id ? 0.85 : 0.9}
                  stroke={isSelected ? "#C4922A" : isSaved ? "#8B5CF6" : "none"}
                  strokeWidth={isSelected ? 2.5 : isSaved ? 1.5 : 0}
                  style={{ cursor: isClickable ? "pointer" : "default", transition: "opacity 0.1s" }}
                  onMouseEnter={() => setHoveredPlot(plot)}
                  onMouseLeave={() => setHoveredPlot(null)}
                  onClick={() => isClickable && onSelectPlot?.(isSelected ? null : plot)}
                />

                {/* AGIS overlay layers (stacked semi-transparent) */}
                {affectingLayers.map((l) => (
                  <rect
                    key={l}
                    x={x} y={y}
                    width={CELL_SIZE} height={CELL_SIZE}
                    rx={3}
                    fill={AGIS_LAYER_COLORS[l]}
                    style={{ pointerEvents: "none" }}
                  />
                ))}

                {/* AGIS warning dot */}
                {affectingLayers.length > 0 && (
                  <circle cx={x + CELL_SIZE - 5} cy={y + 5} r={3} fill="#F59E0B" style={{ pointerEvents: "none" }} />
                )}

                {/* Corner piece marker */}
                {plot.type === "corner" && affectingLayers.length === 0 && (
                  <circle cx={x + CELL_SIZE - 4} cy={y + 4} r={2.5} fill="rgba(255,255,255,0.7)" />
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Tooltip */}
      {hoveredPlot && (
        <div
          className="absolute z-20 pointer-events-none bg-[var(--foreground)] text-[var(--background)] text-xs rounded-md px-3 py-2 shadow-lg"
          style={{ left: tooltipPos.x, top: tooltipPos.y, maxWidth: 220 }}
        >
          <div className="font-semibold mb-0.5">
            {getPlotBlockLabel(estate, hoveredPlot).label}
            {hoveredPlot.type === "corner" && <span className="ml-1 text-[var(--accent)]">★</span>}
          </div>
          <div className="text-white/70">{hoveredPlot.sqm} sqm · {hoveredPlot.orientation}</div>
          <div className="font-mono-data mt-0.5">{formatAmount(hoveredPlot.price, currency)}</div>
          <div className="mt-0.5" style={{ color: STATUS_COLORS[hoveredPlot.status] }}>
            {STATUS_LABELS[hoveredPlot.status]}
          </div>
          {/* AGIS warning in tooltip */}
          {(() => {
            const layers = Array.from(activeLayers).filter((l) => isAffected(l, hoveredPlot.row, hoveredPlot.col));
            if (layers.length === 0) return null;
            return (
              <div className="mt-1.5 pt-1.5 border-t border-white/20 text-amber-300">
                ⚠ AGIS: {layers.map((l) => AGIS_LAYER_LABELS[l]).join(", ")}
              </div>
            );
          })()}
        </div>
      )}

      {/* Footer */}
      <div className="mt-2 text-xs text-[var(--muted-foreground)] font-mono-data">
        Blocks A–{lastBlockLabel} · {estate.totalPlots} plots · {estate.availablePlots} available
      </div>
    </div>
  );
}
