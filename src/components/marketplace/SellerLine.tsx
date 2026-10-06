import type { Seller } from "../../services/marketplaceService";

// "Branch · Company" — preserves the tenant→branch hierarchy publicly
// without exposing any private tenant data (books, staff, clients). A
// company-level estate has no branch, so it reads as the company alone.
export default function SellerLine({ seller, className }: { seller: Seller; className?: string }) {
  return (
    <span className={className ?? "text-xs text-[var(--muted-foreground)]"}>
      {seller.branchName ? `${seller.branchName} · ${seller.companyName}` : seller.companyName}
    </span>
  );
}

// The selling branch's office, which the developer chose to publish. Nothing
// renders when there is none — never a placeholder address.
export function SellerOffice({ seller }: { seller: Seller }) {
  const office = seller.office;
  if (!office) return null;
  const address = [office.street, office.city, office.state].filter(Boolean).join(", ");
  const parts = [address, office.phone, office.email].filter(Boolean);
  if (parts.length === 0) return null;
  return <span className="text-xs text-[var(--muted-foreground)] block mt-0.5">Office: {parts.join(" · ")}</span>;
}
