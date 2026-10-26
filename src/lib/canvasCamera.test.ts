import { describe, expect, test } from "bun:test";
import { canvasMaxZoom, INITIAL_CAMERA, zoomCamera } from "./canvasCamera";

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

  test("gives tablets and desktops enough zoom for a single tile to fill the viewport", () => {
    const viewport = { width: 1000, height: 700 };
    for (const aspect of [1320 / 2868, 1080 / 2400, 2732 / 2048, 2880 / 1800]) {
      const maxZoom = canvasMaxZoom(viewport, aspect, 5);
      const tileWidth = ((viewport.width - 80) * maxZoom / 100 - 64) / 5;
      expect(tileWidth).toBeGreaterThanOrEqual(Math.min(920, 620 * aspect) - 0.001);
    }
    expect(canvasMaxZoom(viewport, 2880 / 1800, 5)).toBeGreaterThan(500);
    expect(canvasMaxZoom(viewport, 1320 / 2868, 5)).toBe(200);
  });

  test("adapts to short rows and wide viewports without changing the zoom anchor", () => {
    expect(canvasMaxZoom({ width: 1000, height: 700 }, 1.6, 1)).toBe(200);
    const limit = canvasMaxZoom({ width: 2400, height: 1000 }, 1.6, 5);
    const next = zoomCamera(INITIAL_CAMERA, 9999, { x: 120, y: -50 }, limit);
    expect(next.zoom).toBe(limit);
    expect((120 - next.x) / next.zoom).toBeCloseTo(1.2);
    expect((-50 - next.y) / next.zoom).toBeCloseTo(-0.5);
  });
});
