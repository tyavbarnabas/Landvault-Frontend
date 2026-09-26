// The estate boundary step: paste it, or upload the file the surveyor sent,
// and see it on satellite imagery before saving.
//
// ONE validation path. Both inputs hand their text to parseBoundary — if the
// file route grew its own rules, the two would eventually disagree about what
// is valid.
//
// Scope: a single estate boundary polygon. Importing a plot layout (a
// FeatureCollection of hundreds of polygons, mapped to price tiers) is a much
// larger separate slice, and nothing here is generalised toward it.

import { useRef, useState } from "react";
import {
  BOUNDARY_TEMPLATE_JSON, boundaryAreaSqm, parseBoundary,
  type BoundaryValidationError, type GeoJsonPolygon,
} from "../../services/portalEstatesService";
import EstateBoundaryMap from "../map/EstateBoundaryMap";


const TEMPLATE_FILENAME = "landvault-estate-boundary-template.geojson";

export interface BoundaryFieldState {
  polygon: GeoJsonPolygon | null;
  // True when there is text in the field that hasn't produced a valid
  // polygon — the form uses this to block submit rather than silently
  // dropping what was typed.
  hasUnresolvedInput: boolean;
}

export default function BoundaryField({ onChange }: { onChange: (state: BoundaryFieldState) => void }) {
  const [text, setText] = useState("");
  const [polygon, setPolygon] = useState<GeoJsonPolygon | null>(null);
  const [ambiguous, setAmbiguous] = useState(false);
  const [error, setError] = useState<BoundaryValidationError | null>(null);
  const [fileName, setFileName] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const validate = (value: string) => {
    setError(null);
    setPolygon(null);
    setAmbiguous(false);

    if (!value.trim()) {
      onChange({ polygon: null, hasUnresolvedInput: false });
      return;
    }

    const result = parseBoundary(value);
    if ("error" in result) {
      setError(result.error);
      onChange({ polygon: null, hasUnresolvedInput: true });
      return;
    }

    setPolygon(result.polygon);
    setAmbiguous(result.coordinatesAmbiguous);
    onChange({ polygon: result.polygon, hasUnresolvedInput: false });
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);
    const contents = await file.text();
    // Populated into the textarea as well, so what was read is visible and
    // editable — a developer fixing one coordinate shouldn't have to save and
    // re-upload a file.
    setText(contents);
    validate(contents);
  };

  const downloadTemplate = () => {
    const blob = new Blob([BOUNDARY_TEMPLATE_JSON], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = TEMPLATE_FILENAME;
    link.click();
    URL.revokeObjectURL(url);
  };

  const areaSqm = polygon ? boundaryAreaSqm(polygon) : 0;

  return (
    <div className="border-t border-[var(--border)] pt-5">
      <label htmlFor="boundary" className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
        Boundary (optional)
      </label>
      <p className="text-xs text-[var(--muted-foreground)] mb-3">
        A GeoJSON Polygon in <span className="font-mono-data">[longitude, latitude]</span> order, with the ring closed — the last
        coordinate repeats the first. You can add this later; an estate can stay a draft until it's surveyed.
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="px-3 py-1.5 border border-[var(--border)] rounded-md text-xs font-medium text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
        >
          Upload .geojson
        </button>
        <input
          ref={fileInput}
          type="file"
          accept=".geojson,.json,application/geo+json,application/json"
          onChange={(e) => handleFile(e.target.files?.[0])}
          className="hidden"
          aria-label="Upload a GeoJSON boundary file"
        />
        {/* Handing over a working file to edit beats explaining GeoJSON. */}
        <button type="button" onClick={downloadTemplate} className="text-xs font-medium text-[var(--accent)] hover:underline">
          Download a template
        </button>
        <button type="button" onClick={() => { setText(BOUNDARY_TEMPLATE_JSON); validate(BOUNDARY_TEMPLATE_JSON); }} className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
          Use the example
        </button>
        {fileName && <span className="text-xs text-[var(--muted-foreground)] font-mono-data">{fileName}</span>}
      </div>

      <textarea
        id="boundary"
        rows={7}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => validate(text)}
        placeholder={BOUNDARY_TEMPLATE_JSON}
        className="w-full px-3 py-2 bg-[var(--card)] border border-[var(--border)] rounded-md text-xs font-mono-data focus:outline-none focus:border-[var(--accent)]"
      />
      <button type="button" onClick={() => validate(text)} className="mt-2 text-xs font-medium text-[var(--accent)] hover:underline">
        Check boundary
      </button>

      {error && (
        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg" role="alert">
          <div className="text-xs font-semibold text-amber-900 mb-0.5">
            {error.likelyTransposed ? "Latitude and longitude look swapped" : "This boundary was rejected"}
          </div>
          <p className="text-xs text-amber-800 leading-relaxed">{error.message}</p>
        </div>
      )}

      {/* Shown as soon as it parses, before submit — so a misplaced boundary is
          caught now rather than after the estate exists. */}
      {polygon && (
        <div className="mt-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
            <p className="text-xs text-[var(--muted-foreground)]">Check this is the right piece of ground before you save.</p>
            <p className="text-xs text-[var(--muted-foreground)] font-mono-data">
              ≈ {formatHectares(areaSqm)} ({Math.round(areaSqm).toLocaleString()} m²)
            </p>
          </div>

          {/* Nigeria's own latitude and longitude ranges overlap between 4 and
              14, so a swapped pair can still land inside the country — in the
              wrong state, with nothing to reject it. The imagery is the only
              check that catches that, so say so when the coordinates are
              genuinely ambiguous. */}
          {ambiguous && (
            <p className="text-xs text-amber-700 mb-2">
              These coordinates would also be valid read the other way round, so no automated check can rule out a swap. Confirm the
              outline below sits where you expect before saving.
            </p>
          )}

          <EstateBoundaryMap
            boundary={{ type: "FeatureCollection", features: [{ type: "Feature", geometry: polygon, properties: {} }] }}
            heightClass="h-64"
            label="Boundary you entered, on satellite imagery"
          />
        </div>
      )}
    </div>
  );
}

function formatHectares(areaSqm: number): string {
  const hectares = areaSqm / 10_000;
  return `${hectares < 10 ? hectares.toFixed(2) : Math.round(hectares).toLocaleString()} ha`;
}
