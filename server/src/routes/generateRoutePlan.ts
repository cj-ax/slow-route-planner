import { Router } from "express";
import type { RideType, RouteRequest } from "@srp/shared";
import { generateRoutePlan } from "../llm/client.js";

const router = Router();

const RIDE_TYPES: RideType[] = ["car", "motorcycle", "bike", "ebike"];

function normalizeRequest(body: any): RouteRequest {
  const rideType: RideType = RIDE_TYPES.includes(body?.rideType)
    ? body.rideType
    : "motorcycle";
  return {
    id: body?.id,
    rawPrompt: typeof body?.rawPrompt === "string" ? body.rawPrompt : "",
    startLocation: typeof body?.startLocation === "string" ? body.startLocation : "",
    endLocation: body?.endLocation,
    endpointIntent: body?.endpointIntent,
    customEndpointIntent: body?.customEndpointIntent,
    area: body?.area,
    targetDurationMinutes:
      body?.targetDurationMinutes != null ? Number(body.targetDurationMinutes) : undefined,
    rideType,
    maxPreferredSpeedMph:
      body?.maxPreferredSpeedMph != null ? Number(body.maxPreferredSpeedMph) : undefined,
    avoid: Array.isArray(body?.avoid) ? body.avoid : [],
    prefer: Array.isArray(body?.prefer) ? body.prefer : [],
  };
}

router.post("/generate-route-plan", async (req, res, next) => {
  try {
    const request = normalizeRequest(req.body ?? {});
    if (!request.rawPrompt && !request.startLocation && !request.area) {
      res.status(400).json({
        error: "Provide at least a prompt, start location, or area.",
      });
      return;
    }
    const plan = await generateRoutePlan(request);
    res.json(plan);
  } catch (err) {
    next(err);
  }
});

export default router;
