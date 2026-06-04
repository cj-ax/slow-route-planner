import type {
  CurrentWeather,
  WeatherAlert,
  WeatherResponse,
  WeatherSeverity,
} from "@srp/shared";
import { config } from "../config.js";

const BASE = "https://weather.googleapis.com/v1";
const TTL_MS = 15 * 60 * 1000; // weather changes slowly; cache to control cost

const cache = new Map<string, { at: number; data: WeatherResponse }>();

function num(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function normalizeSeverity(s: unknown): WeatherSeverity {
  const up = String(s ?? "").toUpperCase();
  return (["EXTREME", "SEVERE", "MODERATE", "MINOR"] as const).find((x) => up.includes(x)) ??
    "UNKNOWN";
}

async function fetchCurrent(lat: number, lng: number): Promise<CurrentWeather | null> {
  try {
    const url = new URL(`${BASE}/currentConditions:lookup`);
    url.searchParams.set("key", config.googleWeatherApiKey);
    url.searchParams.set("location.latitude", String(lat));
    url.searchParams.set("location.longitude", String(lng));
    url.searchParams.set("unitsSystem", "IMPERIAL");

    const res = await fetch(url);
    if (!res.ok) throw new Error(`current ${res.status}`);
    const d = (await res.json()) as Record<string, any>;
    const tempF = num(d.temperature?.degrees);
    if (tempF === undefined) return null;
    return {
      tempF,
      feelsLikeF: num(d.feelsLikeTemperature?.degrees),
      conditionType: d.weatherCondition?.type,
      condition: d.weatherCondition?.description?.text ?? "—",
      humidityPct: num(d.relativeHumidity),
      windMph: num(d.wind?.speed?.value),
      windCardinal: d.wind?.direction?.cardinal,
      precipPct: num(d.precipitation?.probability?.percent),
      uvIndex: num(d.uvIndex),
      isDaytime: typeof d.isDaytime === "boolean" ? d.isDaytime : undefined,
    };
  } catch (err) {
    console.warn("[weather] current conditions failed:", (err as Error).message);
    return null;
  }
}

async function fetchAlerts(lat: number, lng: number): Promise<WeatherAlert[]> {
  try {
    const url = new URL(`${BASE}/publicAlerts:lookup`);
    url.searchParams.set("key", config.googleWeatherApiKey);
    url.searchParams.set("location.latitude", String(lat));
    url.searchParams.set("location.longitude", String(lng));

    const res = await fetch(url);
    // No alerts for a location can come back as 404 — treat as "none", not error.
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`alerts ${res.status}`);
    const d = (await res.json()) as Record<string, any>;
    const raw: any[] = Array.isArray(d.alerts) ? d.alerts : [];
    return raw.map((a) => ({
      title: a.alertTitle ?? a.title ?? a.eventType ?? "Weather alert",
      severity: normalizeSeverity(a.severity),
      urgency: a.urgency,
      area: a.areaName ?? a.area,
      eventType: a.eventType,
      expiresAt: a.expirationTime ?? a.expireTime,
    }));
  } catch (err) {
    console.warn("[weather] alerts failed:", (err as Error).message);
    return [];
  }
}

/**
 * Current conditions + public alerts for a point. Cached by ~1km cell for 15
 * minutes so repeated views (and nearby coordinates) don't re-bill the API.
 * Always resolves — a failure of one part doesn't break the other.
 */
export async function getWeather(lat: number, lng: number): Promise<WeatherResponse> {
  if (!config.weatherConfigured) return { current: null, alerts: [] };

  const key = `${lat.toFixed(2)},${lng.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

  const [current, alerts] = await Promise.all([fetchCurrent(lat, lng), fetchAlerts(lat, lng)]);
  const data: WeatherResponse = { current, alerts };
  cache.set(key, { at: Date.now(), data });
  return data;
}
