import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { NIGERIAN_STATES, type NigerianState } from "../../../data/nigerianStates";
import {
  createPortalEstate, parseBoundary,
  type BoundaryValidationError, type GeoJsonPolygon,
} from "../../../services/portalEstatesService";
import EstateBoundaryMap from "../../../components/map/EstateBoundaryMap";
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

  const [boundaryText, setBoundaryText] = useState("");
  const [boundary, setBoundary] = useState<GeoJsonPolygon | null>(null);
  const [boundaryError, setBoundaryError] = useState<BoundaryValidationError | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const checkBoundary = () => {
    setBoundary(null);
    setBoundaryError(null);
    if (!boundaryText.trim()) return;
    const result = parseBoundary(boundaryText);
    if ("error" in result) setBoundaryError(result.error);
    else setBoundary(result.polygon);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scope) return;
    if (!state) { setFormError("Choose the state this estate is in."); return; }
    if (!branchId.trim()) { setFormError("Enter the branch this estate belongs to."); return; }
    if (boundaryText.trim() && !boundary) { setFormError("Fix the boundary, or clear it and add it later."); return; }

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

        <div className="border-t border-[var(--border)] pt-5">
          <label htmlFor="boundary" className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
            Boundary (optional)
          </label>
          <p className="text-xs text-[var(--muted-foreground)] mb-2">
            Paste a GeoJSON Polygon in <span className="font-mono-data">[longitude, latitude]</span> order. You can add this later — an
            estate can exist as a draft before it's surveyed. Uploading a surveyor's file comes in a later release.
          </p>
          <textarea
            id="boundary"
            rows={7}
            value={boundaryText}
            onChange={(e) => setBoundaryText(e.target.value)}
            onBlur={checkBoundary}
            placeholder={EXAMPLE_BOUNDARY}
            className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-xs font-mono-data focus:outline-none focus:border-[var(--accent)]"
          />
          <div className="flex items-center gap-3 mt-2">
            <button type="button" onClick={checkBoundary} className="text-xs font-medium text-[var(--accent)] hover:underline">Check boundary</button>
            <button type="button" onClick={() => setBoundaryText(EXAMPLE_BOUNDARY)} className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]">Use the example</button>
          </div>

          {boundaryError && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg" role="alert">
              <div className="text-xs font-semibold text-amber-900 mb-0.5">
                {boundaryError.likelyTransposed ? "Latitude and longitude look swapped" : "This boundary was rejected"}
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">{boundaryError.message}</p>
            </div>
          )}

          {/* Shown as soon as the boundary parses, before it is submitted:
              the map is the only real check that it is in the right place. */}
          {boundary && (
            <div className="mt-3">
              <p className="text-xs text-[var(--muted-foreground)] mb-2">
                Check this is the right piece of ground before you save. A swapped coordinate pair can still be inside Nigeria.
              </p>
              <EstateBoundaryMap
                boundary={{ type: "FeatureCollection", features: [{ type: "Feature", geometry: boundary, properties: {} }] }}
                heightClass="h-64"
                label="Boundary you entered, on satellite imagery"
              />
            </div>
          )}
        </div>

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
