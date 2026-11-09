// Public land: fetched in the browser from PAD-US and MN DNR ArcGIS services,
// filtered server-side to the 75-mile study circle, normalized into
// "properties" (one per named unit) and cached in IndexedDB.

import { RADIUS_MI, SERVICES, VICTORIA, LAND_CACHE_MAX_AGE_MS } from "../config";
import { kvGet, kvSet } from "./db";
import {
  bboxOf,
  distanceToGeomsMi,
  haversineMi,
  polygonAreaAcres,
  type BBox,
  type LonLat,
} from "./geo";

export type AgencyKey =
  | "wma"
  | "ama"
  | "state_forest"
  | "refuge"
  | "wpa"
  | "sna"
  | "state_park"
  | "county"
  | "regional"
  | "federal_other"
  | "state_other";

export const AGENCIES: Record<AgencyKey, { label: string; color: string; defaultOn: boolean }> = {
  wma: { label: "Wildlife Mgmt Area (WMA)", color: "#2f9e44", defaultOn: true },
  wpa: { label: "Waterfowl Production Area", color: "#1c7ed6", defaultOn: true },
  refuge: { label: "National Wildlife Refuge", color: "#0b7285", defaultOn: true },
  state_forest: { label: "State Forest", color: "#5c940d", defaultOn: true },
  ama: { label: "Aquatic Mgmt Area", color: "#3bc9db", defaultOn: true },
  county: { label: "County land", color: "#e67700", defaultOn: true },
  sna: { label: "Scientific & Natural Area", color: "#9c36b5", defaultOn: false },
  state_park: { label: "State Park (special hunts)", color: "#c2255c", defaultOn: false },
  regional: { label: "Regional park reserve", color: "#868e96", defaultOn: false },
  federal_other: { label: "Other federal", color: "#5f3dc4", defaultOn: true },
  state_other: { label: "Other state land", color: "#a9e34b", defaultOn: false },
};

export type HuntingStatus = "listed" | "unknown";

export interface Property {
  id: string;
  name: string;
  agency: AgencyKey;
  manager: string;
  designation: string;
  state: string;
  access: "open" | "restricted" | "unknown";
  /** "listed" only when the source explicitly lists deer hunting (DNR WMA deer flag). */
  hunting: HuntingStatus;
  huntingNote: string;
  acres: number;
  bbox: BBox;
  /** Nearest point of the property boundary to Victoria, straight line. */
  distMi: number;
  /** Straight-line miles from the property boundary to the nearest known DNR parking lot. */
  parkingMi: number | null;
  parkingCount: number;
  source: string;
  sourceUrl?: string;
}

export interface LandData {
  fetchedAt: number;
  properties: Property[];
  /** Polygons with `pid` + `agency` properties (for map styling). */
  polygons: GeoJSON.FeatureCollection;
  parking: GeoJSON.FeatureCollection<GeoJSON.Point>;
  warnings: string[];
}

// ---------------- classification (pure, tested) ----------------

export interface PadAttrs {
  Unit_Nm?: string | null;
  MngNm_Desc?: string | null;
  DesTp_Desc?: string | null;
  Pub_Access?: string | null;
  ST_Name?: string | null;
  Category?: string | null;
}

const EXCLUDED_MANAGERS = new Set([
  "City Land",
  "Private",
  "Non-Governmental Organization",
  "Other or Unknown Local Government",
  "Unknown",
]);
const EXCLUDED_DESIG = new Set([
  "Local Park",
  "Local Recreation Area",
  "Local Historic or Cultural Area",
  "Historic or Cultural Area",
  "Private Park",
  "Private Other or Unknown",
  "Private Conservation",
]);

