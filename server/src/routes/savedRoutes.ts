import { randomUUID } from "node:crypto";
import { Router } from "express";
import type { RoutePlan } from "@srp/shared";
import { getStore } from "../storage/store";

const router = Router();

router.get("/routes", async (_req, res, next) => {
  try {
    res.json(await getStore().list());
  } catch (err) {
    next(err);
  }
});

router.get("/routes/:id", async (req, res, next) => {
  try {
    const plan = await getStore().get(req.params.id);
    if (!plan) {
      res.status(404).json({ error: "Route not found." });
      return;
    }
    res.json(plan);
  } catch (err) {
    next(err);
  }
});

router.post("/save-route", async (req, res, next) => {
  try {
    const body = req.body as RoutePlan;
    if (!body || typeof body.title !== "string" || !body.title.trim()) {
      res.status(400).json({ error: "A route plan with a title is required." });
      return;
    }
    const now = new Date().toISOString();
    const stored: RoutePlan = {
      ...body,
      id: body.id || randomUUID(),
      createdAt: body.createdAt || now,
      updatedAt: now,
    };
    await getStore().put(stored);
    res.status(201).json(stored);
  } catch (err) {
    next(err);
  }
});

router.put("/routes/:id", async (req, res, next) => {
  try {
    const store = getStore();
    const existing = await store.get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "Route not found." });
      return;
    }
    const updated: RoutePlan = {
      ...existing,
      ...(req.body as RoutePlan),
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await store.put(updated);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete("/routes/:id", async (req, res, next) => {
  try {
    const removed = await getStore().remove(req.params.id);
    if (!removed) {
      res.status(404).json({ error: "Route not found." });
      return;
    }
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
