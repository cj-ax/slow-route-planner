// Export the exact property set the app builds (same ids, same filters) so the
// pipeline and the app agree. Run from repo root:
//   npx vite-node pipeline/export_properties.ts -- out/properties.geojson
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fetchLandData } from "../client/src/lib/land";

const out = process.argv[process.argv.length - 1].endsWith(".geojson")
  ? process.argv[process.argv.length - 1]
  : "pipeline/work/properties.geojson";

const d = await fetchLandData();
if (d.warnings.length) console.warn("warnings:", d.warnings);
const geoms = new Map<string, GeoJSON.Position[][][]>();
for (const f of d.polygons.features) {
  const pid = f.properties?.pid as string;
  const g = f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  geoms.set(pid, [...(geoms.get(pid) ?? []), ...polys]);
}
const fc: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: d.properties.map((p) => ({
    type: "Feature",
    geometry: { type: "MultiPolygon", coordinates: geoms.get(p.id) ?? [] },
    properties: { ...p, bbox: undefined },
  })),
};
const parking: GeoJSON.FeatureCollection = d.parking;
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(fc));
writeFileSync(out.replace("properties.geojson", "dnr_parking.geojson"), JSON.stringify(parking));
console.log(`wrote ${fc.features.length} properties to ${out}`);
