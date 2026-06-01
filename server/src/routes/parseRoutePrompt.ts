import { Router } from "express";
import type { EndpointIntent, RideType, RouteRequest } from "@srp/shared";

const router = Router();

function detectRideType(text: string): RideType {
  if (/\be-?bike\b|electric bike/.test(text)) return "ebike";
  if (/\bmotorcycle|moto\b|bike ride on the/.test(text)) return "motorcycle";
  if (/\bbicycle|bike\b|cycling\b/.test(text)) return "bike";
  if (/\bcar\b|drive\b|driving\b/.test(text)) return "car";
  return "motorcycle";
}

function detectEndpointIntent(text: string): EndpointIntent | undefined {
  if (/ice cream|gelato|custard/.test(text)) return "ice_cream";
  if (/beer|brewery|taproom|pint|patio drink/.test(text)) return "beer";
  if (/coffee|espresso|latte|cafe|café/.test(text)) return "coffee";
  if (/food|snack|lunch|dinner|eat|bite|patio/.test(text)) return "food";
  if (/view|overlook|scenic spot|sunset/.test(text)) return "view";
  return undefined;
}

function detectArea(text: string): string | undefined {
  const m =
    text.match(/around ([a-z0-9 .'-]+?)(?:[.,]|\.|$| and | with | avoid| that| to )/i) ||
    text.match(/near ([a-z0-9 .'-]+?)(?:[.,]|\.|$| and | with | avoid| that| to )/i);
  return m?.[1]?.trim();
}

function detectDuration(text: string): number | undefined {
  const range = text.match(/(\d{2,3})\s*[-–to]+\s*(\d{2,3})\s*(?:min|minute|hour)/i);
  if (range) {
    const lo = Number(range[1]);
    const hi = Number(range[2]);
    return Math.round((lo + hi) / 2);
  }
  const single = text.match(/(\d{1,3})\s*(min|minute)/i);
  if (single) return Number(single[1]);
  const hours = text.match(/(\d(?:\.\d)?)\s*hour/i);
  if (hours) return Math.round(Number(hours[1]) * 60);
  return undefined;
}

function detectAvoid(text: string): string[] {
  const avoid: string[] = [];
  if (/highway|freeway|interstate|multilane|multi-lane/.test(text)) {
    avoid.push("highways", "fast multilane roads");
  }
  if (/busy|traffic|stressful/.test(text)) avoid.push("stressful intersections");
  if (/truck/.test(text)) avoid.push("truck-heavy roads");
  return [...new Set(avoid)];
}

function detectPrefer(text: string): string[] {
  const prefer: string[] = [];
  if (/lake|water|shore/.test(text)) prefer.push("lake views");
  if (/curv|winding|twisty/.test(text)) prefer.push("curves");
  if (/tree|wooded|forest/.test(text)) prefer.push("tree-lined roads");
  if (/residential|neighborhood|neighbourhood|quiet/.test(text)) {
    prefer.push("quiet residential streets");
  }
  if (/main street|downtown|small town|small-town/.test(text)) {
    prefer.push("small-town main streets");
  }
  if (/scenic|pretty|beautiful/.test(text)) prefer.push("scenic roads");
  return [...new Set(prefer)];
}

/** Lightweight keyword parse to pre-fill the prompt form. No LLM needed. */
function parsePrompt(rawPrompt: string, partial: Partial<RouteRequest>): RouteRequest {
  const text = rawPrompt.toLowerCase();
  return {
    rawPrompt,
    startLocation: partial.startLocation ?? "",
    endLocation: partial.endLocation,
    endpointIntent: partial.endpointIntent ?? detectEndpointIntent(text),
    customEndpointIntent: partial.customEndpointIntent,
    area: partial.area ?? detectArea(rawPrompt),
    targetDurationMinutes: partial.targetDurationMinutes ?? detectDuration(text),
    rideType: partial.rideType ?? detectRideType(text),
    maxPreferredSpeedMph: partial.maxPreferredSpeedMph,
    avoid: partial.avoid?.length ? partial.avoid : detectAvoid(text),
    prefer: partial.prefer?.length ? partial.prefer : detectPrefer(text),
  };
}

router.post("/parse-route-prompt", (req, res) => {
  const body = req.body ?? {};
  if (typeof body.rawPrompt !== "string" || !body.rawPrompt.trim()) {
    res.status(400).json({ error: "rawPrompt is required." });
    return;
  }
  res.json(parsePrompt(body.rawPrompt, body));
});

export default router;
