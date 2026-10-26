import { MinusIcon, PlusIcon, RotateCcwIcon } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { INITIAL_CAMERA, MAX_ZOOM, MIN_ZOOM, zoomCamera } from "../lib/canvasCamera";
import { Button } from "./ui/button";

const ZOOM_STEP = 10;

/** Pan without bounds; avoid ancestor transforms so fixed lightboxes and export tiles stay independent. */
export function PreviewCanvas({
  children,
  label,
  enabled,
}: {
  children: ReactNode;
  label?: string;
  enabled: boolean;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [camera, setCamera] = useState(INITIAL_CAMERA);
  const zoom = Math.round(camera.zoom);
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [panning, setPanning] = useState(false);
  const changeZoom = (value: number | ((current: number) => number)) => {
    setCamera((current) => zoomCamera(current,
      typeof value === "function" ? value(current.zoom) : value,
    ));
  };

  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const element = viewport.current;
    if (!element || !enabled) return;
    const onWheel = (event: WheelEvent) => {
      if (event.target instanceof Element && event.target.closest('[role="dialog"]')) return;
      event.preventDefault();
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element.clientHeight : 1;
      if (event.ctrlKey || event.metaKey) {
        const rect = element.getBoundingClientRect();
        const anchor = { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
        setCamera((current) => zoomCamera(current, current.zoom * Math.exp(-event.deltaY * unit * 0.01), anchor));
      } else {
        // Trackpad two-finger scroll supplies both axes, including inertial motion.
        setCamera((current) => ({ ...current, x: current.x - event.deltaX * unit, y: current.y - event.deltaY * unit }));
      }
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [enabled]);

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-10 py-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="flex items-center gap-1 rounded-xl border bg-background p-1 shadow-sm" role="group" aria-label="Preview zoom">
          <Button variant="ghost" size="icon-sm" aria-label="Zoom out" title="Zoom out" disabled={!enabled || zoom <= MIN_ZOOM} onClick={() => changeZoom((current) => current - ZOOM_STEP)}>
            <MinusIcon />
          </Button>
          <input
            type="range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={1}
            value={zoom}
            disabled={!enabled}
            onChange={(event) => changeZoom(Number(event.target.value))}
            aria-label="Preview zoom percentage"
            aria-valuetext={`${zoom}%`}
            className="mx-1 w-24 accent-primary disabled:opacity-50"
          />
          <Button variant="ghost" size="sm" className="w-14 tabular-nums" disabled={!enabled} title="Reset zoom to 100%" aria-label={`Zoom ${zoom}%, reset to 100%`} onClick={() => changeZoom(100)}>
            {zoom}%
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Zoom in" title="Zoom in" disabled={!enabled || zoom >= MAX_ZOOM} onClick={() => changeZoom((current) => current + ZOOM_STEP)}>
            <PlusIcon />
          </Button>
          <div className="mx-1 h-4 w-px bg-border" />
          <Button variant="ghost" size="icon-sm" aria-label="Reset preview zoom" title="Center canvas and reset zoom" disabled={!enabled || (camera.zoom === 100 && camera.x === 0 && camera.y === 0)} onClick={() => setCamera(INITIAL_CAMERA)}>
            <RotateCcwIcon />
          </Button>
        </div>
      </div>
      <div
        ref={viewport}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-10"
        aria-label="Preview canvas"
        style={{
          cursor: enabled ? panning ? "grabbing" : "grab" : undefined,
          overscrollBehavior: "none",
          backgroundImage: enabled ? "radial-gradient(circle, color-mix(in srgb, var(--foreground) 12%, transparent) 1px, transparent 1px)" : undefined,
          backgroundSize: "20px 20px",
          backgroundPosition: `${camera.x}px ${camera.y}px`,
        }}
        onPointerDown={(event) => {
          if (!enabled || event.pointerType !== "mouse" ||
            (event.button !== 1 && (event.button !== 0 || event.target !== event.currentTarget))) return;
          event.preventDefault();
          drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
          setPanning(true);
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current || current.pointerId !== event.pointerId) return;
          const dx = event.clientX - current.x;
          const dy = event.clientY - current.y;
          drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
          setCamera((value) => ({ ...value, x: value.x + dx, y: value.y + dy }));
        }}
        onPointerUp={(event) => {
          if (drag.current?.pointerId !== event.pointerId) return;
          drag.current = null;
          setPanning(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onLostPointerCapture={() => { drag.current = null; setPanning(false); }}
        onPointerCancel={() => { drag.current = null; setPanning(false); }}
      >
          <div
            className="relative shrink-0"
            style={{
              width: enabled ? Math.max(1, Math.min(1400, width - 80)) * camera.zoom / 100 : undefined,
              left: enabled ? camera.x : undefined,
              top: enabled ? camera.y : undefined,
              cursor: "auto",
            }}
          >
            {children}
          </div>
        {enabled && <p className="pointer-events-none absolute bottom-4 left-0 right-0 text-center text-[11px] text-muted-foreground">Two-finger pan · Pinch to zoom · Drag empty canvas to move</p>}
      </div>
    </main>
  );
}
