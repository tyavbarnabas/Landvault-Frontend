import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { formatAmount, type Estate } from "../../data/mockData";
import { fetchEstates } from "../../services/estatesService";
import { useApp } from "../../contexts/AppContext";

export default function Browse() {
  const { currency } = useApp();
  const [estates, setEstates] = useState<Estate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [priceMax, setPriceMax] = useState(100_000_000);
  const [intent, setIntent] = useState<"all" | "development" | "investment">("all");

  useEffect(() => {
    let cancelled = false;
    fetchEstates().then((data) => { if (!cancelled) { setEstates(data); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  const filtered = estates.filter((e) => {
    if (search && !e.name.toLowerCase().includes(search.toLowerCase()) && !e.location.toLowerCase().includes(search.toLowerCase())) return false;
    if (e.priceFrom > priceMax) return false;
    return true;
  });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-3xl text-[var(--foreground)] mb-1">Estates</h1>
        <p className="text-sm text-[var(--muted-foreground)]">Browse all active developments. Plots are live and reflect current availability.</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or location…"
          className="flex-1 min-w-[200px] px-3 py-2 text-sm bg-[var(--card)] border border-[var(--border)] rounded-md"
        />
        <select
          value={intent}
          onChange={(e) => setIntent(e.target.value as any)}
          className="px-3 py-2 text-sm bg-[var(--card)] border border-[var(--border)] rounded-md"
        >
          <option value="all">All intent</option>
          <option value="development">Development</option>
          <option value="investment">Investment</option>
        </select>
        <select
          value={priceMax}
          onChange={(e) => setPriceMax(Number(e.target.value))}
          className="px-3 py-2 text-sm bg-[var(--card)] border border-[var(--border)] rounded-md"
        >
          <option value={100_000_000}>Any price</option>
          <option value={15_000_000}>Up to {formatAmount(15_000_000, currency)}</option>
          <option value={30_000_000}>Up to {formatAmount(30_000_000, currency)}</option>
          <option value={50_000_000}>Up to {formatAmount(50_000_000, currency)}</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-20 text-[var(--muted-foreground)] text-sm">Loading estates…</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-[var(--muted-foreground)]">
          <div className="text-4xl mb-3">🗺</div>
          <div className="font-medium">No estates match your filters</div>
          <button onClick={() => { setSearch(""); setPriceMax(100_000_000); setIntent("all"); }} className="mt-3 text-sm text-[var(--accent)] hover:underline">Clear filters</button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((estate) => (
            <Link key={estate.id} to={`/estates/${estate.id}`} className="group block bg-[var(--card)] rounded-xl border border-[var(--border)] overflow-hidden hover:border-[var(--accent)]/50 hover:shadow-md transition-all">
              <div className="aspect-video overflow-hidden bg-[var(--muted)] relative">
                <img
                  src={estate.imageUrl}
                  alt={estate.name}
                  className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                />
                <div className="absolute top-3 left-3">
                  <TitleBadge type={estate.titleType} verified={estate.titleVerified} />
                </div>
                <div className="absolute bottom-3 right-3 bg-[var(--foreground)]/80 text-[var(--background)] text-xs font-mono-data px-2 py-0.5 rounded">
                  {estate.availablePlots} available
                </div>
              </div>
              <div className="p-4">
                <div className="font-semibold text-[var(--foreground)] mb-0.5">{estate.name}</div>
                <div className="text-xs text-[var(--muted-foreground)] mb-3">{estate.location}</div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {estate.amenities.slice(0, 3).map((a) => (
                    <span key={a} className="text-xs bg-[var(--muted)] text-[var(--muted-foreground)] px-2 py-0.5 rounded">{a}</span>
                  ))}
                  {estate.amenities.length > 3 && (
                    <span className="text-xs text-[var(--muted-foreground)]">+{estate.amenities.length - 3}</span>
                  )}
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-[var(--border)]">
                  <div>
                    <div className="text-xs text-[var(--muted-foreground)]">From</div>
                    <div className="font-semibold font-mono-data text-sm">{formatAmount(estate.priceFrom, currency)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-[var(--muted-foreground)]">Plot size</div>
                    <div className="font-semibold font-mono-data text-sm">{estate.sqmFrom}–{estate.sqmTo} sqm</div>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function TitleBadge({ type, verified }: { type: string; verified: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${verified ? "bg-white text-emerald-800" : "bg-white text-amber-700"}`}>
      {verified ? "✓" : "⚠"} {type}
    </span>
  );
}
