import { describe, expect, it } from "vitest";
import { buildLandData, classifyPadus, stateFor, titleCase } from "../lib/land";

const sq = (x: number, y: number, d = 0.01): GeoJSON.Polygon => ({
  type: "Polygon",
  coordinates: [[[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]]],
});
const feat = (geometry: GeoJSON.Geometry, properties: Record<string, unknown>): GeoJSON.Feature => ({
  type: "Feature",
  geometry,
  properties,
});

describe("classifyPadus", () => {
  const base = { Category: "Fee", Pub_Access: "OA" };
  it.each([
    [{ Unit_Nm: "Scott County Waterfowl Production Area", MngNm_Desc: "U.S. Fish and Wildlife Service" }, "wpa"],
    [{ Unit_Nm: "Minnesota Valley National Wildlife Refuge", DesTp_Desc: "National Wildlife Refuge" }, "refuge"],
    [{ Unit_Nm: "Rum River State Forest", MngNm_Desc: "State Department of Natural Resources" }, "state_forest"],
    [{ Unit_Nm: "Lotus Lake State Aquatic Management Area", MngNm_Desc: "State Fish and Wildlife" }, "ama"],
    [{ Unit_Nm: "Raguet State Wildlife Management Area", MngNm_Desc: "State Fish and Wildlife" }, "wma"],
    [{ Unit_Nm: "Seminary Fen State Scientific and Natural Area", MngNm_Desc: "State Department of Natural Resources" }, "sna"],
    [{ Unit_Nm: "Sibley State Park", MngNm_Desc: "State Park and Recreation", DesTp_Desc: "State Park" }, "state_park"],
    [{ Unit_Nm: "Wolf Lake", MngNm_Desc: "County Land", DesTp_Desc: "Local Conservation Area" }, "county"],
  ])("%o -> %s", (a, want) => expect(classifyPadus({ ...base, ...a })).toBe(want));

  it("drops city parks, closed land, easements, junk names", () => {
    expect(classifyPadus({ ...base, Unit_Nm: "Baldwin Park", MngNm_Desc: "County Land", DesTp_Desc: "Local Park" })).toBeNull();
    expect(classifyPadus({ ...base, Unit_Nm: "X", MngNm_Desc: "City Land" })).toBeNull();
    expect(classifyPadus({ ...base, Pub_Access: "XA", Unit_Nm: "X WMA", MngNm_Desc: "State Fish and Wildlife" })).toBeNull();
    expect(classifyPadus({ Category: "Easement", Unit_Nm: "X", MngNm_Desc: "State Fish and Wildlife" })).toBeNull();
    expect(classifyPadus({ ...base, Unit_Nm: "Miscellaneous", MngNm_Desc: "State Department of Natural Resources" })).toBeNull();
    expect(classifyPadus({ ...base, Unit_Nm: "Northeastern States District Office", MngNm_Desc: "Bureau of Land Management" })).toBeNull();
  });
});

describe("stateFor", () => {
  it("splits MN and WI along the rivers", () => {
    expect(stateFor([-93.66, 44.86])).toBe("MN"); // Victoria
    expect(stateFor([-92.6, 45.0])).toBe("WI"); // Hudson area
    expect(stateFor([-92.0, 44.6])).toBe("WI"); // Durand area
    expect(stateFor([-92.5, 44.2])).toBe("MN"); // Zumbro Falls area
  });
});

describe("buildLandData", () => {
  it("groups by unit, prefers DNR WMAs, marks hunting from deer flag, finds parking", () => {
    const wma = [
      feat(sq(-93.6, 44.8), { unit_name: "RAGUET", deer: 1 }),
      feat(sq(-93.58, 44.8), { unit_name: "RAGUET", deer: 1 }),
      feat(sq(-93.5, 44.7), { name: "NO DEER", deer: null }),
    ];
    const pad = [
      feat(sq(-93.6, 44.8), { Category: "Fee", Pub_Access: "OA", Unit_Nm: "Raguet State Wildlife Management Area", MngNm_Desc: "State Fish and Wildlife" }),
      feat(sq(-93.4, 44.6, 0.05), { Category: "Fee", Pub_Access: "OA", Unit_Nm: "Scott County Waterfowl Production Area", MngNm_Desc: "U.S. Fish and Wildlife Service" }),
      feat(sq(-93.3, 44.6, 0.0001), { Category: "Fee", Pub_Access: "OA", Unit_Nm: "Tiny AMA Aquatic Management Area", MngNm_Desc: "State Fish and Wildlife" }),
    ];
    const parking = [feat({ type: "Point", coordinates: [-93.595, 44.805] }, {})];
    const d = buildLandData(pad, wma, parking);
    const names = d.properties.map((p) => p.name).sort();
    expect(names).toEqual(["No Deer WMA", "Raguet WMA", "Scott County Waterfowl Production Area"]);
    const raguet = d.properties.find((p) => p.name === "Raguet WMA")!;
    expect(raguet.hunting).toBe("listed");
    expect(raguet.parkingCount).toBe(1);
    expect(raguet.parkingMi).toBe(0);
    expect(d.polygons.features.filter((f) => f.properties?.pid === raguet.id)).toHaveLength(2);
    expect(d.properties.find((p) => p.name === "No Deer WMA")!.hunting).toBe("unknown");
    expect(d.properties.find((p) => p.agency === "wpa")!.hunting).toBe("unknown");
    // sorted by distance from Victoria
    const dists = d.properties.map((p) => p.distMi);
    expect([...dists].sort((a, b) => a - b)).toEqual(dists);
  });

  it("keeps PAD-US WMAs when the DNR layer failed", () => {
    const pad = [
      feat(sq(-93.6, 44.8), { Category: "Fee", Pub_Access: "OA", Unit_Nm: "Raguet State Wildlife Management Area", MngNm_Desc: "State Fish and Wildlife" }),
    ];
    expect(buildLandData(pad, null, []).properties).toHaveLength(1);
  });

  it("title cases with acronyms", () => {
    expect(titleCase("CARVER HIGHLANDS WMA")).toBe("Carver Highlands WMA");
  });
});
