import { useMemo } from "react";
import type { RoutePlan, Waypoint, WaypointPurpose } from "@srp/shared";

export interface MapMarker {
  id: string;
  index: number;
  lat: number;
  lng: number;
  label: string;
  purpose: WaypointPurpose;
}

export interface MapRoute {
  markers: MapMarker[];
  /** [lng, lat] pairs in waypoint order (only waypoints with coords). */
  lineCoords: [number, number][];
  /** [[minLng, minLat], [maxLng, maxLat]] or null when no coords. */
  bounds: [[number, number], [number, number]] | null;
  hasGeometry: boolean;
  missingCoordCount: number;
}

function hasCoords(w: Waypoint): w is Waypoint & { lat: number; lng: number } {
  return w.lat !== undefined && w.lng !== undefined;
}

export function useMapRoute(plan: RoutePlan | null): MapRoute {
  return useMemo(() => {
    const waypoints = plan?.waypoints ?? [];
    const located = waypoints.filter(hasCoords);

    const markers: MapMarker[] = located.map((w, index) => ({
      id: w.id,
      index,
      lat: w.lat,
      lng: w.lng,
      label: w.label,
      purpose: w.purpose,
    }));

    const lineCoords: [number, number][] = located.map((w) => [w.lng, w.lat]);

    let bounds: MapRoute["bounds"] = null;
    if (located.length > 0) {
      let minLng = Infinity;
      let minLat = Infinity;
      let maxLng = -Infinity;
      let maxLat = -Infinity;
      for (const w of located) {
        minLng = Math.min(minLng, w.lng);
        maxLng = Math.max(maxLng, w.lng);
        minLat = Math.min(minLat, w.lat);
        maxLat = Math.max(maxLat, w.lat);
      }
      bounds = [
        [minLng, minLat],
        [maxLng, maxLat],
      ];
    }

    return {
      markers,
      lineCoords,
      bounds,
      hasGeometry: lineCoords.length >= 2,
      missingCoordCount: waypoints.length - located.length,
    };
  }, [plan]);
}
