import type { RoutePlan, Waypoint } from "./types";

/** Coordinate string when available, otherwise the searchable text. */
function stopParam(w: Waypoint): string {
  if (w.lat !== undefined && w.lng !== undefined) {
    return `${w.lat},${w.lng}`;
  }
  return w.query || w.label;
}

/**
 * Build a Google Maps directions URL from the current waypoint sequence.
 * Always uses driving mode — Google Maps has no universal motorcycle mode.
 */
export function buildGoogleMapsUrl(plan: RoutePlan): string {
  const stops = plan.waypoints.map(stopParam).filter(Boolean);

  let origin: string;
  let destination: string;
  let intermediate: string[] = [];

  if (stops.length >= 2) {
    origin = stops[0];
    destination = stops[stops.length - 1];
    intermediate = stops.slice(1, -1);
  } else {
    origin = plan.start;
    destination = plan.destination || plan.start;
  }

  const params = new URLSearchParams({
    api: "1",
    origin,
    destination,
    travelmode: "driving",
  });
  if (intermediate.length > 0) {
    params.set("waypoints", intermediate.join("|"));
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
