// Create an estate as a draft, from the Figma "Portal estate setup" proposal:
// four short sections (the estate, where it is, pricing and amenities, who it
// belongs to) and, beside them, the setup steps that come after.

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { NIGERIAN_STATES, type NigerianState } from "../../../data/nigerianStates";
import { createPortalEstate, type GeoJsonPolygon } from "../../../services/portalEstatesService";
import BoundaryField, { type BoundaryFieldState } from "../../../components/portal/BoundaryField";
import { serverMessage } from "../../../components/portal/formParts";
import FormSection from "../../../components/portal/FormSection";
import AmenityInput from "../../../components/portal/AmenityInput";
import Page from "../../../components/ui/Page";
import Card from "../../../components/ui/Card";
import Button, { LinkButton } from "../../../components/ui/Button";
import { ErrorText, Field, Input, Select, Textarea } from "../../../components/ui/Field";
import { cx } from "../../../components/ui/cx";
import { FileCheckIcon, GridIcon, ImageIcon, MapPinIcon, ReceiptIcon, ShieldCheckIcon } from "../../../components/icons";
import { usePortalScope } from "../usePortalScope";
import { useFetch } from "../../../lib/useFetch";
import { fetchBranches } from "../../../services/branchesService";

// A real Abuja boundary, offered as the example so a developer can see the
// expected shape — and so a transposed paste is visibly different from this.

