import {
  CameraIcon,
  LaptopIcon,
  type LucideIcon,
  SmartphoneIcon,
  TabletIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EmptyState } from "./components/EmptyState";
import { Sidebar } from "./components/Sidebar";
import { Strip } from "./components/Strip";
import { useHistory } from "./lib/useHistory";
import { projectApi } from "./project-api";
import { DEFAULT_DEVICE_BY_PLATFORM, type ProjectSummary } from "./project";
import {
  type BundledFont,
  type CapturePosition,
  type CapturePositions,
  type Design,
  type DeviceEntry,
  loadDesign,
  loadManifest,
  type SavedDesign,
  type SceneCopy,
  type SlotGeometries,
  type SlotGeometry,
  type StoreManifest,
  saveDesign,
} from "./manifest";

/** Sentinel for the config's own layout sequence, which the studio can show but not edit. */
export const CUSTOM_TEMPLATE = "__custom__";

export type Platform = "ios" | "ipados" | "android" | "macos";

/** Shown when a store tab has no configured upload target. */
const ENABLE_PLATFORM: Record<
  Platform,
  { icon: LucideIcon; title: string; body: string }
> = {
  ios: {
    icon: SmartphoneIcon,
    title: "No App Store screenshots yet",
    body: "Upload screenshots for this iPhone size.",
  },
  ipados: {
    icon: TabletIcon,
    title: "No iPad screenshots yet",
    body: "Upload screenshots for this iPad size.",
  },
  android: {
    icon: SmartphoneIcon,
    title: "No Google Play screenshots yet",
    body: "Upload screenshots for this Android size.",
  },
  macos: {
    icon: LaptopIcon,
    title: "No Mac App Store screenshots yet",
    body: "Upload screenshots for this Mac size.",
  },
};

/** How long the design must sit still before it is written to disk. */
const SAVE_DEBOUNCE_MS = 500;

export function App() {
  const [projectId, setProjectId] = useState(initialProjectId);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState<{ manifest: StoreManifest; design: SavedDesign } | null>(
    null,
  );
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    projectApi.list().then((items) => {
      setProjects(items);
      if (projectId === "demo" || items.some((project) => project.id === projectId)) return;
      const migrated = items.find((project) => project.legacyIds?.includes(projectId));
      if (!migrated) return;
      window.history.replaceState({}, "", `/projects/${encodeURIComponent(migrated.id)}`);
      localStorage.setItem("goldie-studio:last-project", migrated.id);
      setProjectId(migrated.id);
    }).catch(() => setProjects([]));
    const pop = () => setProjectId(projectIdFromLocation() ?? "demo");
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);

  useEffect(() => {
    setLoaded(null);
    setError(null);
    Promise.all([loadManifest(projectId), loadDesign(projectId)])
      .then(([manifest, design]) => setLoaded({ manifest, design }))
      .catch((e: Error) => setError(e));
  }, [projectId, revision]);

  const selectProject = (id: string) => {
    window.history.pushState({}, "", `/projects/${encodeURIComponent(id)}`);
    localStorage.setItem("goldie-studio:last-project", id);
    setProjectId(id);
  };
  const createProject = async () => {
    const name = window.prompt("Project name", "Untitled App")?.trim();
    if (!name) return;
    try {
      const created = await projectApi.create(name);
      setProjects((current) => [created.project, ...current]);
      selectProject(created.project.id);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    }
  };

  if (error)
    return (
      <EmptyState
        icon={TriangleAlertIcon}
        title="The studio could not load"
        body={error.message}
      />
    );
  if (!loaded) return null;
  return (
    <Loaded
      key={projectId}
      projectId={projectId}
      projects={projects}
      manifest={loaded.manifest}
      saved={loaded.design}
      onProject={selectProject}
      onNewProject={() => void createProject()}
      onAssetsChanged={() => {
        setRevision((value) => value + 1);
        projectApi.list().then(setProjects).catch(() => {});
      }}
    />
  );
}

