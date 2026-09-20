/**
 * Browser-side layout engine. This intentionally lives inside Studio so the
 * the standalone app can build without external rendering dependencies.
 */
import type { SlotGeometry } from "../manifest";

export const LAYOUT_KEYS = [
  "classic",
  "copy-below",
  "hero",
  "offset",
  "tilt",
  "tilt-right",
  "duo",
  "duo-tilt",
  "panorama",
  "panorama-duo",
  "minimal",
  "gallery",
  "side-by-side",
  "overlap-tilt",
  "screenshot-pair",
] as const;
export type LayoutKey = (typeof LAYOUT_KEYS)[number];

export type CopyAlign = "center" | "left";
export type CopyPosition = "top" | "bottom" | "none";
export type DevicePlacement = {
  widthRatio: number;
  x: number;
  y: number;
  rotate: number;
  capture: "primary" | "secondary";
  fitBelowCopy?: boolean;
};
export type LayoutSpec = {
  key: LayoutKey;
  label: string;
  description: string;
  span: 1 | 2;
  copy: {
    position: CopyPosition;
    align: CopyAlign;
    heightRatio?: number;
    x?: number;
    widthRatio?: number;
  };
  devices: DevicePlacement[];
  /** Render the uploaded image as a tall screenshot card instead of inside device art. */
  capturePresentation?: {
    aspectRatio: number;
    cornerRadiusRatio: number;
    objectFit: "cover" | "contain";
    objectPosition: string;
  };
};

export const TYPE = {
  headlineSize: 0.082,
  headlineLineHeight: 1.08,
  headlineTracking: -0.0016,
  headlineWeight: 700,
  subheadSize: 0.038,
  subheadLineHeight: 1.3,
  subheadWeight: 400,
  padX: 0.09,
  padTop: 0.055,
  padBottom: 0.05,
  gap: 0.014,
} as const;

/** Typography tuned for a 16:10 desktop screenshot rather than a narrow phone tile. */
export const LANDSCAPE_TYPE = {
  headlineSize: 0.048,
  headlineLineHeight: 1.08,
  headlineTracking: -0.0009,
  headlineWeight: 700,
  subheadSize: 0.022,
  subheadLineHeight: 1.3,
  subheadWeight: 400,
  padX: 0.06,
  padTop: 0.065,
  padBottom: 0.06,
  gap: 0.012,
} as const;

export const BADGE = {
  fontSize: 0.03,
  weight: 700,
  padX: 0.028,
  padY: 0.014,
  inset: 0.045,
} as const;

export const CLASSIC_BOTTOM_MARGIN = 0.03;
export const SCREEN_SHADOW = {
  blur: 0.06,
  offsetY: 0.02,
  color: "rgba(0, 0, 0, 0.28)",
} as const;

const single = (
  placement: Partial<DevicePlacement> & Pick<DevicePlacement, "x" | "y">,
): DevicePlacement[] => [
  { widthRatio: 0.84, rotate: 0, capture: "primary", ...placement },
];

