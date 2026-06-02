import { useEffect, useRef, useState } from "react";
import type { LngLat } from "@srp/shared";
import { api } from "../api/client";

export interface UseRouteGeometry {
  /** Road-following polyline as [lng, lat], or null to fall back to straight lines. */
  roadCoords: LngLat[] | null;
  loading: boolean;
}

/**
 * Fetch road-following geometry for an ordered list of waypoint coordinates.
 * Pass `route.lineCoords` from useMapRoute. Returns null (caller draws straight
 * segments) when there are fewer than two points or routing is unavailable.
 */
export function useRouteGeometry(coords: LngLat[]): UseRouteGeometry {
  const [roadCoords, setRoadCoords] = useState<LngLat[] | null>(null);
  const [loading, setLoading] = useState(false);
  // Re-fetch only when the actual coordinate list changes.
  const key = JSON.stringify(coords);
  const requestedKey = useRef<string>("");

  useEffect(() => {
    if (coords.length < 2) {
      setRoadCoords(null);
      setLoading(false);
      requestedKey.current = key;
      return;
    }
    if (requestedKey.current === key) return;
    requestedKey.current = key;

    let cancelled = false;
    setLoading(true);
    api
      .routeGeometry(coords)
      .then((res) => {
        if (cancelled) return;
        setRoadCoords(res.geometry.length >= 2 ? res.geometry : null);
      })
      .catch(() => {
        if (!cancelled) setRoadCoords(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [key, coords]);

  return { roadCoords, loading };
}
