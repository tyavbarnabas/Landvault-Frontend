// Edit an estate's details — PUT /api/portal/estates/{id}.
//
// Three things are deliberately NOT editable here, because the backend refuses
// them rather than ignoring them: the boundary (added on the estate page, where
// the overlap check runs), publication (publish/unpublish check every
// condition), and the branch (an estate can't move across the branch wall).
//
// Laid out from the Figma "Portal estate setup" proposal: the Details step,
// in the same sections as New estate, with a save bar that counts changes.

import { useState } from "react";
import LoadError from "../../../components/LoadError";
import { useNavigate, useParams } from "react-router-dom";
import { useFetch } from "../../../lib/useFetch";
import { NIGERIAN_STATES, type NigerianState } from "../../../data/nigerianStates";
import {
  EstateEditError, fetchPortalEstateById, updatePortalEstate,
  type EstateIntent, type PortalEstate, type UpdateEstateInput,
} from "../../../services/portalEstatesService";
import EstateSetupPage from "../../../components/portal/EstateSetupPage";
import FormSection from "../../../components/portal/FormSection";
import AmenityInput from "../../../components/portal/AmenityInput";
import Page, { Loading } from "../../../components/ui/Page";
import Card from "../../../components/ui/Card";
import Alert from "../../../components/ui/Alert";
import Button from "../../../components/ui/Button";
import TextLink from "../../../components/ui/TextLink";
import { ErrorText, Field, Input, Select, Textarea, describedBy } from "../../../components/ui/Field";
import { MapPinIcon } from "../../../components/icons";
import { STATE_BOUNDARY_ATTRIBUTION } from "../../../components/portal/BoundaryField";
import { usePortalScope } from "../usePortalScope";
import { ownershipLabel, useBranchNames } from "../useBranchNames";