export const LAYOUTS: Record<LayoutKey, LayoutSpec> = {
  classic: {
    key: "classic",
    label: "Classic",
    description: "Centred copy above a centred device.",
    span: 1,
    copy: { position: "top", align: "center" },
    devices: single({ x: 0.5, y: 0.5, fitBelowCopy: true }),
  },
  "copy-below": {
    key: "copy-below",
    label: "Copy below",
    description: "Device hanging from the top edge, copy underneath.",
    span: 1,
    copy: { position: "bottom", align: "center", heightRatio: 0.24 },
    devices: single({ x: 0.5, y: 0.34 }),
  },
  hero: {
    key: "hero",
    label: "Hero",
    description: "Copy on top, a large device running off the bottom.",
    span: 1,
    copy: { position: "top", align: "center", heightRatio: 0.24 },
    devices: single({ widthRatio: 0.95, x: 0.5, y: 0.74 }),
  },
  offset: {
    key: "offset",
    label: "Offset",
    description: "Left-aligned copy, device pushed to the bottom right.",
    span: 1,
    copy: { position: "top", align: "left", heightRatio: 0.26 },
    devices: single({ widthRatio: 0.9, x: 0.62, y: 0.76 }),
  },
  tilt: {
    key: "tilt",
    label: "Tilt",
    description: "Copy on top, device tilted and running off the bottom.",
    span: 1,
    copy: { position: "top", align: "center", heightRatio: 0.24 },
    devices: single({ widthRatio: 0.9, x: 0.5, y: 0.75, rotate: -8 }),
  },
  "tilt-right": {
    key: "tilt-right",
    label: "Tilt right",
    description: "Left-aligned copy, device tilted into the bottom right corner.",
    span: 1,
    copy: { position: "top", align: "left", heightRatio: 0.26 },
    devices: single({ widthRatio: 0.9, x: 0.64, y: 0.78, rotate: 10 }),
  },
  duo: {
    key: "duo",
    label: "Duo",
    description: "Two screens, layered front to back.",
    span: 1,
    copy: { position: "top", align: "center", heightRatio: 0.24 },
    devices: [
      { widthRatio: 0.62, x: 0.3, y: 0.62, rotate: 0, capture: "secondary" },
      { widthRatio: 0.7, x: 0.64, y: 0.72, rotate: 0, capture: "primary" },
    ],
  },
  "duo-tilt": {
    key: "duo-tilt",
    label: "Duo tilt",
    description: "Two tilted screens stepping down diagonally.",
    span: 1,
    copy: { position: "top", align: "center", heightRatio: 0.24 },
    devices: [
      { widthRatio: 0.64, x: 0.3, y: 0.6, rotate: -6, capture: "secondary" },
      { widthRatio: 0.7, x: 0.66, y: 0.74, rotate: -6, capture: "primary" },
    ],
  },
  panorama: {
    key: "panorama",
    label: "Panorama",
    description: "Two tiles with one device crossing the seam.",
    span: 2,
    copy: { position: "top", align: "left", heightRatio: 0.3, x: 0.045, widthRatio: 0.86 },
    devices: single({ widthRatio: 1.1, x: 0.56, y: 0.7, rotate: -10 }),
  },
  "panorama-duo": {
    key: "panorama-duo",
    label: "Panorama duo",
    description: "Two tiles with a screen on each side.",
    span: 2,
    copy: { position: "top", align: "center", heightRatio: 0.24, widthRatio: 1.6 },
    devices: [
      { widthRatio: 0.8, x: 0.27, y: 0.7, rotate: 6, capture: "primary" },
      { widthRatio: 0.8, x: 0.73, y: 0.7, rotate: -6, capture: "secondary" },
    ],
  },
  minimal: {
    key: "minimal",
    label: "Minimal",
    description: "No copy, just the device, large and centred.",
    span: 1,
    copy: { position: "none", align: "center" },
    devices: single({ widthRatio: 0.92, x: 0.5, y: 0.5 }),
  },
  gallery: {
    key: "gallery",
    label: "Gallery",
    description: "A tilted screen above left-aligned copy at the bottom.",
    span: 1,
    copy: { position: "bottom", align: "left", heightRatio: 0.24, widthRatio: 0.82 },
    devices: single({ widthRatio: 0.7, x: 0.62, y: 0.38, rotate: 6 }),
  },
  "side-by-side": {
    key: "side-by-side",
    label: "Side by side",
    description: "Two screens side by side beneath the copy.",
    span: 1,
    copy: { position: "top", align: "center", heightRatio: 0.24 },
    devices: [
      { widthRatio: 0.62, x: 0.26, y: 0.62, rotate: -3, capture: "primary" },
      { widthRatio: 0.62, x: 0.74, y: 0.62, rotate: 3, capture: "secondary" },
    ],
  },
  "overlap-tilt": {
    key: "overlap-tilt",
    label: "Overlapping screenshots",
    description: "Two tilted, overlapping screenshot cards without device frames.",
    span: 1,
    copy: { position: "top", align: "center", heightRatio: 0.24 },
    devices: [
      { widthRatio: 0.72, x: 0.39, y: 0.66, rotate: -3, capture: "secondary" },
      { widthRatio: 0.74, x: 0.62, y: 0.72, rotate: 4, capture: "primary" },
    ],
    capturePresentation: {
      aspectRatio: 0.78,
      cornerRadiusRatio: 0.022,
      objectFit: "cover",
      objectPosition: "top center",
    },
  },
  "screenshot-pair": {
    key: "screenshot-pair",
    label: "Screenshot pair",
    description: "Two upright screenshot cards, evenly spaced and fully visible.",
    span: 1,
    copy: { position: "top", align: "center", heightRatio: 0.24 },
    devices: [
      { widthRatio: 0.46, x: 0.27, y: 0.63, rotate: 0, capture: "primary" },
      { widthRatio: 0.46, x: 0.73, y: 0.63, rotate: 0, capture: "secondary" },
    ],
    capturePresentation: {
      aspectRatio: 0.78,
      cornerRadiusRatio: 0.022,
      objectFit: "contain",
      objectPosition: "center",
    },
  },
};

