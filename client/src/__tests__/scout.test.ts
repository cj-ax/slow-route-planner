import { describe, expect, it } from "vitest";
import { decodeFactorPixel, seasonScore, windFit, windMessage, type CandidateProps } from "../lib/scout";

function fakeTile(fill: (block: number) => [number, number, number]): ImageData {
  const w = 256, h = 768;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const [r, g, b] = fill(Math.floor(y / 256));
      const i = (y * w + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
  return { data, width: w, height: h, colorSpace: "srgb" } as ImageData;
}

describe("factor tile decoding", () => {
  it("reads the three stacked blocks", () => {
    const img = fakeTile((b) => (b === 0 ? [255, 128, 0] : b === 1 ? [64, 255, 32] : [0, 12, 255]));
    const d = decodeFactorPixel(img, 10, 20)!;
    expect(d.factors.food).toBe(1);
    expect(d.factors.cover).toBeCloseTo(0.5, 1);
    expect(d.factors.pressure).toBe(1);
    expect(d.accessMinutes).toBe(12);
    expect(d.inProperty).toBe(true);
  });
  it("returns null outside the scored area", () => {
    expect(decodeFactorPixel(fakeTile(() => [0, 0, 0]), 1, 1)).toBeNull();
  });
  it("treats 255 minutes as unknown and 128 mask as buffer", () => {
    const d = decodeFactorPixel(fakeTile((b) => (b === 2 ? [0, 255, 128] : [10, 10, 10])), 0, 0)!;
    expect(d.accessMinutes).toBeNull();
    expect(d.inProperty).toBe(false);
    expect(d.inBuffer).toBe(true);
  });
});

describe("seasonScore", () => {
  it("matches the weighted mean and applies thermal mix", () => {
    const b = { factors: { food: 1, cover: 0, edge: 0, corridor: 0, pressure: 0, terrain: 0 }, thermal: 1, accessMinutes: 5, inProperty: true, inBuffer: true };
    const w = { food: 0.5, cover: 0.5, edge: 0, corridor: 0, pressure: 0, terrain: 0 };
    expect(seasonScore(b, { label: "x", weights: w, thermalMix: 0 }).total).toBeCloseTo(0.5);
    expect(seasonScore(b, { label: "x", weights: w, thermalMix: 0.4 }).total).toBeCloseTo(0.7);
  });
});

describe("wind", () => {
  const c: CandidateProps = {
    kind: "stand", season: "rut", score: 80, reasons: [], pid: "p", pname: "P", entry: null,
    wind: { approachFrom: "N", goodWinds: ["N", "NE"], okWinds: ["E", "NW", "W"], badWinds: ["S", "SE", "SW"] },
  };
  it("classifies current wind against the stand", () => {
    expect(windFit(c.wind, "N")).toBe("good");
    expect(windFit(c.wind, "W")).toBe("ok");
    expect(windFit(c.wind, "S")).toBe("bad");
    expect(windFit(c.wind, "")).toBe("unknown");
  });
  it("warns on bad wind", () => {
    expect(windMessage(c, "S")).toMatch(/^Bad wind/);
  });
});
