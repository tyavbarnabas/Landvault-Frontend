import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { NIGERIAN_STATES, type NigerianState } from "../../../data/nigerianStates";
import { createPortalEstate, type GeoJsonPolygon } from "../../../services/portalEstatesService";
import BoundaryField, { type BoundaryFieldState } from "../../../components/portal/BoundaryField";
import { serverMessage } from "../../../components/portal/formParts";
import { usePortalScope } from "../usePortalScope";
import { useFetch } from "../../../lib/useFetch";
import { fetchBranches } from "../../../services/branchesService";

// A real Abuja boundary, offered as the example so a developer can see the
// expected shape — and so a transposed paste is visibly different from this.
const EXAMPLE_BOUNDARY = `{
  "type": "Polygon",
  "coordinates": [[
    [7.4890, 9.0480],
    [7.4935, 9.0480],
    [7.4935, 9.0515],
    [7.4890, 9.0515],
    [7.4890, 9.0480]
  ]]
}`;

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
  const [amenities, setAmenities] = useState("");
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
        amenities: amenities.split(",").map((a) => a.trim()).filter(Boolean),
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
    return <div className="p-8 text-sm text-[var(--muted-foreground)]">This account isn't linked to a company.</div>;
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Link to="/portal/estates" className="text-xs text-[var(--accent)] hover:underline">← Estates</Link>
      <h1 className="font-display text-3xl text-[var(--foreground)] mt-2 mb-1">New estate</h1>
      <p className="text-sm text-[var(--muted-foreground)] mb-6">
        Created as a draft. Publishing is a separate step once the inventory, title and fee schedule are in place.
      </p>

      {/* Same card, spacing and buttons as New branch and Invite someone. */}
      <form onSubmit={submit} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5 space-y-4">
        <Field label="Estate name" value={name} onChange={setName} required />
        <Field label="Description" value={description} onChange={setDescription} textarea />

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Area" value={area} onChange={setArea} required placeholder="Guzape" />
          <Field label="City" value={city} onChange={setCity} required placeholder="Abuja" />
        </div>

        <div>
          <label htmlFor="state" className="block text-sm font-medium text-[var(--foreground)] mb-1.5">State</label>
          <select
            id="state"
            required
            value={state}
            onChange={(e) => setState(e.target.value as NigerianState)}
            className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="">Select a state</option>
            {NIGERIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {/* Required, and not just for the address: it lets the boundary be
              checked against this state rather than the whole country, whose
              latitude and longitude ranges overlap between 4 and 14. */}
          <p className="text-xs text-[var(--muted-foreground)] mt-1">
            Required — the boundary is checked against the state you choose, not just against Nigeria as a whole.
          </p>
        </div>

        <Field label="Address" value={address} onChange={setAddress} />

        <Field label="Corner premium (%)" value={cornerPremiumPct} onChange={setCornerPremiumPct} type="number" />

        {branchScoped ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            This estate will belong to your branch{branches.data?.[0] ? `, ${branches.data[0].name}` : ""}.
          </p>
        ) : (
          <fieldset>
            <legend className="block text-sm font-medium text-[var(--foreground)] mb-1.5">Who does this estate belong to?</legend>
            <div className="space-y-2">
              <label className={`flex items-start gap-2 px-3 py-2 rounded-md border text-sm cursor-pointer ${ownership === "company" ? "border-[var(--accent)] bg-[var(--muted)]" : "border-[var(--border)] bg-[var(--card)]"}`}>
                <input type="radio" name="ownership" checked={ownership === "company"} onChange={() => setOwnership("company")} className="mt-0.5" />
                <span>
                  <span className="text-[var(--foreground)]">The company itself — no branch</span>
                  <span className="block text-xs text-[var(--muted-foreground)]">For a single-office developer. Branch staff can see it, but only company-wide staff can change it.</span>
                </span>
              </label>
              <label className={`flex items-start gap-2 px-3 py-2 rounded-md border text-sm ${branches.data && branches.data.length === 0 ? "opacity-60" : "cursor-pointer"} ${ownership === "branch" ? "border-[var(--accent)] bg-[var(--muted)]" : "border-[var(--border)] bg-[var(--card)]"}`}>
                <input type="radio" name="ownership" checked={ownership === "branch"} disabled={branches.data?.length === 0}
                  onChange={() => setOwnership("branch")} className="mt-0.5" />
                <span className="flex-1">
                  <span className="text-[var(--foreground)]">One of your branches</span>
                  {branches.data?.length === 0 ? (
                    <span className="block text-xs text-[var(--muted-foreground)]">Your company has no branches yet.</span>
                  ) : ownership === "branch" && (
                    <select aria-label="Branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}
                      className="mt-2 w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--accent)]">
                      <option value="">Choose a branch</option>
                      {(branches.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  )}
                </span>
              </label>
            </div>
          </fieldset>
        )}

        <Field label="Amenities (comma separated)" value={amenities} onChange={setAmenities} placeholder="Perimeter Fencing, Motorable Roads" />

        <BoundaryField onChange={handleBoundaryChange} />

        {formError && <p className="text-sm text-red-700">{formError}</p>}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 disabled:opacity-60"
          >
            {submitting ? "Creating…" : "Create draft estate"}
          </button>
          <Link to="/portal/estates" className="px-4 py-2 border border-[var(--border)] rounded-md text-sm text-[var(--foreground)] hover:bg-[var(--muted)]">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, required, placeholder, type = "text", textarea, disabled }: {
  label: string; value: string; onChange: (v: string) => void;
  required?: boolean; placeholder?: string; type?: string; textarea?: boolean; disabled?: boolean;
}) {
  const id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const shared = "w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-sm focus:outline-none focus:border-[var(--accent)] disabled:opacity-60";
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-[var(--foreground)] mb-1.5">{label}</label>
      {textarea ? (
        <textarea id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)} required={required} placeholder={placeholder} className={shared} />
      ) : (
        <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} placeholder={placeholder} disabled={disabled} className={shared} />
      )}
    </div>
  );
}
