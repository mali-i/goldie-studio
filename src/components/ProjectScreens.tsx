import {
  GripVerticalIcon,
  ImagePlusIcon,
  Loader2Icon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { Reorder } from "motion/react";
import { useRef, useState } from "react";
import type { DesignScene, DeviceCaptures } from "../manifest";
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
  onReorder: (order: string[]) => void;
  onChanged: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<{ sceneId: string; slot: ScreenshotSlot } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (demo) return null;

  const rank = new Map(order.map((id, index) => [id, index]));
  const orderedScenes = [...scenes].sort(
    (a, b) =>
      (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
  );
  const sceneIds = orderedScenes.map((scene) => scene.id);
  const available = new Set(
    (captures?.screenshots ?? []).map((shot) => `${shot.sceneId}:${shot.slot ?? "primary"}`),
  );

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
        headline: scene?.headline[locale],
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
                {index + 1}. {scene.headline[locale] ?? scene.id}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {(["primary", "secondary"] as const).map((slot, slotIndex) => {
                const hasScreen = available.has(`${scene.id}:${slot}`);
                return (
                  <div
                    key={slot}
                    className="flex min-w-0 items-center rounded-md border border-border bg-background/60"
                  >
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => chooseFile(scene.id, slot)}
                      className="flex min-w-0 flex-1 items-center gap-1 px-2 py-1.5 text-[11px] disabled:opacity-50"
                    >
                      <ImagePlusIcon className="size-3 shrink-0" />
                      <span className="truncate">
                        Screen {slotIndex + 1}
                        {hasScreen ? " ✓" : " +"}
                      </span>
                    </button>
                    {hasScreen ? (
                      <button
                        type="button"
                        disabled={busy}
                        aria-label={`Remove screen ${slotIndex + 1} from ${scene.id}`}
                        onClick={() => void remove(scene.id, slot)}
                        className="p-1.5 text-muted-foreground hover:text-destructive disabled:opacity-50"
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
