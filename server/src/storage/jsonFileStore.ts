import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RoutePlan } from "@srp/shared";
import type { RouteStore } from "./store";

const here = path.dirname(fileURLToPath(import.meta.url)); // server/src/storage
const dataDir = path.resolve(here, "../../data"); // server/data
const dataFile = path.join(dataDir, "routes.json");

async function readAll(): Promise<RoutePlan[]> {
  try {
    const raw = await readFile(dataFile, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RoutePlan[]) : [];
  } catch (err: any) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
}

async function writeAll(plans: RoutePlan[]): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  await writeFile(dataFile, JSON.stringify(plans, null, 2), "utf8");
}

export const jsonFileStore: RouteStore = {
  async list() {
    const plans = await readAll();
    return plans.sort((a, b) =>
      (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
    );
  },

  async get(id) {
    const plans = await readAll();
    return plans.find((p) => p.id === id) ?? null;
  },

  async put(plan) {
    const plans = await readAll();
    const idx = plans.findIndex((p) => p.id === plan.id);
    if (idx >= 0) {
      plans[idx] = plan;
    } else {
      plans.push(plan);
    }
    await writeAll(plans);
    return plan;
  },

  async remove(id) {
    const plans = await readAll();
    const next = plans.filter((p) => p.id !== id);
    if (next.length === plans.length) return false;
    await writeAll(next);
    return true;
  },
};
