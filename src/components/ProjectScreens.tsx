import {
  CheckIcon,
  GripVerticalIcon,
  ImagePlusIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { Reorder } from "motion/react";
import { AlertDialog } from "radix-ui";
import { useRef, useState } from "react";
import { isTemplateKey, resolveScenes, type LayoutKey } from "../lib/layouts";
import type { DesignScene, DeviceCaptures, SceneCopy } from "../manifest";
import type { ScreenshotSlot } from "../project";
import { projectApi } from "../project-api";
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
  const slotsFor = (sceneId: string): ScreenshotSlot[] =>
    needsSecondScreen.get(sceneId) ? ["primary", "secondary"] : ["primary"];
  const available = new Set(
    (captures?.screenshots ?? []).map((shot) => `${shot.sceneId}:${shot.slot ?? "primary"}`),
  );
  const headlineOf = (scene: DesignScene) =>
    copy[scene.id]?.headline?.[locale] ?? scene.headline[locale] ?? scene.id;

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
    <section className="flex flex-col gap-2 border-b border-sidebar-border px-5 py-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Scenes</span>
        <span className="text-[11px] text-muted-foreground/70">{scenes.length}</span>
      </div>
      <Reorder.Group
        axis="y"
        values={sceneIds}
        onReorder={onReorder}
        className="flex list-none flex-col gap-2 p-0"
        aria-label="Scenes, drag to reorder"
      >
        {orderedScenes.map((scene, index) => (
          <Reorder.Item
            key={scene.id}
            value={scene.id}
            className="rounded-md bg-muted/60 px-2.5 py-2"
          >
            <div className="flex items-center gap-1.5">
              <GripVerticalIcon className="size-3.5 shrink-0 cursor-grab text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-xs">
                {index + 1}. {headlineOf(scene)}
              </span>
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
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <Trash2Icon />
                  </Button>
                </AlertDialog.Trigger>
                <AlertDialog.Portal>
                  <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
                  <AlertDialog.Content className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 space-y-4 rounded-2xl border border-border bg-popover p-6 text-popover-foreground shadow-xl outline-none">
                    <AlertDialog.Title className="text-lg font-semibold">Delete Scene?</AlertDialog.Title>
                    <AlertDialog.Description className="break-words text-sm text-muted-foreground">
                      Scene {index + 1} “{headlineOf(scene)}” and its screenshots for all devices and languages will be removed. This cannot be undone.
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
            <div
              className={`mt-2 grid gap-1.5 ${needsSecondScreen.get(scene.id) ? "grid-cols-2" : "grid-cols-1"}`}
            >
              {slotsFor(scene.id).map((slot, slotIndex) => {
                const hasScreen = available.has(`${scene.id}:${slot}`);
                return (
                  <div
                    key={slot}
                    className={`flex min-w-0 items-center overflow-hidden rounded-lg border transition-colors ${
                      hasScreen
                        ? "border-border bg-background/80"
                        : "border-dashed border-border bg-background/50 hover:border-foreground/40 hover:bg-background"
                    }`}
                  >
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => chooseFile(scene.id, slot)}
                      aria-label={`${hasScreen ? "Replace" : "Upload"} screen ${slotIndex + 1} for ${headlineOf(scene)}`}
                      className="flex min-h-8 min-w-0 flex-1 items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50"
                    >
                      {hasScreen ? (
                        <CheckIcon className="size-3.5 shrink-0 text-emerald-600" />
                      ) : (
                        <ImagePlusIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <span className="truncate">Screen {slotIndex + 1}</span>
                      {!hasScreen ? (
                        <PlusIcon className="size-3 shrink-0 text-muted-foreground" />
                      ) : null}
                    </button>
                    {hasScreen ? (
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`Remove screen ${slotIndex + 1} from ${scene.id}`}
                        onClick={() => void remove(scene.id, slot)}
                        className="flex min-h-8 items-center border-l border-border px-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-50"
                      >
                        <Trash2Icon className="size-3" />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Reorder.Item>
        ))}
      </Reorder.Group>
      <input
        ref={input}
        className="hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(event) => void upload(event.target.files)}
      />
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void addScene()}>
        {busy ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
        Add Scene
      </Button>
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </section>
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
