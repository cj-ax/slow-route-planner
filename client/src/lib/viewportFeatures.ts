// Viewport-driven loader for ArcGIS feature services: fetches features in
// fixed tile-sized chunks as the map moves, caches them in memory, and caps
// the total. Used for parcel lines and government-owned land.

import { lonLatToTile, type BBox } from "./geo";

export function tileToBBox(z: number, x: number, y: number): BBox {
  const n = 2 ** z;
  const lon = (xx: number) => (xx / n) * 360 - 180;
  const lat = (yy: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * yy) / n))) * 180) / Math.PI;
  return [lon(x), lat(y + 1), lon(x + 1), lat(y)];
}

/** Chunk keys at zoom `z` covering a view, or [] when more than `max` would be needed. */
export function chunksForView(view: BBox, z: number, max = 16): string[] {
  const [x0, y0] = lonLatToTile(view[0], view[3], z);
  const [x1, y1] = lonLatToTile(view[2], view[1], z);
  const keys: string[] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) keys.push(`${x}/${y}`);
  return keys.length > max ? [] : keys;
}

export interface ViewportLayerOptions {
  url: string; // FeatureServer layer URL
  chunkZ: number;
  minZoom: number;
  outFields: string; // keep to non-personal fields only
  where?: string;
  simplifyDeg: number;
  idField: string;
  maxFeatures?: number;
  maxChunks?: number;
}

export function createViewportLayer(o: ViewportLayerOptions) {
  const loaded = new Set<string>();
  const inflight = new Map<string, Promise<void>>();
  const features = new Map<number, GeoJSON.Feature>();
  const maxFeatures = o.maxFeatures ?? 25000;

  async function loadChunk(key: string): Promise<void> {
    const [x, y] = key.split("/").map(Number);
    const [w, s, e, n] = tileToBBox(o.chunkZ, x, y);
    for (let offset = 0; offset < 20000; offset += 2000) {
      const q = new URLSearchParams({
        where: o.where ?? "1=1",
        geometry: `${w},${s},${e},${n}`,
        geometryType: "esriGeometryEnvelope",
        inSR: "4326",
        outSR: "4326",
        spatialRel: "esriSpatialRelIntersects",
        outFields: o.outFields,
        returnGeometry: "true",
        geometryPrecision: "6",
        maxAllowableOffset: String(o.simplifyDeg),
        resultOffset: String(offset),
        resultRecordCount: "2000",
        f: "geojson",
      });
      const res = await fetch(`${o.url}/query?${q}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const fc = (await res.json()) as GeoJSON.FeatureCollection & { properties?: { exceededTransferLimit?: boolean } };
      for (const f of fc.features ?? []) {
        const id = Number(f.properties?.[o.idField]);
        if (Number.isFinite(id)) features.set(id, { type: "Feature", id, geometry: f.geometry, properties: f.properties ?? {} });
      }
      if (!fc.properties?.exceededTransferLimit && (fc.features?.length ?? 0) < 2000) break;
    }
    if (features.size > maxFeatures) {
      const extra = features.size - maxFeatures;
      let i = 0;
      for (const k of features.keys()) {
        if (i++ >= extra) break;
        features.delete(k);
      }
      loaded.clear();
    }
    loaded.add(key);
  }

  return {
    minZoom: o.minZoom,
    async forView(view: BBox): Promise<GeoJSON.FeatureCollection> {
      const keys = chunksForView(view, o.chunkZ, o.maxChunks ?? 16).filter((k) => !loaded.has(k));
      await Promise.allSettled(
        keys.map((k) => {
          let p = inflight.get(k);
          if (!p) {
            p = loadChunk(k).finally(() => inflight.delete(k));
            inflight.set(k, p);
          }
          return p;
        }),
      );
      return { type: "FeatureCollection", features: [...features.values()] };
    },
  };
}
