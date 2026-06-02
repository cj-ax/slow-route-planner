import { Router } from "express";
import type { HealthStatus } from "@srp/shared";
import { config, mockMode } from "../config.js";

const router = Router();

router.get("/health", (_req, res) => {
  const status: HealthStatus = {
    status: "ok",
    llmConfigured: config.llmConfigured,
    placesConfigured: config.placesConfigured,
    routingConfigured: config.routingConfigured,
    blobConfigured: config.blobConfigured,
    mockMode,
    storageBackend: config.storageBackend,
  };
  res.json(status);
});

export default router;
