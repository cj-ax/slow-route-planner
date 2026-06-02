import { randomUUID } from "node:crypto";
import type { PlaceOption, PlaceType, SearchPlacesRequest } from "@srp/shared";
import { config, placesMockMode } from "../config";
import { createMockPlaces } from "../mock/mockPlaces";

const TYPE_KEYWORD: Record<PlaceType, string> = {
  coffee: "coffee shop",
  beer: "brewery taproom",
  food: "restaurant patio",
  ice_cream: "ice cream shop",
  view: "lake view park",
  custom: "point of interest",
};

interface GoogleTextSearchResult {
  name: string;
  formatted_address?: string;
  geometry?: { location?: { lat: number; lng: number } };
}

function buildQuery(req: SearchPlacesRequest): string {
  const type = req.type ?? "custom";
  const base = req.query?.trim() || TYPE_KEYWORD[type];
  const near = req.near?.trim() || "Excelsior, MN";
  return `${base} near ${near}`;
}

/**
 * Search for endpoint options. Uses Google Places (legacy Text Search) when a
 * key is set and mocks are off; otherwise returns mock options. Any failure
 * falls back to mocks so the app keeps working.
 */
export async function searchPlaces(req: SearchPlacesRequest): Promise<PlaceOption[]> {
  const type = req.type ?? "custom";
  if (placesMockMode) {
    return createMockPlaces(type);
  }

  try {
    const url = new URL(
      "https://maps.googleapis.com/maps/api/place/textsearch/json",
    );
    url.searchParams.set("query", buildQuery(req));
    url.searchParams.set("key", config.googlePlacesApiKey);

    const res = await fetch(url);
    const data = (await res.json()) as {
      results?: GoogleTextSearchResult[];
      status?: string;
      error_message?: string;
    };
    // Google returns HTTP 200 with a status field; surface real failures
    // (e.g. REQUEST_DENIED / API not enabled) so they fall back to mocks.
    if (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      throw new Error(
        `Google Places ${data.status}${data.error_message ? `: ${data.error_message}` : ""}`,
      );
    }
    const results = data.results ?? [];

    return results.slice(0, 6).map((r) => ({
      id: randomUUID(),
      name: r.name,
      query: `${r.name} ${r.formatted_address ?? ""}`.trim(),
      address: r.formatted_address,
      lat: r.geometry?.location?.lat,
      lng: r.geometry?.location?.lng,
      type,
    }));
  } catch (err) {
    console.warn("[places] falling back to mock places:", (err as Error).message);
    return createMockPlaces(type);
  }
}
