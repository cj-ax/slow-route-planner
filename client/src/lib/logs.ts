// Field log schema. Designed so logs can later be joined to the scoring
// rasters (by location + season) to tune factor weights: every record keeps
// the raw observation, its context (season, wind, time of day) and a
// confidence the hunter assigns, plus a schema version for migrations.

import { logsAll, logPut, logDelete } from "./db";
import type { LonLat } from "./geo";

export const LOG_SCHEMA_VERSION = 1;

export const LOG_TYPES = [
  { id: "rub", label: "Rub", group: "sign" },
  { id: "scrape", label: "Scrape", group: "sign" },
  { id: "bed", label: "Bed", group: "sign" },
  { id: "trail", label: "Trail / run", group: "sign" },
  { id: "tracks", label: "Tracks", group: "sign" },
  { id: "droppings", label: "Droppings", group: "sign" },
  { id: "browse", label: "Browse / feeding", group: "sign" },
  { id: "doe", label: "Doe / fawn seen", group: "sighting" },
  { id: "buck", label: "Buck seen", group: "sighting" },
  { id: "pressure", label: "Hunter / pressure", group: "context" },
  { id: "stand", label: "Stand / sit spot", group: "waypoint" },
  { id: "parking", label: "Parking / access", group: "waypoint" },
  { id: "waypoint", label: "Waypoint", group: "waypoint" },
] as const;

export type LogType = (typeof LOG_TYPES)[number]["id"];
export type Season = "early" | "rut" | "late";
export type TimeOfDay = "dawn" | "midday" | "dusk" | "night" | "unknown";

export interface ScoutLog {
  schemaVersion: number;
  id: string;
  type: LogType;
  lon: number;
  lat: number;
  /** GPS accuracy in meters when dropped from GPS; null when placed on the map. */
  accuracyM: number | null;
  locationSource: "gps" | "map";
  /** ISO timestamp of the observation (editable), and of record creation. */
  observedAt: string;
  createdAt: string;
  notes: string;
  /** Deer count for sightings; 0 otherwise. */
  count: number;
  /** Hunter's confidence 1..3 (used to down-weight shaky sign when tuning). */
  confidence: 1 | 2 | 3;
  season: Season;
  timeOfDay: TimeOfDay;
  /** Wind direction FROM, degrees (0 = N), when known. */
  windFromDeg: number | null;
  /** Property the point falls in, if any (PAD-US / DNR id). */
  propertyId: string | null;
}

export function seasonForDate(d: Date): Season {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (m < 10 || (m === 10 && day < 25)) return m <= 2 ? "late" : "early";
  if (m === 10 || (m === 11 && day <= 20)) return "rut";
  return "late";
}

export function timeOfDayFor(d: Date): TimeOfDay {
  const h = d.getHours();
  if (h >= 5 && h < 9) return "dawn";
  if (h >= 9 && h < 16) return "midday";
  if (h >= 16 && h < 20) return "dusk";
  return "night";
}

export function newLog(
  type: LogType,
  at: LonLat,
  opts: Partial<ScoutLog> & { now?: Date } = {},
): ScoutLog {
  const now = opts.now ?? new Date();
  const { now: _n, ...rest } = opts;
  return {
    schemaVersion: LOG_SCHEMA_VERSION,
    id: `log_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    lon: +at[0].toFixed(6),
    lat: +at[1].toFixed(6),
    accuracyM: null,
    locationSource: "map",
    observedAt: now.toISOString(),
    createdAt: now.toISOString(),
    notes: "",
    count: 0,
    confidence: 2,
    season: seasonForDate(now),
    timeOfDay: timeOfDayFor(now),
    windFromDeg: null,
    propertyId: null,
    ...rest,
  };
}

export const loadLogs = () =>
  logsAll<ScoutLog>().then((l) => l.sort((a, b) => b.observedAt.localeCompare(a.observedAt)));
export const saveLog = (l: ScoutLog) => logPut(l);
export const deleteLog = (id: string) => logDelete(id);

export const labelFor = (t: LogType) => LOG_TYPES.find((x) => x.id === t)?.label ?? t;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function logsToGpx(logs: ScoutLog[]): string {
  const wpts = logs
    .map(
      (l) =>
        `  <wpt lat="${l.lat}" lon="${l.lon}">\n` +
        `    <time>${l.observedAt}</time>\n` +
        `    <name>${esc(labelFor(l.type))}</name>\n` +
        `    <desc>${esc(l.notes)}</desc>\n` +
        `    <type>${l.type}</type>\n` +
        `  </wpt>`,
    )
    .join("\n");
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<gpx version="1.1" creator="Deer Scout" xmlns="http://www.topografix.com/GPX/1/1">\n` +
    `${wpts}\n</gpx>\n`
  );
}

export function logsToGeoJSON(logs: ScoutLog[]): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: logs.map((l) => {
      const { lon, lat, ...props } = l;
      return { type: "Feature", geometry: { type: "Point", coordinates: [lon, lat] }, properties: props };
    }),
  };
}

export function downloadText(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
