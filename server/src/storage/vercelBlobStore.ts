import { del, get, list, put } from "@vercel/blob";
import type { RoutePlan } from "@srp/shared";
import type { RouteStore } from "./store.js";

// One JSON blob per route, stored in a PRIVATE Blob store: all reads/writes go
// through the authenticated SDK (no public URLs), which suits user route data.
const PREFIX = "routes/";
const pathFor = (id: string) => `${PREFIX}${id}.json`;

/** Read + parse a private blob by pathname. Returns null when missing/invalid. */
async function readPlan(pathname: string): Promise<RoutePlan | null> {
  try {
    const result = await get(pathname, { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return (await new Response(result.stream).json()) as RoutePlan;
  } catch {
    return null;
  }
}

export const vercelBlobStore: RouteStore = {
  async list() {
    const { blobs } = await list({ prefix: PREFIX });
    const plans = await Promise.all(blobs.map((b) => readPlan(b.pathname)));
    return plans
      .filter((p): p is RoutePlan => p !== null)
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  },

  async get(id) {
    return readPlan(pathFor(id));
  },

  async put(plan) {
    // Auth (OIDC via BLOB_STORE_ID + VERCEL_OIDC_TOKEN, or BLOB_READ_WRITE_TOKEN)
    // is resolved by the SDK from the environment. Routes reuse their id, so
    // overwriting the same path needs allowOverwrite.
    await put(pathFor(plan.id as string), JSON.stringify(plan), {
      access: "private",
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
