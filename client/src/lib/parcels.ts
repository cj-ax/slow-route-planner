// Parcel outlines for context around public land. Loaded by viewport in
// zoom-14 tile chunks from MnGeo's open parcel service. Only geometry is
// requested: no owner names, addresses or values ever reach the app.
// Outlines are not survey-grade and never imply permission to hunt or cross.

import { SERVICES } from "../config";
import { lonLatToTile, type BBox } from "./geo";

export const PARCEL_MIN_ZOOM = 14;
const CHUNK_Z = 14;
const MAX_CHUNKS_PER_VIEW = 16;
const MAX_FEATURES = 25000;

export function tileToBBox(z: number, x: number, y: number): BBox {
  const n = 2 ** z;
  const lon = (xx: number) => (xx / n) * 360 - 180;
  const lat = (yy: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * yy) / n))) * 180) / Math.PI;
  return [lon(x), lat(y + 1), lon(x + 1), lat(y)];
}

/** z14 chunk keys covering a view bbox, or [] when the view is too big. */
export function chunksForView(view: BBox): string[] {
  const [x0, y0] = lonLatToTile(view[0], view[3], CHUNK_Z);
  const [x1, y1] = lonLatToTile(view[2], view[1], CHUNK_Z);
  const keys: string[] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) keys.push(`${x}/${y}`);
  return keys.length > MAX_CHUNKS_PER_VIEW ? [] : keys;
}

const loaded = new Set<string>();
const inflight = new Map<string, Promise<void>>();
const features = new Map<number, GeoJSON.Feature>();

async function loadChunk(key: string): Promise<void> {
  const [x, y] = key.split("/").map(Number);
  const [w, s, e, n] = tileToBBox(CHUNK_Z, x, y);
  const q = new URLSearchParams({
    where: "1=1",
    geometry: `${w},${s},${e},${n}`,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    outSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "objectid",
    returnGeometry: "true",
    geometryPrecision: "6",
    maxAllowableOffset: "0.00002",
    resultRecordCount: "2000",
    f: "geojson",
  });
  const res = await fetch(`${SERVICES.mnParcels}/query?${q}`);
  if (!res.ok) throw new Error(`parcels HTTP ${res.status}`);
  const fc = (await res.json()) as GeoJSON.FeatureCollection;
  for (const f of fc.features ?? []) {
    const id = Number(f.properties?.objectid);
    if (Number.isFinite(id)) features.set(id, { type: "Feature", geometry: f.geometry, properties: {} });
  }
  if (features.size > MAX_FEATURES) {
    // Drop the oldest entries; Map iterates in insertion order.
    const extra = features.size - MAX_FEATURES;
    let i = 0;
    for (const k of features.keys()) {
      if (i++ >= extra) break;
      features.delete(k);
    }
    loaded.clear();
  }
  loaded.add(key);
}

/** Ensure parcels for the view are loaded; resolves to the current collection. */
export async function parcelsForView(view: BBox): Promise<GeoJSON.FeatureCollection> {
  const keys = chunksForView(view).filter((k) => !loaded.has(k));
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
}
