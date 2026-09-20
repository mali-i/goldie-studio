import { ChevronLeft, ChevronRight, DownloadIcon, Loader2Icon, X } from "lucide-react";
import { AnimatePresence, Reorder } from "motion/react";
import type React from "react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { CENTER_CAPTURE_POSITION, dragCapturePosition } from "../lib/capturePosition";
import { downloadScreenshot, renderExportTile } from "../lib/exportScreenshot";
import {
  BADGE,
  type Composition,
  compose,
  isTemplateKey,
  LANDSCAPE_LAYOUTS,
  type LAYOUTS,
  type LayoutKey,
  type LayoutSpec,
  resolveScenes,
  SCREEN_SHADOW,
} from "../lib/layouts";
import type {
  CapturePosition,
  CapturePositions,
  SlotGeometries,
  SlotGeometry,
  Decoration,
  Design,
  DesignScene,
  DeviceCaptures,
  DeviceEntry,
  FrameGeometry,
  SceneCopy,
  Theme,
} from "../manifest";
import { CHECKERBOARD, layoutOptions, TRANSPARENT } from "./DesignPanel";
import { Select } from "./Sidebar";
import { Button } from "./ui/button";

/** Tiles shown at once; the App Store product page shows this many before scrolling. */
const PAGE_SIZE = 5;
/** Apple's cap on screenshots per device family. */
const MAX_SCREENSHOTS = 10;
type Slot = "primary" | "secondary";
type SlotEditorState = {
  mode: "image" | "slot";
  selectedSlot: Slot;
  onSelectSlot: (slot: Slot) => void;
};

/**
 * Page-turn animation: the incoming page slides in from the side the arrow
 * points at while the outgoing page leaves through the opposite edge. 110%
 * keeps a page's tile shadows clear of the clip edge until it is in motion.
 */
const pageSlide = {
  enter: (direction: number) => ({ x: direction > 0 ? "110%" : "-110%" }),
  center: { x: "0%" },
  exit: (direction: number) => ({ x: direction > 0 ? "-110%" : "110%" }),
};

/**
 * The five-up strip, composited in the browser: each screenshot tile is the
 * raw device capture inside the bezel art on the chosen background, laid out
 * with the same geometry used by full-resolution browser export. Background
 * and frame arrive as props from React state and repaint instantly. The preview tile
 * plays the raw clips as they are: Apple requires a plain screen recording.
 *
 * The App Store allows up to ten screenshots; the strip shows five tiles at a
 * time, and when there are more, arrows page through them like the store's
 * own carousel. Scenes past the tenth are dropped with a note.
 *
 * Every tile is a size-container: the geometry is computed in the device's
 * spec pixels and expressed in cqw/cqh, so the tile is the composition scaled
 * down. Captions under the tiles show the spec size the export will produce;
 * the video's turns red when the clips sum outside Apple's 15-30s window
 * (iOS only; the android video goes to YouTube, which has no bounds).
 *
 * In the lightbox the headline and subhead are editable in place; a change
 * is reported through onCopy for the current locale and layered over the
 * project's config copy and browser export.
 *
 * Screenshot tiles can be dragged into a new order; the resulting scene id
 * list is reported through onReorder and saved the same way, so an export
 * numbers the files in the order shown. The preview tile stays first, as
 * the store shows it.
 */
