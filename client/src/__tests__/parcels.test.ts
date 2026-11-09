import { describe, expect, it } from "vitest";
import { chunksForView, tileToBBox } from "../lib/parcels";
import { lonLatToTile } from "../lib/geo";

describe("parcel chunks", () => {
  it("round-trips a tile bbox", () => {
    const [x, y] = lonLatToTile(-93.66, 44.86, 14);
    const b = tileToBBox(14, x, y);
    expect(b[0]).toBeLessThanOrEqual(-93.66);
    expect(b[2]).toBeGreaterThanOrEqual(-93.66);
    expect(b[1]).toBeLessThanOrEqual(44.86);
    expect(b[3]).toBeGreaterThanOrEqual(44.86);
  });
  it("covers a small view and refuses a huge one", () => {
    expect(chunksForView([-93.67, 44.855, -93.65, 44.865]).length).toBeGreaterThanOrEqual(1);
    expect(chunksForView([-94.5, 44.0, -93.0, 45.5])).toEqual([]);
  });
});
