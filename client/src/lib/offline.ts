// "Download this property for offline": enumerate tiles covering the
// property bbox and store them in the Cache API. The service worker serves
// tile requests cache-first from the same cache, so MapLibre finds them with
// no network.

import { BASE_LAYERS, OVERLAYS, type BaseLayerId, type OverlayId } from "../config";
import { tilesForBBox, tileUrl, type BBox } from "./geo";

export const OFFLINE_TILE_CACHE = "deer-tiles-offline-v1";
export const MAX_OFFLINE_TILES = 4000;

export interface OfflinePlan {
  urls: string[];
  tooBig: boolean;
}

export function padBBox(b: BBox, frac = 0.08): BBox {
  const dx = (b[2] - b[0]) * frac + 0.003;
  const dy = (b[3] - b[1]) * frac + 0.002;
  return [b[0] - dx, b[1] - dy, b[2] + dx, b[3] + dy];
}

export function planOfflineTiles(
  bbox: BBox,
  bases: BaseLayerId[],
  overlays: OverlayId[],
  zmin = 11,
  zmax = 16,
): OfflinePlan {
  const padded = padBBox(bbox);
  const urls: string[] = [];
  const defs = [...bases.map((b) => BASE_LAYERS[b]), ...overlays.map((o) => OVERLAYS[o])];
  for (const def of defs) {
    const top = Math.min(zmax, def.maxzoom);
    for (const [z, x, y] of tilesForBBox(padded, zmin, top)) urls.push(tileUrl(def.tiles[0], z, x, y));
  }
  return { urls, tooBig: urls.length > MAX_OFFLINE_TILES };
}

export async function downloadTiles(
  urls: string[],
  onProgress: (done: number, failed: number) => void,
  signal?: AbortSignal,
): Promise<{ done: number; failed: number }> {
  const cache = await caches.open(OFFLINE_TILE_CACHE);
  let done = 0;
  let failed = 0;
  let i = 0;
  const worker = async () => {
    while (i < urls.length && !signal?.aborted) {
      const url = urls[i++];
      try {
        if (!(await cache.match(url))) {
          const res = await fetch(url, { mode: "cors", signal });
          if (!res.ok) throw new Error(String(res.status));
          await cache.put(url, res);
        }
        done++;
      } catch {
        failed++;
      }
      if ((done + failed) % 10 === 0) onProgress(done, failed);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  onProgress(done, failed);
  return { done, failed };
}

export async function offlineTileCount(): Promise<number> {
  if (!("caches" in globalThis)) return 0;
  const cache = await caches.open(OFFLINE_TILE_CACHE);
  return (await cache.keys()).length;
}

export async function clearOfflineTiles(): Promise<void> {
  await caches.delete(OFFLINE_TILE_CACHE);
}
