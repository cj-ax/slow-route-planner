// Context layers loaded by viewport from MnGeo open county data.
// Parcels: geometry only (no owner names, addresses or values).
// Government-owned land: owner type + county only.
// Neither is survey-grade or implies permission to hunt or cross.

import { SERVICES } from "../config";
import { createViewportLayer } from "./viewportFeatures";

export { chunksForView, tileToBBox } from "./viewportFeatures";

export const PARCEL_MIN_ZOOM = 14;
export const GOVLAND_MIN_ZOOM = 11;

export const parcelsLayer = createViewportLayer({
  url: SERVICES.mnParcels,
  chunkZ: 14,
  minZoom: PARCEL_MIN_ZOOM,
  outFields: "objectid",
  simplifyDeg: 0.00002,
  idField: "objectid",
});

export const govLandLayer = createViewportLayer({
  url: SERVICES.mnGovLand,
  chunkZ: 12,
  minZoom: GOVLAND_MIN_ZOOM,
  outFields: "objectid,govt_own,co_name",
  simplifyDeg: 0.00004,
  idField: "objectid",
  maxChunks: 12,
});

export const GOV_TYPES = {
  "Tax Forfeit": { label: "Tax-forfeit (county-managed)", color: "#d9480f", defaultOn: true },
  "County Fee": { label: "County-owned", color: "#f08c00", defaultOn: true },
  State: { label: "State-owned", color: "#5c940d", defaultOn: false },
  Federal: { label: "Federal", color: "#1971c2", defaultOn: false },
  Tribal: { label: "Tribal (not public land)", color: "#868e96", defaultOn: false },
} as const;
export type GovType = keyof typeof GOV_TYPES;

export function govLandNote(type: string): string {
  if (type === "Tribal") return "Tribal land. Not public hunting land.";
  if (type === "Tax Forfeit")
    return "Tax-forfeited land is managed by the county. Many parcels are open to hunting, but rules vary by county and some are leased or landlocked. Verify with the county land department.";
  if (type === "County Fee") return "County-owned. Often parks or facilities where hunting is not allowed. Verify with the county.";
  return "Government-owned. Access and hunting rules depend on the managing agency. Verify before hunting.";
}
