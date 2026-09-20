import type { CapturePosition } from "../manifest";

export const CENTER_CAPTURE_POSITION: CapturePosition = { x: 0.5, y: 0.5 };

type Size = { width: number; height: number };

/** Move a cover-fitted image inside its crop without exposing empty space. */
export function dragCapturePosition(
  start: CapturePosition,
  delta: { x: number; y: number },
  viewport: Size,
  image: Size,
): CapturePosition {
  if (viewport.width <= 0 || viewport.height <= 0 || image.width <= 0 || image.height <= 0) {
    return start;
  }
  const scale = Math.max(viewport.width / image.width, viewport.height / image.height);
  const overflowX = image.width * scale - viewport.width;
  const overflowY = image.height * scale - viewport.height;
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  return {
    x: overflowX > 0.01 ? clamp(start.x - delta.x / overflowX) : 0.5,
    y: overflowY > 0.01 ? clamp(start.y - delta.y / overflowY) : 0.5,
  };
}
