// Say WHAT is verified — the developer company and a plot's title are different claims.
export default function VerifiedBadge({ label = "Verified developer" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
        <path d="M20 6 9 17l-5-5" />
      </svg>
      {label}
    </span>
  );
}
