import { Router } from "express";
import { getWeather } from "../weather/client.js";

const router = Router();

router.get("/weather", async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: "lat and lng query params are required." });
      return;
    }
    res.json(await getWeather(lat, lng));
  } catch (err) {
    next(err);
  }
});

export default router;
