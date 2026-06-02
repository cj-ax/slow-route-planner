import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import type {
  LatLng,
  RoutePlan,
  RouteRequest,
  Waypoint,
  WaypointPurpose,
} from "@srp/shared";
import { buildGoogleMapsUrl } from "@srp/shared";
import { config, llmMockMode } from "../config";
import { createMockRoutePlan } from "../mock/mockRoutePlan";
import { geocode } from "../routing/geocode";
import { ROUTE_PLANNER_SYSTEM_PROMPT } from "../prompts/routePlannerPrompt";

// Opus 4.8 is the default; override with LLM_MODEL (e.g. claude-haiku-4-5 for
// a cheaper/faster option, or claude-sonnet-4-6 for a middle ground).
const DEFAULT_MODEL = "claude-opus-4-8";

const VALID_PURPOSES: WaypointPurpose[] = [
  "start",
  "scenic",
  "residential_detour",
  "lake_view",
  "food_drink",
  "route_shaping",
  "destination",
];

/** Shape the LLM is asked to return (see routePlannerPrompt.ts). */
interface LlmRoutePlanJson {
  title: string;
  summary: string;
  start: string;
  destination?: string;
  waypoints: Array<{
    label: string;
    query: string;
    purpose: string;
    locked?: boolean;
    reason?: string;
  }>;
  avoidRoads?: string[];
  routeNotes?: string[];
  foodDrinkSearches?: string[];
  manualChecks?: string[];
}

function coercePurpose(value: string): WaypointPurpose {
  return VALID_PURPOSES.includes(value as WaypointPurpose)
    ? (value as WaypointPurpose)
    : "route_shaping";
}

/** Convert raw LLM JSON into a RoutePlan (assigns ids; coords come later). */
export function mapLlmJsonToPlan(json: LlmRoutePlanJson): RoutePlan {
  const waypoints: Waypoint[] = (json.waypoints ?? []).map((w) => ({
    id: randomUUID(),
    label: w.label,
    query: w.query,
    purpose: coercePurpose(w.purpose),
    locked: Boolean(w.locked),
    reason: w.reason,
  }));

  const plan: RoutePlan = {
    title: json.title,
    summary: json.summary,
    start: json.start,
    destination: json.destination,
    waypoints,
    avoidRoads: json.avoidRoads ?? [],
    routeNotes: json.routeNotes ?? [],
    // foodDrinkSearches become search seeds; the client resolves real places
    // via /api/search-places. Keep options empty here.
    foodDrinkOptions: [],
    manualChecks: json.manualChecks ?? [],
  };
  plan.googleMapsUrl = buildGoogleMapsUrl(plan);
  return plan;
}

/** Turn the structured request into the user-turn prompt for the LLM. */
function buildUserMessage(r: RouteRequest): string {
  const endpoint = r.endpointIntent
    ? `End with: ${r.endpointIntent}${
        r.customEndpointIntent ? ` (${r.customEndpointIntent})` : ""
      }`
    : "";
  return [
    `Ride request: ${r.rawPrompt}`,
    `Start location: ${r.startLocation}`,
    r.area ? `Area: ${r.area}` : "",
    `Ride type: ${r.rideType}`,
    endpoint,
    r.targetDurationMinutes ? `Target duration: ${r.targetDurationMinutes} minutes` : "",
    r.maxPreferredSpeedMph
      ? `Prefer roads at or below about ${r.maxPreferredSpeedMph} mph`
      : "",
    r.avoid?.length ? `Avoid: ${r.avoid.join(", ")}` : "",
    r.prefer?.length ? `Prefer: ${r.prefer.join(", ")}` : "",
    "Respond with the route plan JSON only.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Pull the JSON text out of the response, tolerating accidental code fences. */
function extractJson(message: Anthropic.Message): LlmRoutePlanJson {
  const textBlock = message.content.find((b) => b.type === "text");
  let text = textBlock && textBlock.type === "text" ? textBlock.text : "";
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) text = fenced[1];
  return JSON.parse(text.trim()) as LlmRoutePlanJson;
}

/**
 * Best-effort: resolve each waypoint's map query to coordinates via ORS
 * geocoding so LLM-generated routes render on the map and follow roads. The
 * ride start anchors the search so ambiguous street names resolve nearby.
 * Failures leave a waypoint un-located rather than aborting the plan.
 */
async function geocodeWaypoints(plan: RoutePlan, startText: string): Promise<void> {
  if (!config.routingConfigured) return;
  const anchor: LatLng | undefined = (await geocode(startText)) ?? undefined;
  await Promise.all(
    plan.waypoints.map(async (w) => {
      if (w.lat !== undefined && w.lng !== undefined) return;
      const found = await geocode(w.query || w.label, anchor);
      if (found) {
        w.lat = found.lat;
        w.lng = found.lng;
      }
    }),
  );
}

/**
 * Real route generation via the Anthropic Messages API. The static planner
 * prompt is cached (cache_control); adaptive thinking keeps the visible text a
 * clean JSON object. LLM waypoints carry no coordinates, so we geocode them
 * before returning.
 */
async function callRouteLlm(request: RouteRequest): Promise<RoutePlan> {
  const client = new Anthropic({ apiKey: config.llmApiKey });
  const model = config.llmModel || DEFAULT_MODEL;
  const message = await client.messages.create({
    model,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    system: [
      {
        type: "text",
        text: ROUTE_PLANNER_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: buildUserMessage(request) }],
  });

  console.log(`[llm] route generated via ${message.model}`);
  const plan = mapLlmJsonToPlan(extractJson(message));
  await geocodeWaypoints(plan, request.startLocation);
  plan.googleMapsUrl = buildGoogleMapsUrl(plan);
  return plan;
}

/**
 * Generate a route plan from a request. Uses mocks when forced or when no LLM
 * key is set. If a real call is attempted and fails, falls back to a mock plan
 * with a visible note so the app never breaks.
 */
export async function generateRoutePlan(request: RouteRequest): Promise<RoutePlan> {
  if (llmMockMode) {
    return createMockRoutePlan(request);
  }
  try {
    return await callRouteLlm(request);
  } catch (err) {
    console.warn("[llm] falling back to mock plan:", (err as Error).message);
    const plan = createMockRoutePlan(request);
    plan.manualChecks = [
      "LLM call failed or is not wired yet — showing a mock plan. See README to enable real route generation.",
      ...plan.manualChecks,
    ];
    return plan;
  }
}
