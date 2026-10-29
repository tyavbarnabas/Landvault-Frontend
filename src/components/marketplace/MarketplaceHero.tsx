// The marketplace's top band, from the Figma proposal: what this is, one
// search (words + state), and the three promises that make it different.
// Search applies on submit, not per keystroke; it writes the same `query` and
// `state` filters the toolbar used to.

import { useEffect, useState } from "react";
import { NIGERIAN_STATES } from "../../data/nigerianStates";
import type { UnifiedListingFilters } from "../../services/marketplaceFeedService";
import { FileTextIcon, LockIcon, MapPinIcon, ShieldCheckIcon } from "../icons";
import NightSky from "./NightSky";

interface MarketplaceHeroProps {
  filters: UnifiedListingFilters;
  onSearch: (patch: Pick<UnifiedListingFilters, "query" | "state">) => void;
}

function SearchIcon() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>;
}

export default function MarketplaceHero({ filters, onSearch }: MarketplaceHeroProps) {
  const [query, setQuery] = useState(filters.query ?? "");
  const [state, setState] = useState<string>(filters.state ?? "");
  // A chip removed below, or a link with ?q=…, changes the filters: follow them.
  useEffect(() => { setQuery(filters.query ?? ""); setState(filters.state ?? ""); }, [filters.query, filters.state]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch({ query: query.trim() || undefined, state: (state || undefined) as UnifiedListingFilters["state"] });
  };

  return (
    <section className="relative overflow-hidden bg-[var(--secondary)]">
      <NightSky />
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-8 pb-7 sm:pt-12 sm:pb-10">
        <h1 className="font-display text-[28px] leading-[34px] sm:text-[44px] sm:leading-[52px] text-[var(--foreground)]">Find verified land across Nigeria</h1>
        <p className="hidden sm:block text-base text-[var(--secondary-foreground)] mt-3">Developer estates and resale plots from every seller on HomeTrue. Every fee is declared before you pay.</p>

        <form onSubmit={submit} role="search" className="mt-5 sm:mt-6 flex flex-col sm:flex-row gap-3 sm:gap-0 sm:items-center sm:bg-[var(--card)] sm:border sm:border-[var(--border)] sm:rounded-xl sm:p-2 sm:pl-5 sm:shadow-[0_6px_20px_-4px_rgba(13,31,20,0.08)]">
          <div className="flex flex-col sm:flex-row sm:flex-1 sm:items-center bg-[var(--card)] border border-[var(--border)] rounded-xl sm:border-0 sm:rounded-none overflow-hidden">
            <label className="flex flex-1 items-center gap-2.5 px-3.5 sm:px-0 py-3 sm:py-2 text-[var(--muted-foreground)]">
              <SearchIcon />
              <span className="sr-only">Search by estate, area or city</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by estate, area or city"
                className="flex-1 min-w-0 bg-transparent text-base text-[var(--foreground)] placeholder:text-[var(--muted-foreground)]" />
            </label>
            <label className="flex items-center gap-2 px-3.5 sm:px-5 py-3 sm:py-2 border-t sm:border-t-0 sm:border-l border-[var(--border)] text-[var(--muted-foreground)]">
              <MapPinIcon size={18} />
              <span className="sr-only">State</span>
              <select value={state} onChange={(e) => setState(e.target.value)} className="flex-1 sm:flex-none bg-transparent text-base text-[var(--foreground)] cursor-pointer">
                <option value="">All states</option>
                {NIGERIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
          <button type="submit" className="w-full sm:w-auto px-5 py-2.5 rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-semibold hover:opacity-90">Search</button>
        </form>

        <ul className="mt-4 sm:mt-5 flex flex-col sm:flex-row gap-1.5 sm:gap-7 text-xs sm:text-sm font-medium text-[var(--secondary-foreground)]">
          <li className="inline-flex items-center gap-2"><span className="text-[var(--success-text)]"><ShieldCheckIcon /></span>Every developer verified by HomeTrue</li>
          <li className="inline-flex items-center gap-2"><span className="text-[var(--success-text)]"><LockIcon /></span>Pay only through HomeTrue</li>
          <li className="inline-flex items-center gap-2"><span className="text-[var(--success-text)]"><FileTextIcon /></span>Every fee declared before you pay</li>
        </ul>
      </div>
    </section>
  );
}