export function Strip({
  design,
  captures,
  spec: tileSpec,
  locale,
  background,
  frameUrl,
  fontFamily,
  copy,
  onCopy,
  order,
  onReorder,
  template,
  layout,
  screenOnly,
  sceneLayouts,
  onSceneLayout,
  capturePositions,
  onCapturePosition,
  slotGeometries,
  onSlotGeometry,
}: {
  design: Design;
  captures: DeviceCaptures;
  spec: DeviceEntry;
  locale: string;
  background: string;
  frameUrl: string;
  fontFamily: string;
  copy: Record<string, SceneCopy>;
  onCopy: (sceneId: string, field: "headline" | "subhead", text: string) => void;
  /** Screenshot scene ids in display order; empty means the config's order. */
  order: string[];
  onReorder: (order: string[]) => void;
  /** A built-in template key, "" for none, or a custom layout sequence. */
  template: string | string[];
  /** The default layout key, and per-scene overrides by scene id. */
  layout: string;
  screenOnly: boolean;
  sceneLayouts: Record<string, string>;
  onSceneLayout: (sceneId: string, key: string | undefined) => void;
  capturePositions: CapturePositions;
  onCapturePosition: (
    sceneId: string,
    device: string,
    locale: string,
    slot: "primary" | "secondary",
    position: CapturePosition,
  ) => void;
  slotGeometries: SlotGeometries;
  onSlotGeometry: (
    sceneId: string,
    device: string,
    locale: string,
    layout: string,
    slot: "primary" | "secondary",
    geometry: SlotGeometry | undefined,
  ) => void;
}) {
  const theme = design.theme;
  const scenes =
    order.length > 0
      ? [...design.scenes].sort((a, b) => rankOf(order, a.id) - rankOf(order, b.id))
      : design.scenes;
  // Resolve layouts at the same resolution used by browser export.
  const resolved = resolveScenes(scenes, {
    template: Array.isArray(template)
      ? (template as LayoutKey[])
      : isTemplateKey(template)
        ? template
        : undefined,
    layout,
    sceneLayouts,
  });
  const layoutOf = (scene: DesignScene) => resolved.find((r) => r.scene.id === scene.id)!;
  // The same resolution with no per-scene overrides: what the template (or
  // theme layout) gives each scene, which the lightbox names as "Default".
  const unforced = resolveScenes(scenes, {
    template: Array.isArray(template)
      ? (template as LayoutKey[])
      : isTemplateKey(template)
        ? template
        : undefined,
    layout,
  });
  const defaultLayoutOf = (scene: DesignScene) =>
    unforced.find((r) => r.scene.id === scene.id)!.layout.key;

  // A dark background flips the copy
  // to light, a light background flips light copy colors to dark, and
  // per-scene background overrides are dropped, so the export matches what
  // is on screen.
  const bgLum = backgroundLuminance(background);
  const dark = bgLum !== null && bgLum < 0.5;
  const light = bgLum !== null && bgLum >= 0.5;
  const lightColor = (c: string) => (backgroundLuminance(c) ?? 0) > 0.5;
  const headlineColor = dark
    ? "#FFFFFF"
    : light && lightColor(theme.headlineColor)
      ? "#0E1B2A"
      : theme.headlineColor;
  const subheadColor = dark
    ? "#D9E1EA"
    : light && lightColor(theme.subheadColor)
      ? "#5A6A7D"
      : theme.subheadColor;

  // Scenes are the stable units of the strip. Captures merely fill one of
  // their two screen slots, so an empty scene remains visible and editable.
  const allShots = scenes.map((scene) => ({ scene }));
  const legacyCaptures =
    captures.screenshots.length > 0 &&
    captures.screenshots.every((shot) => shot.slot === undefined);
  // Apple's cap counts tiles, so a panorama scene uses two of the ten.
  let used = 0;
  const shots = allShots.filter(({ scene }) => {
    used += layoutOf(scene).layout.span;
    return used <= MAX_SCREENSHOTS;
  });
  const dropped = allShots.length - shots.length;

  const segments =
    design.preview && captures.clips
      ? design.preview.segments.flatMap((seg) => {
          const clip = captures.clips!.find((c) => c.segmentId === seg.id);
          return clip ? [{ url: clip.url, durationSeconds: clip.durationSeconds }] : [];
        })
      : [];

  const totalSeconds = segments.reduce((s, c) => s + c.durationSeconds, 0);

  // A device with its own geometry (Android or Mac) ignores the frame picker:
  // the picker's variants are iPhone art, with iPhone geometry.
  const deviceFrameUrl = tileSpec.frame?.url ?? frameUrl;
  const geom = tileSpec.frame?.geom;

  type Entry = {
    key: string;
    width: number;
    height: number;
    bad: boolean;
    badReason?: string;
    /** Whether the lightbox offers in-place copy editing (screenshots only). */
    editable: boolean;
    /** Empty screen slots stay on the canvas but must not become exported store art. */
    exportable: boolean;
    /** At least one uploaded capture can be repositioned in the lightbox. */
    repositionable: boolean;
    /** The composition; editable renders the copy as editable text (lightbox only). */
    scene: (editable: boolean, editor?: SlotEditorState) => ReactNode;
    /** Set on screenshot tiles, which can be dragged into a new order. */
    sceneId?: string;
    /** The lightbox's per-scene layout override control (screenshots only). */
    layout?: {
      value: string | undefined;
      /** The layout the scene gets with no override: the template's pick, or the theme layout. */
      defaultKey: string;
      onChange: (key: string | undefined) => void;
    };
    slotEditor?: {
      slots: Slot[];
      defaults: Partial<Record<Slot, SlotGeometry>>;
      current: Partial<Record<Slot, SlotGeometry>>;
      onChange: (slot: Slot, geometry: SlotGeometry | undefined) => void;
    };
  };
  const entries: Entry[] = [];
  if (segments.length > 0 && tileSpec.preview) {
    // The 15-30s window is Apple's upload rule; the android video goes to
    // YouTube, which has no duration bounds.
    const outOfBounds = tileSpec.platform === "ios" && (totalSeconds < 15 || totalSeconds > 30);
    entries.push({
      key: "preview",
      width: tileSpec.preview.width,
      height: tileSpec.preview.height,
      bad: outOfBounds,
      badReason: "Clips sum outside the 15-30s Apple allows for previews.",
      editable: false,
      exportable: false,
      repositionable: false,
      scene: () => <PreviewScene segments={segments} />,
    });
  }
  for (const { scene } of shots) {
    const { layout: spec, secondScene } = layoutOf(scene);
    const primary = captures.screenshots.find(
      (s) => s.sceneId === scene.id && (s.slot ?? "primary") === "primary",
    );
    // New projects keep both captures on the same scene. The secondScene
    // fallback preserves bundled and externally generated legacy manifests.
    const secondary =
      captures.screenshots.find((s) => s.sceneId === scene.id && s.slot === "secondary") ??
      (legacyCaptures && secondScene
        ? captures.screenshots.find(
            (s) => s.sceneId === secondScene && (s.slot ?? "primary") === "primary",
          )
        : undefined);
    const layoutControl = {
      value: sceneLayouts[scene.id],
      defaultKey: defaultLayoutOf(scene),
      onChange: (key: string | undefined) => onSceneLayout(scene.id, key),
    };
    const needsSecondary = spec.devices.some((device) => device.capture === "secondary");
    const exportable = Boolean(primary && (!needsSecondary || secondary));
    const presentation = tileSpec.screenshot.width > tileSpec.screenshot.height
      ? LANDSCAPE_LAYOUTS[spec.key].capturePresentation
      : spec.capturePresentation;
    const base = compose(spec, tileSpec.screenshot, theme, { screenOnly, geom });
    const resolvedSpec = tileSpec.screenshot.width > tileSpec.screenshot.height
      ? LANDSCAPE_LAYOUTS[spec.key]
      : spec;
    const defaults: Partial<Record<Slot, SlotGeometry>> = {};
    for (const [index, device] of base.devices.entries()) {
      const placement = resolvedSpec.devices[index]!;
      const tileWidth = placement.fitBelowCopy ? base.designWidth :
        (base.designWidth !== tileSpec.screenshot.width && spec.copy.position !== "none"
          ? tileSpec.screenshot.width
          : base.designWidth);
      defaults[device.capture] = {
        x: (device.frame.left + device.frame.width / 2) / base.width,
        y: (device.frame.top + device.frame.height / 2) / base.height,
        widthRatio: device.frame.width / tileWidth,
        heightRatio: device.frame.height / base.height,
        rotate: device.rotate,
      };
    }
    const currentGeometries = slotGeometries[scene.id]?.[tileSpec.key]?.[locale]?.[spec.key] ?? {};
    for (let slice = 0; slice < spec.span; slice++) {
      entries.push({
        key: spec.span > 1 ? `${scene.id}#${slice + 1}` : scene.id,
        width: tileSpec.screenshot.width,
        height: tileSpec.screenshot.height,
        bad: !exportable,
        badReason: !primary
          ? "Upload Screen 1 for this scene before exporting."
          : needsSecondary && !secondary
            ? "This layout needs Screen 2 before exporting."
            : undefined,
        editable: true,
        exportable,
        repositionable: Boolean(primary || secondary) && presentation?.objectFit !== "contain",
        // Only the first slice drags; the second follows it.
        sceneId: slice === 0 ? scene.id : undefined,
        layout: layoutControl,
        slotEditor: {
          slots: base.devices.map((device) => device.capture),
          defaults,
          current: currentGeometries,
          onChange: (slot, geometry) =>
            onSlotGeometry(scene.id, tileSpec.key, locale, spec.key, slot, geometry),
        },
        scene: (editable, editor) => (
          <ScreenshotScene
            key={`${scene.id}:${spec.key}:${slice}`}
            spec={spec}
            slice={slice}
            tile={tileSpec.screenshot}
            theme={theme}
            screenOnly={screenOnly}
            background={background}
            frameUrl={deviceFrameUrl}
            geom={geom}
            fontFamily={fontFamily}
            headline={copy[scene.id]?.headline?.[locale] ?? scene.headline[locale] ?? ""}
            subhead={copy[scene.id]?.subhead?.[locale] ?? scene.subhead?.[locale]}
            headlineColor={headlineColor}
            subheadColor={subheadColor}
            sceneId={scene.id}
            captureUrl={primary?.url}
            secondCaptureUrl={secondary?.url}
            capturePositions={capturePositions[scene.id]?.[tileSpec.key]?.[locale]}
            slotGeometries={currentGeometries}
            defaultSlotGeometries={defaults}
            slotEditor={editable ? editor : undefined}
            onSlotGeometry={editable
              ? (slot, geometry) => onSlotGeometry(scene.id, tileSpec.key, locale, spec.key, slot, geometry)
              : undefined}
            onCapturePosition={editable
              ? (slot, position) => onCapturePosition(scene.id, tileSpec.key, locale, slot, position)
              : undefined}
            decorations={[...design.decorations, ...(scene.decorations ?? [])]}
            locale={locale}
            onEdit={editable ? (field, text) => onCopy(scene.id, field, text) : undefined}
          />
        ),
      });
    }
  }

  const [open, setOpenState] = useState<number | null>(null);
  // The tile that shares its view-transition-name with the lightbox scene.
  // It must already be named in the frame *before* the transition starts,
  // or the old snapshot has nothing to morph from; so it is committed
  // synchronously first, and only cleared once the closing morph is done.
  const [named, setNamed] = useState<number | null>(null);
  const setOpen = (next: number | null) => {
    if (typeof document.startViewTransition !== "function") {
      setNamed(next);
      setOpenState(next);
      return;
    }
    if (next !== null) flushSync(() => setNamed(next));
    const transition = document.startViewTransition(() => flushSync(() => setOpenState(next)));
    if (next === null) transition.finished.finally(() => setNamed(null));
  };
  // A pointer drag on a tile also produces a click when it ends; the click
  // is dropped while a drag is underway or just finished.
  const dragged = useRef(false);
  // The scene being dragged, lifted with a slight scale. Driven through
  // `animate` rather than whileDrag, which can stay applied when the drop
  // coincides with the item's layout animation.
  const [lifting, setLifting] = useState<string | null>(null);
  const tileAt = (i: number) => {
    const entry = entries[i];
    return (
      <Tile
        key={entry.key}
        draggable={entry.sceneId !== undefined}
        width={entry.width}
        height={entry.height}
        bad={entry.bad}
        badReason={entry.badReason}
        onOpen={() => {
          if (!dragged.current) setOpen(i);
        }}
        // Named only while the lightbox is closed: once open, the scene inside
        // it carries the name, and a duplicate would abort the transition.
        transitionName={named === i && open === null ? "lightbox-scene" : undefined}
      >
        {entry.scene(false)}
      </Tile>
    );
  };

  // Strip cells: the preview tile, then one cell per scene holding its
  // tile(s), so a panorama's two slices drag together. Cells are paged so a
  // page holds at most PAGE_SIZE tiles without splitting a scene.
  type Cell = { sceneId?: string; tiles: number[] };
  const cells: Cell[] = [];
  entries.forEach((entry, i) => {
    const last = cells[cells.length - 1];
    if (entry.sceneId === undefined && last?.sceneId !== undefined && entry.key.includes("#")) {
      last.tiles.push(i);
    } else {
      cells.push({ sceneId: entry.sceneId, tiles: [i] });
    }
  });
  const pageCells: Cell[][] = [[]];
  for (const cell of cells) {
    const current = pageCells[pageCells.length - 1];
    const used = current.reduce((n, c) => n + c.tiles.length, 0);
    if (used + cell.tiles.length > PAGE_SIZE && current.length > 0) pageCells.push([cell]);
    else current.push(cell);
  }
  const pages = pageCells.length;
  const [page, setPage] = useState(0);
  // Which way the last page turn went, so the incoming page slides in from
  // that side and the outgoing one leaves through the other.
  const [direction, setDirection] = useState(0);
  const turnPage = (delta: number) => {
    setDirection(delta);
    setPage((p) => p + delta);
  };
  // A device switch can shrink the tile count; keep the page in range.
  useEffect(() => {
    if (page > pages - 1) setPage(pages - 1);
  }, [page, pages]);
  useEffect(() => {
    if (open !== null && open > entries.length - 1) {
      setOpenState(null);
      setNamed(null);
    }
  }, [open, entries.length]);

  if (entries.length === 0) return null;

  const visible = pageCells[Math.min(page, pages - 1)];
  const visibleIds = visible.flatMap((c) => (c.sceneId ? [c.sceneId] : []));
  // Pad the last page so tiles keep the same width as on a full page.
  const columns = pages > 1 ? PAGE_SIZE : entries.length;
  // The page's scenes in their new order, spliced back into the full order.
  const reorderPage = (ids: string[]) => {
    const queue = [...ids];
    onReorder(scenes.map((s) => (visibleIds.includes(s.id) ? queue.shift()! : s.id)));
  };

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="pointer-events-none fixed top-0 -left-[100000px]" aria-hidden>
        {entries
          .filter((entry) => entry.editable && entry.exportable)
          .map((entry, index) => (
            <div
              key={`export-${entry.key}`}
              data-export-tile
              data-export-key={entry.key}
              data-export-name={`${String(index + 1).padStart(2, "0")}-${entry.key.replace("#", "-")}.png`}
              style={{ position: "relative", width: entry.width, height: entry.height }}
            >
              {entry.scene(false)}
            </div>
          ))}
      </div>
      <div className="relative">
        {/* Clips only horizontally, so a sliding page vanishes at the strip's
            edge while tile shadows and the hover lift stay visible; the small
            padding keeps the edge tiles' own shadows out of the clip. */}
        <div className="-mx-2 overflow-x-clip px-2">
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <Reorder.Group
              key={page}
              axis="x"
              values={visibleIds}
              onReorder={reorderPage}
              aria-label="Screenshots, drag to reorder"
              className="grid w-full list-none items-start gap-4 p-0"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
              custom={direction}
              variants={pageSlide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: "tween", duration: 0.25, ease: "easeInOut" }}
            >
              {visible.map((cell) =>
                cell.sceneId ? (
                  <Reorder.Item
                    key={cell.sceneId}
                    value={cell.sceneId}
                    className="relative grid gap-4"
                    style={{
                      zIndex: lifting === cell.sceneId ? 10 : undefined,
                      gridColumn: `span ${cell.tiles.length}`,
                      gridTemplateColumns: `repeat(${cell.tiles.length}, minmax(0, 1fr))`,
                    }}
                    animate={{ scale: lifting === cell.sceneId ? 1.04 : 1 }}
                    onDragStart={() => {
                      dragged.current = true;
                      setLifting(cell.sceneId ?? null);
                    }}
                    onDragEnd={() => {
                      setLifting(null);
                      setTimeout(() => {
                        dragged.current = false;
                      }, 0);
                    }}
                  >
                    {cell.tiles.map(tileAt)}
                  </Reorder.Item>
                ) : (
                  <li key={entries[cell.tiles[0]].key}>{tileAt(cell.tiles[0])}</li>
                ),
              )}
            </Reorder.Group>
          </AnimatePresence>
        </div>

        {pages > 1 ? (
          <>
            <PagerButton
              side="left"
              label="Previous screenshots"
              disabled={page === 0}
              onClick={() => turnPage(-1)}
            />
            <PagerButton
              side="right"
              label="Next screenshots"
              disabled={page === pages - 1}
              onClick={() => turnPage(1)}
            />
          </>
        ) : null}
      </div>

      {dropped > 0 ? (
        <p className="text-center text-[11px] font-medium text-destructive">
          {dropped} more scene{dropped === 1 ? "" : "s"} hidden: the App Store allows{" "}
          {MAX_SCREENSHOTS} screenshots.
        </p>
      ) : null}

      {open !== null && entries[open] ? (
        <Lightbox
          entry={entries[open]}
          layouts={design.layouts}
          index={open}
          count={entries.length}
          onClose={() => setOpen(null)}
          // Stepping swaps the scene in place with no morph.
          onStep={(delta) => {
            if (open === null) return;
            const next = Math.min(entries.length - 1, Math.max(0, open + delta));
            setNamed(next);
            setOpenState(next);
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Full-viewport view of one tile: the same composition, rendered as large as
 * the window allows at the spec's aspect ratio. Click outside, Escape, or the
 * close button dismiss it; arrow keys step between tiles. Keys typed into the
 * editable copy are left to the text.
 */
function Lightbox({
  entry,
  layouts,
  index,
  count,
  onClose,
  onStep,
}: {
  entry: {
    key: string;
    width: number;
    height: number;
    editable: boolean;
    exportable: boolean;
    repositionable: boolean;
    scene: (editable: boolean, editor?: SlotEditorState) => ReactNode;
    layout?: {
      value: string | undefined;
      /** The layout the scene gets with no override: the template's pick, or the theme layout. */
      defaultKey: string;
      onChange: (key: string | undefined) => void;
    };
    slotEditor?: {
      slots: Slot[];
      defaults: Partial<Record<Slot, SlotGeometry>>;
      current: Partial<Record<Slot, SlotGeometry>>;
      onChange: (slot: Slot, geometry: SlotGeometry | undefined) => void;
    };
  };
  layouts: Design["layouts"];
  index: number;
  count: number;
  onClose: () => void;
  onStep: (delta: number) => void;
}) {
  const [mode, setMode] = useState<"image" | "slot">("image");
  const [selectedSlot, setSelectedSlot] = useState<Slot>("primary");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportOne = async () => {
    if (exporting || !entry.exportable) return;
    setExporting(true);
    setExportError(null);
    try {
      const node = Array.from(document.querySelectorAll<HTMLElement>("[data-export-tile]"))
        .find((candidate) => candidate.dataset.exportKey === entry.key);
      if (!node) throw new Error("The screenshot is not ready to export.");
      const blob = await renderExportTile(node);
      downloadScreenshot(blob, node.dataset.exportName ?? `${entry.key}.png`);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : String(error));
    } finally {
      setExporting(false);
    }
  };
  useEffect(() => {
    setSelectedSlot(entry.slotEditor?.slots[0] ?? "primary");
    setExportError(null);
  }, [index]);
  const slot = entry.slotEditor?.slots.includes(selectedSlot)
    ? selectedSlot
    : entry.slotEditor?.slots[0] ?? "primary";
  const defaultGeometry = entry.slotEditor?.defaults[slot];
  const geometry = entry.slotEditor?.current[slot] ?? defaultGeometry;
  const heightRatio = geometry && defaultGeometry
    ? geometry.heightRatio ?? defaultGeometry.heightRatio! * geometry.widthRatio / defaultGeometry.widthRatio
    : undefined;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement &&
        (e.target.isContentEditable || e.target instanceof HTMLInputElement)) return;
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onStep(-1);
      else if (e.key === "ArrowRight") onStep(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onStep]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Screenshot preview"
      className="animate-in fade-in fixed inset-0 z-50 flex duration-150 flex-col items-center justify-center gap-3 bg-black/80 p-8 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="relative overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10"
        style={{
          viewTransitionName: "lightbox-scene",
          aspectRatio: `${entry.width} / ${entry.height}`,
          // Sized by width alone so the aspect ratio always holds: a height
          // cap plus flex shrinking would squash the box, stretching the bezel
          // art off the cover-fitted capture (a misaligned camera cutout).
          // Leave room for the layout and slot controls below the scene.
          flexShrink: 0,
          width: `min(calc(100vw - 4rem), calc((100vh - 11rem) * ${entry.width / entry.height}))`,
        }}
      >
        {entry.scene(true, { mode, selectedSlot: slot, onSelectSlot: setSelectedSlot })}
      </div>
      <div className="flex w-full max-w-[900px] flex-col items-center gap-2 px-2 text-[11px] text-neutral-300">
        <div className="flex w-full flex-wrap items-center justify-center gap-3">
          {entry.slotEditor ? (
            <div className="flex items-center gap-1">
              <Button type="button" size="sm" variant={mode === "image" ? "secondary" : "outline"}
                onClick={() => setMode("image")}>Image</Button>
              <Button type="button" size="sm" variant={mode === "slot" ? "secondary" : "outline"}
                onClick={() => setMode("slot")}>Slot</Button>
            </div>
          ) : null}
          {mode === "image" && entry.repositionable
            ? <span>Drag a screenshot to adjust its crop.</span>
            : null}
          {mode === "slot" ? <span>Drag to move; drag the corner to resize.</span> : null}
          {entry.layout ? (
            <div className="dark w-44 text-foreground">
              <Select
                value={entry.layout.value ?? ""}
                onChange={(v) => entry.layout?.onChange(v || undefined)}
                options={[
                  [
                    "",
                    `Default (${layouts.find((l) => l.key === entry.layout?.defaultKey)?.label ?? entry.layout.defaultKey})`,
                  ],
                  ...layoutOptions(layouts),
                ]}
              />
            </div>
          ) : null}
          {entry.editable ? (
            <Button type="button" size="sm" variant="secondary"
              disabled={!entry.exportable || exporting}
              onClick={() => void exportOne()}>
              {exporting ? <Loader2Icon className="animate-spin" /> : <DownloadIcon />}
              {exporting ? "Exporting…" : "Export PNG"}
            </Button>
          ) : null}
        </div>
        {exportError ? <p role="alert" className="text-destructive">{exportError}</p> : null}
        {mode === "slot" && entry.slotEditor && geometry && defaultGeometry ? (
          <div className="flex w-full min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-2">
            <div className="dark w-28 text-foreground">
              <Select
                value={slot}
                onChange={(value) => setSelectedSlot(value as Slot)}
                options={entry.slotEditor.slots.map((value, index) =>
                  [value, `Screen ${index + 1}`] as [string, string])}
              />
            </div>
            <label className="flex items-center gap-2">
              Width
              <input
                aria-label="Slot width"
                className="w-20"
                type="range"
                min="40" max="160" step="1"
                value={Math.round(geometry.widthRatio / defaultGeometry.widthRatio * 100)}
                onChange={(event) => entry.slotEditor?.onChange(slot, {
                  ...geometry,
                  widthRatio: defaultGeometry.widthRatio * Number(event.target.value) / 100,
                  heightRatio,
                })}
              />
              <span className="w-9 text-right">{Math.round(geometry.widthRatio / defaultGeometry.widthRatio * 100)}%</span>
            </label>
            <label className="flex items-center gap-2">
              Height
              <input
                aria-label="Slot height"
                className="w-20"
                type="range"
                min="40" max="160" step="1"
                value={Math.round(heightRatio! / defaultGeometry.heightRatio! * 100)}
                onChange={(event) => entry.slotEditor?.onChange(slot, {
                  ...geometry,
                  heightRatio: defaultGeometry.heightRatio! * Number(event.target.value) / 100,
                })}
              />
              <span className="w-9 text-right">{Math.round(heightRatio! / defaultGeometry.heightRatio! * 100)}%</span>
            </label>
            <label className="flex items-center gap-2">
              Angle
              <input
                aria-label="Slot rotation"
                className="w-20"
                type="range"
                min="-45" max="45" step="1"
                value={geometry.rotate}
                onChange={(event) => entry.slotEditor?.onChange(slot, {
                  ...geometry, rotate: Number(event.target.value),
                })}
              />
              <span className="w-9 text-right">{geometry.rotate}°</span>
            </label>
            <Button type="button" size="sm" variant="outline"
              disabled={!entry.slotEditor.current[slot]}
              onClick={() => entry.slotEditor?.onChange(slot, undefined)}>
              Reset slot
            </Button>
          </div>
        ) : null}
      </div>

      <Button
        type="button"
        variant="outline"
        size="icon-lg"
        aria-label="Close"
        className="absolute top-4 right-4 rounded-full"
        onClick={onClose}
      >
        <X />
      </Button>
      {count > 1 ? (
        <>
          <PagerButton
            side="left"
            label="Previous"
            disabled={index === 0}
            onClick={() => onStep(-1)}
            inset
          />
          <PagerButton
            side="right"
            label="Next"
            disabled={index === count - 1}
            onClick={() => onStep(1)}
            inset
          />
        </>
      ) : null}
    </div>
  );
}

/** Round arrow floating over the strip's edge, like the store carousel's. */
function PagerButton({
  side,
  label,
  disabled,
  onClick,
  inset = false,
}: {
  side: "left" | "right";
  label: string;
  disabled: boolean;
  onClick: () => void;
  /** Sit inside the edge instead of overhanging it (used in the lightbox). */
  inset?: boolean;
}) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  const offset = inset
    ? side === "left"
      ? "left-4"
      : "right-4"
    : side === "left"
      ? "-left-5"
      : "-right-5";
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-lg"
      aria-label={label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`absolute top-1/2 -translate-y-1/2 rounded-full bg-popover shadow-md transition-none hover:bg-popover focus-visible:ring-0 active:not-aria-[haspopup]:-translate-y-1/2 ${offset}`}
    >
      <Icon />
    </Button>
  );
}

