import type {
  HealthStatus,
  LngLat,
  PlaceOption,
  RouteGeometryResponse,
  RoutePlan,
  RouteRequest,
  SearchPlacesRequest,
  WeatherResponse,
} from "@srp/shared";

// Empty base => same-origin "/api" (production on Vercel).
// Local dev sets VITE_API_BASE_URL=http://localhost:3001.
const BASE = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // ignore non-JSON error bodies
    }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  health: () => request<HealthStatus>("/health"),
  parsePrompt: (body: Partial<RouteRequest> & { rawPrompt: string }) =>
    request<RouteRequest>("/parse-route-prompt", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  generatePlan: (body: RouteRequest) =>
    request<RoutePlan>("/generate-route-plan", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  searchPlaces: (body: SearchPlacesRequest) =>
    request<PlaceOption[]>("/search-places", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  routeGeometry: (coordinates: LngLat[]) =>
    request<RouteGeometryResponse>("/route-geometry", {
      method: "POST",
      body: JSON.stringify({ coordinates }),
    }),
  saveRoute: (plan: RoutePlan) =>
    request<RoutePlan>("/save-route", {
      method: "POST",
      body: JSON.stringify(plan),
    }),
  listRoutes: () => request<RoutePlan[]>("/routes"),
  getRoute: (id: string) => request<RoutePlan>(`/routes/${id}`),
  updateRoute: (id: string, plan: RoutePlan) =>
    request<RoutePlan>(`/routes/${id}`, {
      method: "PUT",
      body: JSON.stringify(plan),
    }),
  deleteRoute: (id: string) =>
    request<void>(`/routes/${id}`, { method: "DELETE" }),
  weather: (lat: number, lng: number) =>
    request<WeatherResponse>(`/weather?lat=${lat}&lng=${lng}`),
};
