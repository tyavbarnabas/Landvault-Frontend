// Renders an estate's boundary on satellite imagery.
//
// This is the only practical check against a misplaced boundary. Nigeria's
// latitude and longitude ranges overlap between 4 and 14, so a transposed
// Abuja boundary still passes a country-level bounds test — it stores
// cleanly, renders cleanly, and sits in the wrong state. A coordinate list
// cannot be eyeballed; a shape over the wrong field is obvious in a second.
//
// Built once, taking a plain FeatureCollection, so the buyer-facing surfaces
// can reuse it rather than growing a second map implementation.

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import * as L from "leaflet";
import type { GeoJsonFeatureCollection } from "../../services/portalEstatesService";

interface EstateBoundaryMapProps {
  boundary: GeoJsonFeatureCollection;
  // An explicit height is required: `height: 100%` inside a parent with no
  // height of its own produces a zero-height map and no visible error.
  heightClass?: string;
  label?: string;
}

// Free, no account needed. A production tile provider (imagery licensing,
// usage limits, a key) is a separate decision — see INTEGRATION.md.
const ESRI_IMAGERY_URL = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTRIBUTION = "Imagery &copy; Esri, Maxar, Earthstar Geographics";

// Fits the view to the boundary itself rather than a hardcoded centre, so an
// estate anywhere in the country frames correctly — and a boundary in the
// wrong place is immediately obvious instead of being cropped out of view.
function FitToBoundary({ bounds }: { bounds: L.LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [24, 24] });
  }, [map, bounds]);
  return null;
}

export default function EstateBoundaryMap({ boundary, heightClass = "h-80", label }: EstateBoundaryMapProps) {
  // Leaflet's own helper does the [lng, lat] → [lat, lng] conversion. Doing
  // that by hand is exactly where the swap bug creeps back in, so it is never
  // done by hand anywhere in this app.
  const bounds = useMemo(() => L.geoJSON(boundary as never).getBounds(), [boundary]);

  if (!bounds.isValid()) return null;

  return (
    <div className={`${heightClass} rounded-xl overflow-hidden border border-[var(--border)]`}>
      <MapContainer bounds={bounds} scrollWheelZoom={false} className="w-full h-full" aria-label={label ?? "Estate boundary on satellite imagery"}>
        <TileLayer url={ESRI_IMAGERY_URL} attribution={ESRI_ATTRIBUTION} maxZoom={19} />
        {/* Leaflet's GeoJSON component, never a hand-built Polygon. */}
        <GeoJSON data={boundary as never} style={{ color: "#f59e0b", weight: 2, fillOpacity: 0.15 }} />
        <FitToBoundary bounds={bounds} />
      </MapContainer>
    </div>
  );
}