/** Map a PAD-US record to an agency class, or null when it should be dropped. */
export function classifyPadus(a: PadAttrs): AgencyKey | null {
  const name = (a.Unit_Nm ?? "").toLowerCase();
  const mgr = a.MngNm_Desc ?? "";
  const des = a.DesTp_Desc ?? "";
  if (a.Category && a.Category !== "Fee") return null;
  if (a.Pub_Access === "XA") return null;
  if (EXCLUDED_MANAGERS.has(mgr) || EXCLUDED_DESIG.has(des)) return null;
  if (/district office|boat landing|water access|public access|fairground/.test(name)) return null;
  if (/^(miscellaneous|scattered|unnamed|natural area)\b/.test(name)) return null;
  if (/aquatic management area/.test(name)) return "ama";
  if (/waterfowl production area/.test(name)) return "wpa";
  if (des === "National Wildlife Refuge" || /national wildlife refuge/.test(name)) return "refuge";
  if (/state forest/.test(name)) return "state_forest";
  if (/wildlife management area|wildlife area|public hunting ground/.test(name)) return "wma";
  if (/scientific and natural area|state natural area/.test(name)) return "sna";
  if (des === "State Park" || mgr === "State Park and Recreation") return "state_park";
  if (mgr === "County Land") return "county";
  if (mgr === "Regional Agency Land") return "regional";
  if (
    mgr.startsWith("U.S.") ||
    ["National Park Service", "Army Corps of Engineers", "Bureau of Land Management", "Other or Unknown Federal Land", "Department of Defense", "Natural Resources Conservation Service"].includes(mgr)
  )
    return mgr === "U.S. Fish and Wildlife Service" ? "refuge" : "federal_other";
  if (mgr === "State Fish and Wildlife") return "wma";
  if (mgr.startsWith("State") || mgr === "Other or Unknown State Land" || mgr === "Joint") return "state_other";
  return null;
}

/**
 * Approximate MN/WI border (St. Croix then Mississippi rivers) as lat -> lon
 * breakpoints. Good to a mile or two, which is enough to label the state and
 * warn that Wisconsin land needs a Wisconsin license. Not a legal boundary.
 */
const BORDER: [number, number][] = [
  [43.5, -91.22], [44.05, -91.64], [44.38, -92.03], [44.45, -92.27], [44.57, -92.53],
  [44.75, -92.8], [45.06, -92.8], [45.4, -92.65], [45.73, -92.88], [46.0, -92.29],
];

export function stateFor([lon, lat]: LonLat): "MN" | "WI" {
  if (lat <= BORDER[0][0]) return lon > BORDER[0][1] ? "WI" : "MN";
  for (let i = 1; i < BORDER.length; i++) {
    const [la0, lo0] = BORDER[i - 1];
    const [la1, lo1] = BORDER[i];
    if (lat <= la1) {
      const t = (lat - la0) / (la1 - la0);
      return lon > lo0 + t * (lo1 - lo0) ? "WI" : "MN";
    }
  }
  return lon > BORDER[BORDER.length - 1][1] ? "WI" : "MN";
}

function firstCoord(g: GeoJSON.Polygon | GeoJSON.MultiPolygon): LonLat | null {
  const c = g.type === "Polygon" ? g.coordinates[0]?.[0] : g.coordinates[0]?.[0]?.[0];
  return c ? (c as LonLat) : null;
}

const ACCESS: Record<string, Property["access"]> = { OA: "open", RA: "restricted" };

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bWma\b/g, "WMA")
    .replace(/\bWpa\b/g, "WPA")
    .replace(/\bAma\b/g, "AMA");
}

// ---------------- fetching ----------------

