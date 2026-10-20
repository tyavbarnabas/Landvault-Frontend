// The estate boundary step: paste it, or upload the file the surveyor sent,
// and see it on satellite imagery before saving. From the Figma "Portal
// estate setup" proposal: the file leads, pasting is the fallback.
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
import Alert from "../ui/Alert";
import Button from "../ui/Button";
import { Textarea } from "../ui/Field";
import { MapPinIcon } from "../icons";


const TEMPLATE_FILENAME = "hometrue-estate-boundary-template.geojson";

export interface BoundaryFieldState {
  polygon: GeoJsonPolygon | null;
  // True when there is text in the field that hasn't produced a valid
  // polygon — the form uses this to block submit rather than silently
  // dropping what was typed.
  hasUnresolvedInput: boolean;
}

// Required wherever the UI relies on the backend's boundary-in-state check
// (SB-1): the state polygons are GRID3's, via geoBoundaries, CC BY 4.0.
export const STATE_BOUNDARY_ATTRIBUTION = "State boundaries: GRID3, via geoBoundaries (CC BY 4.0)";

const ESTATE_INTRO = "A GeoJSON Polygon in [longitude, latitude] order, with the ring closed — the last coordinate repeats the first. You can add this later; an estate can stay a draft until it's surveyed.";

export default function BoundaryField({
  onChange,
  inputId = "boundary",
  label = "Boundary (optional)",
  intro = ESTATE_INTRO,
  stateChecked = true,
}: {
  onChange: (state: BoundaryFieldState) => void;
  // Overridable so the same field serves a plot, and a page holding two.
  inputId?: string;
  label?: string;
  intro?: string;
  // An estate boundary is checked against its declared state (SB-1); a plot's
  // only against its estate. Controls the state note and its attribution.
  stateChecked?: boolean;
}) {
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

  const clear = () => { setText(""); setFileName(""); if (fileInput.current) fileInput.current.value = ""; validate(""); };

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-medium text-[var(--foreground)] mb-1">{label}</div>
        <p className="text-xs text-[var(--muted-foreground)]">{intro}</p>
      </div>

      {/* The surveyor's file first: most developers have one, few can write GeoJSON. */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
        className="flex flex-wrap items-center gap-3 rounded-lg border-2 border-dashed border-[var(--border)] p-4"
      >
        <span className="w-10 h-10 shrink-0 rounded-lg bg-[var(--secondary)] text-[var(--primary)] flex items-center justify-center"><MapPinIcon size={20} /></span>
        <div className="flex-1 min-w-0">
          {polygon ? (
            <>
              <div className="text-sm font-mono-data font-medium text-[var(--foreground)] truncate">{fileName || "Pasted boundary"}</div>
              <div className="text-xs text-[var(--success-text)]">≈ {formatHectares(areaSqm)} ({Math.round(areaSqm).toLocaleString()} m²) · reads correctly</div>
            </>
          ) : (
            <>
              <div className="text-sm font-semibold text-[var(--foreground)]">Upload the surveyor's file</div>
              <div className="text-xs text-[var(--muted-foreground)]">A .geojson file with one Polygon — drop it here, or choose it.</div>
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          <Button variant={polygon ? "link" : "secondary"} className={polygon ? "font-medium" : undefined} onClick={() => fileInput.current?.click()}>
            {polygon ? "Replace file" : "Choose file"}
          </Button>
          {(polygon || text) && <Button variant="linkMuted" onClick={clear}>Remove</Button>}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".geojson,.json,application/geo+json,application/json"
          onChange={(e) => handleFile(e.target.files?.[0])}
          className="hidden"
          aria-label="Upload a GeoJSON boundary file"
        />
      </div>

      <p className="text-xs text-[var(--muted-foreground)]">
        No file yet?{" "}
        {/* Handing over a working file to edit beats explaining GeoJSON. */}
        <Button variant="link" className="text-xs font-medium" onClick={downloadTemplate}>Download the template</Button> for your surveyor
        {" · "}
        <Button variant="link" className="text-xs" onClick={() => { setText(BOUNDARY_TEMPLATE_JSON); validate(BOUNDARY_TEMPLATE_JSON); }}>use the example</Button>
      </p>

      {/* Pasting is the fallback, and it's where a file's text lands too, so
          one wrong coordinate can be fixed here without re-uploading. */}
      <details className="text-sm" open={!!error && !fileName}>
        <summary className="cursor-pointer text-[var(--muted-foreground)]">{fileName ? "See or fix the file's text" : "Paste the GeoJSON instead"}</summary>
        <div className="mt-2">
          <Textarea
            id={inputId}
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => validate(text)}
            placeholder={BOUNDARY_TEMPLATE_JSON}
            aria-label={label}
            className="font-mono-data text-xs"
          />
          <Button variant="link" className="mt-1 text-xs font-medium" onClick={() => validate(text)}>Check boundary</Button>
        </div>
      </details>

      {error && (
        <Alert role="alert" title={error.likelyTransposed ? "Latitude and longitude look swapped" : "This boundary was rejected"}>
          <span className="text-xs leading-relaxed">{error.message}</span>
        </Alert>
      )}

      {/* Shown as soon as it parses, before submit — so a misplaced boundary is
          caught now rather than after the estate exists. */}
      {polygon && (
        <div>
          <p className="text-xs text-[var(--muted-foreground)] mb-2">Check this is the right piece of ground before you save.</p>

          {/* Nigeria's own latitude and longitude ranges overlap between 4 and
              14, so a swapped pair can still land inside the country — in the
              wrong state, with nothing to reject it. The imagery is the only
              check that catches that, so say so when the coordinates are
              genuinely ambiguous. */}
          {ambiguous && (
            <p className="text-xs text-[var(--warning-text)] mb-2">
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

      {stateChecked && (
        <p className="text-xs text-[var(--muted-foreground)]">
          On saving it's checked against the estate's state, with a 1 km margin for border imprecision. These are reference boundaries
          used to catch mistakes, not a ruling on disputed borders. <span className="italic">{STATE_BOUNDARY_ATTRIBUTION}.</span>
        </p>
      )}
    </div>
  );
}

function formatHectares(areaSqm: number): string {
  const hectares = areaSqm / 10_000;
  return `${hectares < 10 ? hectares.toFixed(2) : Math.round(hectares).toLocaleString()} ha`;
}
