// Shared domain types — the single source of truth for client and server.

export type RideType = "car" | "motorcycle" | "bike" | "ebike";

export type EndpointIntent =
  | "coffee"
  | "beer"
  | "food"
  | "ice_cream"
  | "view"
  | "custom";

export type WaypointPurpose =
  | "start"
  | "scenic"
  | "residential_detour"
  | "lake_view"
  | "food_drink"
  | "route_shaping"
  | "destination";

export type PlaceType = "coffee" | "beer" | "food" | "ice_cream" | "view" | "custom";

export type GpsQuality = "good" | "okay" | "poor" | "unknown";

export interface RouteRequest {
  id?: string;
  rawPrompt: string;
  startLocation: string;
  endLocation?: string;
  endpointIntent?: EndpointIntent;
  customEndpointIntent?: string;
  area?: string;
  targetDurationMinutes?: number;
  rideType: RideType;
  maxPreferredSpeedMph?: number;
  avoid: string[];
  prefer: string[];
}

export interface Waypoint {
  id: string;
  label: string;
  query: string;
  lat?: number;
  lng?: number;
  purpose: WaypointPurpose;
  locked: boolean;
  reason?: string;
}

export interface PlaceOption {
  id: string;
  name: string;
  query: string;
  address?: string;
  lat?: number;
  lng?: number;
  type: PlaceType;
  reason?: string;
  selected?: boolean;
}

export interface RoutePlan {
  id?: string;
  title: string;
  summary: string;
  start: string;
  destination?: string;
  waypoints: Waypoint[];
  avoidRoads: string[];
  routeNotes: string[];
  foodDrinkOptions: PlaceOption[];
  manualChecks: string[];
  googleMapsUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  rating?: number;
  personalNotes?: string;
}

export interface LiveLocation {
  lat: number;
  lng: number;
  accuracy?: number;
  speedMps?: number;
  heading?: number;
  timestamp: number;
}

export interface RideStatus {
  isTracking: boolean;
  followMode: boolean;
  currentLocation?: LiveLocation;
  nextWaypoint?: Waypoint;
  distanceToNextWaypointMeters?: number;
  distanceToRouteMeters?: number;
  isOffRoute: boolean;
  gpsQuality: GpsQuality;
}

// ----- API request/response helpers -----

export interface HealthStatus {
  status: "ok";
  llmConfigured: boolean;
  placesConfigured: boolean;
  routingConfigured: boolean;
  blobConfigured: boolean;
  mockMode: boolean;
  storageBackend: "json-file" | "vercel-blob";
}

/** A [lng, lat] coordinate pair (GeoJSON / MapLibre order). */
export type LngLat = [number, number];

export interface RouteGeometryRequest {
  /** Waypoints to route through, in order, as [lng, lat] pairs. */
  coordinates: LngLat[];
}

export interface RouteGeometryResponse {
  /** Road-following polyline as [lng, lat] pairs. Empty when unavailable. */
  geometry: LngLat[];
  source: "ors" | "none";
}

export interface SearchPlacesRequest {
  query?: string;
  type?: PlaceType;
  near?: string;
  lat?: number;
  lng?: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}
