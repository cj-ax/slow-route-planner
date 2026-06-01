import { randomUUID } from "node:crypto";
import type { PlaceOption, PlaceType } from "@srp/shared";

type Seed = Omit<PlaceOption, "id">;

// Plausible endpoint options clustered around downtown Excelsior, MN.
const SEEDS: Record<PlaceType, Seed[]> = {
  coffee: [
    {
      name: "Bordertown Coffee — Excelsior",
      query: "coffee shop downtown Excelsior MN",
      address: "Water St, Excelsior, MN",
      lat: 44.9036,
      lng: -93.566,
      type: "coffee",
      reason: "Walkable Water Street spot for an espresso after the ride.",
    },
    {
      name: "Excelsior Bay Coffee",
      query: "cafe near Excelsior Bay Lake Minnetonka",
      address: "Lake St, Excelsior, MN",
      lat: 44.9041,
      lng: -93.5672,
      type: "coffee",
      reason: "Casual cafe a block from the lake.",
    },
  ],
  beer: [
    {
      name: "Excelsior Brewing Co.",
      query: "Excelsior Brewing Company taproom",
      address: "Water St, Excelsior, MN",
      lat: 44.9046,
      lng: -93.5688,
      type: "beer",
      reason: "Local taproom with a relaxed patio.",
    },
    {
      name: "Coalition Drinkery (patio)",
      query: "Coalition Excelsior patio Lake Minnetonka",
      address: "Lake St, Excelsior, MN",
      lat: 44.9009,
      lng: -93.5664,
      type: "beer",
      reason: "Lakeside patio — good for a casual end-of-ride drink.",
    },
  ],
  food: [
    {
      name: "Maynard's on the Lake",
      query: "Maynard's Excelsior lakeside patio",
      address: "Lake St, Excelsior, MN",
      lat: 44.9006,
      lng: -93.5666,
      type: "food",
      reason: "Patio right on Excelsior Bay.",
    },
    {
      name: "Jake O'Connor's Public House",
      query: "pub downtown Excelsior MN patio",
      address: "Water St, Excelsior, MN",
      lat: 44.9038,
      lng: -93.5668,
      type: "food",
      reason: "Easygoing pub fare on the main street.",
    },
  ],
  ice_cream: [
    {
      name: "Adele's Frozen Custard",
      query: "Adele's Frozen Custard Excelsior",
      address: "2nd St, Excelsior, MN",
      lat: 44.9043,
      lng: -93.565,
      type: "ice_cream",
      reason: "Classic frozen custard stop with outdoor seating.",
    },
    {
      name: "Licks Unlimited",
      query: "ice cream shop Water Street Excelsior",
      address: "Water St, Excelsior, MN",
      lat: 44.9035,
      lng: -93.5662,
      type: "ice_cream",
      reason: "Quick cone on the walkable main drag.",
    },
  ],
  view: [
    {
      name: "Excelsior Commons & Beach",
      query: "Excelsior Commons Lake Minnetonka beach",
      address: "Lake St, Excelsior, MN",
      lat: 44.902,
      lng: -93.565,
      type: "view",
      reason: "Open lakefront park to wind down and look at the water.",
    },
    {
      name: "Port of Excelsior Dock",
      query: "Port of Excelsior dock Lake Minnetonka",
      address: "Lake St, Excelsior, MN",
      lat: 44.9011,
      lng: -93.5659,
      type: "view",
      reason: "Public dock with a wide lake view.",
    },
  ],
  custom: [
    {
      name: "Downtown Excelsior (Water Street)",
      query: "downtown Excelsior MN",
      address: "Water St, Excelsior, MN",
      lat: 44.9033,
      lng: -93.5663,
      type: "custom",
      reason: "Walkable small-town main street.",
    },
  ],
};

/** Mock endpoint options for a given type. Used by /search-places and plans. */
export function createMockPlaces(type: PlaceType = "coffee"): PlaceOption[] {
  const seeds = SEEDS[type] ?? SEEDS.custom;
  return seeds.map((seed) => ({ id: randomUUID(), ...seed }));
}
