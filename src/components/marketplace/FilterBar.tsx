import { NIGERIAN_STATES } from "../../data/nigerianStates";
import type { UnifiedListingFilters } from "../../services/marketplaceFeedService";

interface FilterBarProps {
  filters: UnifiedListingFilters;
  onChange: (patch: Partial<UnifiedListingFilters>) => void;
}

const TITLE_TYPES = ["C of O", "R of O", "Governor's Consent", "Gazette"] as const;

export default function FilterBar({ filters, onChange }: FilterBarProps) {
  const numOrUndefined = (v: string) => (v === "" ? undefined : Number(v));

  return (
    <div className="flex flex-wrap gap-3">
      <div className="flex rounded-md border border-[var(--border)] overflow-hidden shrink-0" role="radiogroup" aria-label="Listing type">
        {([
          { value: undefined, label: "All" },
          { value: "primary" as const, label: "Developer estates" },
          { value: "resale" as const, label: "Resale" },
        ]).map((opt) => (
          <button
            key={opt.label}
            type="button"
            role="radio"
            aria-checked={filters.type === opt.value}
            onClick={() => onChange({ type: opt.value })}
            className={`px-3 py-2 text-sm font-medium transition-colors ${filters.type === opt.value ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]"}`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <input
        value={filters.query ?? ""}
        onChange={(e) => onChange({ query: e.target.value || undefined })}
        placeholder="Search by estate, area, city, or state…"
        className="flex-1 min-w-[240px] px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]"
      />

      <select value={filters.state ?? ""} onChange={(e) => onChange({ state: (e.target.value || undefined) as UnifiedListingFilters["state"] })} className="px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm cursor-pointer">
        <option value="">All states</option>
        {NIGERIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>

      <select value={filters.titleType ?? ""} onChange={(e) => onChange({ titleType: (e.target.value || undefined) as UnifiedListingFilters["titleType"] })} className="px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm cursor-pointer">
        <option value="">All title types</option>
        {TITLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>

      <select value={filters.paymentPlan ?? ""} onChange={(e) => onChange({ paymentPlan: (e.target.value || undefined) as UnifiedListingFilters["paymentPlan"] })} className="px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm cursor-pointer">
        <option value="">Any payment plan</option>
        <option value="outright">Outright</option>
        <option value="installment">Installment</option>
        <option value="milestone">Milestone</option>
      </select>

      <select value={filters.intent ?? ""} onChange={(e) => onChange({ intent: (e.target.value || undefined) as UnifiedListingFilters["intent"] })} className="px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm cursor-pointer">
        <option value="">Development or investment</option>
        <option value="development">Development</option>
        <option value="investment">Investment</option>
      </select>

      <div className="flex items-center gap-1.5">
        <input type="number" placeholder="Min ₦" value={filters.minPrice ?? ""} onChange={(e) => onChange({ minPrice: numOrUndefined(e.target.value) })} className="w-28 px-2.5 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm" />
        <span className="text-[var(--muted-foreground)] text-sm">–</span>
        <input type="number" placeholder="Max ₦" value={filters.maxPrice ?? ""} onChange={(e) => onChange({ maxPrice: numOrUndefined(e.target.value) })} className="w-28 px-2.5 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm" />
      </div>

      <div className="flex items-center gap-1.5">
        <input type="number" placeholder="Min sqm" value={filters.minSize ?? ""} onChange={(e) => onChange({ minSize: numOrUndefined(e.target.value) })} className="w-24 px-2.5 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm" />
        <span className="text-[var(--muted-foreground)] text-sm">–</span>
        <input type="number" placeholder="Max sqm" value={filters.maxSize ?? ""} onChange={(e) => onChange({ maxSize: numOrUndefined(e.target.value) })} className="w-24 px-2.5 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm" />
      </div>

      <label className="flex items-center gap-1.5 px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm cursor-pointer">
        <input type="checkbox" checked={filters.verifiedOnly ?? false} onChange={(e) => onChange({ verifiedOnly: e.target.checked || undefined })} className="w-3.5 h-3.5 accent-[var(--accent)]" />
        Verified only
      </label>

      <select value={filters.sort ?? "newest"} onChange={(e) => onChange({ sort: e.target.value as UnifiedListingFilters["sort"] })} className="px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm cursor-pointer">
        <option value="newest">Newest</option>
        <option value="price_low">Price: low to high</option>
        <option value="price_per_sqm">Price per sqm</option>
        <option value="plots_remaining">Plots remaining</option>
      </select>
    </div>
  );
}
