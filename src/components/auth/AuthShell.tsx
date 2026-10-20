// The frame every sign-in screen sits in (sign in, create account, password
// reset and change, staff invitation), from the Figma "Sign-in & landing"
// proposal: the form on the left with the logo and a way back to the
// marketplace, and on the right what HomeTrue checks, in place of the old
// stock photo. On a phone those points become a short strip under the form.

import { Link } from "react-router-dom";
import { ArrowLeftIcon, BuildingIcon, CheckIcon, FileCheckIcon, LockIcon, ShieldCheckIcon } from "../icons";

const POINTS = [
  { icon: BuildingIcon, title: "Every developer verified", body: "No company lists until HomeTrue has verified it." },
  { icon: ShieldCheckIcon, title: "Titles labelled honestly", body: "Declared means declared. Verified means HomeTrue checked it." },
  { icon: LockIcon, title: "One place to pay", body: "Never into a bank account named in a letter, message or flyer." },
  { icon: FileCheckIcon, title: "Documents anyone can check", body: "Receipts and allocation letters carry a code to verify." },
];

export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] bg-[var(--background)]">
      <div className="flex flex-col px-4 sm:px-10 lg:px-16 xl:px-24 py-6 lg:py-10 min-h-full">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" className="font-display text-2xl text-[var(--foreground)]">HomeTrue</Link>
          <Link to="/marketplace" className="inline-flex items-center gap-1.5 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
            <ArrowLeftIcon size={14} /><span className="sm:hidden">Marketplace</span><span className="hidden sm:inline">Back to the marketplace</span>
          </Link>
        </div>

        <main className="flex-1 flex items-center justify-center py-10">
          <div className="w-full max-w-[400px]">{children}</div>
        </main>

        <ul className="lg:hidden w-full max-w-[400px] mx-auto rounded-xl bg-[var(--primary)] p-4 space-y-2 mb-6" aria-label="Why HomeTrue">
          {POINTS.slice(0, 3).map((p) => (
            <li key={p.title} className="flex items-center gap-2 text-sm text-[var(--primary-foreground)]">
              <span className="text-[var(--accent)]"><CheckIcon size={14} /></span>{p.title}
            </li>
          ))}
        </ul>

        <p className="text-xs text-[var(--muted-foreground)]">
          © 2026 HomeTrue · <Link to="/support" className="hover:text-[var(--foreground)]">Support</Link> · hometrue.com.ng
        </p>
      </div>

      <aside className="hidden lg:flex flex-col justify-center bg-[var(--primary)] px-14 xl:px-16 py-16 gap-7" aria-label="Why HomeTrue">
        <p className="font-mono-data text-xs tracking-widest text-[var(--accent)]">WHY HOMETRUE</p>
        <p className="font-display text-4xl leading-tight text-[var(--primary-foreground)] max-w-md">Land you can check before you pay for it.</p>
        <ul className="space-y-5">
          {POINTS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3.5">
              <span className="w-9 h-9 shrink-0 rounded-lg bg-[var(--accent)] text-[var(--accent-foreground)] flex items-center justify-center"><Icon size={18} /></span>
              <div>
                <div className="font-semibold text-[var(--primary-foreground)]">{title}</div>
                <div className="text-sm text-[var(--primary-foreground)] opacity-75">{body}</div>
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

// The heading block each screen opens with: serif title and a short line.
export function AuthHeading({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-7">
      <h1 className="font-display text-3xl sm:text-4xl text-[var(--foreground)] mb-1.5">{title}</h1>
      {children && <div className="text-sm text-[var(--muted-foreground)]">{children}</div>}
    </div>
  );
}
