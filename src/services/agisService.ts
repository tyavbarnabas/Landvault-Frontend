// AGIS (FCT/state municipal GIS) overlay — which plots sit on planned roads,
// sewer lines, green verges, or building setback zones.
//
// NOT A REAL INTEGRATION: isAffected() below is a positional formula, not a
// municipal GIS feed — it invents which cells are "affected" from row/col
// alone. Previously this lived inline in components/PlotCanvas.tsx with no
// service boundary at all; moved here (still mock, still keyed by estate id
// so a real per-estate integration can slot in later) and gated behind
// CAPABILITIES.agisOverlay (default false) so the app never presents this as
// real planning data. See landvault-catalogue-unification-plan in project
// memory.
//
// TODO (backend): replace with a real per-estate AGIS/state-registry GIS
// layer once one exists.

export type AGISLayer = "roads" | "sewer" | "greenverge" | "setback";

export const AGIS_LAYER_LABELS: Record<AGISLayer, string> = {
  roads: "Planned roads",
  sewer: "Sewer lines",
  greenverge: "Green verges",
  setback: "Building setback zones",
};

export const AGIS_LAYER_COLORS: Record<AGISLayer, string> = {
  roads: "rgba(251,191,36,0.55)",
  sewer: "rgba(59,130,246,0.45)",
  greenverge: "rgba(34,197,94,0.45)",
  setback: "rgba(239,68,68,0.35)",
};

// Deterministic "affected" cells per layer, seeded by estate id + position so
// two different estates don't show identical overlays purely by coincidence
// of sharing a row/col.
function seedFor(estateId: string): number {
  let h = 0;
  for (let i = 0; i < estateId.length; i++) h = (h * 31 + estateId.charCodeAt(i)) >>> 0;
  return h;
}

export function isAffected(estateId: string, layer: AGISLayer, row: number, col: number): boolean {
  const seed = seedFor(estateId);
  if (layer === "roads") return row % 6 === seed % 6;
  if (layer === "sewer") return col % 5 === (seed >> 3) % 5;
  if (layer === "greenverge") return (row === 0 || row === 1) && col % 3 === seed % 3;
  if (layer === "setback") return row === 0 || col === 0;
  return false;
}
