// The public home page, from the Figma "Sign-in & landing" proposal: what
// HomeTrue checks before an estate is listed, a search that opens the
// marketplace, the newest estates, how buying works and why it's safe.
//
// Every figure is counted from the published marketplace; nothing here is a
// stock claim. Features that aren't live (installments, upgrades,
// construction tracking) aren't promised, and the old personas are gone —
// they were internal design personas, not customers.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchListings, isTitleVerified } from "../services/marketplaceService";
import { normalizeVerifyCode } from "../services/documentsService";
import { NIGERIAN_STATES } from "../data/nigerianStates";
import { useFetch } from "../lib/useFetch";
import EstateCard from "../components/marketplace/EstateCard";
import NightSky from "../components/marketplace/NightSky";
import Card from "../components/ui/Card";
import Button, { LinkButton } from "../components/ui/Button";
import { Input, Select } from "../components/ui/Field";
import TextLink from "../components/ui/TextLink";
import {
  AlertIcon, BuildingIcon, CalendarIcon, FileCheckIcon, FileTextIcon, LockIcon, MapPinIcon, ReceiptIcon, SearchIcon, ShieldCheckIcon,
} from "../components/icons";

const CHECKS = [
  { icon: BuildingIcon, title: "Developer verified", body: "No company can list until HomeTrue has verified it." },
  { icon: FileTextIcon, title: "Title documents checked", body: "C of O, R of O, Gazette or Consent — reviewed by HomeTrue." },
  { icon: MapPinIcon, title: "Land checked on the map", body: "The estate's boundary is mapped and checked for overlaps." },
  { icon: ReceiptIcon, title: "Fees declared up front", body: "The developer's fees and terms are on the listing before you pay." },
];

const STEPS = [
  { icon: SearchIcon, title: "Find a verified estate", body: "Filter by state, price, size and title. Every fee is on the listing." },
  { icon: CalendarIcon, title: "Inspect or reserve", body: "Book a site inspection, or reserve a plot on the estate map." },
  { icon: LockIcon, title: "Pay through HomeTrue", body: "Card or bank transfer to HomeTrue — never to a personal account." },
  { icon: FileCheckIcon, title: "Get your documents", body: "Your receipt and allocation letter, each with a code anyone can verify." },
];

const TRUST = [
  { icon: ShieldCheckIcon, title: "Titles checked, and labelled honestly", body: "A declared title says “declared”. Only a title HomeTrue checked says “verified”." },
  { icon: ReceiptIcon, title: "Every cost before you pay", body: "The land price, fees and staged charges add up to one total commitment." },
  { icon: LockIcon, title: "One place to pay", body: "Money goes to HomeTrue, and on to the developer once the sale is verified." },
  { icon: FileCheckIcon, title: "Documents anyone can check", body: "A lawyer, bank or relative can confirm your letter on HomeTrue's verify page." },
];

