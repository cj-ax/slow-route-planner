import { describe, expect, it } from "vitest";
import { filterProperties } from "../components/PropertyList";
import { planOfflineTiles, MAX_OFFLINE_TILES } from "../lib/offline";
import type { Property } from "../lib/land";

const mk = (id: string, over: Partial<Property>): Property => ({
  id, name: id, agency: "wma", manager: "", designation: "", state: "MN", access: "open",
  hunting: "unknown", huntingNote: "", acres: 100, bbox: [-93.6, 44.8, -93.59, 44.81], distMi: 10,
  parkingMi: null, parkingCount: 0, source: "", ...over,
});
const allOn = { wma: true, ama: true, state_forest: true, refuge: true, wpa: true, sna: true, state_park: true, county: true, regional: true, federal_other: true, state_other: true };

describe("filterProperties", () => {
  const props = [
    mk("a", { distMi: 30, acres: 500, hunting: "listed" }),
    mk("b", { distMi: 5, acres: 50 }),
    mk("c", { distMi: 80, acres: 900 }),
    mk("d", { distMi: 12, acres: 10, agency: "sna" }),
  ];
  it("filters by distance, size, agency, hunting", () => {
    const f = { maxMi: 75, minAcres: 40, deerListedOnly: false, sort: "distance" as const, q: "" };
    expect(filterProperties(props, f, allOn).map((p) => p.id)).toEqual(["b", "a"]);
    expect(filterProperties(props, { ...f, sort: "size" }, allOn).map((p) => p.id)).toEqual(["a", "b"]);
    expect(filterProperties(props, { ...f, deerListedOnly: true }, allOn).map((p) => p.id)).toEqual(["a"]);
    expect(filterProperties(props, { ...f, minAcres: 0 }, { ...allOn, sna: false }).map((p) => p.id)).toEqual(["b", "a"]);
  });
});

describe("planOfflineTiles", () => {
  it("plans a small property under the cap and a huge one over it", () => {
    const small = planOfflineTiles([-93.6, 44.8, -93.59, 44.81], ["topo"], []);
    expect(small.urls.length).toBeGreaterThan(5);
    expect(small.tooBig).toBe(false);
    const huge = planOfflineTiles([-94.5, 44.0, -93.0, 45.5], ["topo", "imagery"], ["cdl"]);
    expect(huge.urls.length).toBeGreaterThan(MAX_OFFLINE_TILES);
    expect(huge.tooBig).toBe(true);
  });
});
