import { useCallback, useEffect, useRef, useState } from "react";
import type { GpsQuality, LiveLocation } from "@srp/shared";

export type GeoPermission = "unknown" | "prompt" | "granted" | "denied";

export interface UseLiveLocation {
  currentLocation?: LiveLocation;
  error?: string;
  isTracking: boolean;
  gpsQuality: GpsQuality;
  permission: GeoPermission;
  startTracking: () => void;
  stopTracking: () => void;
}

function qualityFromAccuracy(accuracy?: number): GpsQuality {
  if (accuracy === undefined || accuracy === null) return "unknown";
  if (accuracy <= 15) return "good";
  if (accuracy <= 50) return "okay";
  return "poor";
}

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 1000,
  timeout: 10000,
};

export function useLiveLocation(): UseLiveLocation {
  const [currentLocation, setCurrentLocation] = useState<LiveLocation>();
  const [error, setError] = useState<string>();
  const [isTracking, setIsTracking] = useState(false);
  const [permission, setPermission] = useState<GeoPermission>("unknown");
  const watchId = useRef<number | null>(null);

  // Best-effort permission state (not supported in every browser).
  useEffect(() => {
    if (!("permissions" in navigator)) return;
    let cancelled = false;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((status) => {
        if (cancelled) return;
        setPermission(status.state as GeoPermission);
        status.onchange = () => setPermission(status.state as GeoPermission);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stopTracking = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
    }
    setIsTracking(false);
  }, []);

  const startTracking = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setError("Geolocation is not supported by this browser.");
      return;
    }
    setError(undefined);
    setIsTracking(true);
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        setError(undefined);
        setPermission("granted");
        setCurrentLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          speedMps: pos.coords.speed ?? undefined,
          heading: pos.coords.heading ?? undefined,
          timestamp: pos.timestamp,
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setPermission("denied");
          setError("Location permission denied. Enable it to use Ride Mode.");
          stopTracking();
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setError("Position unavailable — waiting for a GPS fix.");
        } else if (err.code === err.TIMEOUT) {
          setError("Timed out waiting for a GPS fix — retrying.");
        } else {
          setError(err.message);
        }
      },
      GEO_OPTIONS,
    );
  }, [stopTracking]);

  useEffect(() => () => stopTracking(), [stopTracking]);

  return {
    currentLocation,
    error,
    isTracking,
    gpsQuality: qualityFromAccuracy(currentLocation?.accuracy),
    permission,
    startTracking,
    stopTracking,
  };
}
