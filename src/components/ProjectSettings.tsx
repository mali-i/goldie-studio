import { Loader2Icon, SaveIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GoldieProjectConfig } from "../project";
import { projectApi } from "../project-api";
import { Field, Select } from "./Sidebar";

export function ProjectSettings({
  projectId,
  demo,
  onChanged,
}: {
  projectId: string;
  demo: boolean;
  onChanged: () => void;
}) {
  const [config, setConfig] = useState<GoldieProjectConfig | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (demo) return;
    projectApi.get(projectId).then((detail) => setConfig(detail.config)).catch((e: Error) => setError(e.message));
  }, [demo, projectId]);

  if (demo || !config) return null;
  const locale = config.locales[0] ?? "en-US";
  const device = config.devices[0] ?? "iphone-6.9";
  const updateStore = <K extends keyof GoldieProjectConfig["store"]>(
    key: K,
    value: GoldieProjectConfig["store"][K],
  ) => setConfig({ ...config, store: { ...config.store, [key]: value } });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await projectApi.saveConfig(projectId, config);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="border-b border-sidebar-border px-5 py-4">
      <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Project settings</summary>
      <div className="mt-3 flex flex-col gap-3">
        <Field label="App name">
          <Input value={config.store.name} onChange={(e) => updateStore("name", e.target.value)} />
        </Field>
        <Field label="Developer">
          <Input value={config.store.developer} onChange={(e) => updateStore("developer", e.target.value)} />
        </Field>
        <Field label="Subtitle">
          <Input
            value={config.store.subtitle[locale] ?? ""}
            onChange={(e) => updateStore("subtitle", { ...config.store.subtitle, [locale]: e.target.value })}
          />
        </Field>
        <Field label="Target device">
          <Select
            value={device}
            onChange={(value) => setConfig({ ...config, devices: [value] })}
            options={[
              ["iphone-6.9", "iPhone 6.9\""],
              ["pixel-10-pro", "Pixel 10 Pro"],
              ["mac-2880x1800", "Mac 2880 × 1800"],
            ]}
          />
        </Field>
        <Field label="Locale">
          <Input value={locale} onChange={(e) => setConfig({ ...config, locales: [e.target.value] })} />
        </Field>
        <Button size="sm" onClick={() => void save()} disabled={busy}>
          {busy ? <Loader2Icon className="animate-spin" /> : <SaveIcon />}
          Save settings
        </Button>
        {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
      </div>
    </details>
  );
}
