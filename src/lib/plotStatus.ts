// The one plot-status colour/label convention, extracted from PlotCanvas.tsx
// so the portal's boundary map and the buyer-facing canvas can't drift into
// two different colour languages for the same states.

import type { PlotStatus } from "../data/mockData";

export const STATUS_COLORS: Record<PlotStatus, string> = {
  "available-dev": "#16A34A",
  "available-inv": "#2563EB",
  reserved: "#D97706",
  sold: "#DC2626",
  // Neutral slate — the same fallback grey the portal map already uses.
  withheld: "#64748B",
};

export const STATUS_LABELS: Record<PlotStatus, string> = {
  "available-dev": "Available — development",
  "available-inv": "Available — investment",
  reserved: "Reserved / pending",
  sold: "Sold / allocated",
  withheld: "Withheld by developer",
};

// `withheld` is the developer's own switch off the market (IE-7). It is a
// PORTAL status only: the public marketplace collapses every non-available
// status to "unavailable" so a buyer never learns why. Buyer-facing legends
// list these four and nothing else.
export const BUYER_FACING_STATUSES: PlotStatus[] = ["available-dev", "available-inv", "reserved", "sold"];

// What a new plot may start as. `withheld` is reached only through the
// status endpoint, which records the available variant it came from (the
// backend's CHECK on withheld_from_status) — so it is never a starting status.
export const CREATABLE_STATUSES: PlotStatus[] = ["available-dev", "available-inv", "reserved", "sold"];
