// Edit an estate's details — PUT /api/portal/estates/{id}.
//
// Three things are deliberately NOT editable here, because the backend refuses
// them rather than ignoring them: the boundary (added on the estate page, where
// the overlap check runs), publication (publish/unpublish check every
// condition), and the branch (an estate can't move across the branch wall).

import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useFetch } from "../../../lib/useFetch";
import { NIGERIAN_STATES, type NigerianState } from "../../../data/nigerianStates";
import {
  EstateEditError, fetchPortalEstateById, updatePortalEstate,
  type EstateIntent, type PortalEstate, type UpdateEstateInput,
} from "../../../services/portalEstatesService";
import { Field, inputClass } from "../../../components/portal/formParts";
import { STATE_BOUNDARY_ATTRIBUTION } from "../../../components/portal/BoundaryField";
import { usePortalScope } from "../usePortalScope";
import { ownershipLabel, useBranchNames } from "../useBranchNames";

export default function EditPortalEstate() {
  const { estateId } = useParams<{ estateId: string }>();
  const scope = usePortalScope();
  const loaded = useFetch(async () => (scope && estateId ? fetchPortalEstateById(estateId, scope) : null), [scope?.tenantId, scope?.branchId, estateId]);

  if (loaded.loading) return <div className="p-8 text-sm text-[var(--muted-foreground)]">Loading estate…</div>;
  const estate = loaded.data;
  if (!estate || !scope) {
    return (
      <div className="p-8">
        <p className="text-sm font-medium text-[var(--foreground)] mb-2">Estate not found.</p>
        <Link to="/portal/estates" className="text-sm text-[var(--accent)] hover:underline">Back to estates</Link>
      </div>
    );
  }
  // Keyed so the form's initial values are the loaded estate's.
  return <EditForm key={estate.id} estate={estate} />;
}

function EditForm({ estate }: { estate: PortalEstate }) {
  const navigate = useNavigate();
  const scope = usePortalScope();
  const branchNames = useBranchNames(scope);
  const [name, setName] = useState(estate.name);
  const [description, setDescription] = useState(estate.description);
  const [area, setArea] = useState(estate.area);
  const [city, setCity] = useState(estate.city);
  const [state, setState] = useState<NigerianState>(estate.state);
  const [address, setAddress] = useState(estate.address);
  const [cornerPremiumPct, setCornerPremiumPct] = useState(String(estate.cornerPremiumPct));
  const [intent, setIntent] = useState<EstateIntent>(estate.intent);
  const [amenities, setAmenities] = useState(estate.amenities.join(", "));
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const premiumChanged = Number(cornerPremiumPct) !== estate.cornerPremiumPct;
  const errorFor = (field: string) => (error?.field === field ? error.message : undefined);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scope) return;
    // Only what changed is sent: a field left out stays as it is.
    const input: UpdateEstateInput = {};
    if (name.trim() !== estate.name) input.name = name;
    if (description.trim() !== estate.description) input.description = description;
    if (area.trim() !== estate.area) input.area = area;
    if (city.trim() !== estate.city) input.city = city;
    if (state !== estate.state) input.state = state;
    if (address.trim() !== estate.address) input.address = address;
    if (premiumChanged) input.cornerPremiumPct = Number(cornerPremiumPct);
    if (intent !== estate.intent) input.intent = intent;
    const nextAmenities = amenities.split(",").map((a) => a.trim()).filter(Boolean);
    if (nextAmenities.join("|") !== estate.amenities.join("|")) input.amenities = nextAmenities;

    if (Object.keys(input).length === 0) { navigate(`/portal/estates/${estate.id}`); return; }

    setSaving(true);
    setError(null);
    try {
      await updatePortalEstate(estate.id, input, scope);
      navigate(`/portal/estates/${estate.id}`);
    } catch (err) {
      setError(err instanceof EstateEditError
        ? { field: err.field, message: err.message }
        : { field: "form", message: err instanceof Error ? err.message : "Couldn't save the estate." });
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Link to={`/portal/estates/${estate.id}`} className="text-xs text-[var(--accent)] hover:underline">← {estate.name}</Link>
      <h1 className="font-display text-3xl text-[var(--foreground)] mt-2 mb-1">Edit details</h1>
      <p className="text-sm text-[var(--muted-foreground)] mb-6">
        Changes apply at once, including on the marketplace if this estate is listed.
      </p>

      <form onSubmit={submit} className="space-y-5" noValidate>
        <Field id="edit-name" label="Estate name" error={errorFor("name")}
          hint="Renaming changes the estate's web address too.">
          <input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>

        <Field id="edit-description" label="Description" error={errorFor("description")}>
          <textarea id="edit-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className={inputClass} />
        </Field>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field id="edit-area" label="Area" error={errorFor("area")}>
            <input id="edit-area" value={area} onChange={(e) => setArea(e.target.value)} className={inputClass} />
          </Field>
          <Field id="edit-city" label="City" error={errorFor("city")}>
            <input id="edit-city" value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} />
          </Field>
        </div>

        <Field id="edit-state" label="State" error={errorFor("state")}
          hint={estate.hasBoundary
            ? `The boundary must sit inside the state you choose (1 km margin). Changing it removes any hand-verified override. ${STATE_BOUNDARY_ATTRIBUTION}.`
            : undefined}>
          <select id="edit-state" value={state} onChange={(e) => setState(e.target.value as NigerianState)} className={inputClass}>
            {NIGERIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>

        <Field id="edit-address" label="Address" error={errorFor("address")} hint="Leave blank to clear it.">
          <input id="edit-address" value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
        </Field>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field id="edit-premium" label="Corner premium (%)" error={errorFor("cornerPremiumPct")}>
            <input id="edit-premium" type="number" min={0} value={cornerPremiumPct} onChange={(e) => setCornerPremiumPct(e.target.value)} className={inputClass} />
          </Field>
          <Field id="edit-intent" label="Sold for" error={errorFor("intent")}>
            <select id="edit-intent" value={intent} onChange={(e) => setIntent(e.target.value as EstateIntent)} className={inputClass}>
              <option value="development">Development — buyers build</option>
              <option value="investment">Investment — buyers hold</option>
            </select>
          </Field>
        </div>

        {/* Said before saving, not after: the change is live at once. */}
        {premiumChanged && (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2" role="status">
            Changing the corner premium reprices every corner plot on this estate at once, including on the marketplace.
            Buyers who have already reserved keep the price they agreed to.
          </p>
        )}

        <Field id="edit-amenities" label="Amenities (comma separated)" error={errorFor("amenities")}
          hint="This replaces the whole list.">
          <input id="edit-amenities" value={amenities} onChange={(e) => setAmenities(e.target.value)} className={inputClass} />
        </Field>

        <div className="text-xs text-[var(--muted-foreground)] space-y-1">
          <p>{ownershipLabel(estate.branchId, branchNames)}. An estate can't be moved to another branch.</p>
          <p>The boundary and publication are managed on the estate page.</p>
        </div>

        {error?.field === "form" && <p className="text-sm text-red-700" role="alert">{error.message}</p>}

        <div className="flex gap-3">
          <button type="submit" disabled={saving} className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-60">
            {saving ? "Saving…" : "Save changes"}
          </button>
          <Link to={`/portal/estates/${estate.id}`} className="px-4 py-2 border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] hover:bg-[var(--muted)]">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
