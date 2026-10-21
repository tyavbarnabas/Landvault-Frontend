// Settings → Profile: the buyer's postal address (backend changeset 097),
// from the Figma "Buyer's address" proposal. Read from GET /api/me/address;
// shown as the letter prints it, with a form to change it. A purchase keeps the address it was opened with, so this
// says plainly that changing it here leaves earlier purchases alone.

import { useState } from "react";
import { useApp } from "../../contexts/AppContext";
import { useFetch } from "../../lib/useFetch";
import { fetchAddress } from "../../services/addressService";
import { formatDay } from "../../lib/formatDate";
import Card from "../ui/Card";
import Button from "../ui/Button";
import Alert from "../ui/Alert";
import { Loading } from "../ui/Page";
import AddressForm from "./AddressForm";
import LetterAddress from "./LetterAddress";
import { MapPinIcon } from "../icons";

export default function AddressSection() {
  const { user } = useApp();
  const loaded = useFetch(() => (user ? fetchAddress(user) : Promise.resolve(null)), [user?.email]);
  const [editing, setEditing] = useState(false);
  // Once saved here, the account's copy (updated by the save) is the latest.
  const [savedHere, setSavedHere] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const address = savedHere ? user?.address ?? null : loaded.data;

  const description = !address
    ? "You haven't added one yet. Your allocation letters are addressed here — we'll also ask for it the first time you buy."
    : editing
      ? "Purchases you've already made keep the address they were opened with."
      : "Your allocation letters are addressed here. Changing it applies to purchases you make from now on — ones you've already made keep the address they were opened with.";

  return (
    <Card as="section" aria-labelledby="address-heading" className="space-y-4 sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <h2 id="address-heading" className="flex items-center gap-2.5 font-semibold text-[var(--foreground)]">
          <span className="text-[var(--primary)]"><MapPinIcon size={18} /></span>Postal address
        </h2>
        {address && !editing && <Button variant="secondary" onClick={() => { setEditing(true); setJustSaved(false); }} aria-label="Change your postal address">Change</Button>}
      </div>

      {loaded.loading && !savedHere ? <Loading label="Loading your address…" />
        : loaded.error && !savedHere ? <Alert tone="error">Your address couldn't be loaded. <Button variant="link" onClick={loaded.refetch}>Try again</Button></Alert>
        : (
          <>
            <p className="text-sm text-[var(--muted-foreground)]">{description}</p>
            {address && !editing ? (
              <>
                {justSaved && <Alert tone="success" role="status">Address saved. It goes on your next purchase's letter.</Alert>}
                <LetterAddress name={user?.name ?? ""} phone={user?.phone} address={address} eyebrow />
                <p className="text-xs text-[var(--muted-foreground)]">Updated {formatDay(address.updatedAt)}</p>
              </>
            ) : (
              <AddressForm id="settings-address" initial={address}
                onSaved={() => { setEditing(false); setSavedHere(true); setJustSaved(true); }}
                onCancel={address ? () => setEditing(false) : undefined} />
            )}
          </>
        )}
    </Card>
  );
}
