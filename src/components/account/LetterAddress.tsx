// The buyer's address laid out the way the allocation letter prints it —
// name, then the address, then the phone — from the Figma "Buyer's address"
// proposal. Used in Settings and at checkout, so the buyer sees what will
// actually go on the letter.

import type { PurchaseAddress } from "../../services/addressService";
import { addressLines } from "../../services/addressService";
import { showInternational } from "../../lib/phone";
import { MapPinIcon } from "../icons";

export default function LetterAddress({ name, phone, address, eyebrow, icon }: {
  name: string;
  phone?: string;
  address: PurchaseAddress & { countryName?: string };
  // "As printed on your allocation letter", where the heading doesn't say so.
  eyebrow?: boolean;
  icon?: boolean;
}) {
  return (
    <div className="flex gap-3.5 rounded-lg bg-[var(--muted)] px-5 py-4">
      {icon && <span className="mt-0.5 shrink-0 text-[var(--primary)]"><MapPinIcon size={18} /></span>}
      <div className="min-w-0">
        {eyebrow && <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--muted-foreground)] mb-2">As printed on your allocation letter</div>}
        <address className="not-italic text-sm leading-relaxed text-[var(--foreground)] wrap-anywhere">
          <div className="font-semibold">{name}</div>
          {addressLines(address).map((line) => <div key={line}>{line}</div>)}
          {phone && <div className="text-[var(--muted-foreground)]">{showInternational(phone)}</div>}
        </address>
      </div>
    </div>
  );
}
