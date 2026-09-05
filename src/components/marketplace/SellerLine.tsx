import type { Seller } from "../../services/marketplaceService";

// "Branch · Company" — preserves the tenant→branch hierarchy publicly
// without exposing any private tenant data (books, staff, clients).
export default function SellerLine({ seller, className }: { seller: Seller; className?: string }) {
  return (
    <span className={className ?? "text-xs text-[var(--muted-foreground)]"}>
      {seller.branchName} · {seller.companyName}
    </span>
  );
}
