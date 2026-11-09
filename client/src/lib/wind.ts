export const WIND_DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;
export type WindDir = (typeof WIND_DIRS)[number];
export const windDeg = (d: WindDir) => WIND_DIRS.indexOf(d) * 45;
export function degToDir(deg: number): WindDir {
  return WIND_DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}
