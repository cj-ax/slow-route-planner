import type { Map as MLMap, StyleSpecification } from "maplibre-gl";
import { dataUrl } from "../lib/scout";
import { BASE_LAYERS, OVERLAYS, type BaseLayerId, type OverlayId } from "../config";
import { AGENCIES, type AgencyKey } from "../lib/land";
import { GOV_TYPES, GOVLAND_MIN_ZOOM } from "../lib/parcels";

export const LAND_SOURCE = "land";
export const PARKING_SOURCE = "parking";
export const LOGS_SOURCE = "logs";
export const AREA_SOURCE = "study-area";
export const PARCELS_SOURCE = "parcels";
export const GOVLAND_SOURCE = "govland";

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
  sources[PARCELS_SOURCE] = { type: "geojson", data: empty, tolerance: 0.3 };
  sources[GOVLAND_SOURCE] = { type: "geojson", data: empty, tolerance: 0.4 };
  sources[LOGS_SOURCE] = { type: "geojson", data: empty };

  const govColor = ["match", ["get", "govt_own"], ...Object.entries(GOV_TYPES).flatMap(([k, v]) => [k, v.color]), "#888"];
  layers.push(
    {
      id: "govland-fill",
      type: "fill",
      source: GOVLAND_SOURCE,
      minzoom: GOVLAND_MIN_ZOOM,
      layout: { visibility: "none" },
      paint: { "fill-color": govColor as never, "fill-opacity": 0.18 },
    },
    {
      id: "govland-line",
      type: "line",
      source: GOVLAND_SOURCE,
      minzoom: GOVLAND_MIN_ZOOM,
      layout: { visibility: "none" },
      paint: { "line-color": govColor as never, "line-width": 1.5, "line-dasharray": [2, 1] },
    },
    {
      id: "parcels",
      type: "line",
      source: PARCELS_SOURCE,
      minzoom: 14,
      layout: { visibility: "none" },
      paint: { "line-color": "#3d3d3d", "line-width": 1, "line-opacity": 0.75, "line-dasharray": [3, 2] },
    },
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
        "line-width": [
          "interpolate", ["linear"], ["zoom"],
          7, ["case", ["boolean", ["feature-state", "selected"], false], 3, 0.6],
          13, ["case", ["boolean", ["feature-state", "selected"], false], 4, 2],
        ],
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

// ---------- pipeline layers (added at runtime when data/meta.json exists) ----------


export const CANDIDATES_SOURCE = "candidates";
export const SEASONS_LIST = ["early", "rut", "late"] as const;

export function addScoutLayers(map: MLMap, zoom: { min: number; max: number }): void {
  if (map.getSource("heat-rut")) return;
  for (const s of SEASONS_LIST) {
    map.addSource(`heat-${s}`, {
      type: "raster",
      url: `pmtiles://${dataUrl(`heat-${s}.pmtiles`)}`,
      tileSize: 256,
      minzoom: zoom.min,
      maxzoom: zoom.max,
    });
    map.addLayer(
      {
        id: `heat-${s}`,
        type: "raster",
        source: `heat-${s}`,
        layout: { visibility: "none" },
        paint: { "raster-opacity": 0.75, "raster-resampling": "nearest", "raster-fade-duration": 0 },
      },
      "land-line",
    );
  }
  map.addSource("corridors", {
    type: "raster",
    url: `pmtiles://${dataUrl("corridors.pmtiles")}`,
    tileSize: 256,
    minzoom: zoom.min,
    maxzoom: zoom.max,
  });
  map.addLayer(
    { id: "corridors", type: "raster", source: "corridors", layout: { visibility: "none" }, paint: { "raster-opacity": 0.8 } },
    "land-line",
  );
  map.addSource(CANDIDATES_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer(
    {
      id: "cand-bedding",
      type: "circle",
      source: CANDIDATES_SOURCE,
      minzoom: 11,
      filter: ["==", ["get", "kind"], "bedding"],
      paint: { "circle-radius": 8, "circle-color": "#8d5524", "circle-opacity": 0.85, "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 },
    },
    "logs",
  );
  map.addLayer(
    {
      id: "cand-funnel",
      type: "circle",
      source: CANDIDATES_SOURCE,
      minzoom: 11,
      filter: ["==", ["get", "kind"], "funnel"],
      paint: { "circle-radius": 7, "circle-color": "#7a1ea0", "circle-stroke-color": "#fff", "circle-stroke-width": 1.5 },
    },
    "logs",
  );
  map.addLayer(
    {
      id: "cand-stand",
      type: "circle",
      source: CANDIDATES_SOURCE,
      minzoom: 10,
      filter: ["==", ["get", "kind"], "stand"],
      paint: {
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 4, 15, 9],
        "circle-color": ["match", ["get", "fit"], "good", "#2f9e44", "ok", "#f59f00", "bad", "#e03131", "#ff922b"],
        "circle-stroke-color": "#111",
        "circle-stroke-width": 2,
      },
    },
    "logs",
  );
  map.addLayer(
    {
      id: "cand-label",
      type: "symbol",
      source: CANDIDATES_SOURCE,
      minzoom: 13,
      layout: {
        "text-field": ["match", ["get", "kind"], "stand", "Stand", "bedding", "Bed", "funnel", "Funnel", ""],
        "text-font": FONT,
        "text-size": 11,
        "text-offset": [0, 1.2],
        "text-anchor": "top",
      },
      paint: { "text-color": "#111", "text-halo-color": "#fff", "text-halo-width": 1.5 },
    },
    "logs",
  );
}
