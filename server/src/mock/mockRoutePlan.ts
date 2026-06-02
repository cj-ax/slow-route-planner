import { randomUUID } from "node:crypto";
import {
  buildGoogleMapsUrl,
  type PlaceType,
  type RoutePlan,
  type RouteRequest,
  type Waypoint,
} from "@srp/shared";
import { createMockPlaces } from "./mockPlaces.js";

type WaypointSeed = Omit<Waypoint, "id">;

// A coherent, low-stress loop around the east side of Lake Minnetonka.
const WAYPOINT_SEEDS: WaypointSeed[] = [
  {
    label: "Wayzata Depot (start)",
    query: "Wayzata Depot, Wayzata, MN",
    lat: 44.971,
    lng: -93.506,
    purpose: "start",
    locked: true,
    reason: "Easy starting point with parking right on Wayzata Bay.",
  },
  {
    label: "Wayzata Bay lakefront",
    query: "Lake Street E, Wayzata, MN",
    lat: 44.969,
    lng: -93.51,
    purpose: "lake_view",
    locked: false,
    reason: "Open water views along the bay before heading south.",
  },
  {
    label: "Bushaway Road (tree-lined)",
    query: "Bushaway Road, Wayzata, MN",
    lat: 44.95,
    lng: -93.518,
    purpose: "scenic",
    locked: false,
    reason: "Curvy, tree-canopied road connecting Wayzata toward Deephaven.",
  },
  {
    label: "Deephaven residential streets",
    query: "Deephaven, MN",
    lat: 44.9244,
    lng: -93.5219,
    purpose: "residential_detour",
    locked: false,
    reason: "Quiet lakeside neighborhood streets, low traffic.",
  },
  {
    label: "Carsons Bay overlook",
    query: "Carsons Bay, Deephaven, MN",
    lat: 44.918,
    lng: -93.53,
    purpose: "lake_view",
    locked: false,
    reason: "Small bay view tucked into the neighborhood.",
  },
  {
    label: "Smithtown Road shaping point",
    query: "Smithtown Road, Greenwood, MN",
    lat: 44.9147,
    lng: -93.5566,
    purpose: "route_shaping",
    locked: false,
    reason: "Keeps the route off the busier county roads.",
  },
  {
    label: "Tonka Bay shoreline",
    query: "Tonka Bay, MN",
    lat: 44.9136,
    lng: -93.5891,
    purpose: "scenic",
    locked: false,
    reason: "Slow shoreline streets with water on both sides.",
  },
  {
    label: "Shorewood quiet streets",
    query: "Shorewood, MN",
    lat: 44.9019,
    lng: -93.578,
    purpose: "residential_detour",
    locked: false,
    reason: "Calm residential detour approaching Excelsior.",
  },
  {
    label: "Downtown Excelsior",
    query: "Water Street, Excelsior, MN",
    lat: 44.9033,
    lng: -93.5663,
    purpose: "destination",
    locked: false,
    reason: "Walkable small-town main street near the lake to finish.",
  },
];

const INTENT_LABEL: Record<PlaceType, string> = {
  coffee: "coffee",
  beer: "a beer",
  food: "a bite",
  ice_cream: "ice cream",
  view: "a lake view",
  custom: "a casual stop",
};

/**
 * Realistic mock plan anchored to Lake Minnetonka. Adapts a few surface
 * details (start label, endpoint intent, duration note) to the request, but
 * the geometry is fixed so the map and ride mode work with zero API keys.
 */
export function createMockRoutePlan(request: Partial<RouteRequest> = {}): RoutePlan {
  const intent: PlaceType = (request.endpointIntent as PlaceType) ?? "beer";
  const startLabel = request.startLocation?.trim() || "Wayzata Depot";

  const waypoints: Waypoint[] = WAYPOINT_SEEDS.map((seed, i) => ({
    id: randomUUID(),
    ...seed,
    // Reflect the user's start label on the first waypoint.
    label: i === 0 ? `${startLabel} (start)` : seed.label,
    query: i === 0 && request.startLocation ? request.startLocation : seed.query,
  }));

  const foodDrinkOptions = createMockPlaces(intent);

  const durationNote =
    request.targetDurationMinutes != null
      ? `Targeting roughly ${request.targetDurationMinutes} minutes at a relaxed pace; adjust waypoints to taste.`
      : "Plan on roughly 90–120 minutes at a relaxed pace.";

  const plan: RoutePlan = {
    title: `Slow ${request.rideType ?? "ride"} around Lake Minnetonka`,
    summary: `A low-stress loop from ${startLabel} down the east shore of Lake Minnetonka through Deephaven, Tonka Bay, and Shorewood, ending in downtown Excelsior for ${INTENT_LABEL[intent]}. Favors quiet residential streets, tree-lined roads, and lake views over fast through-roads.`,
    start: startLabel,
    destination: "Downtown Excelsior, MN",
    waypoints,
    avoidRoads: [
      "Highway 7",
      "Highway 12 / I-394",
      "County Road 101 (faster sections)",
      "Other fast multilane through-roads",
    ],
    routeNotes: [
      durationNote,
      "Roughly counter-clockwise around the east arms of the lake.",
      request.avoid?.length
        ? `Honoring your avoid list: ${request.avoid.join(", ")}.`
        : "Routed to avoid highways and fast multilane roads.",
      request.prefer?.length
        ? `Leaning into your preferences: ${request.prefer.join(", ")}.`
        : "Leaning into lake views, curves, trees, and small-town main streets.",
    ],
    foodDrinkOptions,
    manualChecks: [
      "Speed limits should be manually verified before riding — this plan treats speed as a preference, not confirmed data.",
      "Google Maps may reroute onto faster roads; follow the planned waypoints rather than the auto-route.",
      "Some residential streets may be unmarked or seasonal — confirm they are through-streets.",
      "Confirm the chosen endpoint is open and has seating before you go.",
    ],
  };

  plan.googleMapsUrl = buildGoogleMapsUrl(plan);
  return plan;
}