export default function EditPortalEstate() {
  const { estateId } = useParams<{ estateId: string }>();
  const scope = usePortalScope();
  const loaded = useFetch(async () => (scope && estateId ? fetchPortalEstateById(estateId, scope) : null), [scope?.tenantId, scope?.branchId, estateId]);

  if (loaded.loading && !loaded.data) return <Page title="Details"><Loading label="Loading estate…" /></Page>;

  if (loaded.error) return <LoadError error={loaded.errorValue} what="this estate" onRetry={loaded.refetch} />;
  const estate = loaded.data;
  if (!estate || !scope) {
    return <Page title="Estate not found" back={{ to: "/portal/estates", label: "Estates" }}>{null}</Page>;
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
  const [amenities, setAmenities] = useState<string[]>(estate.amenities);
  const [error, setError] = useState<{ field: string; message: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const premiumChanged = Number(cornerPremiumPct) !== estate.cornerPremiumPct;
  const errorFor = (field: string) => (error?.field === field ? error.message : undefined);

  // Only what changed is sent: a field left out stays as it is.
  const changes: UpdateEstateInput = {};
  if (name.trim() !== estate.name) changes.name = name;
  if (description.trim() !== estate.description) changes.description = description;
  if (area.trim() !== estate.area) changes.area = area;
  if (city.trim() !== estate.city) changes.city = city;
  if (state !== estate.state) changes.state = state;
  if (address.trim() !== estate.address) changes.address = address;
  if (premiumChanged) changes.cornerPremiumPct = Number(cornerPremiumPct);
  if (intent !== estate.intent) changes.intent = intent;
  if (amenities.join("|") !== estate.amenities.join("|")) changes.amenities = amenities;
  const changed = Object.keys(changes).length;

  const discard = () => {
    setName(estate.name); setDescription(estate.description); setArea(estate.area); setCity(estate.city); setState(estate.state);
    setAddress(estate.address); setCornerPremiumPct(String(estate.cornerPremiumPct)); setIntent(estate.intent); setAmenities(estate.amenities);
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scope) return;
    const input = changes;
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

  const label = (field: string) => errorFor(field);
  return (
    <EstateSetupPage estate={estate} step="details" title="Details"
      description={`${ownershipLabel(estate.branchId, branchNames)}. An estate can't be moved to another branch.`}>
      <form onSubmit={submit} className="space-y-5" noValidate>
        <FormSection title="The estate" description="Changes show on the marketplace straight away if the estate is listed.">
          <Field id="edit-name" label="Estate name" error={label("name")} hint="Renaming changes the estate's web address too.">
            <Input id="edit-name" inputSize="md" value={name} onChange={(e) => setName(e.target.value)} aria-describedby={describedBy("edit-name", { hint: true, error: label("name") })} />
          </Field>
          <Field id="edit-description" label="Description" error={label("description")} hint="A short paragraph: where it is, who it's for, how it's sold.">
            <Textarea id="edit-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} aria-describedby={describedBy("edit-description", { hint: true, error: label("description") })} />
          </Field>
        </FormSection>

        <FormSection title="Where it is"
          description={estate.hasBoundary ? "The boundary must sit inside the state you choose (1 km margin). Changing the state removes any hand-verified override." : undefined}>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field id="edit-area" label="Area" error={label("area")}>
              <Input id="edit-area" inputSize="md" value={area} onChange={(e) => setArea(e.target.value)} />
            </Field>
            <Field id="edit-city" label="City" error={label("city")}>
              <Input id="edit-city" inputSize="md" value={city} onChange={(e) => setCity(e.target.value)} />
            </Field>
            <Field id="edit-state" label="State" error={label("state")}>
              <Select id="edit-state" inputSize="md" value={state} onChange={(e) => setState(e.target.value as NigerianState)}>
                {NIGERIAN_STATES.map((st) => <option key={st} value={st}>{st}</option>)}
              </Select>
            </Field>
            <Field id="edit-address" label="Address" error={label("address")} hint="Leave blank to clear it.">
              <Input id="edit-address" inputSize="md" value={address} onChange={(e) => setAddress(e.target.value)} aria-describedby="edit-address-hint" />
            </Field>
          </div>
          {/* The boundary isn't edited here: the backend refuses it, because
              the overlap check runs where it's changed, on the estate page. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-[var(--muted)] p-3 text-sm">
            <span className="text-[var(--primary)]"><MapPinIcon size={16} /></span>
            <span className="font-medium text-[var(--foreground)]">
              {estate.hasBoundary ? `Boundary${estate.areaSqm ? ` · ${(estate.areaSqm / 10_000).toFixed(2)} ha` : ""} · inside ${estate.state}` : "No boundary yet"}
            </span>
            <TextLink to={`/portal/estates/${estate.id}`} className="font-medium">
              {estate.hasBoundary ? "Change it on the estate overview →" : "Add it on the estate overview →"}
            </TextLink>
          </div>
          {estate.hasBoundary && <p className="text-xs text-[var(--muted-foreground)] italic">{STATE_BOUNDARY_ATTRIBUTION}.</p>}
        </FormSection>

        <FormSection title="Pricing and amenities" description="Tier and plot prices are set on Tiers & plots.">
          <div className="grid sm:grid-cols-2 gap-4">
            <Field id="edit-premium" label="Corner premium (%)" error={label("cornerPremiumPct")} hint="Added to every corner plot's price.">
              <Input id="edit-premium" inputSize="md" type="number" min={0} value={cornerPremiumPct} onChange={(e) => setCornerPremiumPct(e.target.value)} aria-describedby="edit-premium-hint" />
            </Field>
            <Field id="edit-intent" label="Sold for" error={label("intent")}>
              <Select id="edit-intent" inputSize="md" value={intent} onChange={(e) => setIntent(e.target.value as EstateIntent)}>
                <option value="development">Development — buyers build</option>
                <option value="investment">Investment — buyers hold</option>
              </Select>
            </Field>
          </div>

          {/* Said before saving, not after: the change is live at once. */}
          {premiumChanged && (
            <Alert role="status">
              Changing the corner premium reprices every corner plot on this estate at once, including on the marketplace.
              Buyers who have already reserved keep the price they agreed to.
            </Alert>
          )}

          <Field id="edit-amenities" label="Amenities" error={label("amenities")}>
            <AmenityInput id="edit-amenities" value={amenities} onChange={setAmenities} />
          </Field>
        </FormSection>

        {error?.field === "form" && <ErrorText>{error.message}</ErrorText>}

        <Card className="sticky bottom-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <p className="text-sm text-[var(--muted-foreground)]" aria-live="polite">
            {changed === 0 ? "No changes yet." : `${changed} unsaved ${changed === 1 ? "change" : "changes"} · they apply at once, including on the marketplace.`}
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={discard} disabled={changed === 0 || saving}>Discard</Button>
            <Button type="submit" disabled={changed === 0 || saving}>{saving ? "Saving…" : "Save changes"}</Button>
          </div>
        </Card>
      </form>
    </EstateSetupPage>
  );
}
