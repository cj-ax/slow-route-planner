import { Router } from "express";
import type { SearchPlacesRequest } from "@srp/shared";
import { searchPlaces } from "../places/client";

const router = Router();

router.post("/search-places", async (req, res, next) => {
  try {
    const body = (req.body ?? {}) as SearchPlacesRequest;
    const results = await searchPlaces(body);
    res.json(results);
  } catch (err) {
    next(err);
  }
});

export default router;
