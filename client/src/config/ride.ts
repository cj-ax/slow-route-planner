// Off-route and waypoint-reached thresholds. Defaults per spec; adjustable in
// Settings and persisted to localStorage.
export const DEFAULT_OFF_ROUTE_THRESHOLD_M = 100;
export const DEFAULT_WAYPOINT_REACHED_M = 75;

const STORAGE_KEY = "srp.rideConfig";

export interface RideConfig {
  offRouteThresholdM: number;
  waypointReachedM: number;
}

export function loadRideConfig(): RideConfig {
  const fallback: RideConfig = {
    offRouteThresholdM: DEFAULT_OFF_ROUTE_THRESHOLD_M,
    waypointReachedM: DEFAULT_WAYPOINT_REACHED_M,
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      offRouteThresholdM: Number(parsed.offRouteThresholdM) || fallback.offRouteThresholdM,
      waypointReachedM: Number(parsed.waypointReachedM) || fallback.waypointReachedM,
    };
  } catch {
    return fallback;
  }
}

export function saveRideConfig(config: RideConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // storage unavailable — ignore
  }
}