/** Container-query units: 1cqw / 1cqh is one percent of a single tile. */
const cq = (tile: { width: number; height: number }) => ({
  w: (v: number) => `${(v / tile.width) * 100}cqw`,
  h: (v: number) => `${(v / tile.height) * 100}cqh`,
});

function Canvas({
  background,
  fontFamily,
  children,
}: {
  background: string;
  fontFamily: string;
  children: ReactNode;
}) {
  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ containerType: "size", background, fontFamily }}
    >
      {children}
    </div>
  );
}

/**
 * Browser twin of renderScreenshots in src/render.ts: the same compose()
 * geometry, expressed in container-query units of one tile. A panorama
 * layout renders the whole span-wide composition and shifts it left by
 * `slice` tiles, so each tile shows its own slice. With onEdit set, the
 * headline and subhead are contentEditable and report their text when
 * editing ends (blur, or Enter).
 */
function ScreenshotScene({
  spec,
  slice,
  tile,
  theme,
  screenOnly,
  background,
  frameUrl,
  geom,
  fontFamily,
  headline,
  subhead,
  headlineColor,
  subheadColor,
  sceneId,
  captureUrl,
  secondCaptureUrl,
  capturePositions,
  onCapturePosition,
  slotGeometries,
  defaultSlotGeometries,
  slotEditor,
  onSlotGeometry,
  decorations,
  locale,
  onEdit,
}: {
  spec: (typeof LAYOUTS)[keyof typeof LAYOUTS];
  slice: number;
  tile: { width: number; height: number };
  theme: Theme;
  screenOnly: boolean;
  background: string;
  frameUrl: string;
  /** The bezel art's geometry; the iOS bundled art's when the device brings none. */
  geom: FrameGeometry | undefined;
  fontFamily: string;
  headline: string;
  subhead: string | undefined;
  headlineColor: string;
  subheadColor: string;
  sceneId: string;
  captureUrl: string | undefined;
  secondCaptureUrl: string | undefined;
  capturePositions?: Partial<Record<"primary" | "secondary", CapturePosition>>;
  onCapturePosition?: (slot: "primary" | "secondary", position: CapturePosition) => void;
  slotGeometries?: Partial<Record<Slot, SlotGeometry>>;
  defaultSlotGeometries: Partial<Record<Slot, SlotGeometry>>;
  slotEditor?: SlotEditorState;
  onSlotGeometry?: (slot: Slot, geometry: SlotGeometry) => void;
  decorations: Decoration[];
  locale: string;
  onEdit?: (field: "headline" | "subhead", text: string) => void;
}) {
  const [draftGeometries, setDraftGeometries] = useState(slotGeometries ?? {});
  useEffect(() => setDraftGeometries(slotGeometries ?? {}), [slotGeometries]);
  const activeGeometries = slotEditor?.mode === "slot" ? draftGeometries : slotGeometries;
  const c = compose(spec, tile, theme, {
    screenOnly, geom, slotGeometries: activeGeometries,
  });
  const capturePresentation =
    (tile.width > tile.height ? LANDSCAPE_LAYOUTS[spec.key] : spec).capturePresentation;
  const { w, h } = cq(tile);
  // Wider-than-reference tiles compose at a narrower design width; type follows it.
  const typeScale = c.designWidth / tile.width;
  const type = c.type;
  const editable = onEdit ? editableProps : () => ({});
  const copy = c.copy;
  return (
    <Canvas background="transparent" fontFamily={fontFamily}>
      {/* The full composition; the background spans it so a gradient runs across a panorama. */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: `${-slice * 100}%`,
          width: `${spec.span * 100}%`,
          height: "100%",
          background: background === TRANSPARENT ? CHECKERBOARD : background,
        }}
      >
        {copy ? (
          <div
            style={{
              position: "absolute",
              left: w(copy.box.left),
              width: w(copy.box.width),
              ...(copy.position === "top"
                ? { top: 0, paddingTop: h(copy.y), justifyContent: "flex-start" }
                : {
                    bottom: 0,
                    paddingBottom: h(tile.height - copy.y),
                    justifyContent: "flex-end",
                  }),
              height: h(copy.box.height),
              display: "flex",
              flexDirection: "column",
              alignItems: copy.align === "left" ? "flex-start" : "center",
              gap: h(tile.height * type.gap),
              textAlign: copy.align,
            }}
          >
            <h1
              style={{
                margin: 0,
                color: headlineColor,
                fontSize: `${type.headlineSize * typeScale * 100}cqw`,
                lineHeight: type.headlineLineHeight,
                fontWeight: type.headlineWeight,
                letterSpacing: `${type.headlineTracking * typeScale * 100}cqw`,
              }}
              {...editable((text) => onEdit?.("headline", text), headline, "Headline")}
            >
              {headline}
            </h1>
            {subhead || onEdit ? (
              <p
                style={{
                  margin: 0,
                  color: subheadColor,
                  fontSize: `${type.subheadSize * typeScale * 100}cqw`,
                  lineHeight: type.subheadLineHeight,
                  fontWeight: type.subheadWeight,
                  minWidth: "30cqw",
                }}
                {...editable((text) => onEdit?.("subhead", text), subhead ?? "", "Subhead")}
              >
                {subhead}
              </p>
            ) : null}
          </div>
        ) : null}

        <Decorations decorations={decorations} tile={tile} locale={locale} color={headlineColor} />

        {c.devices.map((device) => {
          const url = device.capture === "secondary" ? secondCaptureUrl : captureUrl;
          return (
            <DeviceView
              key={device.capture}
              device={device}
              tile={tile}
              frameUrl={screenOnly || capturePresentation ? null : frameUrl}
              capturePresentation={capturePresentation}
              captureUrl={url}
              capturePosition={capturePositions?.[device.capture]}
              onCapturePosition={slotEditor?.mode !== "slot" && onCapturePosition
                ? (position) => onCapturePosition(device.capture, position)
                : undefined}
              slotMode={slotEditor?.mode === "slot"}
              selected={slotEditor?.mode === "slot" && slotEditor.selectedSlot === device.capture}
              onSelectSlot={() => slotEditor?.onSelectSlot(device.capture)}
              slotGeometry={activeGeometries?.[device.capture] ?? defaultSlotGeometries[device.capture]}
              onSlotGeometryDraft={slotEditor?.mode === "slot"
                ? (geometry) => setDraftGeometries((prev) => ({ ...prev, [device.capture]: geometry }))
                : undefined}
              onSlotGeometryCommit={slotEditor?.mode === "slot"
                ? (geometry) => onSlotGeometry?.(device.capture, geometry)
                : undefined}
              missing={
                url ? undefined : `${sceneId} / Screen ${device.capture === "secondary" ? 2 : 1}`
              }
            />
          );
        })}
      </div>
    </Canvas>
  );
}

