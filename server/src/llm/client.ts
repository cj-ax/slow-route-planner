import { randomUUID } from "node:crypto";
import type { RoutePlan, RouteRequest, Waypoint, WaypointPurpose } from "@srp/shared";
import { buildGoogleMapsUrl } from "@srp/shared";
import { config, llmMockMode } from "../config";
import { createMockRoutePlan } from "../mock/mockRoutePlan";
import { ROUTE_PLANNER_SYSTEM_PROMPT } from "../prompts/routePlannerPrompt";

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

/**
 * Placeholder for a real LLM call. Wire your provider here using
 * ROUTE_PLANNER_SYSTEM_PROMPT as the system prompt and the request as the user
 * message, then JSON.parse the response and pass it to mapLlmJsonToPlan().
 *
 * Example (Anthropic, via fetch — no SDK needed):
 *   const res = await fetch("https://api.anthropic.com/v1/messages", {
 *     method: "POST",
 *     headers: {
 *       "x-api-key": config.llmApiKey,
 *       "anthropic-version": "2023-06-01",
 *       "content-type": "application/json",
 *     },
 *     body: JSON.stringify({
 *       model: config.llmModel || "claude-sonnet-4-6",
 *       max_tokens: 2000,
 *       system: ROUTE_PLANNER_SYSTEM_PROMPT,
 *       messages: [{ role: "user", content: buildUserMessage(request) }],
 *     }),
 *   });
 *   const data = await res.json();
 *   const text = data.content?.[0]?.text ?? "";
 *   return mapLlmJsonToPlan(JSON.parse(text));
 */
async function callRouteLlm(_request: RouteRequest): Promise<RoutePlan> {
  void config;
  void ROUTE_PLANNER_SYSTEM_PROMPT;
  throw new Error(
    "Real LLM integration is not wired yet — see server/src/llm/client.ts",
  );
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
