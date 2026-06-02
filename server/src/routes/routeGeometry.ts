import { Router } from "express";
import type { LngLat, RouteGeometryResponse } from "@srp/shared";
import { getRouteGeometry } from "../routing/client.js";

const router = Router();

function isLngLat(value: unknown): value is LngLat {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
}

router.post("/route-geometry", async (req, res, next) => {
  try {
    const raw = (req.body?.coordinates ?? []) as unknown[];
    const coordinates = Array.isArray(raw) ? raw.filter(isLngLat) : [];

    if (coordinates.length < 2) {
      const empty: RouteGeometryResponse = { geometry: [], source: "none" };
      res.json(empty);
      return;
    }

    const geometry = await getRouteGeometry(coordinates);
    const body: RouteGeometryResponse = {
      geometry,
      source: geometry.length ? "ors" : "none",
    };
    res.json(body);
  } catch (err) {
    next(err);
  }
});

export default router;
