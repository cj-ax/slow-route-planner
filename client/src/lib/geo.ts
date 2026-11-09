// Small geometry helpers. Kept dependency-free so they are cheap to test.

export type LonLat = [number, number];
export type BBox = [number, number, number, number]; // west, south, east, north

const R_MI = 3958.7613;
const R_M = 6371008.8;

const rad = (d: number) => (d * Math.PI) / 180;

export function haversineMi(a: LonLat, b: LonLat): number {
  return (haversineM(a, b) / R_M) * R_MI;
}

export function haversineM(a: LonLat, b: LonLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Iterate every [lon,lat] in Polygon / MultiPolygon coordinates. */
export function* coordsOf(geom: GeoJSON.Geometry): Generator<LonLat> {
  if (geom.type === "Point") yield geom.coordinates as LonLat;
  else if (geom.type === "Polygon") for (const r of geom.coordinates) yield* r as LonLat[];
  else if (geom.type === "MultiPolygon")
    for (const p of geom.coordinates) for (const r of p) yield* r as LonLat[];
  else if (geom.type === "LineString") yield* geom.coordinates as LonLat[];
  else if (geom.type === "MultiLineString") for (const l of geom.coordinates) yield* l as LonLat[];
}

export function bboxOf(geoms: GeoJSON.Geometry[]): BBox {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const g of geoms)
    for (const [x, y] of coordsOf(g)) {
      if (x < w) w = x;
      if (x > e) e = x;
      if (y < s) s = y;
      if (y > n) n = y;
    }
  return [w, s, e, n];
}

/** Planar ring area in m² using a local equirectangular projection (fine at property scale). */
function ringAreaM2(ring: LonLat[], lat0: number): number {
  const kx = rad(1) * R_M * Math.cos(rad(lat0));
  const ky = rad(1) * R_M;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j][0] * kx * (ring[i][1] * ky) - ring[i][0] * kx * (ring[j][1] * ky);
  }
  return Math.abs(a) / 2;
}

export function polygonAreaAcres(geom: GeoJSON.Polygon | GeoJSON.MultiPolygon): number {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  let m2 = 0;
  for (const p of polys) {
    if (!p.length) continue;
    const lat0 = p[0][0]?.[1] ?? 45;
    m2 += ringAreaM2(p[0] as LonLat[], lat0);
    for (const hole of p.slice(1)) m2 -= ringAreaM2(hole as LonLat[], lat0);
  }
  return m2 / 4046.8564224;
}

/** Ray-casting point-in-polygon (handles holes and multipolygons). */
export function pointInPolygon(pt: LonLat, geom: GeoJSON.Polygon | GeoJSON.MultiPolygon): boolean {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys) {
    let inside = false;
    for (const ring of poly) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi)
          inside = !inside;
      }
    }
    if (inside) return true;
  }
  return false;
}

/** Shortest distance (miles) from a point to any vertex of the geometries; 0 if inside. */
export function distanceToGeomsMi(pt: LonLat, geoms: GeoJSON.Geometry[]): number {
  let best = Infinity;
  for (const g of geoms) {
    if ((g.type === "Polygon" || g.type === "MultiPolygon") && pointInPolygon(pt, g)) return 0;
    for (const c of coordsOf(g)) {
      const d = haversineMi(pt, c);
      if (d < best) best = d;
    }
  }
  return best;
}

/** A closed ring approximating a circle on the ground (for the study-area outline). */
export function circlePolygon(center: LonLat, radiusMi: number, steps = 128): GeoJSON.Polygon {
  const ring: LonLat[] = [];
  const d = radiusMi / R_MI;
  const lat1 = rad(center[1]);
  const lon1 = rad(center[0]);
  for (let i = 0; i <= steps; i++) {
    const brg = (2 * Math.PI * i) / steps;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brg));
    const lon2 =
      lon1 + Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    ring.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
  }
  return { type: "Polygon", coordinates: [ring] };
}

// ---- Web Mercator tile math (used for offline tile prefetch) ----

export function lonLatToTile(lon: number, lat: number, z: number): [number, number] {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latR = rad(lat);
  const y = Math.floor(((1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2) * n);
  return [Math.min(n - 1, Math.max(0, x)), Math.min(n - 1, Math.max(0, y))];
}

export function tilesForBBox(bbox: BBox, zmin: number, zmax: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let z = zmin; z <= zmax; z++) {
    const [x0, y0] = lonLatToTile(bbox[0], bbox[3], z);
    const [x1, y1] = lonLatToTile(bbox[2], bbox[1], z);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([z, x, y]);
  }
  return out;
}

/**
 * EPSG:3857 bbox string for a tile, formatted exactly the way MapLibre formats
 * `{bbox-epsg-3857}` (copied from @mapbox/whoots-js) so cached URLs match.
 */
export function tileBBox3857(x: number, y: number, z: number): string {
  const yy = 2 ** z - y - 1;
  const merc = (px: number, py: number) => {
    const res = (2 * Math.PI * 6378137) / 256 / 2 ** z;
    return [px * res - (2 * Math.PI * 6378137) / 2.0, py * res - (2 * Math.PI * 6378137) / 2.0];
  };
  const min = merc(x * 256, yy * 256);
  const max = merc((x + 1) * 256, (yy + 1) * 256);
  return min[0] + "," + min[1] + "," + max[0] + "," + max[1];
}

export function tileUrl(template: string, z: number, x: number, y: number): string {
  return template
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y))
    .replace("{bbox-epsg-3857}", tileBBox3857(x, y, z));
}

export function formatMi(mi: number): string {
  if (!Number.isFinite(mi)) return "n/a";
  return mi < 10 ? `${mi.toFixed(1)} mi` : `${Math.round(mi)} mi`;
}
