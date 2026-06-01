import type { Waypoint } from "./types";

/** Pure array move — returns a new array with the item moved from -> to. */
export function reorderWaypoints(
  waypoints: Waypoint[],
  from: number,
  to: number,
): Waypoint[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= waypoints.length ||
    to >= waypoints.length
  ) {
    return waypoints;
  }
  const next = [...waypoints];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}
