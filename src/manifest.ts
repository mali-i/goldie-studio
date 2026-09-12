/** Data contract shared by the workspace API and the browser renderer. */

export type Theme = {
  background: string;
  headlineColor: string;
  subheadColor: string;
  fontFamily: string;
  /** Fraction of the frame height reserved for copy above the device. */
  copyHeightRatio: number;
  /** Fraction of the frame width the device bezel occupies. */
  deviceWidthRatio: number;
};

/** An optional layer drawn behind the uploaded device screenshot. */
export type Decoration =
  | {
      kind: "badge";
      text: Record<string, string>;
      position: "top-left" | "top-right" | "bottom-left" | "bottom-right";
      background?: string;
      color?: string;
    }
  | { kind: "image"; src: string; x: number; y: number; width: number; rotate?: number };

export type LayoutEntry = { key: string; label: string; description: string; span: number };
export type TemplateEntry = { key: string; label: string; description: string; sequence: string[] };

/** Mirrors FrameGeometry in src/layouts.ts: a bezel image's box and the screen cutout inside it. */
export type FrameGeometry = {
  width: number;
  height: number;
  screen: { x: number; y: number; width: number; height: number };
  screenRadius: number;
};

export type DeviceEntry = {
  key: string;
  label: string;
  platform: "ios" | "android" | "macos";
  simulatorName: string | null;
  screenshot: { width: number; height: number };
  preview: { width: number; height: number } | null;
  /** Device-specific frame geometry, or null when the iPhone frame picker applies. */
  frame: { url: string; geom: FrameGeometry } | null;
};

export type DesignScene = {
  id: string;
  headline: Record<string, string>;
  subhead?: Record<string, string>;
  layout?: string;
  secondScene?: string;
  decorations?: Decoration[];
};

export type BundledFont = {
  key: string;
  family: string;
  fallback: string;
  faces: Array<{ weight: number; url: string }>;
};

export type DeviceCaptures = {
  screenshots: Array<{ sceneId: string; url: string }>;
  clips: Array<{ segmentId: string; url: string; durationSeconds: number }> | null;
};

export type Design = {
  theme: Theme;
  /** null when the config points at custom bezel art. */
  frameVariant: string | null;
  frameVariants: string[];
  /** Standalone Studio may map a frame key to any same-origin asset URL. */
  frameAssets?: Record<string, string>;
  customFrameUrl: string | null;
  /** Bundled typefaces with the @font-face sources to declare. */
  fonts: BundledFont[];
  layouts: LayoutEntry[];
  templates: TemplateEntry[];
  /** The theme's template: a built-in key, null for none, or the config's custom sequence. */
  template: string | string[] | null;
  /** The theme's default layout key. */
  layout: string;
  screenOnly: boolean;
  decorations: Decoration[];
  scenes: DesignScene[];
  preview: {
    sceneId: string;
    segments: Array<{ id: string }>;
  } | null;
  /** Screenshot source URLs per device key. */
  captures: Record<string, DeviceCaptures>;
  /** Upload projects can provide a different source image for each locale. */
  capturesByLocale?: Record<string, Record<string, DeviceCaptures>>;
};

export type StoreManifest = {
  /** True for the assets bundled with the standalone Studio. */
  demo?: boolean;
  generatedAt: string;
  app: {
    name: string;
    subtitle: Record<string, string>;
    developer: string;
    category: string;
    rating: number;
    ratingCount: string;
    ageRating: string;
    price: string;
    description: Record<string, string>;
  };
  devices: DeviceEntry[];
  locales: string[];
  design: Design;
};

export async function loadManifest(projectId?: string): Promise<StoreManifest> {
  if (projectId && projectId !== "demo") {
    const project = await fetch(`/api/projects/${encodeURIComponent(projectId)}/manifest`, {
      cache: "no-store",
    });
    if (!project.ok) throw new Error((await project.text()) || `Loading project failed (${project.status}).`);
    return cacheBust((await project.json()) as StoreManifest);
  }
  const res = await fetch("/demo/store.json", { cache: "no-store" });
  if (!res.ok) {
    throw new Error("The bundled demo could not be loaded.");
  }
  const manifest: StoreManifest = await res.json();
  if (!manifest.design?.fonts || !manifest.design.layouts) {
    throw new Error("The bundled demo manifest is invalid.");
  }

  // Uploaded files keep stable names when replaced, so the manifest timestamp
  // acts as a cache-buster and a reload shows the latest pixels.
  return cacheBust(manifest);
}

function cacheBust(manifest: StoreManifest): StoreManifest {
  const v = `?v=${Date.parse(manifest.generatedAt) || 0}`;
  for (const captures of Object.values(manifest.design.captures)) {
    for (const shot of captures.screenshots) shot.url += v;
    for (const clip of captures.clips ?? []) clip.url += v;
  }
  for (const locales of Object.values(manifest.design.capturesByLocale ?? {})) {
    for (const captures of Object.values(locales)) {
      for (const shot of captures.screenshots) shot.url += v;
      for (const clip of captures.clips ?? []) clip.url += v;
    }
  }
  return manifest;
}

/** Design choices persisted into a project config, or localStorage for Demo. */
export type SavedDesign = {
  background?: string;
  frame?: string;
  fontFamily?: string;
  /** Copy edited in the lightbox, per screenshot scene id, then locale. */
  copy?: Record<string, SceneCopy>;
  /** Screenshot scene ids in the order the tiles were dragged into. */
  order?: string[];
  /** A built-in template key, or "" for none. */
  template?: string;
  /** Default layout key for scenes the template does not cover. */
  layout?: string;
  screenOnly?: boolean;
  /** Layout overrides per screenshot scene id. */
  sceneLayouts?: Record<string, string>;
};

export type SceneCopy = {
  headline?: Record<string, string>;
  subhead?: Record<string, string>;
};

export async function loadDesign(projectId?: string): Promise<SavedDesign> {
  if (projectId && projectId !== "demo") {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/design`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Could not load project design (${res.status}).`);
    const parsed = await res.json();
    return parsed && typeof parsed === "object" ? (parsed as SavedDesign) : {};
  }
  try {
    const res = await fetch("/api/design", { cache: "no-store" });
    if (!res.ok || !res.headers.get("content-type")?.includes("application/json")) {
      return loadLocalDesign();
    }
    const parsed = await res.json();
    return parsed && typeof parsed === "object" ? (parsed as SavedDesign) : {};
  } catch {
    return loadLocalDesign();
  }
}

export async function saveDesign(design: SavedDesign, projectId?: string): Promise<void> {
  if (projectId && projectId !== "demo") {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/design`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(design),
    });
    if (!res.ok) throw new Error(`Could not save project design (${res.status}).`);
    return;
  }
  try {
    const res = await fetch("/api/design", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(design),
    });
    if (res.ok) return;
  } catch {
    // The standalone Studio has no API; persist the demo choices locally.
  }
  localStorage.setItem(LOCAL_DESIGN_KEY, JSON.stringify(design));
}

const LOCAL_DESIGN_KEY = "goldie-studio:standalone-design";

function loadLocalDesign(): SavedDesign {
  try {
    const parsed = JSON.parse(localStorage.getItem(LOCAL_DESIGN_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as SavedDesign) : {};
  } catch {
    return {};
  }
}