/**
 * One device or unframed screenshot card. The capture and its shadow share
 * the same computed geometry used by the preview and full-resolution export.
 * The box rotates about its centre, matching the canvas transform.
 */
function DeviceView({
  device,
  tile,
  frameUrl,
  capturePresentation,
  captureUrl,
  capturePosition,
  onCapturePosition,
  slotMode,
  selected,
  onSelectSlot,
  slotGeometry,
  onSlotGeometryDraft,
  onSlotGeometryCommit,
  missing,
}: {
  device: Composition["devices"][number];
  tile: { width: number; height: number };
  frameUrl: string | null;
  capturePresentation: LayoutSpec["capturePresentation"];
  captureUrl: string | undefined;
  capturePosition?: CapturePosition;
  onCapturePosition?: (position: CapturePosition) => void;
  slotMode?: boolean;
  selected?: boolean;
  onSelectSlot?: () => void;
  slotGeometry?: SlotGeometry;
  onSlotGeometryDraft?: (geometry: SlotGeometry) => void;
  onSlotGeometryCommit?: (geometry: SlotGeometry) => void;
  /** Scene id to name in the placeholder when the capture is missing. */
  missing: string | undefined;
}) {
  const { w, h } = cq(tile);
  const { frame, screen } = device;
  const savedPosition = capturePosition ?? (
    capturePresentation?.objectPosition === "top center"
      ? { x: 0.5, y: 0 }
      : CENTER_CAPTURE_POSITION
  );
  const [position, setPosition] = useState(savedPosition);
  const imageRef = useRef<HTMLImageElement>(null);
  const drag = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    start: CapturePosition;
    current: CapturePosition;
    viewport: { width: number; height: number };
    image: { width: number; height: number };
  } | null>(null);
  const slotDrag = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    start: SlotGeometry;
    current: SlotGeometry;
    canvasWidth: number;
    canvasHeight: number;
  } | null>(null);
  const resizeDrag = useRef<{
    pointerId: number;
    clientX: number;
    clientY: number;
    start: SlotGeometry;
    current: SlotGeometry;
    width: number;
    height: number;
  } | null>(null);
  useEffect(() => {
    if (!drag.current) setPosition(savedPosition);
  }, [savedPosition.x, savedPosition.y, captureUrl]);
  const canDrag = Boolean(
    onCapturePosition && captureUrl && capturePresentation?.objectFit !== "contain",
  );
  const displayPosition = onCapturePosition ? position : savedPosition;
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!canDrag || event.button !== 0 || !imageRef.current?.naturalWidth) return;
    const viewport = {
      width: event.currentTarget.clientWidth,
      height: event.currentTarget.clientHeight,
    };
    const image = {
      width: imageRef.current.naturalWidth,
      height: imageRef.current.naturalHeight,
    };
    drag.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      start: position,
      current: position,
      viewport,
      image,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    // The device box may be rotated; convert the pointer motion to its local axes.
    const radians = (device.rotate * Math.PI) / 180;
    const dx = event.clientX - current.clientX;
    const dy = event.clientY - current.clientY;
    const next = dragCapturePosition(
      current.start,
      {
        x: Math.cos(radians) * dx + Math.sin(radians) * dy,
        y: -Math.sin(radians) * dx + Math.cos(radians) * dy,
      },
      current.viewport,
      current.image,
    );
    current.current = next;
    setPosition(next);
    event.preventDefault();
  };
  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = drag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (current.current.x !== current.start.x || current.current.y !== current.start.y) {
      onCapturePosition?.(current.current);
    }
    event.stopPropagation();
  };
  const onSlotPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!slotMode || !slotGeometry || event.button !== 0) return;
    onSelectSlot?.();
    slotDrag.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      start: slotGeometry,
      current: slotGeometry,
      canvasWidth: event.currentTarget.parentElement?.clientWidth ?? 1,
      canvasHeight: event.currentTarget.parentElement?.clientHeight ?? 1,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };
  const onSlotPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = slotDrag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const clamp = (value: number) => Math.max(0, Math.min(1, value));
    const next = {
      ...current.start,
      x: clamp(current.start.x + (event.clientX - current.clientX) / current.canvasWidth),
      y: clamp(current.start.y + (event.clientY - current.clientY) / current.canvasHeight),
    };
    current.current = next;
    onSlotGeometryDraft?.(next);
    event.preventDefault();
  };
  const onSlotPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = slotDrag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    slotDrag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (current.current.x !== current.start.x || current.current.y !== current.start.y) {
      onSlotGeometryCommit?.(current.current);
    }
    event.stopPropagation();
  };
  const onResizePointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!slotGeometry || event.button !== 0) return;
    const frameElement = event.currentTarget.parentElement;
    resizeDrag.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      start: {
        ...slotGeometry,
        heightRatio: slotGeometry.heightRatio ??
          (frameElement?.offsetHeight ?? 1) / (frameElement?.parentElement?.clientHeight ?? 1),
      },
      current: slotGeometry,
      width: frameElement?.offsetWidth ?? 1,
      height: frameElement?.offsetHeight ?? 1,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };
  const onResizePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = resizeDrag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const radians = (current.start.rotate * Math.PI) / 180;
    const dx = event.clientX - current.clientX;
    const dy = event.clientY - current.clientY;
    const localX = Math.cos(radians) * dx + Math.sin(radians) * dy;
    const localY = -Math.sin(radians) * dx + Math.cos(radians) * dy;
    const widthRatio = Math.max(0.1, Math.min(2,
      current.start.widthRatio * (1 + localX / current.width),
    ));
    const heightRatio = Math.max(0.1, Math.min(2,
      current.start.heightRatio! * (1 + localY / current.height),
    ));
    const next = { ...current.start, widthRatio, heightRatio };
    current.current = next;
    onSlotGeometryDraft?.(next);
    event.preventDefault();
    event.stopPropagation();
  };
  const onResizePointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    const current = resizeDrag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    resizeDrag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (current.current.widthRatio !== current.start.widthRatio ||
      current.current.heightRatio !== current.start.heightRatio) {
      onSlotGeometryCommit?.(current.current);
    }
    event.stopPropagation();
  };
  // The screen as fractions of the device box, so it rotates with it.
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  return (
    <div
      style={{
        position: "absolute",
        left: w(frame.left),
        top: h(frame.top),
        width: w(frame.width),
        height: h(frame.height),
        transform: device.rotate ? `rotate(${device.rotate}deg)` : undefined,
        zIndex: selected ? 10 : undefined,
        cursor: slotMode ? "move" : undefined,
        touchAction: slotMode ? "none" : undefined,
        outline: selected ? `${w(tile.width * 0.008)} solid #38bdf8` : undefined,
        outlineOffset: selected ? w(tile.width * 0.006) : undefined,
      }}
      onPointerDown={onSlotPointerDown}
      onPointerMove={onSlotPointerMove}
      onPointerUp={onSlotPointerUp}
      onPointerCancel={(event) => {
        if (slotDrag.current?.pointerId !== event.pointerId) return;
        onSlotGeometryDraft?.(slotDrag.current.start);
        slotDrag.current = null;
      }}
    >
      <div
        style={{
          position: "absolute",
          left: pct(screen.left - frame.left, frame.width),
          top: pct(screen.top - frame.top, frame.height),
          width: pct(screen.width, frame.width),
          height: pct(screen.height, frame.height),
          borderRadius: w(screen.radius),
          overflow: "hidden",
          cursor: canDrag ? "grab" : undefined,
          touchAction: canDrag ? "none" : undefined,
          userSelect: canDrag ? "none" : undefined,
          background: capturePresentation ? "#fff" : "#000",
          border: capturePresentation ? `${w(tile.width * 0.0008)} solid rgba(144, 162, 195, 0.24)` : undefined,
          boxShadow: capturePresentation
            ? `0 ${w(tile.width * 0.018)} ${w(tile.width * 0.05)} rgba(18, 30, 66, 0.2)`
            : frameUrl
              ? undefined
              : `0 ${w(tile.width * SCREEN_SHADOW.offsetY)} ${w(tile.width * SCREEN_SHADOW.blur)} ${SCREEN_SHADOW.color}`,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(event) => {
          if (drag.current?.pointerId !== event.pointerId) return;
          drag.current = null;
          setPosition(savedPosition);
        }}
      >
        {captureUrl ? (
          <img
            ref={imageRef}
            src={`/${captureUrl}`}
            alt=""
            draggable={false}
            style={{
              width: "100%",
              height: "100%",
              objectFit: capturePresentation?.objectFit ?? "cover",
              objectPosition: `${displayPosition.x * 100}% ${displayPosition.y * 100}%`,
              display: "block",
              pointerEvents: canDrag ? "none" : undefined,
            }}
          />
        ) : (
          <div
            className={`grid h-full w-full place-items-center border-4 border-dashed text-center ${capturePresentation ? "border-slate-300 bg-white text-slate-500" : "border-neutral-500 bg-neutral-800 text-neutral-300"}`}
            style={{ fontSize: "3cqw", padding: "4cqw" }}
          >
            no capture for {missing}
          </div>
        )}
      </div>
      {frameUrl ? (
        <img
          src={`/${frameUrl}`}
          alt=""
          draggable={false}
          style={{
            position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none",
          }}
        />
      ) : null}
      {slotMode && selected ? (
        <button
          type="button"
          aria-label={`Resize ${device.capture} slot`}
          className="absolute -bottom-2 -right-2 z-10 grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-sky-500 text-sm font-bold text-white shadow-lg"
          style={{ cursor: "nwse-resize", touchAction: "none" }}
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={(event) => {
            if (resizeDrag.current?.pointerId !== event.pointerId) return;
            onSlotGeometryDraft?.(resizeDrag.current.start);
            resizeDrag.current = null;
            event.stopPropagation();
          }}
          onClick={(event) => event.stopPropagation()}
        >↘</button>
      ) : null}
    </div>
  );
}

