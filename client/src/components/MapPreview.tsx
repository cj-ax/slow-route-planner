import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MlMap, type GeoJSONSource } from "maplibre-gl";
import type { RoutePlan, WaypointPurpose } from "@srp/shared";
import { getMapStyle } from "../map/style";
import { PURPOSE_META } from "../map/purpose";
import { useMapRoute } from "../hooks/useMapRoute";
import { useRouteGeometry } from "../hooks/useRouteGeometry";

const ROUTE_SOURCE = "srp-route";
const ROUTE_LAYER = "srp-route-line";
const ROUTE_CASING = "srp-route-casing";
/** Amber route line — matches --amber-500 in the design tokens. */
const ROUTE_COLOR = "#f5a623";

function lineData(coords: [number, number][]): any {
  return {
    type: "FeatureCollection",
    features:
      coords.length >= 2
        ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } }]
        : [],
  };
}

function buildMarkerEl(n: number, color: string, selected: boolean): HTMLDivElement {
  const el = document.createElement("div");
  el.className = `map-marker${selected ? " map-marker--selected" : ""}`;
  el.style.setProperty("--marker-color", color);
  el.textContent = String(n);
  return el;
}

function MapLegend({ plan }: { plan: RoutePlan | null }) {
  if (!plan) return null;
  const present = Array.from(
    new Set(plan.waypoints.map((w) => w.purpose)),
  ) as WaypointPurpose[];
  if (present.length === 0) return null;
  return (
    <div className="map-legend">
      {present.map((p) => (
        <span key={p} className="map-legend__item">
          <span className="map-legend__dot" style={{ background: PURPOSE_META[p].color }} />
          {PURPOSE_META[p].label}
        </span>
      ))}
    </div>
  );
}

interface MapPreviewProps {
  plan: RoutePlan | null;
  selectedWaypointId?: string;
  onSelectWaypoint?: (id: string) => void;
}

export function MapPreview({
  plan,
  selectedWaypointId,
  onSelectWaypoint,
}: MapPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const selectRef = useRef(onSelectWaypoint);
  selectRef.current = onSelectWaypoint;
  const [loaded, setLoaded] = useState(false);
  const route = useMapRoute(plan);
  const { roadCoords } = useRouteGeometry(route.lineCoords);

  // Initialize the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle(),
      center: [-93.55, 44.92],
      zoom: 10,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      map.addSource(ROUTE_SOURCE, { type: "geojson", data: lineData([]) });
      // Soft casing beneath the main line for an editorial "drawn route" feel.
      map.addLayer({
        id: ROUTE_CASING,
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ROUTE_COLOR, "line-width": 11, "line-opacity": 0.22, "line-blur": 1 },
      });
      map.addLayer({
        id: ROUTE_LAYER,
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ROUTE_COLOR, "line-width": 5, "line-opacity": 0.95 },
      });
      setLoaded(true);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      setLoaded(false);
    };
  }, []);

  // Redraw line + markers when the route or selection changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;

    const source = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined;
    source?.setData(lineData(roadCoords ?? route.lineCoords));

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = route.markers.map((mk) => {
      const el = buildMarkerEl(
        mk.index + 1,
        PURPOSE_META[mk.purpose].color,
        mk.id === selectedWaypointId,
      );
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        selectRef.current?.(mk.id);
      });
      return new maplibregl.Marker({ element: el })
        .setLngLat([mk.lng, mk.lat])
        .setPopup(new maplibregl.Popup({ offset: 18, closeButton: false }).setText(mk.label))
        .addTo(map);
    });
  }, [loaded, route, roadCoords, selectedWaypointId]);

  // Fit bounds when the route geometry changes (not on selection).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !route.bounds) return;
    map.fitBounds(route.bounds, { padding: 64, maxZoom: 14, duration: 600 });
  }, [loaded, route]);

  // Fly to a selected waypoint.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !selectedWaypointId) return;
    const mk = route.markers.find((m) => m.id === selectedWaypointId);
    if (mk) {
      map.flyTo({
        center: [mk.lng, mk.lat],
        zoom: Math.max(map.getZoom(), 13),
        duration: 600,
      });
    }
  }, [selectedWaypointId, loaded, route.markers]);

  return (
    <div className="map-preview">
      <div ref={containerRef} className="map-canvas" />
      {!route.hasGeometry && (
        <div className="map-overlay-note">
          {plan
            ? "Limited coordinates — showing pins/straight segments only."
            : "Generate a route to see it on the map."}
        </div>
      )}
      <MapLegend plan={plan} />
    </div>
  );
}
