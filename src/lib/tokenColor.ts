// A design token's colour as a plain value, for libraries that can't take
// var(--…) — Leaflet writes its path colours as SVG attributes.
export function tokenColor(name: `--${string}`): string {
  if (typeof document === "undefined") return "currentColor";
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "currentColor";
}