/** Badge pills in the composition's corners and image layers placed by tile fractions. */
function Decorations({
  decorations,
  tile,
  locale,
  color,
}: {
  decorations: Decoration[];
  tile: { width: number; height: number };
  locale: string;
  color: string;
}) {
  const { w, h } = cq(tile);
  const inset = Math.min(tile.width, tile.height) * BADGE.inset;
  return (
    <>
      {decorations.map((d, i) =>
        d.kind === "badge" ? (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: static list from the config
            key={i}
            style={{
              position: "absolute",
              ...(d.position.endsWith("left") ? { left: w(inset) } : { right: w(inset) }),
              ...(d.position.startsWith("top") ? { top: h(inset) } : { bottom: h(inset) }),
              padding: `${w(tile.width * BADGE.padY)} ${w(tile.width * BADGE.padX)}`,
              borderRadius: "999cqw",
              background: d.background ?? "rgba(255, 255, 255, 0.85)",
              color: d.color ?? color,
              fontSize: `${BADGE.fontSize * 100}cqw`,
              lineHeight: 1.2,
              fontWeight: BADGE.weight,
              whiteSpace: "nowrap",
            }}
          >
            {d.text[locale] ?? ""}
          </div>
        ) : (
          <img
            // biome-ignore lint/suspicious/noArrayIndexKey: static list from the config
            key={i}
            src={`/${d.src}`}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              left: w(tile.width * d.x),
              top: h(tile.height * d.y),
              width: w(tile.width * d.width),
              height: "auto",
              transform: d.rotate ? `rotate(${d.rotate}deg)` : undefined,
            }}
          />
        ),
      )}
    </>
  );
}

