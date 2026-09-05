import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { fetchListings, fromPrice, type Listing } from "../services/marketplaceService";
import { formatCurrency } from "../data/mockData";

export default function Landing() {
  const [listings, setListings] = useState<Listing[] | null>(null); // null = loading

  useEffect(() => {
    let cancelled = false;
    fetchListings().then((data) => { if (!cancelled) setListings(data); });
    return () => { cancelled = true; };
  }, []);

  const loading = listings === null;
  const previews = (listings ?? []).slice(0, 3);
  const plotsAvailable = (listings ?? []).reduce((sum, l) => sum + l.priceTiers.reduce((s, t) => s + t.plotsRemaining, 0), 0);
  const titleTypeCount = new Set((listings ?? []).map((l) => l.titleType)).size;
  const statesCovered = Array.from(new Set((listings ?? []).map((l) => l.state)));
  return (
    <div className="min-h-full bg-[var(--background)] font-body">
      {/* Nav */}
      <nav className="sticky top-0 z-30 bg-[var(--background)]/95 backdrop-blur border-b border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-6">
          <span className="font-display text-xl text-[var(--foreground)]">LandVault</span>
          <div className="flex-1" />
          <Link to="/marketplace" className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors hidden sm:block">Marketplace</Link>
          <Link to="/login" className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors">Sign in</Link>
          <Link to="/register" className="text-sm px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md hover:opacity-90 transition-opacity">
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 pt-20 pb-24 grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-mono-data bg-[var(--secondary)] text-[var(--secondary-foreground)] px-3 py-1.5 rounded-full mb-6 border border-[var(--border)]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Verified Titles — Nationwide
            </div>
            <h1 className="font-display text-5xl lg:text-6xl leading-[1.1] text-[var(--foreground)] mb-6">
              Own land in<br />
              <span className="italic text-[var(--accent)]">Nigeria</span>
              <br />from anywhere.
            </h1>
            <p className="text-[var(--muted-foreground)] text-lg leading-relaxed mb-8 max-w-lg">
              Browse verified estates, inspect plots on a live map, and complete your purchase end-to-end — no flights, no paperwork mailed, no gaps in the transaction record.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/register" className="px-6 py-3 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md font-medium hover:opacity-90 transition-opacity text-sm">
                Start browsing plots
              </Link>
              <Link to="/marketplace" className="px-6 py-3 border border-[var(--border)] text-[var(--foreground)] rounded-md font-medium hover:bg-[var(--muted)] transition-colors text-sm">
                Browse the marketplace
              </Link>
            </div>

            {/* Trust indicators — derived from the real published catalogue,
                never invented. No "plots sold" tile: this app has no
                transaction-volume data to derive one from. */}
            <div className="flex flex-wrap gap-6 mt-10">
              {[
                { label: "Verified title types", value: loading ? "—" : `${titleTypeCount}` },
                { label: "Estates active", value: loading ? "—" : `${listings!.length} estates` },
                { label: "Plots available", value: loading ? "—" : plotsAvailable.toLocaleString() },
              ].map((t) => (
                <div key={t.label}>
                  <div className="text-xl font-semibold text-[var(--foreground)]">{t.value}</div>
                  <div className="text-xs text-[var(--muted-foreground)] mt-0.5">{t.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Hero image */}
          <div className="relative">
            <div className="aspect-[4/3] rounded-xl overflow-hidden bg-[var(--muted)]">
              <img
                src="https://images.unsplash.com/photo-1486325212027-8081e485255e?w=700&h=525&fit=crop&auto=format"
                alt="Aerial view of a residential estate in Abuja"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[var(--primary)]/40 to-transparent" />
            </div>

            {/* Floating card */}
            <div className="absolute bottom-4 left-4 bg-white rounded-xl shadow-xl px-4 py-3 max-w-[200px]">
              <div className="text-xs text-[var(--muted-foreground)] mb-0.5">Title status</div>
              <div className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Certificate of Occupancy
              </div>
              <div className="text-xs text-[var(--muted-foreground)] mt-0.5 font-mono-data">Verified Nov 2025</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-[var(--primary)] py-20">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="font-display text-3xl text-white mb-2">Built for trust.</h2>
          <p className="text-white/60 mb-12 max-w-xl">Every feature exists to close the trust gap between buyer and developer — especially across borders.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-white/8 border border-white/10 rounded-xl p-6">
                <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-[var(--accent)] mb-4 text-lg">
                  {f.icon}
                </div>
                <div className="text-white font-semibold mb-1.5">{f.title}</div>
                <div className="text-white/60 text-sm leading-relaxed">{f.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Personas */}
      <section className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="font-display text-3xl text-[var(--foreground)] mb-12">Who it's for</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {PERSONAS.map((p) => (
              <div key={p.name} className="border border-[var(--border)] rounded-xl p-6">
                <div className="w-12 h-12 rounded-full bg-[var(--muted)] flex items-center justify-center text-2xl mb-4">{p.emoji}</div>
                <div className="font-semibold text-[var(--foreground)] mb-0.5">{p.name}</div>
                <div className="text-xs text-[var(--muted-foreground)] font-mono-data mb-3">{p.tag}</div>
                <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Estates preview */}
      <section className="bg-[var(--muted)] py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-end justify-between mb-8">
            <div>
              <h2 className="font-display text-3xl text-[var(--foreground)] mb-1">Current estates</h2>
              <p className="text-[var(--muted-foreground)] text-sm">
                {loading
                  ? "Loading current developments…"
                  : statesCovered.length > 0
                    ? `Active developments across ${statesCovered.join(", ")}`
                    : "No developments published yet."}
              </p>
            </div>
            <Link to="/marketplace" className="text-sm text-[var(--accent)] font-medium hover:underline hidden sm:block">Browse all →</Link>
          </div>
          {loading ? (
            <div className="text-center py-16 text-[var(--muted-foreground)] text-sm">Loading estates…</div>
          ) : previews.length === 0 ? (
            <div className="text-center py-16 text-[var(--muted-foreground)] text-sm border border-dashed border-[var(--border)] rounded-xl">No published estates yet — check back soon.</div>
          ) : (
            <div className="grid md:grid-cols-3 gap-5">
              {previews.map((listing) => {
                const remaining = listing.priceTiers.reduce((s, t) => s + t.plotsRemaining, 0);
                return (
                  <Link to={`/marketplace/${listing.id}`} key={listing.id} className="group block bg-[var(--card)] rounded-xl overflow-hidden border border-[var(--border)] hover:border-[var(--accent)] transition-colors">
                    <div className="aspect-video overflow-hidden bg-[var(--muted)]">
                      {listing.imageUrl ? (
                        <img src={listing.imageUrl} alt={listing.name} className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[var(--muted-foreground)]/40">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 3L3 5v16l6-2 6 2 6-2V5l-6 2-6-2Z" /><path d="M9 3v16M15 5v16" /></svg>
                        </div>
                      )}
                    </div>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <div className="font-semibold text-sm text-[var(--foreground)]">{listing.name}</div>
                        <span className="text-xs font-mono-data text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full whitespace-nowrap">{listing.titleType}</span>
                      </div>
                      <div className="text-xs text-[var(--muted-foreground)]">{listing.area}, {listing.city}</div>
                      <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-center justify-between">
                        <div>
                          <div className="text-xs text-[var(--muted-foreground)]">From</div>
                          <div className="text-sm font-semibold font-mono-data text-[var(--foreground)]">{formatCurrency(fromPrice(listing))}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-[var(--muted-foreground)]">Available</div>
                          <div className="text-sm font-semibold font-mono-data text-[var(--foreground)]">{remaining} plots</div>
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[var(--primary)]">
        <div className="max-w-2xl mx-auto px-6 text-center">
          <h2 className="font-display text-4xl text-white mb-4">Ready to secure your plot?</h2>
          <p className="text-white/60 mb-8">Create an account in under 2 minutes. No documents needed to start browsing.</p>
          <Link to="/register" className="inline-block px-8 py-3.5 bg-[var(--accent)] text-white rounded-md font-semibold text-sm hover:opacity-90 transition-opacity">
            Create your account
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <span className="font-display text-lg text-[var(--foreground)]">LandVault</span>
          <p className="text-xs text-[var(--muted-foreground)] text-center">
            © 2026 LandVault Ltd. All plots sold subject to title verification and availability. Prices in NGN; FX conversions are indicative.
          </p>
        </div>
      </footer>
    </div>
  );
}

const FEATURES = [
  { icon: "🗺", title: "Live plot canvas", desc: "A real-time color-coded map shows every plot's availability status. Reserve while you browse." },
  { icon: "🔏", title: "Title badges", desc: "Every estate displays its C of O, R of O, or Governor's Consent status with the last-verified date." },
  { icon: "📄", title: "Document vault", desc: "Allocation letters, deeds, and receipts auto-generated with cryptographic QR codes verifiable by third parties." },
  { icon: "💳", title: "Installment plans", desc: "Pay outright or spread over 6–24 months. Diaspora buyers can pay in USD, GBP, or EUR." },
  { icon: "🔁", title: "Upgrade & swap", desc: "Upgrade to a larger plot or swap equity to another estate without restarting the legal process." },
  { icon: "📡", title: "Construction tracking", desc: "Time-stamped drone photos and infrastructure completion badges so remote buyers stay informed." },
];

const PERSONAS = [
  { emoji: "🇬🇧", name: "Emeka Okonkwo", tag: "Diaspora investor · London", desc: "Wants an Abuja corner plot without flying in. Pays in GBP, reviews title badges, and tracks installments from his phone." },
  { emoji: "🏠", name: "Aisha Aliyu", tag: "First-time buyer · Abuja", desc: "Buying a residential plot on a 12-month plan. Checks the AGIS overlay for encroachments and monitors her equity progress." },
  { emoji: "📈", name: "Tunde Adeyemi", tag: "Commercial investor · Lagos", desc: "Buys investment-flagged plots, reviews ROI projections, and lists on the secondary market when the time is right." },
];
