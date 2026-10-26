export const MIN_ZOOM = 25;
export const MAX_ZOOM = 200;

export type CanvasCamera = { zoom: number; x: number; y: number };
export const INITIAL_CAMERA: CanvasCamera = { zoom: 100, x: 0, y: 0 };

/** Allow a single screenshot to fill the usable viewport, preserving existing zoom headroom. */
export function canvasMaxZoom(
  viewport: { width: number; height: number },
  tileAspectRatio: number,
  columns: number,
): number {
  const availableWidth = Math.max(1, viewport.width - 80);
  const availableHeight = Math.max(1, viewport.height - 80);
  const baseWidth = Math.min(1400, availableWidth);
  const targetTileWidth = Math.min(availableWidth, availableHeight * tileAspectRatio);
  return Math.max(MAX_ZOOM, (targetTileWidth * columns + 16 * (columns - 1)) / baseWidth * 100);
}

/** Keep the canvas point under the gesture anchor stationary during zoom. */
export function zoomCamera(
  camera: CanvasCamera,
  requestedZoom: number,
  anchor = { x: 0, y: 0 },
  maxZoom = MAX_ZOOM,
): CanvasCamera {
  const zoom = Math.max(MIN_ZOOM, Math.min(maxZoom, requestedZoom));
  const ratio = zoom / camera.zoom;
  return {
    zoom,
    x: anchor.x - (anchor.x - camera.x) * ratio,
    y: anchor.y - (anchor.y - camera.y) * ratio,
  };
}
