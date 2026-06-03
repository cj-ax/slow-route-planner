import { del, list, put } from "@vercel/blob";
import type { RoutePlan } from "@srp/shared";
import type { RouteStore } from "./store.js";

// One JSON blob per route. Personal scale (a handful of routes) makes the
// extra fetches irrelevant. Blobs are "public" tier but live under a random,
// unguessable store id — fine for a personal app with no secrets in routes.
const PREFIX = "routes/";
const pathFor = (id: string) => `${PREFIX}${id}.json`;

async function fetchJson(url: string): Promise<RoutePlan | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  return (await res.json()) as RoutePlan;
}

export const vercelBlobStore: RouteStore = {
  async list() {
    const { blobs } = await list({ prefix: PREFIX });
    const plans = await Promise.all(blobs.map((b) => fetchJson(b.url)));
    return plans
      .filter((p): p is RoutePlan => p !== null)
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  },

  async get(id) {
    const { blobs } = await list({ prefix: pathFor(id) });
    const match = blobs.find((b) => b.pathname === pathFor(id)) ?? blobs[0];
    return match ? fetchJson(match.url) : null;
  },

  async put(plan) {
    // OIDC or token auth is resolved by the SDK from the environment
    // (BLOB_STORE_ID + VERCEL_OIDC_TOKEN, or BLOB_READ_WRITE_TOKEN). Routes
    // reuse their id, so overwriting the same path needs allowOverwrite.
    await put(pathFor(plan.id as string), JSON.stringify(plan), {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return plan;
  },

  async remove(id) {
    const { blobs } = await list({ prefix: pathFor(id) });
    const match = blobs.find((b) => b.pathname === pathFor(id));
    if (!match) return false;
    await del(match.url);
    return true;
  },
};
