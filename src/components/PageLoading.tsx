// Suspense fallback for a lazy-loaded route chunk (see App.tsx's React.lazy
// split of the Super Admin console, the marketplace surface, and the
// onboarding wizard). Reuses the same plain loading treatment already used
// by every page's own initial-fetch state (e.g. EstateDetail.tsx,
// MarketplaceCheckout.tsx) — no new design token for this pass.
export default function PageLoading() {
  return <div className="p-8 text-[var(--muted-foreground)] text-sm">Loading…</div>;
}
