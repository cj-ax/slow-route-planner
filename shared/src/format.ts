/** Format a speed given in meters/second as mph (rides are US-based). */
export function formatSpeed(speedMps?: number): string {
  if (speedMps === undefined || speedMps === null || Number.isNaN(speedMps)) {
    return "-- mph";
  }
  const mph = speedMps * 2.2369362921;
  return `${Math.max(0, Math.round(mph))} mph`;
}

/** Format a distance in meters using ft/mi (imperial). */
export function formatDistance(meters?: number): string {
  if (meters === undefined || meters === null || !Number.isFinite(meters)) {
    return "--";
  }
  const feet = meters * 3.280839895;
  if (feet < 1000) {
    return `${Math.round(feet)} ft`;
  }
  const miles = meters / 1609.344;
  return `${miles.toFixed(miles < 10 ? 1 : 0)} mi`;
}
