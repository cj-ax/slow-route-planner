import type { LngLat } from "@srp/shared";
import { config } from "../config.js";

const ORS_URL =
  "https://api.openrouteservice.org/v2/directions/driving-car/geojson";

interface OrsGeoJson {
  features?: Array<{ geometry?: { coordinates?: LngLat[] } }>;
  error?: { message?: string } | string;
}

/**
 * Road-following geometry through the given waypoints via OpenRouteService.
 * Returns the polyline as [lng, lat] pairs, or [] when no key is set, fewer
 * than two coordinates are given, or the request fails — in which case the
 * client falls back to drawing straight segments between waypoints.
 *
 * Not gated by USE_MOCKS: routing only depends on ORS_API_KEY, so you can get
 * real roads even while route *plans* are mocked.
 */
export async function getRouteGeometry(coordinates: LngLat[]): Promise<LngLat[]> {
  if (!config.routingConfigured || coordinates.length < 2) return [];

  try {
    const res = await fetch(ORS_URL, {
      method: "POST",
      headers: {
        Authorization: config.orsApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ coordinates }),
    });

    const data = (await res.json()) as OrsGeoJson;
    if (!res.ok) {
      const msg =
        typeof data.error === "string" ? data.error : data.error?.message;
      throw new Error(msg || `ORS responded ${res.status}`);
    }

    const line = data.features?.[0]?.geometry?.coordinates ?? [];
    return Array.isArray(line) ? line : [];
  } catch (err) {
    console.warn(
      "[routing] falling back to straight segments:",
      (err as Error).message,
    );
    return [];
  }
}
