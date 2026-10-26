import { describe, expect, test } from "bun:test";
import { INITIAL_CAMERA, zoomCamera } from "./canvasCamera";

describe("canvas camera", () => {
  test("keeps the same canvas point under an off-center pinch after panning", () => {
    const camera = { zoom: 80, x: -420, y: 270 };
    const anchor = { x: 150, y: -90 };
    const next = zoomCamera(camera, 160, anchor);
    expect((anchor.x - next.x) / next.zoom).toBeCloseTo((anchor.x - camera.x) / camera.zoom);
    expect((anchor.y - next.y) / next.zoom).toBeCloseTo((anchor.y - camera.y) / camera.zoom);
  });

  test("uses the clamped scale for the anchor and preserves tiny pinch deltas", () => {
    expect(zoomCamera(INITIAL_CAMERA, 100.1).zoom).toBe(100.1);
    expect(zoomCamera(INITIAL_CAMERA, 400, { x: 100, y: 50 })).toEqual({ zoom: 200, x: -100, y: -50 });
    expect(zoomCamera(INITIAL_CAMERA, 0).zoom).toBe(25);
  });
});
