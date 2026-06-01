import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import maplibregl, { type Map as MlMap, type GeoJSONSource } from "maplibre-gl";
import {
  calculateDistanceMeters,
  distanceToRouteMeters,
  formatDistance,
  formatSpeed,
  getNextWaypoint,
  isWaypointReached,
  waypointsToLine,
  type RideStatus,
  type RoutePlan,
} from "@srp/shared";
import { getMapStyle } from "../map/style";
import { PURPOSE_META } from "../map/purpose";
import { useMapRoute } from "../hooks/useMapRoute";
import { useLiveLocation } from "../hooks/useLiveLocation";
import { useWakeLock } from "../hooks/useWakeLock";
import { loadRideConfig } from "../config/ride";
import { createLiveLocationElement, setLiveLocationHeading } from "./LiveLocationMarker";

const ROUTE_SOURCE = "ride-route";
const ROUTE_LAYER = "ride-route-line";

function lineData(coords: [number, number][]): any {
  return {
    type: "FeatureCollection",
    features:
      coords.length >= 2
        ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } }]
        : [],
  };
}

function buildWaypointEl(n: number, color: string, reached: boolean, isNext: boolean): HTMLDivElement {
  const el = document.createElement("div");
  el.className =
    "ride-marker" +
    (reached ? " ride-marker--reached" : "") +
    (isNext ? " ride-marker--next" : "");
  el.style.setProperty("--marker-color", color);
  el.textContent = String(n);
  return el;
}

const QUALITY_LABEL: Record<RideStatus["gpsQuality"], string> = {
  good: "Good",
  okay: "Okay",
  poor: "Poor",
  unknown: "—",
};

