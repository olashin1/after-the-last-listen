import { describe, expect, it } from "vitest";
import { outputSize, squareCrop } from "./image";

describe("squareCrop", () => {
  it("keeps a square image whole", () => {
    expect(squareCrop(800, 800)).toEqual({ sx: 0, sy: 0, size: 800 });
  });

  it("centers horizontally on a landscape image", () => {
    expect(squareCrop(1200, 800)).toEqual({ sx: 200, sy: 0, size: 800 });
  });

  it("centers vertically on a portrait image", () => {
    expect(squareCrop(3024, 4032)).toEqual({ sx: 0, sy: 504, size: 3024 });
  });

  it("rounds an odd margin down so the crop stays inside the image", () => {
    const crop = squareCrop(801, 800);
    expect(crop).toEqual({ sx: 0, sy: 0, size: 800 });
    expect(crop.sx + crop.size).toBeLessThanOrEqual(801);
  });

  it("rejects empty or invalid sizes", () => {
    expect(() => squareCrop(0, 100)).toThrow(RangeError);
    expect(() => squareCrop(100, Number.NaN)).toThrow(RangeError);
  });
});

describe("outputSize", () => {
  it("shrinks large crops to the maximum", () => {
    expect(outputSize(3024, 512)).toBe(512);
  });

  it("never upscales small crops", () => {
    expect(outputSize(200, 512)).toBe(200);
  });

  it("is at least 1px", () => {
    expect(outputSize(0.2, 512)).toBe(1);
  });
});