/**
 * The same layout concepts re-composed for a wide Mac canvas. Device
 * widths are fractions of one 2880px tile; panorama coordinates still span
 * two tiles, matching the portrait layout contract.
 */
export const LANDSCAPE_LAYOUTS: Record<LayoutKey, LayoutSpec> = {
  classic: {
    ...LAYOUTS.classic,
    copy: { position: "top", align: "center", heightRatio: 0.28, widthRatio: 0.76 },
    devices: single({ widthRatio: 0.84, x: 0.5, y: 0.62, fitBelowCopy: true }),
  },
  "copy-below": {
    ...LAYOUTS["copy-below"],
    copy: { position: "bottom", align: "center", heightRatio: 0.27, widthRatio: 0.76 },
    devices: single({ widthRatio: 0.6, x: 0.5, y: 0.365 }),
  },
  hero: {
    ...LAYOUTS.hero,
    copy: { position: "top", align: "center", heightRatio: 0.24, widthRatio: 0.8 },
    devices: single({ widthRatio: 0.98, x: 0.5, y: 0.74 }),
  },
  offset: {
    ...LAYOUTS.offset,
    copy: { position: "top", align: "left", heightRatio: 0.28, widthRatio: 0.52 },
    devices: single({ widthRatio: 0.86, x: 0.63, y: 0.72 }),
  },
  tilt: {
    ...LAYOUTS.tilt,
    copy: { position: "top", align: "center", heightRatio: 0.25, widthRatio: 0.8 },
    devices: single({ widthRatio: 0.92, x: 0.5, y: 0.72, rotate: -3 }),
  },
  "tilt-right": {
    ...LAYOUTS["tilt-right"],
    copy: { position: "top", align: "left", heightRatio: 0.28, widthRatio: 0.52 },
    devices: single({ widthRatio: 0.86, x: 0.64, y: 0.72, rotate: 4 }),
  },
  duo: {
    ...LAYOUTS.duo,
    copy: { position: "top", align: "center", heightRatio: 0.25, widthRatio: 0.8 },
    devices: [
      { widthRatio: 0.58, x: 0.32, y: 0.57, rotate: 0, capture: "secondary" },
      { widthRatio: 0.65, x: 0.66, y: 0.7, rotate: 0, capture: "primary" },
    ],
  },
  "duo-tilt": {
    ...LAYOUTS["duo-tilt"],
    copy: { position: "top", align: "center", heightRatio: 0.25, widthRatio: 0.8 },
    devices: [
      { widthRatio: 0.56, x: 0.31, y: 0.56, rotate: -4, capture: "secondary" },
      { widthRatio: 0.63, x: 0.67, y: 0.71, rotate: 3, capture: "primary" },
    ],
  },
  panorama: {
    ...LAYOUTS.panorama,
    copy: { position: "top", align: "left", heightRatio: 0.28, x: 0.055, widthRatio: 0.72 },
    devices: single({ widthRatio: 0.96, x: 0.54, y: 0.76, rotate: -3 }),
  },
  "panorama-duo": {
    ...LAYOUTS["panorama-duo"],
    copy: { position: "top", align: "center", heightRatio: 0.25, widthRatio: 1.45 },
    devices: [
      { widthRatio: 0.76, x: 0.27, y: 0.7, rotate: 3, capture: "primary" },
      { widthRatio: 0.76, x: 0.73, y: 0.7, rotate: -3, capture: "secondary" },
    ],
  },
  minimal: {
    ...LAYOUTS.minimal,
    devices: single({ widthRatio: 0.8, x: 0.5, y: 0.5 }),
  },
  gallery: {
    ...LAYOUTS.gallery,
    copy: { position: "bottom", align: "left", heightRatio: 0.26, widthRatio: 0.55 },
    devices: single({ widthRatio: 0.48, x: 0.64, y: 0.35, rotate: 3 }),
  },
  "side-by-side": {
    ...LAYOUTS["side-by-side"],
    copy: { position: "top", align: "center", heightRatio: 0.24, widthRatio: 0.8 },
    devices: [
      { widthRatio: 0.45, x: 0.27, y: 0.72, rotate: -2, capture: "primary" },
      { widthRatio: 0.45, x: 0.73, y: 0.72, rotate: 2, capture: "secondary" },
    ],
    capturePresentation: {
      aspectRatio: 3 / 4,
      cornerRadiusRatio: 0.022,
      objectFit: "cover",
      objectPosition: "center",
    },
  },
  "overlap-tilt": {
    ...LAYOUTS["overlap-tilt"],
    copy: { position: "top", align: "center", heightRatio: 0.24, widthRatio: 0.88 },
    devices: [
      { widthRatio: 0.45, x: 0.29, y: 0.72, rotate: 3, capture: "secondary" },
      { widthRatio: 0.47, x: 0.7, y: 0.73, rotate: 5, capture: "primary" },
    ],
  },
  "screenshot-pair": {
    ...LAYOUTS["screenshot-pair"],
    copy: { position: "top", align: "center", heightRatio: 0.24, widthRatio: 0.88 },
    devices: [
      { widthRatio: 0.345, x: 0.29, y: 0.64, rotate: 0, capture: "primary" },
      { widthRatio: 0.345, x: 0.71, y: 0.64, rotate: 0, capture: "secondary" },
    ],
  },
};