export function RideMode({ plan }: { plan: RoutePlan }) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const liveMarkerRef = useRef<maplibregl.Marker | null>(null);
  const liveElRef = useRef<HTMLDivElement | null>(null);
  const waypointMarkersRef = useRef<maplibregl.Marker[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [followMode, setFollowMode] = useState(true);
  const [reachedIds, setReachedIds] = useState<Set<string>>(new Set());
  const [debugOpen, setDebugOpen] = useState(false);

  const route = useMapRoute(plan);
  const live = useLiveLocation();
  const wake = useWakeLock();
  const rideConfig = useMemo(() => loadRideConfig(), []);

  const routeLine = useMemo(() => waypointsToLine(plan.waypoints), [plan.waypoints]);
  const nextWaypoint = useMemo(
    () => getNextWaypoint(plan.waypoints, { reachedIds }),
    [plan.waypoints, reachedIds],
  );

  const status: RideStatus = useMemo(() => {
    const loc = live.currentLocation;
    const distanceToNextWaypointMeters =
      loc && nextWaypoint?.lat !== undefined && nextWaypoint?.lng !== undefined
        ? calculateDistanceMeters(loc, { lat: nextWaypoint.lat, lng: nextWaypoint.lng })
        : undefined;
    const distToRoute =
      loc && routeLine.length > 0 ? distanceToRouteMeters(loc, routeLine) : undefined;
    return {
      isTracking: live.isTracking,
      followMode,
      currentLocation: loc,
      nextWaypoint,
      distanceToNextWaypointMeters,
      distanceToRouteMeters: distToRoute,
      isOffRoute: distToRoute !== undefined && distToRoute > rideConfig.offRouteThresholdM,
      gpsQuality: live.gpsQuality,
    };
  }, [live.currentLocation, live.isTracking, live.gpsQuality, nextWaypoint, routeLine, followMode, rideConfig.offRouteThresholdM]);

  // Start tracking + hold the screen awake for the duration of the ride.
  // Mount-only: the hook callbacks are stable and re-running would restart GPS.
  useEffect(() => {
    live.startTracking();
    void wake.request();
    return () => {
      live.stopTracking();
      void wake.release();
    };
  }, []);

  // Initialize the map once, with the route line + live marker.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const center: [number, number] =
      route.markers[0] ? [route.markers[0].lng, route.markers[0].lat] : [-93.55, 44.92];
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyle(),
      center,
      zoom: 13,
      attributionControl: false,
    });
    map.on("load", () => {
      map.addSource(ROUTE_SOURCE, { type: "geojson", data: lineData(route.lineCoords) });
      map.addLayer({
        id: ROUTE_LAYER,
        type: "line",
        source: ROUTE_SOURCE,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#5aa9e6", "line-width": 5, "line-opacity": 0.9 },
      });
      const el = createLiveLocationElement();
      liveElRef.current = el;
      liveMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat(center)
        .addTo(map);
      setLoaded(true);
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      liveMarkerRef.current = null;
      liveElRef.current = null;
      setLoaded(false);
    };
    // Mount-only: the map is created once; route updates flow through later effects.
  }, []);

  // Draw the route line + waypoint markers (rebuilt when reached/next changes).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const source = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined;
    source?.setData(lineData(route.lineCoords));

    waypointMarkersRef.current.forEach((m) => m.remove());
    waypointMarkersRef.current = route.markers.map((mk) => {
      const el = buildWaypointEl(
        mk.index + 1,
        PURPOSE_META[mk.purpose].color,
        reachedIds.has(mk.id),
        mk.id === nextWaypoint?.id,
      );
      return new maplibregl.Marker({ element: el }).setLngLat([mk.lng, mk.lat]).addTo(map);
    });
  }, [loaded, route, reachedIds, nextWaypoint?.id]);

  // Fit the route once it's drawn.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded || !route.bounds) return;
    map.fitBounds(route.bounds, { padding: 80, maxZoom: 14, duration: 0 });
  }, [loaded, route.bounds]);

  // Move the live marker and (in follow mode) keep it centered.
  useEffect(() => {
    const map = mapRef.current;
    const marker = liveMarkerRef.current;
    const loc = live.currentLocation;
    if (!map || !loaded || !marker || !loc) return;
    marker.setLngLat([loc.lng, loc.lat]);
    if (liveElRef.current) setLiveLocationHeading(liveElRef.current, loc.heading);
    if (followMode) {
      map.easeTo({ center: [loc.lng, loc.lat], zoom: Math.max(map.getZoom(), 14), duration: 600 });
    }
  }, [live.currentLocation, loaded, followMode]);

  // Auto-mark the next waypoint reached once we're inside the threshold.
  useEffect(() => {
    const loc = live.currentLocation;
    if (!loc || !nextWaypoint) return;
    if (isWaypointReached(nextWaypoint, loc, rideConfig.waypointReachedM)) {
      setReachedIds((prev) => new Set(prev).add(nextWaypoint.id));
    }
  }, [live.currentLocation, nextWaypoint, rideConfig.waypointReachedM]);

  function recenter() {
    const map = mapRef.current;
    const loc = live.currentLocation;
    if (map && loc) {
      map.easeTo({ center: [loc.lng, loc.lat], zoom: Math.max(map.getZoom(), 15), duration: 500 });
    } else if (map && route.bounds) {
      map.fitBounds(route.bounds, { padding: 80, maxZoom: 14, duration: 500 });
    }
  }

  function skipWaypoint() {
    if (nextWaypoint) {
      setReachedIds((prev) => new Set(prev).add(nextWaypoint.id));
    }
  }

  const denied = live.permission === "denied";

  return (
    <div className="ride-mode">
      <div ref={containerRef} className="ride-mode__map" />

      {/* Top status strip */}
      <div className="ride-hud ride-hud--top">
        <div className="ride-stat">
          <span className="ride-stat__value">{formatSpeed(live.currentLocation?.speedMps)}</span>
          <span className="ride-stat__label">Speed</span>
        </div>
        <div className={`ride-stat ride-stat--${status.gpsQuality}`}>
          <span className="ride-stat__value">{QUALITY_LABEL[status.gpsQuality]}</span>
          <span className="ride-stat__label">
            GPS{live.currentLocation?.accuracy ? ` ±${Math.round(live.currentLocation.accuracy)}m` : ""}
          </span>
        </div>
        <button type="button" className="btn btn--ghost btn--sm ride-exit" onClick={() => navigate(-1)}>
          ✕ Exit
        </button>
      </div>

      {/* Off-route warning */}
      {status.isOffRoute && (
        <div className="ride-warning">
          Off route — {formatDistance(status.distanceToRouteMeters)} from the planned line.
        </div>
      )}

      {/* Permission / wake-lock notices */}
      {denied && (
        <div className="ride-notice ride-notice--warn">
          Location permission denied. Enable location access for this site, then reopen Ride Mode.
        </div>
      )}
      {!denied && !live.isTracking && !live.currentLocation && (
        <div className="ride-notice">Allow location access to start tracking your position…</div>
      )}
      {live.error && !denied && <div className="ride-notice">{live.error}</div>}
      {!wake.supported && (
        <div className="ride-notice ride-notice--muted">
          Screen Wake Lock isn&apos;t supported here — your screen may dim. Adjust your display
          timeout if needed.
        </div>
      )}

      {/* Bottom: next waypoint + controls */}
      <div className="ride-hud ride-hud--bottom">
        <div className="ride-next">
          {nextWaypoint ? (
            <>
              <span className="ride-next__label">
                Next: <strong>{nextWaypoint.label}</strong>
              </span>
              <span className="ride-next__dist">
                {formatDistance(status.distanceToNextWaypointMeters)}
              </span>
            </>
          ) : (
            <span className="ride-next__label">Route complete — all waypoints reached 🎉</span>
          )}
        </div>

        <div className="ride-controls">
          <button type="button" className="btn btn--accent" onClick={recenter}>
            Recenter
          </button>
          <button
            type="button"
            className={`btn ${followMode ? "btn--primary" : "btn--ghost"}`}
            onClick={() => setFollowMode((f) => !f)}
          >
            Follow {followMode ? "on" : "off"}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={skipWaypoint}
            disabled={!nextWaypoint}
          >
            Skip waypoint
          </button>
          {plan.googleMapsUrl && (
            <a className="btn btn--ghost" href={plan.googleMapsUrl} target="_blank" rel="noreferrer">
              Google Maps
            </a>
          )}
        </div>

        <button
          type="button"
          className="ride-debug__toggle"
          onClick={() => setDebugOpen((d) => !d)}
        >
          {debugOpen ? "Hide" : "Show"} debug
        </button>
        {debugOpen && (
          <dl className="ride-debug">
            <div>
              <dt>lat</dt>
              <dd>{live.currentLocation?.lat?.toFixed(6) ?? "—"}</dd>
            </div>
            <div>
              <dt>lng</dt>
              <dd>{live.currentLocation?.lng?.toFixed(6) ?? "—"}</dd>
            </div>
            <div>
              <dt>accuracy</dt>
              <dd>{live.currentLocation?.accuracy ? `${Math.round(live.currentLocation.accuracy)} m` : "—"}</dd>
            </div>
            <div>
              <dt>heading</dt>
              <dd>{live.currentLocation?.heading != null ? `${Math.round(live.currentLocation.heading)}°` : "—"}</dd>
            </div>
            <div>
              <dt>to route</dt>
              <dd>{formatDistance(status.distanceToRouteMeters)}</dd>
            </div>
            <div>
              <dt>wake lock</dt>
              <dd>{wake.active ? "active" : wake.supported ? "idle" : "unsupported"}</dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}
