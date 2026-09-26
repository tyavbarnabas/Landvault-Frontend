// The one plot-status colour/label convention, extracted from PlotCanvas.tsx
// so the portal's boundary map and the buyer-facing canvas can't drift into
// two different colour languages for the same four states.

import type { PlotStatus } from "../data/mockData";

export const STATUS_COLORS: Record<PlotStatus, string> = {
  "available-dev": "#16A34A",
  "available-inv": "#2563EB",
  reserved: "#D97706",
  sold: "#DC2626",
};

export const STATUS_LABELS: Record<PlotStatus, string> = {
  "available-dev": "Available — development",
  "available-inv": "Available — investment",
  reserved: "Reserved / pending",
  sold: "Sold / allocated",
};
