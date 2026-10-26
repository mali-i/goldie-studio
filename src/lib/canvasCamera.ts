export const MIN_ZOOM = 25;
export const MAX_ZOOM = 200;

export type CanvasCamera = { zoom: number; x: number; y: number };
export const INITIAL_CAMERA: CanvasCamera = { zoom: 100, x: 0, y: 0 };

/** Keep the canvas point under the gesture anchor stationary during zoom. */
export function zoomCamera(
  camera: CanvasCamera,
  requestedZoom: number,
  anchor = { x: 0, y: 0 },
): CanvasCamera {
  const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, requestedZoom));
  const ratio = zoom / camera.zoom;
  return {
    zoom,
    x: anchor.x - (anchor.x - camera.x) * ratio,
    y: anchor.y - (anchor.y - camera.y) * ratio,
  };
}
