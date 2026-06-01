import type { LatLng, Waypoint } from "./types";

const EARTH_RADIUS_M = 6371000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Great-circle distance between two lat/lng points, in meters. */
export function calculateDistanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Project lat/lng to local planar meters around a reference latitude. */
function project(p: LatLng, refLat: number): { x: number; y: number } {
  return {
    x: toRadians(p.lng) * Math.cos(toRadians(refLat)) * EARTH_RADIUS_M,
    y: toRadians(p.lat) * EARTH_RADIUS_M,
  };
}

function pointToSegmentMeters(p: LatLng, a: LatLng, b: LatLng): number {
  const refLat = p.lat;
  const pp = project(p, refLat);
  const aa = project(a, refLat);
  const bb = project(b, refLat);

  const dx = bb.x - aa.x;
  const dy = bb.y - aa.y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    // Degenerate segment — distance to the point.
    return Math.hypot(pp.x - aa.x, pp.y - aa.y);
  }

  let t = ((pp.x - aa.x) * dx + (pp.y - aa.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const projX = aa.x + t * dx;
  const projY = aa.y + t * dy;
  return Math.hypot(pp.x - projX, pp.y - projY);
}

/**
 * Distance from a point to a polyline (array of lat/lng), in meters.
 * Returns Infinity when the line has no usable geometry.
 */
export function distanceToRouteMeters(point: LatLng, line: LatLng[]): number {
  if (line.length === 0) return Infinity;
  if (line.length === 1) return calculateDistanceMeters(point, line[0]);

  let min = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const d = pointToSegmentMeters(point, line[i], line[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

function toIdSet(ids?: Set<string> | string[]): Set<string> {
  if (!ids) return new Set();
  return ids instanceof Set ? ids : new Set(ids);
}

/**
 * The first waypoint that is neither skipped nor already reached.
 * Reached/skipped tracking lives in ride state and is passed in here.
 */
export function getNextWaypoint(
  waypoints: Waypoint[],
  options?: { skippedIds?: Set<string> | string[]; reachedIds?: Set<string> | string[] },
): Waypoint | undefined {
  const skipped = toIdSet(options?.skippedIds);
  const reached = toIdSet(options?.reachedIds);
  return waypoints.find((w) => !skipped.has(w.id) && !reached.has(w.id));
}

/** Whether a waypoint with coords is within the reached threshold of a point. */
export function isWaypointReached(
  waypoint: Waypoint,
  point: LatLng,
  thresholdMeters: number,
): boolean {
  if (waypoint.lat === undefined || waypoint.lng === undefined) return false;
  return (
    calculateDistanceMeters(point, { lat: waypoint.lat, lng: waypoint.lng }) <=
    thresholdMeters
  );
}

/** Waypoints that have real coordinates, as a lat/lng polyline. */
export function waypointsToLine(waypoints: Waypoint[]): LatLng[] {
  return waypoints
    .filter((w) => w.lat !== undefined && w.lng !== undefined)
    .map((w) => ({ lat: w.lat as number, lng: w.lng as number }));
}
