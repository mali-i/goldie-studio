import {
  EllipsisIcon,
  GripVerticalIcon,
  ImagePlusIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
import { AlertDialog, DropdownMenu } from "radix-ui";
import { useRef, useState, type ReactNode } from "react";
import { isTemplateKey, resolveScenes, type LayoutKey } from "../lib/layouts";
import type { DesignScene, DeviceCaptures, SceneCopy } from "../manifest";
import type { ScreenshotSlot } from "../project";
import { projectApi } from "../project-api";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";

export function ProjectScreens({
  projectId,
  demo,
  device,
  locale,
  scenes,
  captures,
  order,
  copy,
  template,
  layout,
  sceneLayouts,
  onReorder,
  onChanged,
}: {
  projectId: string;
  demo: boolean;
  device: string;
  locale: string;
  scenes: DesignScene[];
  captures: DeviceCaptures | undefined;
  order: string[];
  copy: Record<string, SceneCopy>;
  template: string | string[];
  layout: string;
  sceneLayouts: Record<string, string>;
  onReorder: (order: string[]) => void;
  onChanged: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<{ sceneId: string; slot: ScreenshotSlot } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sceneToDelete, setSceneToDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  if (demo) return null;

  const rank = new Map(order.map((id, index) => [id, index]));
  const orderedScenes = [...scenes].sort(
    (a, b) =>
      (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
  const sceneIds = orderedScenes.map((scene) => scene.id);
  const resolved = resolveScenes(orderedScenes, {
    template: Array.isArray(template)
      ? (template as LayoutKey[])
      : isTemplateKey(template)
        ? template
        : undefined,
    layout,
    sceneLayouts,
  });
  const needsSecondScreen = new Map(
    resolved.map(({ scene, layout: spec }) => [
      scene.id,
      spec.devices.some((placement) => placement.capture === "secondary"),
    ]),
  );
  let frameCount = 0;
  const frameLabels = new Map(resolved.map(({ scene, layout: spec }) => {
    const first = frameCount + 1;
    frameCount += spec.span;
    return [scene.id, spec.span === 1 ? `Frame ${first}` : `Frames ${first}–${frameCount}`];
  }));
  const slotsFor = (sceneId: string): ScreenshotSlot[] =>
    needsSecondScreen.get(sceneId) ? ["primary", "secondary"] : ["primary"];
  const screenshots = new Map(
    (captures?.screenshots ?? []).map((shot) => [`${shot.sceneId}:${shot.slot ?? "primary"}`, shot.url]),
  );
  const headlineOf = (scene: DesignScene) =>
    copy[scene.id]?.headline?.[locale] ?? scene.headline[locale] ?? scene.id;

  const moveScene = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= sceneIds.length) return;
    const next = [...sceneIds];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onReorder(next);
  };

  const chooseFile = (sceneId: string, slot: ScreenshotSlot) => {
    uploadTarget.current = { sceneId, slot };
    input.current?.click();
  };

  const upload = async (files: FileList | null) => {
    const target = uploadTarget.current;
    const file = files?.[0];
    if (!file || !target || !device || !locale) return;
    setBusy(true);
    setError(null);
    try {
      const scene = scenes.find((candidate) => candidate.id === target.sceneId);
      await projectApi.upload(projectId, {
        device,
        locale,
        sceneId: target.sceneId,
        slot: target.slot,
        headline: scene ? headlineOf(scene) : undefined,
        subhead: scene?.subhead?.[locale],
        mimeType: file.type,
        base64: await fileBase64(file),
      });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      uploadTarget.current = null;
      if (input.current) input.current.value = "";
    }
  };

  const remove = async (sceneId: string, slot: ScreenshotSlot) => {
    if (
      !window.confirm(`Remove screen ${slot === "primary" ? "1" : "2"} from “${sceneId}”?`)
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await projectApi.removeScreenshot(projectId, sceneId, device, locale, slot);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const addScene = async () => {
    setBusy(true);
    setError(null);
    try {
      await projectApi.addScene(projectId);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const deleteScene = async (sceneId: string) => {
    setBusy(true);
    setDeleteError(null);
    try {
      await projectApi.deleteScene(projectId, sceneId);
      setSceneToDelete(null);
      onChanged();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Scenes" className="flex flex-col gap-3 border-b border-sidebar-border px-5 py-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex flex-col gap-0.5 text-sm font-semibold">
          Scenes
          <span className="text-[11px] font-normal text-muted-foreground tabular-nums">
            {frameCount} {frameCount === 1 ? "Frame" : "Frames"}
          </span>
        </h2>
        <Button type="button" variant="outline" size="xs" disabled={busy} onClick={() => void addScene()}>
          <PlusIcon />
          Add Scene
        </Button>
      </div>
      {orderedScenes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-sidebar-border px-3 py-4 text-center text-xs text-muted-foreground">
          Add a scene to start uploading screenshots.
        </p>
      ) : (
        <Reorder.Group
          as="ol"
          axis="y"
          values={sceneIds}
          onReorder={onReorder}
          className="list-none divide-y divide-sidebar-border border-t border-sidebar-border p-0"
          aria-label="Scene order"
        >
          {orderedScenes.map((scene, index) => (
            <SceneRow
              key={scene.id}
              id={scene.id}
              name={`${frameLabels.get(scene.id)}: ${headlineOf(scene)}`}
              busy={busy}
              onMove={(direction) => moveScene(index, direction)}
            >
              <div className="flex min-w-0 items-start gap-1.5">
                <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
                  <span className="text-[11px] leading-4 font-semibold text-muted-foreground tabular-nums">
                    {frameLabels.get(scene.id)}
                  </span>
                  <span className="max-w-full truncate text-[13px] font-normal" title={headlineOf(scene)}>
                    {headlineOf(scene)}
                  </span>
                </div>
                <AlertDialog.Root
                  open={sceneToDelete === scene.id}
                  onOpenChange={(open) => {
                    if (busy) return;
                    setSceneToDelete(open ? scene.id : null);
                    setDeleteError(null);
                  }}
                >
                  <AlertDialog.Trigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      disabled={busy}
                      aria-label={`Delete scene ${index + 1}: ${headlineOf(scene)}`}
                      title="Delete Scene"
                    >
                      <Trash2Icon />
                    </Button>
                  </AlertDialog.Trigger>
                  <AlertDialog.Portal>
                    <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
                    <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-2xl border border-border bg-popover p-6 text-popover-foreground shadow-xl outline-none">
                      <AlertDialog.Title className="text-lg font-semibold">Delete Scene?</AlertDialog.Title>
                      <AlertDialog.Description className="break-words text-sm text-muted-foreground">
                        Deleting “{headlineOf(scene)}” ({frameLabels.get(scene.id)}) also removes its screenshots for all devices and languages. This cannot be undone.
                      </AlertDialog.Description>
                      {deleteError ? <p role="alert" className="text-sm text-destructive">{deleteError}</p> : null}
                      <div className="flex justify-end gap-2">
                        <AlertDialog.Cancel asChild>
                          <Button type="button" variant="outline" disabled={busy}>Cancel</Button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action asChild>
                          <Button
                            type="button"
                            variant="destructive"
                            disabled={busy}
                            onClick={(event) => {
                              event.preventDefault();
                              void deleteScene(scene.id);
                            }}
                          >
                            {busy ? <Loader2Icon className="animate-spin" /> : null}
                            {busy ? "Deleting…" : "Delete Scene"}
                          </Button>
                        </AlertDialog.Action>
                      </div>
                    </AlertDialog.Content>
                  </AlertDialog.Portal>
                </AlertDialog.Root>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {slotsFor(scene.id).map((slot, slotIndex) => {
                  const screenshot = screenshots.get(`${scene.id}:${slot}`);
                  const screenLabel = needsSecondScreen.get(scene.id) ? `Screen ${slotIndex + 1}` : "Screenshot";
                  return (
                    <ScreenshotControl
                      key={slot}
                      screenshot={screenshot}
                      label={screenLabel}
                      sceneName={headlineOf(scene)}
                      busy={busy}
                      onUpload={() => chooseFile(scene.id, slot)}
                      onRemove={() => void remove(scene.id, slot)}
                    />
                  );
                })}
              </div>
            </SceneRow>
          ))}
        </Reorder.Group>
      )}
      <input
        ref={input}
        className="hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => void upload(event.target.files)}
      />
      {error ? <p role="alert" className="text-[11px] text-destructive">{error}</p> : null}
    </section>
  );
}

function ScreenshotControl({ screenshot, label, sceneName, busy, onUpload, onRemove }: {
  screenshot: string | undefined;
  label: string;
  sceneName: string;
  busy: boolean;
  onUpload: () => void;
  onRemove: () => void;
}) {
  const buttonClass = "h-7 gap-1.5 rounded-md px-1.5 text-[11px] font-normal text-muted-foreground";
  if (!screenshot) {
    return (
      <Button type="button" variant="ghost" size="xs" className={cn(buttonClass, "border-dashed border-sidebar-border")}
        disabled={busy} onClick={onUpload} aria-label={`Upload ${label.toLowerCase()} for ${sceneName}`}>
        <ImagePlusIcon />
        Upload {label.toLowerCase()}
      </Button>
    );
  }

  const itemClass = "flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-xs outline-none data-highlighted:bg-accent";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button type="button" variant="ghost" size="xs" className={cn(buttonClass, "bg-muted/65")}
          disabled={busy} aria-label={`${label} options for ${sceneName}`}>
          <img src={`/${screenshot}`} alt="" loading="lazy" className="size-5 shrink-0 rounded-sm bg-background object-contain" />
          {label}
          <EllipsisIcon />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={4} className="z-50 min-w-36 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg">
          <DropdownMenu.Item className={itemClass} onSelect={onUpload}>
            <ImagePlusIcon className="size-3.5" /> Replace screenshot
          </DropdownMenu.Item>
          <DropdownMenu.Item className={cn(itemClass, "text-destructive")} onSelect={onRemove}>
            <Trash2Icon className="size-3.5" /> Remove screenshot
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function SceneRow({ id, name, busy, onMove, children }: {
  id: string;
  name: string;
  busy: boolean;
  onMove: (direction: -1 | 1) => void;
  children: ReactNode;
}) {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={id}
      dragListener={false}
      dragControls={controls}
      whileDrag={{ scale: 1.02 }}
      className="relative grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-1.5 py-2.5"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="touch-none cursor-grab text-muted-foreground active:cursor-grabbing"
        aria-label={`Reorder ${name}`}
        aria-keyshortcuts="ArrowUp ArrowDown"
        title="Drag or use ↑ and ↓ to reorder"
        disabled={busy}
        onPointerDown={(event) => controls.start(event)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault();
          onMove(event.key === "ArrowUp" ? -1 : 1);
        }}
      >
        <GripVerticalIcon />
      </Button>
      <div className="flex min-w-0 flex-col gap-1.5">{children}</div>
    </Reorder.Item>
  );
}

function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the image."));
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.readAsDataURL(file);
  });
}
