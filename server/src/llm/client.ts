import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import type {
  LatLng,
  RoutePlan,
  RouteRequest,
  Waypoint,
  WaypointPurpose,
} from "@srp/shared";
import { buildGoogleMapsUrl, calculateDistanceMeters } from "@srp/shared";
import { config, llmMockMode } from "../config.js";
import { createMockRoutePlan } from "../mock/mockRoutePlan.js";
import { geocode } from "../routing/geocode.js";
import { ROUTE_PLANNER_SYSTEM_PROMPT } from "../prompts/routePlannerPrompt.js";

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

/** Detect a loop / round-trip request from the user's free text. */
export function isLoopRequest(rawPrompt: string): boolean {
  return /\b(loop|round[\s-]?trip|circular|circuit|out[\s-]and[\s-]back|return to (the )?start|back to (the )?start)\b/i.test(
    rawPrompt || "",
  );
}

/** Turn the structured request into the user-turn prompt for the LLM. */
function buildUserMessage(r: RouteRequest): string {
  const endpoint = r.endpointIntent
    ? `End with: ${r.endpointIntent}${
        r.customEndpointIntent ? ` (${r.customEndpointIntent})` : ""
      }`
    : "";
  const loop = isLoopRequest(r.rawPrompt)
    ? 'This is a LOOP / round trip: the route MUST return to the start. Set "destination" to the SAME place as the start, make the final waypoint the start area, and progress around the area in ONE rotational direction (clockwise or counter-clockwise) without crossing back over yourself.'
    : "";
  return [
    `Ride request: ${r.rawPrompt}`,
    r.startLocation
      ? `Start location: ${r.startLocation}`
      : "Start location: not given — use the start the rider named in the request above.",
    r.area ? `Area: ${r.area}` : "",
    `Ride type: ${r.rideType}`,
    endpoint,
    loop,
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

function distM(a: Waypoint, b: Waypoint): number {
  return calculateDistanceMeters(
    { lat: a.lat as number, lng: a.lng as number },
    { lat: b.lat as number, lng: b.lng as number },
  );
}

/** Greedy nearest-neighbour ordering of `pts`, starting from `from`. */
function nearestNeighbourOrder(from: Waypoint, pts: Waypoint[]): Waypoint[] {
  const ordered: Waypoint[] = [];
  let current = from;
  const remaining = [...pts];
  while (remaining.length) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const d = distM(current, remaining[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    current = remaining[bestIdx];
    ordered.push(current);
    remaining.splice(bestIdx, 1);
  }
  return ordered;
}

/**
 * 2-opt: repeatedly reverse the path segment between two points when doing so
 * shortens the total length. This "uncrosses" the path and removes the
 * back-and-forth that makes a loop look like a horseshoe. The first and last
 * stops (start / destination) stay fixed.
 */
function twoOpt(seq: Waypoint[]): void {
  const n = seq.length;
  if (n < 4) return;
  let improved = true;
  let guard = 0;
  while (improved && guard < 60) {
    guard += 1;
    improved = false;
    for (let i = 1; i < n - 2; i += 1) {
      for (let k = i + 1; k < n - 1; k += 1) {
        const a = seq[i - 1];
        const b = seq[i];
        const c = seq[k];
        const d = seq[k + 1];
        if (distM(a, c) + distM(b, d) + 1e-6 < distM(a, b) + distM(c, d)) {
          for (let lo = i, hi = k; lo < hi; lo += 1, hi -= 1) {
            const tmp = seq[lo];
            seq[lo] = seq[hi];
            seq[hi] = tmp;
          }
          improved = true;
        }
      }
    }
  }
}

/** Centroid (mean lat/lng) of a set of located waypoints. */
function centroidOf(pts: Waypoint[]): LatLng {
  const lat = pts.reduce((s, p) => s + (p.lat as number), 0) / pts.length;
  const lng = pts.reduce((s, p) => s + (p.lng as number), 0) / pts.length;
  return { lat, lng };
}

/**
 * Order located waypoints as a clean ring: sort by polar angle around the
 * centroid, starting just past the start's angle and sweeping one direction.
 * This forces the route to go all the way around (covering every side) without
 * crossing back on itself — the right shape for "a loop around the lake".
 */
function angleSortRing(start: Waypoint, located: Waypoint[]): Waypoint[] {
  const c = centroidOf([start, ...located]);
  const startAngle = Math.atan2((start.lat as number) - c.lat, (start.lng as number) - c.lng);
  return located
    .map((w) => {
      const a = Math.atan2((w.lat as number) - c.lat, (w.lng as number) - c.lng);
      return { w, rel: (a - startAngle + 2 * Math.PI) % (2 * Math.PI) };
    })
    .sort((a, b) => a.rel - b.rel)
    .map((x) => x.w);
}

/**
 * Reorder the middle waypoints so the drawn line flows instead of zig-zagging,
 * and demote far-flung bad geocodes (e.g. an ambiguous street name that lands
 * in the wrong town) to "no pin" so the route never detours out to them.
 * Loops are ordered as a ring (angle sort); point-to-point uses nearest
 * neighbour + 2-opt. Start stays first and the destination last.
 */
function reorderForFlow(waypoints: Waypoint[], isLoop: boolean): Waypoint[] {
  if (waypoints.length < 4) return waypoints;
  const start = waypoints[0];
  if (start.lat === undefined || start.lng === undefined) return waypoints;

  const lastIsDest = waypoints[waypoints.length - 1]?.purpose === "destination";
  const end = lastIsDest ? waypoints[waypoints.length - 1] : undefined;
  const fixed = new Set([start.id, ...(end ? [end.id] : [])]);

  const middle = waypoints.filter((w) => !fixed.has(w.id));
  let located = middle.filter((w) => w.lat !== undefined && w.lng !== undefined);
  const unlocated = middle.filter((w) => w.lat === undefined || w.lng === undefined);
  if (located.length < 2) return waypoints;

  // Demote outliers: anything far beyond the typical distance from the start is
  // almost always a mis-geocode. Strip its coords so it shows as "no pin"
  // (kept in the list) instead of dragging the line across the metro.
  const dists = located.map((w) => distM(start, w)).sort((a, b) => a - b);
  const median = dists[Math.floor(dists.length / 2)] || 0;
  const limit = Math.max(median * 3, 12000);
  for (const w of located) {
    if (distM(start, w) > limit) {
      w.lat = undefined;
      w.lng = undefined;
    }
  }
  located = located.filter((w) => w.lat !== undefined && w.lng !== undefined);
  const demoted = middle.filter(
    (w) => !fixed.has(w.id) && (w.lat === undefined || w.lng === undefined) && !unlocated.includes(w),
  );
  const tail = [...unlocated, ...demoted];
  if (located.length < 2) return [start, ...located, ...tail, ...(end ? [end] : [])];

  let orderedMiddle: Waypoint[];
  if (isLoop) {
    orderedMiddle = angleSortRing(start, located);
  } else {
    const seq: Waypoint[] = [start, ...nearestNeighbourOrder(start, located), ...(end ? [end] : [])];
    twoOpt(seq);
    orderedMiddle = seq.filter((w) => !fixed.has(w.id));
  }

  return [start, ...orderedMiddle, ...tail, ...(end ? [end] : [])];
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
    // Thinking disabled: route planning is well-specified by the system prompt,
    // and a deterministic reorder fixes geographic flow — so we trade the long
    // adaptive-thinking latency (which would time out on Vercel) for a fast,
    // clean JSON response.
    thinking: { type: "disabled" },
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
  // Anchor geocoding on the model's own start (e.g. "Victoria, MN") so it works
  // even when the rider didn't fill the start field, and biases stops nearby.
  await geocodeWaypoints(plan, plan.start || request.startLocation);
  const isLoop =
    isLoopRequest(request.rawPrompt) ||
    (Boolean(plan.destination) &&
      plan.start.trim().toLowerCase() === (plan.destination ?? "").trim().toLowerCase());
  plan.waypoints = reorderForFlow(plan.waypoints, isLoop);
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
    const reason = (err as Error)?.message || "unknown error";
    console.warn("[llm] falling back to mock plan:", reason);
    const plan = createMockRoutePlan(request);
    plan.manualChecks = [
      `Live AI route generation failed (${reason}) — showing a sample plan instead.`,
      ...plan.manualChecks,
    ];
    return plan;
  }
}
