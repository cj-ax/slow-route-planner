import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import health from "./routes/health";
import parseRoutePrompt from "./routes/parseRoutePrompt";
import generateRoutePlan from "./routes/generateRoutePlan";
import searchPlaces from "./routes/searchPlaces";
import savedRoutes from "./routes/savedRoutes";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  const api = express.Router();
  api.use(health);
  api.use(parseRoutePrompt);
  api.use(generateRoutePlan);
  api.use(searchPlaces);
  api.use(savedRoutes);
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
