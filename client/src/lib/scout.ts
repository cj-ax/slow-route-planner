// Pipeline outputs (published under ./data/ by the deploy workflow). Every
// loader degrades to "no data" so the app keeps working before the pipeline
// has ever run.

import { PMTiles } from "pmtiles";
import type { Season } from "./logs";
import type { WindDir } from "./wind";

export const FACTOR_KEYS = ["food", "cover", "edge", "corridor", "pressure", "terrain"] as const;
export type FactorKey = (typeof FACTOR_KEYS)[number];

export interface SeasonMeta {
  label: string;
  weights: Record<FactorKey, number>;
  thermalMix: number;
}

export interface ScoutMeta {
  generated: string;
  zoom: { min: number; max: number };
  seasons: Record<Season, SeasonMeta>;
  stretch: Record<Season, [number, number]>;
  counts: { properties: number; z13Tiles: number; candidates: number };
  groundResolutionM: number;
}

export interface Ranking {
  id: string;
  name: string;
  scores: Record<Season, number>;
  reasons: Record<Season, string[]>;
  walkMin: number | null;
  walkMedianMin: number | null;
  hasParking: boolean;
  sources?: { cdl?: string; osm?: boolean };
}

export interface WindInfo {
  approachFrom: WindDir | null;
  goodWinds: WindDir[];
  okWinds: WindDir[];
  badWinds: WindDir[];
}

export interface CandidateProps {
  kind: "stand" | "bedding" | "funnel";
  season?: Season;
  score: number;
  reasons: string[];
  wind?: WindInfo;
  entry?: { fromDir: WindDir; walkMin: number | null; crossesDeerSide: boolean } | null;
  pid: string;
  pname: string;
}

export const dataUrl = (file: string) => new URL(`data/${file}`, document.baseURI).toString();

async function getJson<T>(file: string): Promise<T | null> {
  try {
    const r = await fetch(dataUrl(file), { cache: "no-cache" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export const loadMeta = () => getJson<ScoutMeta>("meta.json");
export const loadRankings = async () =>
  new Map((await getJson<{ properties: Ranking[] }>("rankings.json"))?.properties.map((r) => [r.id, r]) ?? []);
export const loadCandidates = () => getJson<GeoJSON.FeatureCollection<GeoJSON.Point, CandidateProps>>("candidates.geojson");

// ---------- wind ----------

export type WindFit = "good" | "ok" | "bad" | "unknown";

export function windFit(w: WindInfo | undefined, wind: WindDir | ""): WindFit {
  if (!w || !wind || !w.approachFrom) return "unknown";
  if (w.goodWinds.includes(wind)) return "good";
  if (w.okWinds.includes(wind)) return "ok";
  return "bad";
}

export function windMessage(p: CandidateProps, wind: WindDir | ""): string {
  const w = p.wind;
  if (!w?.approachFrom) return "Deer approach direction unclear here. Play the wind by feel.";
  const base = `Deer most likely approach from the ${w.approachFrom}. Best sit winds: ${w.goodWinds.join(", ")}.`;
  const fit = windFit(w, wind);
  if (fit === "bad") return `Bad wind: a ${wind} wind carries your scent toward the ${w.approachFrom} side. ${base}`;
  if (fit === "ok") return `Marginal ${wind} crosswind. ${base}`;
  if (fit === "good") return `Good: a ${wind} wind keeps your scent off the approach. ${base}`;
  return base;
}

// ---------- per-pixel factor lookup (tap for breakdown) ----------

let factorArchive: PMTiles | null = null;
const tileCache = new Map<string, ImageData | null>();

function lonLatToPixel(lon: number, lat: number, z: number): { x: number; y: number; px: number; py: number } {
  const n = 2 ** z;
  const fx = ((lon + 180) / 360) * n;
  const latR = (lat * Math.PI) / 180;
  const fy = ((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n;
  const x = Math.floor(fx);
  const y = Math.floor(fy);
  return { x, y, px: Math.floor((fx - x) * 256), py: Math.floor((fy - y) * 256) };
}

async function factorTile(z: number, x: number, y: number): Promise<ImageData | null> {
  const key = `${z}/${x}/${y}`;
  if (tileCache.has(key)) return tileCache.get(key)!;
  factorArchive ??= new PMTiles(dataUrl("factors.pmtiles"));
  let img: ImageData | null = null;
  try {
    const t = await factorArchive.getZxy(z, x, y);
    if (t?.data) {
      const bmp = await createImageBitmap(new Blob([t.data], { type: "image/png" }), {
        premultiplyAlpha: "none",
        colorSpaceConversion: "none",
      });
      const canvas = document.createElement("canvas");
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(bmp, 0, 0);
      img = ctx.getImageData(0, 0, bmp.width, bmp.height);
    }
  } catch {
    img = null;
  }
  tileCache.set(key, img);
  return img;
}

export interface PointBreakdown {
  factors: Record<FactorKey, number>;
  thermal: number;
  accessMinutes: number | null;
  inProperty: boolean;
  inBuffer: boolean;
}

/** Decode the factor tile pixel at a location. Layout: three 256-row RGB blocks. */
export function decodeFactorPixel(img: ImageData, px: number, py: number): PointBreakdown | null {
  const at = (block: number) => {
    const i = ((block * 256 + py) * img.width + px) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2]];
  };
  const [food, cover, edge] = at(0);
  const [corridor, pressure, terrain] = at(1);
  const [thermal, access, mask] = at(2);
  if (mask === 0) return null;
  const n = (v: number) => v / 255;
  return {
    factors: { food: n(food), cover: n(cover), edge: n(edge), corridor: n(corridor), pressure: n(pressure), terrain: n(terrain) },
    thermal: n(thermal),
    accessMinutes: access >= 255 ? null : access,
    inProperty: mask === 255,
    inBuffer: mask >= 128,
  };
}

export async function breakdownAt(lon: number, lat: number, z: number): Promise<PointBreakdown | null> {
  const { x, y, px, py } = lonLatToPixel(lon, lat, z);
  const img = await factorTile(z, x, y);
  return img ? decodeFactorPixel(img, px, py) : null;
}

/** Same formula as pipeline factors.season_score. */
export function seasonScore(b: PointBreakdown, s: SeasonMeta): { total: number; parts: { key: FactorKey; value: number; weight: number; contrib: number }[] } {
  const wsum = FACTOR_KEYS.reduce((a, k) => a + s.weights[k], 0);
  const parts = FACTOR_KEYS.map((key) => {
    let value = b.factors[key];
    if (key === "cover" && s.thermalMix) value = (1 - s.thermalMix) * value + s.thermalMix * b.thermal;
    const weight = s.weights[key] / wsum;
    return { key, value, weight, contrib: weight * value };
  });
  return { total: parts.reduce((a, p) => a + p.contrib, 0), parts };
}

export const FACTOR_LABELS: Record<FactorKey, string> = {
  food: "Food (crops, mast)",
  cover: "Bedding cover",
  edge: "Edge",
  corridor: "Travel corridor / funnel",
  pressure: "Low hunting pressure",
  terrain: "Terrain",
};
