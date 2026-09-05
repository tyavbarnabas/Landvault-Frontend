// The trust distinction that makes a unified feed honest — see PART 2 of the
// marketplace-unification spec. Deliberately two different visual
// treatments so a resale listing is never mistaken for developer-verified
// inventory: primary reuses the existing green/success "verified" language;
// resale gets the blue/info treatment already established for "informational,
// not a success state" elsewhere in this app (StatusBadge's "info" variant).
// Status is never colour-only — the text itself always says which it is.

export type ListingType = "primary" | "resale";

export default function ListingTypeBadge({ type }: { type: ListingType }) {
  if (type === "primary") {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        Verified developer estate
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16h.01" />
      </svg>
      Resale · listed by verified owner
    </span>
  );
}
