// The public site footer, from the Figma library's "Site footer". Every link
// goes to a page that exists — nothing here promises a page we don't have.

import { Link } from "react-router-dom";

const COLUMNS: { heading: string; links: { to: string; label: string }[] }[] = [
  { heading: "Buy", links: [{ to: "/marketplace", label: "Marketplace" }, { to: "/verify", label: "Verify a document" }] },
  { heading: "Developers", links: [{ to: "/list-your-company", label: "List your company" }, { to: "/login", label: "Developer portal sign in" }] },
  { heading: "Help", links: [{ to: "/support", label: "Support" }] },
];

export default function SiteFooter() {
  return (
    <footer className="bg-[var(--primary)] text-[var(--primary-foreground)] mt-16">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-8">
        <div className="grid gap-10 sm:grid-cols-[1fr_auto_auto_auto] sm:gap-16">
          <div>
            <Link to="/" className="font-display text-2xl">HomeTrue</Link>
            <p className="text-sm opacity-70 mt-2 max-w-xs">Verified land from verified developers, across Nigeria. Every payment goes through HomeTrue.</p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <div className="text-xs font-medium opacity-55 mb-3">{col.heading}</div>
              <ul className="space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.to}><Link to={l.to} className="text-sm hover:underline">{l.label}</Link></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-between gap-2 border-t border-white/10 mt-10 pt-5 text-xs opacity-55">
          <span>© {new Date().getFullYear()} HomeTrue</span>
          <span>hometrue.com.ng</span>
        </div>
      </div>
    </footer>
  );
}
