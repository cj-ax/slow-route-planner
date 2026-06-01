import type { WaypointPurpose } from "@srp/shared";

export const PURPOSE_META: Record<
  WaypointPurpose,
  { label: string; color: string }
> = {
  start: { label: "Start", color: "#3ddc84" },
  scenic: { label: "Scenic", color: "#5aa9e6" },
  residential_detour: { label: "Residential detour", color: "#b98bdb" },
  lake_view: { label: "Lake view", color: "#36c5d8" },
  food_drink: { label: "Food / drink", color: "#f4a259" },
  route_shaping: { label: "Route shaping", color: "#8d99ae" },
  destination: { label: "Destination", color: "#ff5d73" },
};

export const PURPOSE_ORDER: WaypointPurpose[] = [
  "start",
  "scenic",
  "lake_view",
  "residential_detour",
  "route_shaping",
  "food_drink",
  "destination",
];
