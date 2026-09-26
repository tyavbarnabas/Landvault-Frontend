import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { NIGERIAN_STATES, type NigerianState } from "../../../data/nigerianStates";
import { createPortalEstate, type GeoJsonPolygon } from "../../../services/portalEstatesService";
import BoundaryField, { type BoundaryFieldState } from "../../../components/portal/BoundaryField";
import { usePortalScope } from "../usePortalScope";
import { useApp } from "../../../contexts/AppContext";

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
  const { user } = useApp();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [area, setArea] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState<NigerianState | "">("");
  const [address, setAddress] = useState("");
  const [cornerPremiumPct, setCornerPremiumPct] = useState("0");
  const [amenities, setAmenities] = useState("");
  const [branchId, setBranchId] = useState(user?.branchId ?? "");

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
    if (!branchId.trim()) { setFormError("Enter the branch this estate belongs to."); return; }
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
        branchId: branchId.trim(),
      }, scope);
      navigate(`/portal/estates/${created.id}`);
    } catch {
      setFormError("Couldn't create the estate. Please try again.");
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

      <form onSubmit={submit} className="space-y-5">
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

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Corner premium (%)" value={cornerPremiumPct} onChange={setCornerPremiumPct} type="number" />
          <Field label="Branch" value={branchId} onChange={setBranchId} required disabled={!!user?.branchId} />
        </div>

        <Field label="Amenities (comma separated)" value={amenities} onChange={setAmenities} placeholder="Perimeter Fencing, Motorable Roads" />

        <BoundaryField onChange={handleBoundaryChange} />

        {formError && <p className="text-sm text-red-700">{formError}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {submitting ? "Creating…" : "Create draft estate"}
        </button>
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