/**
 * Props that make a copy element editable in place. Input is reported live
 * so other views can mirror it; Enter finishes (Shift+Enter keeps a line
 * break), and Escape restores the value from when editing began.
 */
function editableProps(commit: (text: string) => void, current: string, label: string) {
  return {
    contentEditable: "plaintext-only" as const,
    suppressContentEditableWarning: true,
    role: "textbox",
    "aria-label": label,
    "data-placeholder": label,
    spellCheck: false,
    className: "editable-copy",
    onFocus: (e: React.FocusEvent<HTMLElement>) => {
      e.currentTarget.dataset.editStart = current;
    },
    onInput: (e: React.FormEvent<HTMLElement>) => {
      const text = e.currentTarget.innerText.replace(/\n+$/, "");
      if (text !== current) commit(text);
    },
    onBlur: (e: React.FocusEvent<HTMLElement>) => {
      const text = e.currentTarget.innerText.replace(/\n+$/, "");
      if (text !== current) commit(text);
      delete e.currentTarget.dataset.editStart;
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        e.currentTarget.blur();
      } else if (e.key === "Escape") {
        e.preventDefault();
        const original = e.currentTarget.dataset.editStart ?? current;
        e.currentTarget.innerText = original;
        commit(original);
        e.currentTarget.blur();
      }
    },
  };
}

