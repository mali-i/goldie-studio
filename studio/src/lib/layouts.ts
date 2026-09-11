/**
 * Browser-side layout engine. This intentionally lives inside Studio so the
 * standalone app can build without importing the Goldie CLI source tree.
 */

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
  opts: { screenOnly?: boolean; geom?: FrameGeometry } = {},
): Composition {
  const geom = opts.geom ?? FRAME;
  const tile =
    tileIn.width / tileIn.height > REF_TILE_ASPECT + 1e-6
      ? { width: tileIn.height * REF_TILE_ASPECT, height: tileIn.height }
      : tileIn;
  const dx = (spec.span * (tileIn.width - tile.width)) / 2;
  const width = tile.width * spec.span;
  const height = tile.height;
  const art = opts.screenOnly
    ? { width: geom.screen.width, height: geom.screen.height, screen: { x: 0, y: 0 } }
    : { width: geom.width, height: geom.height, screen: geom.screen };
  const classic = spec.key === "classic";
  const copyHeight =
    spec.copy.position === "none"
      ? 0
      : tile.height * (classic ? theme.copyHeightRatio : (spec.copy.heightRatio ?? 0.24));
  const padX = tile.width * TYPE.padX;
  const maxWidth = spec.copy.widthRatio ? tile.width * spec.copy.widthRatio : tile.width - 2 * padX;

  let copy: Composition["copy"] = null;
  if (spec.copy.position !== "none") {
    const x =
      spec.copy.x !== undefined
        ? width * spec.copy.x
        : spec.copy.align === "left"
          ? padX
          : width / 2;
    const copyDx = spec.copy.align === "left" ? 0 : dx;
    const boxLeft = spec.copy.align === "left" ? x : x - maxWidth / 2;
    const top = spec.copy.position === "top" ? 0 : height - copyHeight;
    copy = {
      position: spec.copy.position,
      align: spec.copy.align,
      x: x + copyDx,
      y: spec.copy.position === "top" ? height * TYPE.padTop : height - height * TYPE.padBottom,
      maxWidth,
      box: { left: boxLeft + copyDx, top, width: maxWidth, height: copyHeight },
    };
  }

  const squat = tile !== tileIn;
  const devices = spec.devices.map((placement) => {
    const widthRatio = classic ? theme.deviceWidthRatio : placement.widthRatio;
    const deviceTile =
      squat && !placement.fitBelowCopy && spec.copy.position !== "none" ? tileIn : tile;
    let scale = (deviceTile.width * widthRatio) / art.width;
    let left: number;
    let top: number;
    if (placement.fitBelowCopy) {
      const bottomMargin = height * CLASSIC_BOTTOM_MARGIN;
      const available = height - copyHeight - bottomMargin;
      scale = Math.min(scale, available / art.height);
      left = (width - art.width * scale) / 2 + dx;
      top = copyHeight + (available - art.height * scale) / 2;
    } else {
      left = tileIn.width * spec.span * placement.x - (art.width * scale) / 2;
      top = height * placement.y - (art.height * scale) / 2;
      if (squat && copy?.position === "top") top = Math.max(top, copy.box.height + height * 0.015);
      if (squat && copy?.position === "bottom") {
        top = Math.min(top, copy.box.top - height * 0.015 - art.height * scale);
      }
    }
    return {
      frame: { left, top, width: art.width * scale, height: art.height * scale },
      screen: {
        left: left + art.screen.x * scale,
        top: top + art.screen.y * scale,
        width: geom.screen.width * scale,
        height: geom.screen.height * scale,
        radius: geom.screenRadius * scale,
      },
      rotate: placement.rotate,
      capture: placement.capture,
    };
  });
  return { width: tileIn.width * spec.span, height, copy, devices, designWidth: tile.width };
}

function needsSecondCapture(spec: LayoutSpec): boolean {
  return spec.devices.some((device) => device.capture === "secondary");
}