export default function Landing() {
  // The whole published catalogue, for honest counts: one generous page, not
  // a paginated list view.
  const catalogue = useFetch(() => fetchListings({}, { limit: 500 }), []);
  const listings = catalogue.data?.items ?? [];
  const counted = !!catalogue.data;
  const stats = [
    { value: catalogue.data?.total ?? 0, label: "Estates listed" },
    { value: listings.reduce((sum, l) => sum + l.priceTiers.reduce((s, t) => s + t.plotsRemaining, 0), 0), label: "Plots available" },
    { value: new Set(listings.map((l) => l.state)).size, label: "States covered" },
    { value: listings.filter(isTitleVerified).length, label: "Titles verified by HomeTrue" },
  ];
  const newest = [...listings].sort((a, b) => (a.publishedDate < b.publishedDate ? 1 : -1)).slice(0, 3);

  return (
    <div className="bg-[var(--background)]">
      {/* Hero, under the night sky at night */}
      <div className="relative overflow-hidden">
      <NightSky />
      <section className="relative max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-10 lg:pt-16 lg:pb-14 grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-10 lg:gap-16 items-center">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--success-border)] bg-[var(--success-surface)] text-[var(--success-text)] px-3 py-1 text-xs font-medium mb-5">
            <ShieldCheckIcon size={13} />Every developer on HomeTrue is verified
          </span>
          <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.5rem] leading-[1.1] text-[var(--foreground)] mb-5">
            Buy verified land in Nigeria — from wherever you live.
          </h1>
          <p className="text-[var(--muted-foreground)] text-base sm:text-lg leading-relaxed mb-7 max-w-xl">
            See each estate's title, every fee and the plots still open before you commit. Pay only through HomeTrue, and keep
            receipts and allocation letters anyone can verify.
          </p>
          <HeroSearch />
          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-sm">
            <TextLink to="/marketplace" className="font-medium">Browse all estates →</TextLink>
            <TextLink to="/verify" className="font-medium">Have a HomeTrue document? Verify it →</TextLink>
          </div>
        </div>

        <Card as="section" padding="lg" className="space-y-4" aria-labelledby="checks-heading">
          <div>
            <h2 id="checks-heading" className="font-semibold text-[var(--foreground)]">Before an estate goes live on HomeTrue</h2>
            <p className="text-sm text-[var(--muted-foreground)] mt-1">
              What HomeTrue checks, and shows on every listing. A check that hasn't passed is shown as pending — never as passed.
            </p>
          </div>
          <ul className="space-y-3.5">
            {CHECKS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3.5">
                <span className="w-9 h-9 shrink-0 rounded-lg bg-[var(--success-surface)] text-[var(--success-text)] flex items-center justify-center"><Icon size={18} /></span>
                <div>
                  <div className="text-sm font-semibold text-[var(--foreground)]">{title}</div>
                  <div className="text-sm text-[var(--muted-foreground)]">{body}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </section>
      </div>

      {/* Live counts */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6" aria-label="HomeTrue in numbers">
        <Card className="grid grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] gap-4 lg:gap-8 items-end">
          {stats.map((s) => (
            <div key={s.label}>
              <div className="font-display text-3xl text-[var(--foreground)]">{counted ? s.value.toLocaleString() : "—"}</div>
              <div className="text-sm text-[var(--muted-foreground)]">{s.label}</div>
            </div>
          ))}
          <p className="col-span-2 lg:col-span-1 text-xs text-[var(--muted-foreground)]">Counted live from the marketplace</p>
        </Card>
      </section>

      {/* Newest estates */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14" aria-labelledby="newest-heading">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
          <div>
            <h2 id="newest-heading" className="font-display text-3xl text-[var(--foreground)] mb-1">On HomeTrue now</h2>
            <p className="text-sm text-[var(--muted-foreground)]">The newest estates, with their title as HomeTrue checked it.</p>
          </div>
          {listings.length > 0 && <TextLink to="/marketplace" className="text-sm font-medium">Browse all {catalogue.data?.total} estates →</TextLink>}
        </div>
        {!counted ? (
          <p className="text-sm text-[var(--muted-foreground)] py-12 text-center">{catalogue.error ? "Estates couldn't be loaded just now." : "Loading estates…"}</p>
        ) : newest.length === 0 ? (
          <Card className="text-center text-sm text-[var(--muted-foreground)] py-12">No estates are published yet — check back soon.</Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {newest.map((l, i) => <EstateCard key={l.id} listing={l} index={i} />)}
          </div>
        )}
      </section>

      {/* How buying works */}
      <section className="bg-[var(--secondary)] py-14" aria-labelledby="how-heading">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 id="how-heading" className="font-display text-3xl text-[var(--foreground)] mb-1">How buying works</h2>
          <p className="text-sm text-[var(--muted-foreground)] mb-8">The same four steps for every estate, start to finish on HomeTrue.</p>
          <ol className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            {STEPS.map(({ icon: Icon, title, body }, i) => (
              <Card as="li" key={title} className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] flex items-center justify-center"><Icon size={20} /></span>
                  <span className="font-mono-data text-xs text-[var(--muted-foreground)]">Step {i + 1}</span>
                </div>
                <div className="font-semibold text-[var(--foreground)]">{title}</div>
                <p className="text-sm text-[var(--muted-foreground)] leading-relaxed">{body}</p>
              </Card>
            ))}
          </ol>
        </div>
      </section>

      {/* Why it's safe */}
      <section className="bg-[var(--surface-inverse)] py-14" aria-labelledby="trust-heading">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 id="trust-heading" className="font-display text-3xl text-[var(--surface-inverse-foreground)] mb-2">Built so you never pay for land that isn't there</h2>
          <p className="text-[var(--surface-inverse-foreground)] opacity-75 mb-8 max-w-2xl">What HomeTrue does on every purchase — whether you're in Abuja or abroad.</p>
          <ul className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
            {TRUST.map(({ icon: Icon, title, body }) => (
              <li key={title} className="rounded-xl p-6 bg-[var(--surface-inverse-foreground)]/[0.07] space-y-3">
                <span className="w-10 h-10 rounded-lg bg-[var(--accent)] text-[var(--accent-foreground)] flex items-center justify-center"><Icon size={20} /></span>
                <div className="font-semibold text-[var(--surface-inverse-foreground)]">{title}</div>
                <p className="text-sm text-[var(--surface-inverse-foreground)] opacity-75 leading-relaxed">{body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 inline-flex items-start gap-2.5 rounded-lg px-4 py-3 bg-[var(--surface-inverse-foreground)]/[0.07] text-sm font-medium text-[var(--surface-inverse-foreground)]">
            <span className="text-[var(--accent)] mt-0.5"><AlertIcon size={16} /></span>
            HomeTrue never asks you to pay into a bank account named in a letter, message or flyer.
          </p>
        </div>
      </section>

      {/* Verify a document · list your company */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid lg:grid-cols-2 gap-6">
        <VerifyBox />
        <Card padding="lg" className="space-y-3">
          <span className="w-11 h-11 rounded-lg bg-[var(--secondary)] text-[var(--primary)] flex items-center justify-center"><BuildingIcon size={20} /></span>
          <h2 className="font-semibold text-lg text-[var(--foreground)]">Selling land? List your company</h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            Verified developers reach buyers across Nigeria and abroad, with payments, receipts and allocation letters handled for them.
          </p>
          <LinkButton to="/list-your-company" variant="secondary">List your company</LinkButton>
        </Card>
      </section>

      {/* Start */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-14">
        <div className="rounded-2xl bg-[var(--accent)]/[0.12] px-6 py-8 sm:px-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl text-[var(--foreground)] mb-1">Start with an account — it's free</h2>
            <p className="text-sm text-[var(--muted-foreground)]">Save estates, book inspections and reserve a plot. Identity checks come only when you buy.</p>
          </div>
          <div className="flex flex-col-reverse sm:flex-row gap-3 shrink-0">
            <LinkButton to="/login" variant="secondary" size="lg">Sign in</LinkButton>
            <LinkButton to="/register" size="lg">Create account</LinkButton>
          </div>
        </div>
      </section>
    </div>
  );
}

// Opens the marketplace with the chosen state and search text — the
// marketplace's own filters, read from its URL.
function HeroSearch() {
  const navigate = useNavigate();
  const [state, setState] = useState("");
  const [query, setQuery] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (state) params.set("state", state);
    if (query.trim()) params.set("q", query.trim());
    const qs = params.toString();
    navigate(`/marketplace${qs ? `?${qs}` : ""}`);
  };
  return (
    <form onSubmit={submit} role="search" aria-label="Search estates"
      className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-2 flex flex-col sm:flex-row sm:items-center gap-2 max-w-xl">
      <label className="relative sm:w-44 shrink-0">
        <span className="sr-only">State</span>
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] pointer-events-none"><MapPinIcon size={16} /></span>
        <Select value={state} onChange={(e) => setState(e.target.value)} className="pl-9 border-transparent font-medium">
          <option value="">All states</option>
          {NIGERIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
      </label>
      <label className="relative flex-1">
        <span className="sr-only">Estate, area or city</span>
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-foreground)] pointer-events-none"><SearchIcon size={16} /></span>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Estate, area or city" className="pl-9 border-transparent sm:border-l-[var(--border)]" />
      </label>
      <Button type="submit" size="lg" className="shrink-0">Search estates</Button>
    </form>
  );
}

function VerifyBox() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizeVerifyCode(code);
    navigate(normalized ? `/verify/${encodeURIComponent(normalized)}` : "/verify");
  };
  return (
    <Card padding="lg" className="space-y-3">
      <span className="w-11 h-11 rounded-lg bg-[var(--secondary)] text-[var(--primary)] flex items-center justify-center"><FileCheckIcon size={20} /></span>
      <h2 className="font-semibold text-lg text-[var(--foreground)]">Check a HomeTrue document</h2>
      <p className="text-sm text-[var(--muted-foreground)]">Enter the code printed on a receipt or allocation letter to see whether HomeTrue issued it.</p>
      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
        <label className="flex-1">
          <span className="sr-only">Document code</span>
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="The code printed on the document" className="font-mono-data" />
        </label>
        <Button type="submit" variant="secondary" size="lg">Verify</Button>
      </form>
      <p className="text-xs text-[var(--muted-foreground)]">Or scan the QR code on the document with your phone's camera.</p>
    </Card>
  );
}