const circleQuery = () =>
  new URLSearchParams({
    geometry: `${VICTORIA[0]},${VICTORIA[1]}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    distance: String(RADIUS_MI),
    units: "esriSRUnit_StatuteMile",
    outSR: "4326",
  });

async function queryAll(
  layerUrl: string,
  where: string,
  outFields: string,
  opts: { simplifyDeg?: number; pageSize?: number; signal?: AbortSignal } = {},
): Promise<GeoJSON.Feature[]> {
  const pageSize = opts.pageSize ?? 1000;
  const out: GeoJSON.Feature[] = [];
  for (let offset = 0; offset < 50000; offset += pageSize) {
    const q = circleQuery();
    q.set("where", where);
    q.set("outFields", outFields);
    q.set("returnGeometry", "true");
    q.set("geometryPrecision", "5");
    if (opts.simplifyDeg) q.set("maxAllowableOffset", String(opts.simplifyDeg));
    q.set("resultOffset", String(offset));
    q.set("resultRecordCount", String(pageSize));
    q.set("f", "geojson");
    const res = await fetch(`${layerUrl}/query`, {
      method: "POST",
      body: q,
      signal: opts.signal,
    });
    if (!res.ok) throw new Error(`${layerUrl} HTTP ${res.status}`);
    const fc = (await res.json()) as GeoJSON.FeatureCollection & {
      error?: { message: string };
      properties?: { exceededTransferLimit?: boolean };
    };
    if (fc.error) throw new Error(`${layerUrl}: ${fc.error.message}`);
    out.push(...(fc.features ?? []));
    const more = fc.properties?.exceededTransferLimit || (fc.features?.length ?? 0) >= pageSize;
    if (!more) break;
  }
  return out;
}

const PAD_WHERE =
  "Category='Fee' AND Pub_Access IN ('OA','RA','UK') AND MngNm_Desc NOT IN ('City Land','Private','Non-Governmental Organization','Other or Unknown Local Government','Unknown') AND DesTp_Desc NOT IN ('Local Park','Local Recreation Area','Local Historic or Cultural Area','Private Park','Private Conservation')";

const isPoly = (g: GeoJSON.Geometry | null): g is GeoJSON.Polygon | GeoJSON.MultiPolygon =>
  !!g && (g.type === "Polygon" || g.type === "MultiPolygon");

interface Group {
  id: string;
  name: string;
  agency: AgencyKey;
  manager: string;
  designation: string;
  state: string;
  access: Property["access"];
  hunting: HuntingStatus;
  huntingNote: string;
  source: string;
  sourceUrl?: string;
  geoms: (GeoJSON.Polygon | GeoJSON.MultiPolygon)[];
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

/** Build properties from raw features. Exported for tests. */
export function buildLandData(
  pad: GeoJSON.Feature[],
  wma: GeoJSON.Feature[] | null,
  parkingRaw: GeoJSON.Feature[],
  warnings: string[] = [],
): LandData {
  const groups = new Map<string, Group>();
  const add = (key: string, init: () => Omit<Group, "geoms">, g: GeoJSON.Polygon | GeoJSON.MultiPolygon) => {
    let grp = groups.get(key);
    if (!grp) {
      grp = { ...init(), geoms: [] };
      groups.set(key, grp);
    }
    grp.geoms.push(g);
  };

  if (wma) {
    for (const f of wma) {
      if (!isPoly(f.geometry)) continue;
      const p = f.properties ?? {};
      const name = titleCase(String(p.unit_name || p.name || "Unnamed WMA"));
      const deer = p.deer === 1 || p.deer === "1" || p.deer === "Y";
      const id = `wma-${slug(name)}`;
      add(
        id,
        () => ({
          id,
          name: /wma$/i.test(name) ? name : `${name} WMA`,
          agency: "wma",
          manager: "MN DNR Fish & Wildlife",
          designation: "Wildlife Management Area",
          state: "MN",
          access: "open",
          hunting: deer ? "listed" : "unknown",
          huntingNote: deer
            ? "MN DNR lists deer as a hunting opportunity here. Check special restrictions and current regulations."
            : "Deer hunting not listed by source. Check MN DNR.",
          source: "MN DNR WMA boundaries (publicly accessible)",
          sourceUrl: "https://www.dnr.state.mn.us/wmas/index.html",
        }),
        f.geometry,
      );
    }
  }

  for (const f of pad) {
    if (!isPoly(f.geometry)) continue;
    const a = (f.properties ?? {}) as PadAttrs;
    const agency = classifyPadus(a);
    if (!agency) continue;
    // ST_Name is "Not Applicable" in this service, so infer from location.
    const first = firstCoord(f.geometry);
    const st = first ? stateFor(first) : "";
    // In Minnesota the DNR WMA layer is authoritative; skip PAD-US duplicates.
    if (wma && agency === "wma" && st === "MN") continue;
    const name = titleCase(a.Unit_Nm ?? "Unnamed");
    const id = `pad-${agency}-${slug(name)}`;
    add(
      id,
      () => ({
        id,
        name,
        agency,
        manager: a.MngNm_Desc ?? "",
        designation: a.DesTp_Desc ?? "",
        state: st,
        access: ACCESS[a.Pub_Access ?? ""] ?? "unknown",
        hunting: "unknown",
        huntingNote:
          st === "WI"
            ? "Wisconsin land: Wisconsin license and regulations apply. Hunting status unknown from source data."
            : "Hunting status unknown from source data. Verify with the managing agency.",
        source: "USGS PAD-US (Public Access)",
        sourceUrl: "https://www.usgs.gov/programs/gap-analysis-project/science/pad-us-data-overview",
      }),
      f.geometry,
    );
  }

  const parkingPts: LonLat[] = parkingRaw
    .filter((f) => f.geometry?.type === "Point")
    .map((f) => (f.geometry as GeoJSON.Point).coordinates as LonLat);

  const properties: Property[] = [];
  const polygons: GeoJSON.Feature[] = [];
  for (const g of groups.values()) {
    const acres = g.geoms.reduce((s, x) => s + polygonAreaAcres(x), 0);
    if (acres < 5) continue; // slivers and boat ramps
    const bbox = bboxOf(g.geoms);
    const distMi = distanceToGeomsMi(VICTORIA, g.geoms);
    if (distMi > RADIUS_MI) continue;
    // Parking lots within ~0.5 mi of the bbox; distance measured to the boundary.
    let parkingMi: number | null = null;
    let parkingCount = 0;
    for (const p of parkingPts) {
      if (p[0] < bbox[0] - 0.01 || p[0] > bbox[2] + 0.01 || p[1] < bbox[1] - 0.008 || p[1] > bbox[3] + 0.008) continue;
      const d = distanceToGeomsMi(p, g.geoms);
      if (d <= 0.5) {
        parkingCount++;
        parkingMi = parkingMi === null ? d : Math.min(parkingMi, d);
      }
    }
    const { geoms, ...rest } = g;
    properties.push({ ...rest, acres: Math.round(acres), bbox, distMi, parkingMi, parkingCount });
    for (const geom of geoms)
      polygons.push({ type: "Feature", geometry: geom, properties: { pid: g.id, agency: g.agency, name: g.name } });
  }
  properties.sort((a, b) => a.distMi - b.distMi);

  return {
    fetchedAt: Date.now(),
    properties,
    polygons: { type: "FeatureCollection", features: polygons },
    parking: {
      type: "FeatureCollection",
      features: parkingPts.map((c) => ({ type: "Feature", geometry: { type: "Point", coordinates: c }, properties: {} })),
    },
    warnings,
  };
}

export async function fetchLandData(signal?: AbortSignal): Promise<LandData> {
  const warnings: string[] = [];
  const [pad, wma, parking] = await Promise.all([
    queryAll(SERVICES.padus, PAD_WHERE, "Unit_Nm,MngNm_Desc,DesTp_Desc,Pub_Access,ST_Name,Category", {
      simplifyDeg: 0.00012,
      signal,
    }).catch((e) => {
      warnings.push(`PAD-US unavailable: ${e.message}`);
      return [] as GeoJSON.Feature[];
    }),
    queryAll(SERVICES.dnrWma, "1=1", "name,unit_name,deer,special_restrictions", {
      simplifyDeg: 0.00008,
      signal,
    }).catch((e) => {
      warnings.push(`MN DNR WMA layer unavailable: ${e.message}`);
      return null;
    }),
    queryAll(SERVICES.dnrWmaFacilities, "facility_subgroup='Parking Lot'", "name", { signal }).catch((e) => {
      warnings.push(`MN DNR WMA parking unavailable: ${e.message}`);
      return [] as GeoJSON.Feature[];
    }),
  ]);
  if (!pad.length && !wma) throw new Error(warnings.join("; ") || "No public land data");
  return buildLandData(pad, wma, parking, warnings);
}

const CACHE_KEY = "land-v1";

/**
 * Cached-first loader. Calls `onData` with cached data immediately (if any),
 * then refreshes from the network when the cache is missing or stale.
 */
export async function loadLandData(onData: (d: LandData, fromCache: boolean) => void): Promise<void> {
  let cached: LandData | undefined;
  try {
    cached = await kvGet<LandData>(CACHE_KEY);
  } catch {
    /* IndexedDB unavailable (private mode) */
  }
  if (cached) onData(cached, true);
  if (cached && Date.now() - cached.fetchedAt < LAND_CACHE_MAX_AGE_MS) return;
  try {
    const fresh = await fetchLandData();
    onData(fresh, false);
    kvSet(CACHE_KEY, fresh).catch(() => undefined);
  } catch (e) {
    if (!cached) throw e;
  }
}

export async function forceRefreshLand(): Promise<LandData> {
  const fresh = await fetchLandData();
  await kvSet(CACHE_KEY, fresh).catch(() => undefined);
  return fresh;
}

export { haversineMi };
