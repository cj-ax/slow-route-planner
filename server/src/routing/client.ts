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
async function requestOrs(coordinates: LngLat[], avoidHighways: boolean): Promise<LngLat[]> {
  const body: Record<string, unknown> = {
    coordinates,
    // Snap each point to the nearest road within an unlimited radius. A
    // lake-view or park waypoint often geocodes a few hundred metres off any
    // road; without this ORS fails the whole request (default snap radius is
    // tiny) and the map falls back to straight lines.
    radiuses: coordinates.map(() => -1),
  };
  if (avoidHighways) {
    // This is a slow/scenic planner — keep the drawn line off freeways and
    // tollways so it hugs local roads instead of sprinting down the interstate.
    body.options = { avoid_features: ["highways", "tollways"] };
  }

  const res = await fetch(ORS_URL, {
    method: "POST",
    headers: {
      Authorization: config.orsApiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as OrsGeoJson;
  if (!res.ok) {
    const msg = typeof data.error === "string" ? data.error : data.error?.message;
    throw new Error(msg || `ORS responded ${res.status}`);
  }
  const line = data.features?.[0]?.geometry?.coordinates ?? [];
  return Array.isArray(line) ? line : [];
}

export async function getRouteGeometry(coordinates: LngLat[]): Promise<LngLat[]> {
  if (!config.routingConfigured || coordinates.length < 2) return [];

  try {
    return await requestOrs(coordinates, true);
  } catch (avoidErr) {
    // Avoiding highways can occasionally leave no valid route (e.g. a waypoint
    // only reachable via a freeway). Retry once on the normal road network so
    // the rider still gets a line.
    console.warn(
      "[routing] avoid-highways routing failed, retrying without it:",
      (avoidErr as Error).message,
    );
    try {
      return await requestOrs(coordinates, false);
    } catch (err) {
      console.warn(
        "[routing] falling back to straight segments:",
        (err as Error).message,
      );
      return [];
    }
  }
}
