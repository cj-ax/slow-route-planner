import type { StyleSpecification } from "maplibre-gl";
import { BASE_LAYERS, OVERLAYS, type BaseLayerId, type OverlayId } from "../config";
import { AGENCIES, type AgencyKey } from "../lib/land";

export const LAND_SOURCE = "land";
export const PARKING_SOURCE = "parking";
export const LOGS_SOURCE = "logs";
export const AREA_SOURCE = "study-area";

const FONT = ["Open Sans Semibold"];

const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

export function agencyColorExpr(): unknown[] {
  const expr: unknown[] = ["match", ["get", "agency"]];
  for (const [k, v] of Object.entries(AGENCIES)) expr.push(k, v.color);
  expr.push("#888");
  return expr;
}

export function agencyFilter(on: Record<AgencyKey, boolean>): unknown[] {
  const keys = (Object.keys(on) as AgencyKey[]).filter((k) => on[k]);
  return ["in", ["get", "agency"], ["literal", keys]];
}

/** Initial style: every base/overlay raster is present but hidden until toggled. */
export function buildStyle(base: BaseLayerId, studyArea: GeoJSON.Polygon): StyleSpecification {
  const sources: StyleSpecification["sources"] = {};
  const layers: StyleSpecification["layers"] = [
    { id: "bg", type: "background", paint: { "background-color": "#dfe3d7" } },
  ];
  for (const def of Object.values(BASE_LAYERS)) {
    sources[`base-${def.id}`] = {
      type: "raster",
      tiles: def.tiles,
      tileSize: def.tileSize,
      maxzoom: def.maxzoom,
      attribution: def.attribution,
    };
    layers.push({
      id: `base-${def.id}`,
      type: "raster",
      source: `base-${def.id}`,
      layout: { visibility: def.id === base ? "visible" : "none" },
    });
  }
  for (const def of Object.values(OVERLAYS)) {
    sources[`ov-${def.id}`] = {
      type: "raster",
      tiles: def.tiles,
      tileSize: def.tileSize,
      maxzoom: def.maxzoom,
      attribution: def.attribution,
    };
    layers.push({
      id: `ov-${def.id}`,
      type: "raster",
      source: `ov-${def.id}`,
      layout: { visibility: "none" },
      paint: { "raster-opacity": def.defaultOpacity, "raster-fade-duration": 0 },
    });
  }
  sources[AREA_SOURCE] = { type: "geojson", data: { type: "Feature", geometry: studyArea, properties: {} } };
  sources[LAND_SOURCE] = { type: "geojson", data: empty, promoteId: "pid", tolerance: 0.5 };
  sources[PARKING_SOURCE] = { type: "geojson", data: empty };
  sources[LOGS_SOURCE] = { type: "geojson", data: empty };

  layers.push(
    {
      id: "study-area",
      type: "line",
      source: AREA_SOURCE,
      paint: { "line-color": "#c92a2a", "line-width": 1.5, "line-dasharray": [4, 3], "line-opacity": 0.7 },
    },
    {
      id: "land-fill",
      type: "fill",
      source: LAND_SOURCE,
      paint: {
        "fill-color": agencyColorExpr() as never,
        "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.45, 0.22],
      },
    },
    {
      id: "land-line",
      type: "line",
      source: LAND_SOURCE,
      paint: {
        "line-color": agencyColorExpr() as never,
        "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 3.5, ["interpolate", ["linear"], ["zoom"], 7, 0.6, 13, 2]],
      },
    },
    {
      id: "land-label",
      type: "symbol",
      source: LAND_SOURCE,
      minzoom: 11,
      layout: {
        "text-field": ["get", "name"],
        "text-font": FONT,
        "text-size": 12,
        "symbol-placement": "point",
        "text-max-width": 10,
      },
      paint: { "text-color": "#1b2a1b", "text-halo-color": "#fff", "text-halo-width": 1.5 },
    },
    {
      id: "parking",
      type: "circle",
      source: PARKING_SOURCE,
      minzoom: 10,
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 3, 15, 7],
        "circle-color": "#1864ab",
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 1.5,
      },
    },
    {
      id: "parking-label",
      type: "symbol",
      source: PARKING_SOURCE,
      minzoom: 13,
      layout: { "text-field": "P", "text-font": FONT, "text-size": 10, "text-allow-overlap": true },
      paint: { "text-color": "#fff" },
    },
    {
      id: "logs",
      type: "circle",
      source: LOGS_SOURCE,
      paint: {
        "circle-radius": 7,
        "circle-color": [
          "match",
          ["get", "group"],
          "sign", "#e8590c",
          "sighting", "#d6336c",
          "context", "#495057",
          "#f59f00",
        ],
        "circle-stroke-color": "#fff",
        "circle-stroke-width": 2,
      },
    },
    {
      id: "logs-label",
      type: "symbol",
      source: LOGS_SOURCE,
      minzoom: 14,
      layout: { "text-field": ["get", "label"], "text-font": FONT, "text-size": 11, "text-offset": [0, 1.3], "text-anchor": "top" },
      paint: { "text-color": "#000", "text-halo-color": "#fff", "text-halo-width": 1.5 },
    },
  );

  return {
    version: 8,
    // Self-hosted Latin glyphs (public/fonts) so labels work offline.
    glyphs: document.baseURI.replace(/[^/]*$/, "") + "fonts/{fontstack}/{range}.pbf",
    sources,
    layers,
  };
}

export type { OverlayId };
