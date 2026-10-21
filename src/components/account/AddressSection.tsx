// Settings → Profile: the buyer's postal address (backend changeset 097).
// Read from GET /api/me/address; shown as the letter prints it, with a form
// to change it. A purchase keeps the address it was opened with, so this
// says plainly that changing it here leaves earlier purchases alone.

import { useState } from "react";
import { useApp } from "../../contexts/AppContext";
import { useFetch } from "../../lib/useFetch";
import { addressLines, fetchAddress } from "../../services/addressService";
import { formatDay } from "../../lib/formatDate";
import Card from "../ui/Card";
import Button from "../ui/Button";
import Alert from "../ui/Alert";
import { Loading } from "../ui/Page";
import AddressForm from "./AddressForm";

export default function AddressSection() {
  const { user } = useApp();
  const loaded = useFetch(() => (user ? fetchAddress(user) : Promise.resolve(null)), [user?.email]);
  const [editing, setEditing] = useState(false);
  // Once saved here, the account's copy (updated by the save) is the latest.
  const [savedHere, setSavedHere] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const address = savedHere ? user?.address ?? null : loaded.data;

  return (
    <Card as="section" aria-labelledby="address-heading" className="sm:p-6">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h2 id="address-heading" className="font-semibold text-[var(--foreground)]">Address</h2>
        {address && !editing && <Button variant="link" onClick={() => { setEditing(true); setJustSaved(false); }}>Change</Button>}
      </div>
      <p className="text-sm text-[var(--muted-foreground)] mb-4">
        Printed on your allocation letters. Changing it doesn't change purchases you've already made.
      </p>

      {loaded.loading && !savedHere ? <Loading label="Loading your address…" />
        : loaded.error && !savedHere ? <Alert tone="error">Your address couldn't be loaded. <Button variant="link" onClick={loaded.refetch}>Try again</Button></Alert>
        : address && !editing ? (
          <>
            <address className="not-italic text-sm text-[var(--foreground)] leading-relaxed">
              {addressLines(address).map((line) => <div key={line}>{line}</div>)}
            </address>
            <p className="text-xs text-[var(--muted-foreground)] mt-2">Updated {formatDay(address.updatedAt)}</p>
            {justSaved && <p role="status" className="text-sm text-[var(--success-text)] mt-3">Address saved.</p>}
          </>
        ) : (
          <>
            {!address && <p className="text-sm text-[var(--muted-foreground)] mb-4">You haven't added one yet. We'll also ask for it the first time you buy.</p>}
            <AddressForm id="settings-address" initial={address}
              onSaved={() => { setEditing(false); setSavedHere(true); setJustSaved(true); }}
              onCancel={address ? () => setEditing(false) : undefined} />
          </>
        )}
    </Card>
  );
}
