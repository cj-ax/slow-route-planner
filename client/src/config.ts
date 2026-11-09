// Central configuration: study area, data service URLs, layer catalog.
// Every URL here is a free, public government service queried from the browser.

export const VICTORIA: [number, number] = [-93.6619, 44.8597]; // lon, lat
export const RADIUS_MI = 75;

export const DNR_HUNTING_RULES_URL =
  "https://www.dnr.state.mn.us/hunting/deer/index.html";
export const DNR_REGS_URL = "https://www.dnr.state.mn.us/regulations/hunting/index.html";
export const DNR_WMA_FINDER_URL = "https://www.dnr.state.mn.us/wmas/index.html";

const MNGEO = "https://enterprise.gisdata.mn.gov/aghost/rest/services";

export const SERVICES = {
  padus:
    "https://services.arcgis.com/v01gqwM5QqNysAAi/arcgis/rest/services/PADUS_Public_Access/FeatureServer/0",
  dnrWma: `${MNGEO}/us_mn_state_dnr/bdry_dnr_wildlife_mgmt_areas_pub/FeatureServer/0`,
  dnrWmaFacilities: `${MNGEO}/us_mn_state_dnr/struc_dnr_wld_mgmt_areas_pub/FeatureServer/0`,
};

/** How long cached public-land data is trusted before a background refresh. */
export const LAND_CACHE_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

export type BaseLayerId = "topo" | "imagery" | "naip";
export type OverlayId = "hillshade" | "cdl" | "nlcd" | "nwi";

export interface RasterDef {
  id: string;
  label: string;
  tiles: string[];
  tileSize: number;
  maxzoom: number;
  attribution: string;
  /** URL pattern uses {bbox-epsg-3857} rather than z/x/y */
  bboxTemplate?: boolean;
}

const exportImage = (base: string, extra = "") =>
  `${base}/exportImage?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&f=image${extra}`;

export const BASE_LAYERS: Record<BaseLayerId, RasterDef> = {
  topo: {
    id: "topo",
    label: "USGS Topo",
    tiles: [
      "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/{z}/{y}/{x}",
    ],
    tileSize: 256,
    maxzoom: 16,
    attribution: "USGS The National Map",
  },
  imagery: {
    id: "imagery",
    label: "USGS Imagery",
    tiles: [
      "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}",
    ],
    tileSize: 256,
    maxzoom: 16,
    attribution: "USGS The National Map: Orthoimagery",
  },
  naip: {
    id: "naip",
    label: "NAIP (latest)",
    tiles: [
      exportImage(
        "https://imagery.nationalmap.gov/arcgis/rest/services/USGSNAIPImagery/ImageServer",
        "&format=jpgpng",
      ),
    ],
    tileSize: 256,
    maxzoom: 18,
    bboxTemplate: true,
    attribution: "USDA NAIP via USGS",
  },
};

export const OVERLAYS: Record<OverlayId, RasterDef & { defaultOpacity: number; legend?: string }> = {
  hillshade: {
    id: "hillshade",
    label: "Hillshade (3DEP)",
    tiles: [
      exportImage(
        "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer",
        "&format=jpgpng&renderingRule=%7B%22rasterFunction%22%3A%22Hillshade%20Gray%22%7D",
      ),
    ],
    tileSize: 256,
    maxzoom: 17,
    bboxTemplate: true,
    attribution: "USGS 3DEP",
    defaultOpacity: 0.35,
  },
  cdl: {
    id: "cdl",
    label: "Cropland (CDL 2025)",
    tiles: [
      exportImage(
        `${MNGEO}/us_mn_state_mda/agri_cropland_data_layer_2025/ImageServer`,
        "&format=png",
      ),
    ],
    tileSize: 256,
    maxzoom: 16,
    bboxTemplate: true,
    attribution: "USDA NASS Cropland Data Layer via MnGeo",
    defaultOpacity: 0.55,
    legend: "Yellow corn, green soybeans, pink alfalfa, tan grains",
  },
  nlcd: {
    id: "nlcd",
    label: "Land cover (NLCD 2021)",
    tiles: [
      "https://www.mrlc.gov/geoserver/mrlc_display/NLCD_2021_Land_Cover_L48/wms?service=WMS&version=1.1.1&request=GetMap&layers=NLCD_2021_Land_Cover_L48&styles=&srs=EPSG:3857&bbox={bbox-epsg-3857}&width=256&height=256&format=image/png&transparent=true",
    ],
    tileSize: 256,
    maxzoom: 16,
    bboxTemplate: true,
    attribution: "MRLC NLCD",
    defaultOpacity: 0.5,
    legend: "Greens forest, browns shrub, blues wetland",
  },
  nwi: {
    id: "nwi",
    label: "Wetlands (NWI)",
    tiles: [
      "https://fwspublicservices.wim.usgs.gov/wetlandsmapservice/rest/services/Wetlands/MapServer/export?bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&f=image",
    ],
    tileSize: 256,
    maxzoom: 17,
    bboxTemplate: true,
    attribution: "USFWS National Wetlands Inventory",
    defaultOpacity: 0.6,
  },
};