export default function CreatePortalEstate() {
  const navigate = useNavigate();
  const scope = usePortalScope();
  const branches = useFetch(async () => (scope ? fetchBranches(scope) : []), [scope?.tenantId, scope?.branchId]);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState<NigerianState | "">("");
  const [address, setAddress] = useState("");
  const [cornerPremiumPct, setCornerPremiumPct] = useState("0");
  const [amenities, setAmenities] = useState<string[]>([]);
  // EB-1: "no branch" is a DELIBERATE choice — null until the developer picks
  // one of the two, never an empty dropdown that looks like something is
  // missing. A branch-scoped user always creates in their own branch.
  const [ownership, setOwnership] = useState<"company" | "branch" | null>(null);
  const [branchId, setBranchId] = useState("");
  const branchScoped = !!scope?.branchId;

  const [boundary, setBoundary] = useState<GeoJsonPolygon | null>(null);
  const [boundaryUnresolved, setBoundaryUnresolved] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const handleBoundaryChange = (state: BoundaryFieldState) => {
    setBoundary(state.polygon);
    setBoundaryUnresolved(state.hasUnresolvedInput);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scope) return;
    if (!name.trim() || !area.trim() || !city.trim()) { setFormError("Give the estate a name, an area and a city."); return; }
    if (!state) { setFormError("Choose the state this estate is in."); return; }
    if (!branchScoped && ownership === null) { setFormError("Choose whether this estate belongs to the company or to one of its branches."); return; }
    if (!branchScoped && ownership === "branch" && !branchId) { setFormError("Choose the branch this estate belongs to."); return; }
    if (boundaryUnresolved) { setFormError("Fix the boundary, or clear it and add it later."); return; }

    setSubmitting(true);
    setFormError("");
    try {
      const created = await createPortalEstate({
        name: name.trim(),
        description: description.trim(),
        area: area.trim(),
        city: city.trim(),
        state,
        address: address.trim(),
        cornerPremiumPct: Number(cornerPremiumPct) || 0,
        amenities,
        boundary: boundary ?? undefined,
        // Left out for a company-level estate; ignored for a branch-scoped user.
        branchId: !branchScoped && ownership === "branch" ? branchId : undefined,
      }, scope);
      navigate(`/portal/estates/${created.id}`);
    } catch (err) {
      // The state check (SB-1) names the state the boundary actually falls
      // in — exactly what a developer needs, so it's shown, not swallowed.
      const code = (err as { body?: { code?: string } }).body?.code;
      if (code === "BOUNDARY_OUTSIDE_STATE") {
        setFormError(`${serverMessage(err, "")} If the land genuinely sits on a disputed border, create the estate without a boundary and contact support — they can verify the state by hand.`);
      } else if (code === "UNKNOWN_STATE" || code === "INVALID_GEOMETRY" || code === "DUPLICATE_RECORD") {
        setFormError(serverMessage(err, "Couldn't create the estate."));
      } else {
        setFormError("Couldn't create the estate. Please try again.");
      }
      setSubmitting(false);
    }
  };

  if (!scope) {
    return <Page title="New estate"><p className="text-sm text-[var(--muted-foreground)]">This account isn't linked to a company.</p></Page>;
  }

  return (
    <Page width="xl" title="New estate" description="Saved as a draft — nothing is public until you publish it." back={{ to: "/portal/estates", label: "Estates" }}>
      <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem] gap-6 items-start">
        <form onSubmit={submit} className="space-y-5" noValidate>
          <FormSection n={1} title="The estate" description="What buyers see first on the listing.">
            <Field id="estate-name" label="Estate name" hint="It becomes the estate's web address too.">
              <Input id="estate-name" inputSize="md" required value={name} onChange={(e) => setName(e.target.value)} aria-describedby="estate-name-hint" />
            </Field>
            <Field id="estate-description" label="Description" hint="A short paragraph: where it is, who it's for, how it's sold.">
              <Textarea id="estate-description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} aria-describedby="estate-description-hint" />
            </Field>
          </FormSection>

          <FormSection n={2} title="Where it is" description="The boundary is checked against the state you choose, and for overlaps with other estates.">
            <div className="grid sm:grid-cols-2 gap-4">
              <Field id="estate-area" label="Area">
                <Input id="estate-area" inputSize="md" required value={area} onChange={(e) => setArea(e.target.value)} placeholder="Guzape" />
              </Field>
              <Field id="estate-city" label="City">
                <Input id="estate-city" inputSize="md" required value={city} onChange={(e) => setCity(e.target.value)} placeholder="Abuja" />
              </Field>
              {/* Required, and not just for the address: it lets the boundary be
                  checked against this state rather than the whole country, whose
                  latitude and longitude ranges overlap between 4 and 14. */}
              <Field id="state" label="State">
                <Select id="state" inputSize="md" required value={state} onChange={(e) => setState(e.target.value as NigerianState)}>
                  <option value="">Select a state</option>
                  {NIGERIAN_STATES.map((st) => <option key={st} value={st}>{st}</option>)}
                </Select>
              </Field>
              <Field id="estate-address" label="Address (optional)">
                <Input id="estate-address" inputSize="md" value={address} onChange={(e) => setAddress(e.target.value)} />
              </Field>
            </div>
            <BoundaryField onChange={handleBoundaryChange} label="Boundary"
              intro="You can add it later — an estate stays a draft until it's surveyed and has one." />
          </FormSection>

          <FormSection n={3} title="Pricing and amenities" description="Tier and plot prices come next, on Tiers & plots.">
            <Field id="estate-premium" label="Corner premium (%)" hint="Added to every corner plot's price. Changing it later reprices all corner plots.">
              <Input id="estate-premium" inputSize="md" type="number" min={0} value={cornerPremiumPct} onChange={(e) => setCornerPremiumPct(e.target.value)} aria-describedby="estate-premium-hint" className="sm:max-w-[12rem]" />
            </Field>
            <Field id="estate-amenities" label="Amenities">
              <AmenityInput id="estate-amenities" value={amenities} onChange={setAmenities} />
            </Field>
          </FormSection>

          <FormSection n={4} title="Who it belongs to" description="Decides who can change it. Branch staff can still see a company estate.">
            {branchScoped ? (
              <p className="text-sm text-[var(--muted-foreground)]">
                This estate will belong to your branch{branches.data?.[0] ? `, ${branches.data[0].name}` : ""}.
              </p>
            ) : (
              <fieldset className="space-y-2">
                <legend className="sr-only">Who does this estate belong to?</legend>
                <OwnerOption checked={ownership === "company"} onChange={() => setOwnership("company")}
                  title="The company itself — no branch" body="For a single-office developer. Only company-wide staff can change it." />
                <OwnerOption checked={ownership === "branch"} onChange={() => setOwnership("branch")} disabled={branches.data?.length === 0}
                  title="One of your branches" body={branches.data?.length === 0 ? "Your company has no branches yet." : "Its branch staff can manage it."}>
                  {ownership === "branch" && (branches.data?.length ?? 0) > 0 && (
                    <Select aria-label="Branch" inputSize="md" value={branchId} onChange={(e) => setBranchId(e.target.value)} className="mt-2">
                      <option value="">Choose a branch</option>
                      {(branches.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  )}
                </OwnerOption>
              </fieldset>
            )}
          </FormSection>

          {formError && <ErrorText>{formError}</ErrorText>}

          <div className="flex gap-3">
            <Button type="submit" size="lg" disabled={submitting}>{submitting ? "Creating…" : "Create draft estate"}</Button>
            <LinkButton to="/portal/estates" variant="secondary" size="lg">Cancel</LinkButton>
          </div>
        </form>

        <Card as="section" aria-labelledby="after-heading" className="lg:sticky lg:top-6 space-y-4">
          <div>
            <h2 id="after-heading" className="font-semibold text-[var(--foreground)]">After you create it</h2>
            <p className="text-sm text-[var(--muted-foreground)] mt-1">
              Your draft is set up in these steps, each on its own page. Publishing needs all of them except the title — plus HomeTrue's
              checks on your company.
            </p>
          </div>
          <ul className="space-y-3">
            {AFTER.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-3">
                <span className="w-8 h-8 shrink-0 rounded-lg bg-[var(--secondary)] text-[var(--primary)] flex items-center justify-center"><Icon size={15} /></span>
                <span>
                  <span className="block text-sm font-medium text-[var(--foreground)]">{title}</span>
                  <span className="block text-xs text-[var(--muted-foreground)]">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </Page>
  );
}

const AFTER = [
  { icon: MapPinIcon, title: "Details & boundary", body: "This page" },
  { icon: GridIcon, title: "Tiers & plots", body: "Sizes, prices, the plots themselves" },
  { icon: ImageIcon, title: "Photos", body: "At least one, with a cover" },
  { icon: ShieldCheckIcon, title: "Land title", body: "Recommended — HomeTrue checks it" },
  { icon: ReceiptIcon, title: "Fees & terms", body: "Fee schedule and refund terms" },
  { icon: FileCheckIcon, title: "Allocation letter", body: "Conditions, preview, approval" },
];

function OwnerOption({ checked, onChange, disabled, title, body, children }: {
  checked: boolean; onChange: () => void; disabled?: boolean; title: string; body: string; children?: React.ReactNode;
}) {
  return (
    <label className={cx("flex items-start gap-3 rounded-lg border p-3.5 text-sm",
      disabled ? "opacity-60" : "cursor-pointer",
      checked ? "border-[var(--ring)] bg-[var(--secondary)]" : "border-[var(--border)] bg-[var(--card)]")}>
      <input type="radio" name="ownership" checked={checked} onChange={onChange} disabled={disabled} className="mt-1" />
      <span className="flex-1">
        <span className="block font-medium text-[var(--foreground)]">{title}</span>
        <span className="block text-[var(--muted-foreground)]">{body}</span>
        {children}
      </span>
    </label>
  );
}
