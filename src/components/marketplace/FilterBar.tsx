// The marketplace toolbar, from the Figma "Marketplace — Proposed": the
// listing-type switch, the three filters people reach for most (price, plot
// size, title) as popovers, everything else behind "More filters", and the
// result count beside sort. Every control writes the same filter keys as
// before, so URLs and the feed call are unchanged. Search and state live in
// the hero above.

import { useState } from "react";
import type { UnifiedListingFilters } from "../../services/marketplaceFeedService";
import { isLive } from "../../lib/backends";
import Popover from "../ui/Popover";
import Dialog from "../ui/Dialog";
import Button from "../ui/Button";
import { Input } from "../ui/Field";
import { formatCompactCurrency } from "../../lib/formatCurrency";

interface FilterBarProps {
  filters: UnifiedListingFilters;
  onChange: (patch: Partial<UnifiedListingFilters>) => void;
  // The feed's own total; null while loading.
  total: number | null;
}

const TITLE_TYPES = ["C of O", "R of O", "Governor's Consent", "Gazette"] as const;
// The title filter matches verified titles only, never ones just declared.
const TITLE_HINT = "Only titles HomeTrue has verified. A resale plot counts when its estate's title is verified.";
const TYPES: { value: UnifiedListingFilters["type"]; label: string }[] = [
  { value: undefined, label: "All" }, { value: "primary", label: "Developer estates" }, { value: "resale", label: "Resale" },
];
const PLANS = [{ value: "outright", label: "Outright" }, { value: "installment", label: "Installment" }, { value: "milestone", label: "Milestone" }] as const;
const INTENTS = [{ value: "development", label: "Development" }, { value: "investment", label: "Investment" }] as const;
const SORTS = [{ value: "newest", label: "Newest" }, { value: "price_low", label: "Price: low to high" }, { value: "price_per_sqm", label: "Price per sqm" }, { value: "plots_remaining", label: "Plots remaining" }] as const;

const numOrUndefined = (v: string) => (v === "" ? undefined : Number(v));

function SlidersIcon() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" /></svg>;
}

// A pill choice: one option of a small set, as a radio.
function Choice({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onClick}
      className={`px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${on ? "border-[var(--primary)] bg-[var(--secondary)] text-[var(--secondary-foreground)]" : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]"}`}>
      {children}
    </button>
  );
}

function Range({ label, min, max, onMin, onMax, minLabel, maxLabel }: { label: string; min?: number; max?: number; onMin: (v?: number) => void; onMax: (v?: number) => void; minLabel: string; maxLabel: string }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-[var(--foreground)] mb-2">{label}</legend>
      <div className="flex items-center gap-2">
        <Input inputSize="md" type="number" inputMode="numeric" aria-label={minLabel} placeholder="Min" value={min ?? ""} onChange={(e) => onMin(numOrUndefined(e.target.value))} />
        <span className="text-[var(--muted-foreground)]">–</span>
        <Input inputSize="md" type="number" inputMode="numeric" aria-label={maxLabel} placeholder="Max" value={max ?? ""} onChange={(e) => onMax(numOrUndefined(e.target.value))} />
      </div>
    </fieldset>
  );
}

function rangeLabel(base: string, min: number | undefined, max: number | undefined, fmt: (n: number) => string): string {
  if (min === undefined && max === undefined) return base;
  return `${min !== undefined ? fmt(min) : "0"} – ${max !== undefined ? fmt(max) : "any"}`;
}

