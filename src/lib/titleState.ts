// HomeTrue's verdict on an owned plot's title, worded once for the plot page
// and the portfolio list so the two always say the same thing.

import type { OwnedPlot } from "../data/mockData";

// Mock plots predate titleStatus and carry only titleVerified.
export function plotTitleStatus(plot: Pick<OwnedPlot, "titleStatus" | "titleVerified">): OwnedPlot["titleStatus"] {
  return plot.titleStatus ?? (plot.titleVerified ? "verified" : null);
}

// What HomeTrue's review of the title said. Rejected reads "not confirmed":
// HomeTrue looked and couldn't confirm it.
export function titleState(titleType: OwnedPlot["titleType"], status: OwnedPlot["titleStatus"]) {
  if (!titleType) return null;
  if (status === "verified") return { tone: "success" as const, chip: "bg-[var(--success-surface)] text-[var(--success-text)]", badge: `${titleType} verified`, head: `${titleType} verified by HomeTrue`, body: "HomeTrue checked the title documents." };
  if (status === "rejected") return { tone: "error" as const, chip: "bg-[var(--error-surface)] text-[var(--error-text)]", badge: "Title not confirmed", head: `${titleType} — not confirmed`, body: "HomeTrue reviewed the title documents and couldn't confirm them. Ask the developer what's outstanding." };
  return { tone: "warning" as const, chip: "bg-[var(--warning-surface)] text-[var(--warning-text)]", badge: `${titleType} declared`, head: `${titleType} — declared by the developer`, body: "HomeTrue is checking the title documents." };
}
