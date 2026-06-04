import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import health from "./routes/health.js";
import parseRoutePrompt from "./routes/parseRoutePrompt.js";
import generateRoutePlan from "./routes/generateRoutePlan.js";
import searchPlaces from "./routes/searchPlaces.js";
import routeGeometry from "./routes/routeGeometry.js";
import savedRoutes from "./routes/savedRoutes.js";
import weather from "./routes/weather.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  const api = express.Router();
  api.use(health);
  api.use(parseRoutePrompt);
  api.use(generateRoutePlan);
  api.use(searchPlaces);
  api.use(routeGeometry);
  api.use(savedRoutes);
  api.use(weather);
  app.use("/api", api);

  // JSON 404 for unknown API routes.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found." });
  });

  // Central error handler — keep the 4-arg signature so Express detects it.
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[server] error:", err);
    res.status(500).json({ error: err.message || "Internal server error." });
  });

  return app;
}

const app = createApp();
export default app;
