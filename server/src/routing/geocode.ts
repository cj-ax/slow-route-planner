import type { LatLng } from "@srp/shared";
import { config } from "../config.js";

const GEOCODE_URL = "https://api.openrouteservice.org/geocode/search";

interface GeocodeResponse {
  features?: Array<{ geometry?: { coordinates?: [number, number] } }>;
}

/**
 * Resolve a free-text place query to lat/lng using OpenRouteService geocoding
 * (Pelias / OpenStreetMap), reusing ORS_API_KEY. Returns null when routing is
 * unconfigured, the text is empty, or nothing is found — callers leave the
 * waypoint un-located rather than failing.
 *
 * `focus` biases results toward a point (e.g. the ride's start) so that
 * ambiguous queries like "Main Street" resolve near the right town.
 */
export async function geocode(
  text: string,
  focus?: LatLng,
): Promise<LatLng | null> {
  if (!config.routingConfigured || !text.trim()) return null;

  const url = new URL(GEOCODE_URL);
  url.searchParams.set("api_key", config.orsApiKey);
  url.searchParams.set("text", text);
  url.searchParams.set("size", "1");
  if (focus) {
    url.searchParams.set("focus.point.lon", String(focus.lng));
    url.searchParams.set("focus.point.lat", String(focus.lat));
    // Constrain results to the ride area so a generic query can't resolve to a
    // far-off town. 60 km is generous enough for longer regional rides.
    url.searchParams.set("boundary.circle.lon", String(focus.lng));
    url.searchParams.set("boundary.circle.lat", String(focus.lat));
    url.searchParams.set("boundary.circle.radius", "60");
  }

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as GeocodeResponse;
    const coords = data.features?.[0]?.geometry?.coordinates;
    if (Array.isArray(coords) && coords.length === 2) {
      return { lng: coords[0], lat: coords[1] };
    }
    return null;
  } catch (err) {
    console.warn("[geocode] lookup failed:", (err as Error).message);
    return null;
  }
}
