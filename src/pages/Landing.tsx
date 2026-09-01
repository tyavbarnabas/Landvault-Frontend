import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="min-h-full bg-[var(--background)] font-body">
      {/* Nav */}
      <nav className="sticky top-0 z-30 bg-[var(--background)]/95 backdrop-blur border-b border-[var(--border)]">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-6">
          <span className="font-display text-xl text-[var(--foreground)]">LandVault</span>
          <div className="flex-1" />
          <Link to="/estates" className="text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors hidden sm:block">Estates</Link>
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
              FCT & Abuja — Verified Titles
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
              <Link to="/estates" className="px-6 py-3 border border-[var(--border)] text-[var(--foreground)] rounded-md font-medium hover:bg-[var(--muted)] transition-colors text-sm">
                View estates
              </Link>
            </div>

            {/* Trust indicators */}
            <div className="flex flex-wrap gap-6 mt-10">
              {[
                { label: "Verified titles", value: "C of O & R of O" },
                { label: "Estates active", value: "3 estates" },
                { label: "Plots sold", value: "1,400+" },
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
              <p className="text-[var(--muted-foreground)] text-sm">3 active developments across FCT Abuja</p>
            </div>
            <Link to="/estates" className="text-sm text-[var(--accent)] font-medium hover:underline hidden sm:block">Browse all →</Link>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {ESTATE_PREVIEWS.map((e) => (
              <Link to="/register" key={e.name} className="group block bg-[var(--card)] rounded-xl overflow-hidden border border-[var(--border)] hover:border-[var(--accent)] transition-colors">
                <div className="aspect-video overflow-hidden bg-[var(--muted)]">
                  <img src={e.img} alt={e.name} className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300" />
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="font-semibold text-sm text-[var(--foreground)]">{e.name}</div>
                    <span className="text-xs font-mono-data text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full whitespace-nowrap">{e.title}</span>
                  </div>
                  <div className="text-xs text-[var(--muted-foreground)]">{e.location}</div>
                  <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-center justify-between">
                    <div>
                      <div className="text-xs text-[var(--muted-foreground)]">From</div>
                      <div className="text-sm font-semibold font-mono-data text-[var(--foreground)]">{e.price}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-[var(--muted-foreground)]">Available</div>
                      <div className="text-sm font-semibold font-mono-data text-[var(--foreground)]">{e.available}</div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
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

const ESTATE_PREVIEWS = [
  { name: "Millbrook Gardens", location: "Maitama Extension, Abuja", title: "C of O", price: "₦28M", available: "142 plots", img: "https://images.unsplash.com/photo-1486325212027-8081e485255e?w=500&h=280&fit=crop&auto=format" },
  { name: "Sterling Court", location: "Apo Legislative Quarters", title: "Gov. Consent", price: "₦18.5M", available: "95 plots", img: "https://images.unsplash.com/photo-1590424693420-1d68e1fd46b5?w=500&h=280&fit=crop&auto=format" },
  { name: "Emerald Park", location: "Lugbe District, Abuja", title: "R of O", price: "₦9.5M", available: "201 plots", img: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=500&h=280&fit=crop&auto=format" },
];