export default function FilterBar({ filters, onChange, total }: FilterBarProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreCount = [filters.paymentPlan, filters.intent, filters.verifiedOnly].filter(Boolean).length;
  // On a phone the price, size and title menus are hidden (the row scrolls,
  // which would clip them), so the Filters button counts those too.
  const phoneCount = moreCount + [filters.minPrice !== undefined || filters.maxPrice !== undefined, filters.minSize !== undefined || filters.maxSize !== undefined, filters.titleType].filter(Boolean).length;
  const noun = filters.type === "primary" ? "estate" : filters.type === "resale" ? "resale plot" : "listing";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 overflow-x-auto sm:overflow-visible -mx-4 px-4 sm:mx-0 sm:px-0 pb-1 sm:pb-0 sm:flex-wrap">
        <div className="flex shrink-0 rounded-full bg-[var(--muted)] p-[3px]" role="radiogroup" aria-label="Listing type">
          {TYPES.map((opt) => {
            const on = filters.type === opt.value;
            return (
              <button key={opt.label} type="button" role="radio" aria-checked={on} onClick={() => onChange({ type: opt.value })}
                className={`px-3.5 py-1.5 rounded-full text-sm transition-colors whitespace-nowrap ${on ? "bg-[var(--card)] font-semibold text-[var(--foreground)] shadow-sm" : "font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}>
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="hidden sm:contents">
        <Popover label={rangeLabel("Price", filters.minPrice, filters.maxPrice, formatCompactCurrency)} active={filters.minPrice !== undefined || filters.maxPrice !== undefined}>
          {(close) => <RangePanel label="Price (₦)" min={filters.minPrice} max={filters.maxPrice} minLabel="Minimum price" maxLabel="Maximum price"
            onApply={(min, max) => { onChange({ minPrice: min, maxPrice: max }); close(); }} />}
        </Popover>
        <Popover label={rangeLabel("Plot size", filters.minSize, filters.maxSize, (n) => `${n} sqm`)} active={filters.minSize !== undefined || filters.maxSize !== undefined}>
          {(close) => <RangePanel label="Plot size (sqm)" min={filters.minSize} max={filters.maxSize} minLabel="Minimum size" maxLabel="Maximum size"
            onApply={(min, max) => { onChange({ minSize: min, maxSize: max }); close(); }} />}
        </Popover>
        <Popover label={filters.titleType ? `${filters.titleType}, verified` : "Title"} active={!!filters.titleType}>
          {(close) => (
            <div className="space-y-2">
              <div role="radiogroup" aria-label="Title type" aria-describedby="title-filter-hint" className="flex flex-wrap gap-2">
                <Choice on={!filters.titleType} onClick={() => { onChange({ titleType: undefined }); close(); }}>Any</Choice>
                {TITLE_TYPES.map((t) => <Choice key={t} on={filters.titleType === t} onClick={() => { onChange({ titleType: t }); close(); }}>{t}</Choice>)}
              </div>
              <p id="title-filter-hint" className="text-xs text-[var(--muted-foreground)]">{TITLE_HINT}</p>
            </div>
          )}
        </Popover>
        </div>
        <button type="button" onClick={() => setMoreOpen(true)}
          className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-sm font-medium transition-colors ${phoneCount ? "max-sm:border-[var(--primary)] max-sm:bg-[var(--secondary)] max-sm:text-[var(--secondary-foreground)]" : ""} ${moreCount ? "border-[var(--primary)] bg-[var(--secondary)] text-[var(--secondary-foreground)]" : "border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] hover:bg-[var(--muted)]"}`}>
          <SlidersIcon />
          <span className="sm:hidden">Filters{phoneCount ? ` (${phoneCount})` : ""}</span>
          <span className="hidden sm:inline">More filters{moreCount ? ` (${moreCount})` : ""}</span>
        </button>
      </div>

      <div className="flex items-center gap-4 text-sm">
        {total !== null && <span className="text-[var(--muted-foreground)]" role="status">{total} {noun}{total === 1 ? "" : "s"}</span>}
        <label className="inline-flex items-center gap-1.5">
          <span className="text-[var(--muted-foreground)]">Sort:</span>
          <select value={filters.sort ?? "newest"} onChange={(e) => onChange({ sort: e.target.value as UnifiedListingFilters["sort"] })}
            className="bg-transparent font-semibold text-[var(--foreground)] cursor-pointer pr-1">
            {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
      </div>

      {moreOpen && <MoreFilters filters={filters} total={total} onClose={() => setMoreOpen(false)} onApply={(patch) => { onChange(patch); setMoreOpen(false); }} />}
    </div>
  );
}

function RangePanel({ label, min, max, minLabel, maxLabel, onApply }: { label: string; min?: number; max?: number; minLabel: string; maxLabel: string; onApply: (min?: number, max?: number) => void }) {
  const [lo, setLo] = useState(min);
  const [hi, setHi] = useState(max);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onApply(lo, hi); }} className="space-y-3">
      <Range label={label} min={lo} max={hi} onMin={setLo} onMax={setHi} minLabel={minLabel} maxLabel={maxLabel} />
      <div className="flex justify-between gap-3">
        <Button variant="linkMuted" onClick={() => onApply(undefined, undefined)}>Clear</Button>
        <Button type="submit">Apply</Button>
      </div>
    </form>
  );
}

// Everything else, applied together. Price and size are here too, so a phone
// user has one place for all of it.
function MoreFilters({ filters, total, onClose, onApply }: { filters: UnifiedListingFilters; total: number | null; onClose: () => void; onApply: (patch: Partial<UnifiedListingFilters>) => void }) {
  const [d, setD] = useState<Partial<UnifiedListingFilters>>({
    type: filters.type, minPrice: filters.minPrice, maxPrice: filters.maxPrice, minSize: filters.minSize, maxSize: filters.maxSize,
    titleType: filters.titleType, paymentPlan: filters.paymentPlan, intent: filters.intent, verifiedOnly: filters.verifiedOnly,
  });
  const set = (patch: Partial<UnifiedListingFilters>) => setD((prev) => ({ ...prev, ...patch }));
  const cleared: Partial<UnifiedListingFilters> = { type: undefined, minPrice: undefined, maxPrice: undefined, minSize: undefined, maxSize: undefined, titleType: undefined, paymentPlan: undefined, intent: undefined, verifiedOnly: undefined };
  const group = (title: string, children: React.ReactNode) => (
    <div>
      <div className="text-sm font-semibold text-[var(--foreground)] mb-2">{title}</div>
      <div role="radiogroup" aria-label={title} className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
  return (
    <Dialog title="Filters" onClose={onClose} size="md">
      <div className="space-y-6 pt-2">
        {group("Listing type", TYPES.map((t) => <Choice key={t.label} on={d.type === t.value} onClick={() => set({ type: t.value })}>{t.label}</Choice>))}
        <Range label="Price (₦)" min={d.minPrice} max={d.maxPrice} onMin={(v) => set({ minPrice: v })} onMax={(v) => set({ maxPrice: v })} minLabel="Minimum price" maxLabel="Maximum price" />
        <Range label="Plot size (sqm)" min={d.minSize} max={d.maxSize} onMin={(v) => set({ minSize: v })} onMax={(v) => set({ maxSize: v })} minLabel="Minimum size" maxLabel="Maximum size" />
        <div>
          {group("Title", <>
            <Choice on={!d.titleType} onClick={() => set({ titleType: undefined })}>Any</Choice>
            {TITLE_TYPES.map((t) => <Choice key={t} on={d.titleType === t} onClick={() => set({ titleType: t })}>{t}</Choice>)}
          </>)}
          <p className="text-xs text-[var(--muted-foreground)] mt-2">{TITLE_HINT}</p>
        </div>
        {group("Payment plan", <>
          <Choice on={!d.paymentPlan} onClick={() => set({ paymentPlan: undefined })}>Any</Choice>
          {PLANS.map((p) => <Choice key={p.value} on={d.paymentPlan === p.value} onClick={() => set({ paymentPlan: p.value })}>{p.label}</Choice>)}
        </>)}
        {group("Buying for", <>
          <Choice on={!d.intent} onClick={() => set({ intent: undefined })}>Either</Choice>
          {INTENTS.map((p) => <Choice key={p.value} on={d.intent === p.value} onClick={() => set({ intent: p.value })}>{p.label}</Choice>)}
        </>)}
        {/* Live, every listed developer is verified (unverified companies are
            never listed), so the filter would do nothing — and would suggest
            the LAND is what's verified. Demo mode only. */}
        {!isLive("marketplace") && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={d.verifiedOnly ?? false} onChange={(e) => set({ verifiedOnly: e.target.checked || undefined })} className="w-4 h-4 accent-[var(--accent)]" />
            Verified developers only
          </label>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-[var(--border)] mt-6 pt-4">
        <Button variant="linkMuted" onClick={() => onApply(cleared)}>Clear all</Button>
        <Button onClick={() => onApply(d)}>{total !== null ? "Show results" : "Apply"}</Button>
      </div>
    </Dialog>
  );
}