export function isLayoutKey(key: string): key is LayoutKey {
  return (LAYOUT_KEYS as readonly string[]).includes(key);
}

export const TEMPLATE_KEYS = [
  "uniform",
  "editorial",
  "showcase",
  "magazine",
  "storyboard",
  "dynamic",
] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];
export type TemplateSpec = {
  key: TemplateKey;
  label: string;
  description: string;
  sequence: LayoutKey[];
};

export const TEMPLATES: Record<TemplateKey, TemplateSpec> = {
  uniform: { key: "uniform", label: "Uniform", description: "One layout throughout.", sequence: [] },
  editorial: {
    key: "editorial",
    label: "Editorial",
    description: "A varied, story-led strip.",
    sequence: ["panorama", "hero", "offset", "minimal", "tilt"],
  },
  showcase: {
    key: "showcase",
    label: "Showcase",
    description: "Large devices with paired screens.",
    sequence: ["hero", "tilt", "duo", "tilt-right", "minimal"],
  },
  magazine: {
    key: "magazine",
    label: "Magazine",
    description: "Editorial copy and strong rhythm.",
    sequence: ["offset", "copy-below", "tilt-right", "hero", "minimal"],
  },
  storyboard: {
    key: "storyboard",
    label: "Storyboard",
    description: "A sequence focused on product flow.",
    sequence: ["panorama-duo", "copy-below", "hero", "minimal", "tilt"],
  },
  dynamic: {
    key: "dynamic",
    label: "Dynamic",
    description: "Tilted, energetic compositions.",
    sequence: ["tilt", "duo-tilt", "panorama", "minimal", "tilt-right"],
  },
};

