import { ImagePlusIcon, Loader2Icon, Trash2Icon } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { DesignScene, DeviceCaptures } from "../manifest";
import { projectApi } from "../project-api";

export function ProjectScreens({
  projectId,
  demo,
  device,
  locale,
  scenes,
  captures,
  onChanged,
}: {
  projectId: string;
  demo: boolean;
  device: string;
  locale: string;
  scenes: DesignScene[];
  captures: DeviceCaptures | undefined;
  onChanged: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (demo) return null;

  const upload = async (files: FileList | null) => {
    if (!files?.length || !device || !locale) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const sceneId = slug(file.name.replace(/\.[^.]+$/, ""));
        await projectApi.upload(projectId, {
          device,
          locale,
          sceneId,
          headline: humanize(sceneId),
          mimeType: file.type,
          base64: await fileBase64(file),
        });
      }
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async (sceneId: string) => {
    if (!window.confirm(`Remove “${sceneId}” for ${device} / ${locale}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await projectApi.removeScreenshot(projectId, sceneId, device, locale);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const available = new Set(captures?.screenshots.map((shot) => shot.sceneId) ?? []);
  return (
    <section className="flex flex-col gap-2 border-b border-sidebar-border px-5 py-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Screens</span>
        <span className="text-[11px] text-muted-foreground/70">{available.size}</span>
      </div>
      {scenes.filter((scene) => available.has(scene.id)).map((scene) => (
        <div key={scene.id} className="flex items-center gap-2 rounded-md bg-muted/60 px-2.5 py-2">
          <span className="min-w-0 flex-1 truncate text-xs">{scene.headline[locale] ?? scene.id}</span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Remove ${scene.id}`}
            disabled={busy}
            onClick={() => void remove(scene.id)}
          >
            <Trash2Icon />
          </Button>
        </div>
      ))}
      <input
        ref={input}
        className="hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        onChange={(event) => void upload(event.target.files)}
      />
      <Button variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2Icon className="animate-spin" /> : <ImagePlusIcon />}
        {busy ? "Uploading…" : "Upload screenshots"}
      </Button>
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </section>
  );
}

function slug(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return normalized || `screen-${Date.now()}`;
}

function humanize(value: string): string {
  return value.replaceAll(/[-_]+/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

function fileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the image."));
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.readAsDataURL(file);
  });
}
