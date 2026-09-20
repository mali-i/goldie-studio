import { describe, expect, test } from "bun:test";
import { CENTER_CAPTURE_POSITION, dragCapturePosition } from "./capturePosition";

describe("dragCapturePosition", () => {
  const card = { width: 750, height: 1000 };
  const macScreenshot = { width: 2880, height: 1800 };

  test("moves a wide screenshot horizontally and clamps at both crop edges", () => {
    const moved = dragCapturePosition(
      CENTER_CAPTURE_POSITION,
      { x: 100, y: 100 },
      card,
      macScreenshot,
    );
    expect(moved.x).toBeLessThan(0.5);
    expect(moved.y).toBe(0.5);
    expect(dragCapturePosition(CENTER_CAPTURE_POSITION, { x: 9999, y: 0 }, card, macScreenshot).x).toBe(0);
    expect(dragCapturePosition(CENTER_CAPTURE_POSITION, { x: -9999, y: 0 }, card, macScreenshot).x).toBe(1);
  });

  test("moves a tall screenshot vertically when the slot is wide", () => {
    const moved = dragCapturePosition(
      CENTER_CAPTURE_POSITION,
      { x: 100, y: -100 },
      { width: 1000, height: 600 },
      { width: 750, height: 1000 },
    );
    expect(moved.x).toBe(0.5);
    expect(moved.y).toBeGreaterThan(0.5);
  });
});