export function isTemplateKey(key: string): key is TemplateKey {
  return (TEMPLATE_KEYS as readonly string[]).includes(key);
}

export type TemplateChoice = TemplateKey | LayoutKey[];

function templateSequence(choice: TemplateChoice | undefined): LayoutKey[] {
  if (!choice) return [];
  return Array.isArray(choice) ? choice : TEMPLATES[choice].sequence;
}

export function resolveScenes<S extends { id: string; layout?: string; secondScene?: string }>(
  scenes: S[],
  opts: { template?: TemplateChoice; layout?: string; sceneLayouts?: Record<string, string> },
): Array<{ scene: S; layout: LayoutSpec; secondScene: string | undefined }> {
  const sequence = templateSequence(opts.template);
  const fallback = opts.layout && isLayoutKey(opts.layout) ? opts.layout : "classic";
  return scenes.map((scene, index) => {
    const requested =
      opts.sceneLayouts?.[scene.id] ??
      scene.layout ??
      (sequence.length ? sequence[index % sequence.length] : undefined) ??
      fallback;
    const layout = LAYOUTS[isLayoutKey(requested) ? requested : "classic"];
    let secondScene = scene.secondScene;
    if (needsSecondCapture(layout) && !secondScene && scenes.length > 1) {
      secondScene = scenes[(index + 1) % scenes.length]?.id;
    }
    return { scene, layout, secondScene };
  });
}

export type Rect = { left: number; top: number; width: number; height: number };
export type FrameGeometry = {
  width: number;
  height: number;
  screen: { x: number; y: number; width: number; height: number };
  screenRadius: number;
};
export type Composition = {
  width: number;
  height: number;
  designWidth: number;
  copy: {
    position: "top" | "bottom";
    align: CopyAlign;
    x: number;
    y: number;
    maxWidth: number;
    box: Rect;
  } | null;
  type: typeof TYPE | typeof LANDSCAPE_TYPE;
  devices: Array<{
    frame: Rect;
    screen: Rect & { radius: number };
    rotate: number;
    capture: "primary" | "secondary";
  }>;
};

const FRAME: FrameGeometry = {
  width: 606,
  height: 1252,
  screen: { x: 24, y: 21, width: 557, height: 1210 },
  screenRadius: 82,
};
const REF_TILE_ASPECT = 1320 / 2868;