/**
 * Plays the raw clips back to back, unframed, exactly as the exported video
 * joins them. Always muted - the configured audio bed only exists in the
 * exported video.
 */
function PreviewScene({ segments }: { segments: Array<{ url: string; durationSeconds: number }> }) {
  const [index, setIndex] = useState(0);
  const segment = segments[index % segments.length]!;
  return (
    // Remounting on every advance restarts playback even with one clip.
    <video
      key={index}
      src={`/${segment.url}`}
      autoPlay
      muted
      playsInline
      preload="auto"
      onEnded={() => setIndex((i) => i + 1)}
      className="absolute inset-0 h-full w-full object-cover"
    />
  );
}

/**
 * One strip tile. Screenshot tiles sit inside a Reorder.Item, which handles
 * the drag; a click still opens the lightbox.
 */
function Tile({
  width,
  height,
  bad,
  badReason,
  onOpen,
  transitionName,
  draggable,
  children,
}: {
  width: number;
  height: number;
  bad: boolean;
  badReason?: string;
  onOpen: () => void;
  transitionName?: string;
  draggable: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        aria-label={
          draggable ? "Open full-size preview (drag to reorder)" : "Open full-size preview"
        }
        title={draggable ? "Drag to reorder" : undefined}
        onClick={onOpen}
        className={`tile-shadow relative block w-full overflow-hidden rounded-2xl bg-neutral-200 ring-1 ring-black/10 transition-[transform,box-shadow,--tw-ring-color] duration-150 select-none hover:-translate-y-0.5 hover:ring-black/25 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none dark:bg-neutral-800 dark:ring-white/10 dark:hover:ring-white/30 ${
          draggable ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"
        }`}
        style={{ aspectRatio: `${width} / ${height}`, viewTransitionName: transitionName }}
      >
        {children}
      </button>
      {bad ? (
        <p className="pt-2 text-center text-[11px] font-medium text-destructive">{badReason}</p>
      ) : null}
    </div>
  );
}

/** Position of a scene id in the saved order; unlisted ids sort last, in config order. */
function rankOf(order: string[], id: string): number {
  const i = order.indexOf(id);
  return i === -1 ? Number.POSITIVE_INFINITY : i;
}

/**
 * Mean relative luminance of the
 * value's six-digit hex colors, or null when it has none.
 */
function backgroundLuminance(css: string): number | null {
  const hexes = css.match(/#[0-9a-fA-F]{6}/g);
  if (!hexes || hexes.length === 0) return null;
  const luminance = (hex: string) => {
    const channel = (offset: number) => {
      const c = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  };
  return hexes.reduce((sum, hex) => sum + luminance(hex), 0) / hexes.length;
}
