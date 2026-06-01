import type { StyleSpecification } from "maplibre-gl";

const STYLE_URL = (import.meta.env.VITE_MAP_STYLE_URL ?? "").trim();

/** Whether a custom (e.g. MapTiler) vector style URL is configured. */
export const mapStyleConfigured = Boolean(STYLE_URL);

// Keyless dark raster fallback using CARTO's dark basemap. Gives a usable
// "cockpit" dark map with no API key. For best quality set VITE_MAP_STYLE_URL
// to a MapTiler dark vector style.
const DARK_RASTER_FALLBACK: StyleSpecification = {
  version: 8,
  sources: {
    "carto-dark": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
        "https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors © CARTO",
    },
  },
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#0c1116" },
    },
    {
      id: "carto-dark",
      type: "raster",
      source: "carto-dark",
    },
  ],
};

export function getMapStyle(): string | StyleSpecification {
  return STYLE_URL || DARK_RASTER_FALLBACK;
}