export function compose(
  spec: LayoutSpec,
  tileIn: { width: number; height: number },
  theme: { copyHeightRatio: number; deviceWidthRatio: number },
  opts: {
    screenOnly?: boolean;
    geom?: FrameGeometry;
    slotGeometries?: Partial<Record<DevicePlacement["capture"], SlotGeometry>>;
  } = {},
): Composition {
  const landscape = tileIn.width > tileIn.height;
  const resolvedSpec = landscape ? LANDSCAPE_LAYOUTS[spec.key] : spec;
  const capture = resolvedSpec.capturePresentation;
  const geom = capture
    ? {
        width: 1000,
        height: 1000 / capture.aspectRatio,
        screen: { x: 0, y: 0, width: 1000, height: 1000 / capture.aspectRatio },
        screenRadius: 1000 * capture.cornerRadiusRatio,
      }
    : (opts.geom ?? FRAME);
  const type = landscape ? LANDSCAPE_TYPE : TYPE;
  // Keep wider portrait store sizes aligned to the iPhone reference, but let
  // landscape targets such as Mac use their full canvas width.
  const tile =
    tileIn.width <= tileIn.height && tileIn.width / tileIn.height > REF_TILE_ASPECT + 1e-6
      ? { width: tileIn.height * REF_TILE_ASPECT, height: tileIn.height }
      : tileIn;
  const dx = (spec.span * (tileIn.width - tile.width)) / 2;
  const width = tile.width * resolvedSpec.span;
  const height = tile.height;
  const art = opts.screenOnly
    ? { width: geom.screen.width, height: geom.screen.height, screen: { x: 0, y: 0 } }
    : { width: geom.width, height: geom.height, screen: geom.screen };
  const classic = resolvedSpec.key === "classic";
  const copyHeight =
    resolvedSpec.copy.position === "none"
      ? 0
      : tile.height *
        (resolvedSpec.copy.heightRatio ?? (classic ? theme.copyHeightRatio : 0.24));
  const padX = tile.width * type.padX;
  const maxWidth = resolvedSpec.copy.widthRatio
    ? tile.width * resolvedSpec.copy.widthRatio
    : tile.width - 2 * padX;

  let copy: Composition["copy"] = null;
  if (resolvedSpec.copy.position !== "none") {
    const x =
      resolvedSpec.copy.x !== undefined
        ? width * resolvedSpec.copy.x
        : resolvedSpec.copy.align === "left"
          ? padX
          : width / 2;
    const copyDx = resolvedSpec.copy.align === "left" ? 0 : dx;
    const boxLeft = resolvedSpec.copy.align === "left" ? x : x - maxWidth / 2;
    const top = resolvedSpec.copy.position === "top" ? 0 : height - copyHeight;
    copy = {
      position: resolvedSpec.copy.position,
      align: resolvedSpec.copy.align,
      x: x + copyDx,
      y:
        resolvedSpec.copy.position === "top"
          ? height * type.padTop
          : height - height * type.padBottom,
      maxWidth,
      box: { left: boxLeft + copyDx, top, width: maxWidth, height: copyHeight },
    };
  }

  const squat = tile !== tileIn;
  const devices = resolvedSpec.devices.map((placement) => {
    const override = opts.slotGeometries?.[placement.capture];
    const widthRatio = override?.widthRatio ??
      (classic && !landscape ? theme.deviceWidthRatio : placement.widthRatio);
    const deviceTile =
      squat && !placement.fitBelowCopy && resolvedSpec.copy.position !== "none" ? tileIn : tile;
    let scale = (deviceTile.width * widthRatio) / art.width;
    let frameHeight = override?.heightRatio !== undefined
      ? tile.height * override.heightRatio
      : art.height * scale;
    let left: number;
    let top: number;
    if (placement.fitBelowCopy && !override) {
      const bottomMargin = height * CLASSIC_BOTTOM_MARGIN;
      const available = height - copyHeight - bottomMargin;
      scale = Math.min(scale, available / art.height);
      frameHeight = art.height * scale;
      left = (width - art.width * scale) / 2 + dx;
      top = copyHeight + (available - frameHeight) / 2;
    } else {
      left = tileIn.width * resolvedSpec.span * (override?.x ?? placement.x) - (art.width * scale) / 2;
      top = height * (override?.y ?? placement.y) - frameHeight / 2;
      if (squat && !override && copy?.position === "top") top = Math.max(top, copy.box.height + height * 0.015);
      if (squat && !override && copy?.position === "bottom") {
        top = Math.min(top, copy.box.top - height * 0.015 - frameHeight);
      }
    }
    const verticalScale = frameHeight / art.height;
    return {
      frame: { left, top, width: art.width * scale, height: frameHeight },
      screen: {
        left: left + art.screen.x * scale,
        top: top + art.screen.y * verticalScale,
        width: geom.screen.width * scale,
        height: geom.screen.height * verticalScale,
        radius: geom.screenRadius * Math.min(scale, verticalScale),
      },
      rotate: override?.rotate ?? placement.rotate,
      capture: placement.capture,
    };
  });
  return {
    width: tileIn.width * resolvedSpec.span,
    height,
    copy,
    type,
    devices,
    designWidth: tile.width,
  };
}

function needsSecondCapture(spec: LayoutSpec): boolean {
  return spec.devices.some((device) => device.capture === "secondary");
}