function projectIdFromLocation(): string | null {
  const match = window.location.pathname.match(/^\/projects\/([^/]+)\/?$/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function initialProjectId(): string {
  return projectIdFromLocation() ?? localStorage.getItem("goldie-studio:last-project") ?? "demo";
}

/**
 * All design state lives here as plain React state: the strip composites the
 * scenes in the browser, so a background or frame change repaints instantly.
 *
 * Two things survive a reload. The design choices (background, frame, font,
 * layout and screen-only mode, per-scene layout overrides, copy edited in the
 * lightbox, the order tiles were dragged into)
 * are written into the workspace project's goldie.config.ts, debounced. Demo
 * choices stay in browser localStorage. View choices (platform, device,
 * locale, dark) also live in localStorage under the app's name and fall back to
 * the config when a stored value no longer applies (a device or frame
 * variant removed from the config, for instance).
 */
function Loaded({
  projectId,
  projects,
  manifest,
  saved,
  onProject,
  onNewProject,
  onAssetsChanged,
}: {
  projectId: string;
  projects: ProjectSummary[];
  manifest: StoreManifest;
  saved: SavedDesign;
  onProject: (id: string) => void;
  onNewProject: () => void;
  onAssetsChanged: () => void;
}) {
  const design = manifest.design;
  const view = loadView(manifest.app.name);
  // The selected device family is view state. Workspace tabs register their
  // target on first selection, while the bundled demo remains read-only.
  const initialPlatform: Platform =
    view.platform === "ios" || view.platform === "ipados" || view.platform === "android" || view.platform === "macos"
      ? view.platform
      : (manifest.devices.find((d) => d.key === view.device)?.platform ??
        manifest.devices[0]?.platform ??
        "ios");
  const [platform, setPlatform] = useState(initialPlatform);
  const [device, setDevice] = useState(() => {
    const devices = manifest.devices.filter((d) => d.platform === initialPlatform);
    return devices.some((d) => d.key === view.device)
      ? (view.device as string)
      : (devices[0]?.key ?? manifest.devices[0]?.key ?? "");
  });
  const selectPlatform = (p: Platform) => {
    setPlatform(p);
    const devices = manifest.devices.filter((d) => d.platform === p);
    const target = devices[0]?.key ?? DEFAULT_DEVICE_BY_PLATFORM[p];
    setDevice(target);
    if (!manifest.demo && devices.length === 0) {
      projectApi.addDevice(projectId, target).then(
        () => onAssetsChanged(),
        (e: Error) => setSaveError(e.message),
      );
    }
  };
  // Keep uploads and exports pointed at a configured device after a manifest refresh.
  useEffect(() => {
    const devices = manifest.devices.filter((entry) => entry.platform === platform);
    if (devices.length > 0 && !devices.some((entry) => entry.key === device)) {
      setDevice(devices[0]!.key);
    }
  }, [device, manifest.devices, platform]);
  const [locale, setLocale] = useState(
    view.locale && manifest.locales.includes(view.locale)
      ? view.locale
      : (manifest.locales[0] ?? ""),
  );
  const [dark, setDark] = useState(
    new URLSearchParams(window.location.search).get("dark") === "1" || view.dark === true,
  );
  const selectLocale = (next: string) => {
    setLocale(next);
    storeView(manifest.app.name, { platform, device, locale: next, dark });
  };
  const knownLayout = (key: string | undefined) =>
    key && design.layouts.some((l) => l.key === key) ? key : undefined;
  const { state, set } = useHistory<DesignState>(() => ({
    background: saved.background ?? design.theme.background,
    frame:
      saved.frame && design.frameVariants.includes(saved.frame)
        ? saved.frame
        : (design.frameVariant ?? ""),
    fontFamily: saved.fontFamily ?? design.theme.fontFamily,
    copy: saved.copy ?? {},
    layout: knownLayout(saved.layout) ?? design.layout,
    template: initialTemplate(design, saved),
    screenOnly: saved.screenOnly ?? design.screenOnly,
    sceneLayouts: initialSceneLayouts(design, saved, knownLayout),
    capturePositions: saved.capturePositions ?? {},
    slotGeometries: saved.slotGeometries ?? {},
    order: initialOrder(design, saved),
  }));
  const {
    background, frame, fontFamily, copy, layout, template, screenOnly,
    sceneLayouts, capturePositions, slotGeometries, order,
  } = state;
  // Each setter names its field so a burst of edits to one control (a drag
  // on the gradient picker) collapses into a single undo step.
  const field =
    <K extends keyof DesignState>(key: K) =>
    (value: DesignState[K]) =>
      set(key, (prev) => ({ ...prev, [key]: value }));
  const setBackground = field("background");
  const setFrame = field("frame");
  const setFontFamily = field("fontFamily");
  const setLayout = field("layout");
  // Picking a template replaces the strip's layout sequence, so any per-scene
  // overrides made against the previous one are dropped with it.
  const setTemplate = (value: string) =>
    set("template", (prev) => ({ ...prev, template: value, sceneLayouts: {} }));
  const setScreenOnly = field("screenOnly");
  const setOrder = field("order");
  // Per-scene layout overrides; a scene absent there follows the default above.
  const setSceneLayout = (sceneId: string, key: string | undefined) =>
    set("sceneLayouts", (prev) => {
      const next = { ...prev.sceneLayouts };
      if (key) next[sceneId] = key;
      else delete next[sceneId];
      return { ...prev, sceneLayouts: next };
    });
  const setCapturePosition = (
    sceneId: string,
    deviceKey: string,
    localeKey: string,
    slot: "primary" | "secondary",
    position: CapturePosition,
  ) =>
    set(`capture:${sceneId}:${deviceKey}:${localeKey}:${slot}`, (prev) => ({
      ...prev,
      capturePositions: {
        ...prev.capturePositions,
        [sceneId]: {
          ...prev.capturePositions[sceneId],
          [deviceKey]: {
            ...prev.capturePositions[sceneId]?.[deviceKey],
            [localeKey]: {
              ...prev.capturePositions[sceneId]?.[deviceKey]?.[localeKey],
              [slot]: position,
            },
          },
        },
      },
    }));
  const setSlotGeometry = (
    sceneId: string,
    deviceKey: string,
    localeKey: string,
    layoutKey: string,
    slot: "primary" | "secondary",
    geometry: SlotGeometry | undefined,
  ) =>
    set(`slot:${sceneId}:${deviceKey}:${localeKey}:${layoutKey}:${slot}`, (prev) => {
      const slots = {
        ...prev.slotGeometries[sceneId]?.[deviceKey]?.[localeKey]?.[layoutKey],
      };
      if (geometry) slots[slot] = geometry;
      else delete slots[slot];
      return {
        ...prev,
        slotGeometries: {
          ...prev.slotGeometries,
          [sceneId]: {
            ...prev.slotGeometries[sceneId],
            [deviceKey]: {
              ...prev.slotGeometries[sceneId]?.[deviceKey],
              [localeKey]: {
                ...prev.slotGeometries[sceneId]?.[deviceKey]?.[localeKey],
                [layoutKey]: slots,
              },
            },
          },
        },
      };
    });
  const setSceneCopy = (sceneId: string, fieldName: "headline" | "subhead", text: string) =>
    set(`copy:${sceneId}:${fieldName}`, (prev) => ({
      ...prev,
      copy: {
        ...prev.copy,
        [sceneId]: {
          ...prev.copy[sceneId],
          [fieldName]: { ...prev.copy[sceneId]?.[fieldName], [locale]: text },
        },
      },
    }));

  useEffect(() => {
    storeView(manifest.app.name, { platform, device, locale, dark });
  }, [manifest.app.name, platform, device, locale, dark]);

  // Write the design once it has sat still for a moment; a drag on the
  // gradient picker fires many changes a second. Skips the initial mount.
  const [saveError, setSaveError] = useState<string | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const timer = setTimeout(() => {
      saveDesign({
        background,
        frame: frame || undefined,
        fontFamily,
        copy: Object.keys(copy).length > 0 ? copy : undefined,
        order: order.length > 0 ? order : undefined,
        template: template === CUSTOM_TEMPLATE ? undefined : template,
        layout,
        screenOnly,
        sceneLayouts,
        capturePositions,
        slotGeometries,
      }, projectId).then(
        () => setSaveError(null),
        (e: Error) => setSaveError(e.message),
      );
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [background, frame, fontFamily, copy, order, template, layout, screenOnly, sceneLayouts, capturePositions, slotGeometries, projectId]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  // The bundled typefaces' @font-face rules, declared once in <head>.
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = fontFaces(design.fonts);
    document.head.append(style);
    return () => style.remove();
  }, [design.fonts]);

  // The exporter appends the bundled CJK typeface as a per-glyph fallback, so
  // the preview does the same; otherwise the browser would silently substitute
  // a system font for characters the chosen stack cannot draw. Only the bare
  // stack is saved to goldie.design.json.
  const cjk = design.fonts.find((f) => f.key === "noto-sans-sc");
  const previewFontFamily =
    cjk && !fontFamily.includes(cjk.family) ? `${fontFamily}, "${cjk.family}"` : fontFamily;

  const platformDevices = manifest.devices.filter((d) => d.platform === platform);
  const spec = platformDevices.find((d) => d.key === device) ?? platformDevices[0];
  const captures = spec
    ? (design.capturesByLocale?.[spec.key]?.[locale] ?? design.captures[spec.key])
    : undefined;
  const frameUrl = spec?.platform === "android"
    ? ""
    : frame
      ? (design.frameAssets?.[frame] ?? `frames/${frame}.png`)
      : (design.customFrameUrl ?? `frames/${design.frameVariants[0]}.png`);

  return (
    <div className="flex h-full bg-stage p-3 text-foreground">
      <Sidebar
        projectId={projectId}
        projects={projects}
        demo={manifest.demo === true}
        onProject={onProject}
        onNewProject={onNewProject}
        onAssetsChanged={onAssetsChanged}
        manifest={manifest}
        platform={platform}
        device={device}
        locale={locale}
        dark={dark}
        onPlatform={selectPlatform}
        onDevice={setDevice}
        onLocale={selectLocale}
        onDark={setDark}
        background={background}
        frame={frame}
        fontFamily={fontFamily}
        template={template}
        sceneTemplate={
          template === CUSTOM_TEMPLATE && Array.isArray(design.template)
            ? design.template
            : template
        }
        layout={layout}
        screenOnly={screenOnly}
        sceneOrder={order}
        sceneLayouts={sceneLayouts}
        sceneCopy={copy}
        onBackground={setBackground}
        onFrame={setFrame}
        onFontFamily={setFontFamily}
        onTemplate={setTemplate}
        onLayout={setLayout}
        onScreenOnly={setScreenOnly}
        onSceneReorder={setOrder}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="relative grid flex-1 place-items-center overflow-auto p-10">
          {spec ? (
            <div className="absolute top-5 left-10 text-xs text-muted-foreground">
              Media Size: {spec.screenshot.width} × {spec.screenshot.height}
            </div>
          ) : null}
          {spec && captures && design.scenes.length > 0 ? (
            <div className="w-full max-w-[1400px]">
              <Strip
                design={design}
                captures={captures}
                spec={spec}
                locale={locale}
                background={background}
                frameUrl={frameUrl}
                fontFamily={previewFontFamily}
                copy={copy}
                onCopy={setSceneCopy}
                order={order}
                onReorder={setOrder}
                template={
                  template === CUSTOM_TEMPLATE && Array.isArray(design.template)
                    ? design.template
                    : template
                }
                layout={layout}
                screenOnly={screenOnly}
                sceneLayouts={sceneLayouts}
                onSceneLayout={setSceneLayout}
                capturePositions={capturePositions}
                onCapturePosition={setCapturePosition}
                slotGeometries={slotGeometries}
                onSlotGeometry={setSlotGeometry}
              />
            </div>
          ) : spec ? (
            <EmptyState
              icon={CameraIcon}
              title={`No screenshots for the ${deviceLabel(spec)} yet`}
              body={
                manifest.demo
                  ? "Create a workspace project to upload and edit your own screenshots."
                  : "Add a scene in the sidebar, then upload PNG, JPEG or WebP screens into it."
              }
            />
          ) : (
            <EmptyState {...ENABLE_PLATFORM[platform]} />
          )}
        </main>
      </div>

      {saveError ? <Toast message={`Could not save design: ${saveError}`} /> : null}
    </div>
  );
}

/** Everything the undo stack tracks and persists for the active project. */
type DesignState = {
  background: string;
  frame: string;
  fontFamily: string;
  copy: Record<string, SceneCopy>;
  layout: string;
  /** A built-in template key, "" for none, or CUSTOM_TEMPLATE for the config's own sequence. */
  template: string;
  screenOnly: boolean;
  /** Per-scene layout overrides; a scene absent here follows `layout`. */
  sceneLayouts: Record<string, string>;
  capturePositions: CapturePositions;
  slotGeometries: SlotGeometries;
  /** Screenshot scene ids as arranged by dragging tiles; empty means the config's order. */
  order: string[];
};

function initialTemplate(design: Design, saved: SavedDesign): string {
  if (saved.template !== undefined && design.templates.some((t) => t.key === saved.template))
    return saved.template;
  if (saved.template === "") return "";
  if (Array.isArray(design.template)) return CUSTOM_TEMPLATE;
  return design.template ?? "";
}

function initialSceneLayouts(
  design: Design,
  saved: SavedDesign,
  knownLayout: (key: string | undefined) => string | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const scene of design.scenes) {
    const key = knownLayout(saved.sceneLayouts?.[scene.id]);
    if (key) out[scene.id] = key;
  }
  return out;
}

/** Ids no longer in the config are dropped, new ones follow the saved order. */
function initialOrder(design: Design, saved: SavedDesign): string[] {
  const ids = design.scenes.map((s) => s.id);
  if (!saved.order) return [];
  const kept = saved.order.filter((id) => ids.includes(id));
  return [...kept, ...ids.filter((id) => !kept.includes(id))];
}

/** Bottom-center notice; the save retries on the next change, so it needs no dismiss. */
function Toast({ message }: { message: string }) {
  return (
    <output className="animate-in fade-in slide-in-from-bottom-2 fixed bottom-6 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-destructive/30 bg-popover px-3.5 py-2 text-xs text-destructive shadow-lg duration-200">
      {message}
    </output>
  );
}

type SavedView = { platform?: string; device?: string; locale?: string; dark?: boolean };

const storageKey = (appName: string) => `goldie-studio:${appName}`;

function loadView(appName: string): SavedView {
  try {
    const raw = localStorage.getItem(storageKey(appName));
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? (parsed as SavedView) : {};
  } catch {
    return {};
  }
}

function storeView(appName: string, saved: SavedView): void {
  try {
    localStorage.setItem(storageKey(appName), JSON.stringify(saved));
  } catch {
    // Storage may be unavailable (private mode); the session still works.
  }
}

/** @font-face rules for the bundled typefaces the manifest lists. */
function fontFaces(fonts: BundledFont[]): string {
  return fonts
    .flatMap((font) =>
      font.faces.map((face) => {
        const format = face.url.endsWith(".otf") ? "opentype" : "truetype";
        return `@font-face{font-family:"${font.family}";font-weight:${face.weight};font-style:normal;src:url("${face.url}") format("${format}")}`;
      }),
    )
    .join("\n");
}

/** iPhone and iPad labels use screen sizes, so show the inch mark in the UI. */
function deviceLabel(d: DeviceEntry): string {
  return d.platform === "ios" || d.platform === "ipados" ? `${d.label}"` : d.label;
}
