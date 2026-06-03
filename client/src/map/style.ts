import type { StyleSpecification } from "maplibre-gl";

const STYLE_URL = (import.meta.env.VITE_MAP_STYLE_URL ?? "").trim();

/** Whether a custom (e.g. MapTiler) vector style URL is configured. */
export const mapStyleConfigured = Boolean(STYLE_URL);

function prefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/**
 * Keyless CARTO raster fallback. Positron (light) reads beautifully with the
 * cream/green/amber palette; dark-matter is used when the OS is in dark mode.
 * Set VITE_MAP_STYLE_URL to a MapTiler vector style for best quality.
 */
function rasterFallback(dark: boolean): StyleSpecification {
  const set = dark ? "dark_all" : "light_all";
  const bg = dark ? "#10140f" : "#f4efe2";
  return {
    version: 8,
    sources: {
      carto: {
        type: "raster",
        tiles: [
          `https://a.basemaps.cartocdn.com/${set}/{z}/{x}/{y}.png`,
          `https://b.basemaps.cartocdn.com/${set}/{z}/{x}/{y}.png`,
          `https://c.basemaps.cartocdn.com/${set}/{z}/{x}/{y}.png`,
          `https://d.basemaps.cartocdn.com/${set}/{z}/{x}/{y}.png`,
        ],
        tileSize: 256,
        attribution: "© OpenStreetMap contributors © CARTO",
      },
    },
    layers: [
      { id: "background", type: "background", paint: { "background-color": bg } },
      { id: "carto", type: "raster", source: "carto" },
    ],
  };
}

export function getMapStyle(): string | StyleSpecification {
  return STYLE_URL || rasterFallback(prefersDark());
}
