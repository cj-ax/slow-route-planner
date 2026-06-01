import type { RoutePlan } from "@srp/shared";
import { config } from "../config";
import { jsonFileStore } from "./jsonFileStore";
import { vercelBlobStore } from "./vercelBlobStore";

export interface RouteStore {
  list(): Promise<RoutePlan[]>;
  get(id: string): Promise<RoutePlan | null>;
  /** Write a plan by its id (create or overwrite). Returns the stored plan. */
  put(plan: RoutePlan): Promise<RoutePlan>;
  remove(id: string): Promise<boolean>;
}

let store: RouteStore | null = null;

/** Singleton store: Vercel Blob when a token is present, else local JSON file. */
export function getStore(): RouteStore {
  if (!store) {
    store = config.blobConfigured ? vercelBlobStore : jsonFileStore;
  }
  return store;
}
