import { describe, expect, it } from "vitest";
import {
  circlePolygon,
  distanceToGeomsMi,
  haversineMi,
  pointInPolygon,
  polygonAreaAcres,
  tileBBox3857,
  tilesForBBox,
  tileUrl,
} from "../lib/geo";

const square = (x: number, y: number, d: number): GeoJSON.Polygon => ({
  type: "Polygon",
  coordinates: [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]],
});

describe("geo", () => {
  it("haversine: Victoria to Minneapolis is about 22 mi", () => {
    const d = haversineMi([-93.6619, 44.8597], [-93.265, 44.9778]);
    expect(d).toBeGreaterThan(19);
    expect(d).toBeLessThan(23);
  });

  it("area of a ~1 km square is about 247 acres", () => {
    const dLat = 1000 / 111195;
    const dLon = 1000 / (111195 * Math.cos((45 * Math.PI) / 180));
    const poly: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: [[[-93, 45], [-93 + dLon, 45], [-93 + dLon, 45 + dLat], [-93, 45 + dLat], [-93, 45]]],
    };
    expect(polygonAreaAcres(poly)).toBeGreaterThan(240);
    expect(polygonAreaAcres(poly)).toBeLessThan(255);
  });

  it("point in polygon with hole", () => {
    const p: GeoJSON.Polygon = {
      type: "Polygon",
      coordinates: [square(0, 0, 10).coordinates[0], square(4, 4, 2).coordinates[0]],
    };
    expect(pointInPolygon([1, 1], p)).toBe(true);
    expect(pointInPolygon([5, 5], p)).toBe(false);
    expect(pointInPolygon([11, 1], p)).toBe(false);
  });

  it("distance is zero inside, positive outside", () => {
    const g = [square(-93.7, 44.8, 0.1)];
    expect(distanceToGeomsMi([-93.65, 44.85], g)).toBe(0);
    expect(distanceToGeomsMi([-93.5, 44.85], g)).toBeGreaterThan(5);
  });

  it("circle radius is respected", () => {
    const c = circlePolygon([-93.66, 44.86], 75);
    for (const pt of c.coordinates[0].slice(0, 10)) expect(haversineMi([-93.66, 44.86], pt as [number, number])).toBeCloseTo(75, 0);
  });

  it("tile bbox matches MapLibre formatting", () => {
    // Same arithmetic as @mapbox/whoots-js getTileBBox used by MapLibre.
    expect(tileBBox3857(0, 0, 0)).toBe("-20037508.342789244,-20037508.342789244,20037508.342789244,20037508.342789244");
    expect(tileUrl("a/{z}/{y}/{x}", 3, 1, 2)).toBe("a/3/2/1");
    expect(tileUrl("b?bbox={bbox-epsg-3857}", 1, 0, 0)).toBe("b?bbox=-20037508.342789244,0,0,20037508.342789244");
  });

  it("tiles for bbox counts grow with zoom", () => {
    const b: [number, number, number, number] = [-93.7, 44.8, -93.6, 44.9];
    expect(tilesForBBox(b, 10, 10).length).toBeGreaterThanOrEqual(1);
    expect(tilesForBBox(b, 14, 14).length).toBeGreaterThan(tilesForBBox(b, 12, 12).length);
  });
});
