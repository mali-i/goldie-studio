import { DownloadIcon, Loader2Icon } from "lucide-react";
import { useState } from "react";
import { zipSync } from "fflate";
import { Button } from "@/components/ui/button";
import { renderExportTile } from "@/lib/exportScreenshot";

/** Renders the off-screen full-resolution tiles and packages them in the browser. */
export function ExportPanel({
  demo,
  hasScreens,
  device,
  locale,
}: {
  demo: boolean;
  hasScreens: boolean;
  device: string;
  locale: string;
}) {
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string | null>(null);

  async function exportZip() {
    if (busy) return;
    setBusy(true);
    setLog("Preparing screenshots…");
    try {
      const nodes = Array.from(document.querySelectorAll<HTMLElement>("[data-export-tile]"));
      if (nodes.length === 0) throw new Error("Upload at least one screenshot before exporting.");
      const files: Record<string, Uint8Array> = {};
      for (const [index, node] of nodes.entries()) {
        setLog(`Rendering ${index + 1} of ${nodes.length}…`);
        const blob = await renderExportTile(node);
        const name = node.dataset.exportName ?? `screenshot-${index + 1}.png`;
        files[`${device}/${locale}/${name}`] = new Uint8Array(await blob.arrayBuffer());
      }
      setLog("Creating ZIP…");
      const zip = zipSync(files, { level: 6 });
      const url = URL.createObjectURL(new Blob([zip], { type: "application/zip" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "goldie-screenshots.zip";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setLog(null);
    } catch (error) {
      setLog(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {log !== null && !busy ? <p className="text-[12px] text-destructive">Export failed.</p> : null}
      {log !== null ? (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
          {log}
        </pre>
      ) : null}
      <Button
        size="lg"
        className="w-full"
        onClick={() => void exportZip()}
        disabled={busy || demo || !hasScreens}
        title={demo ? "Create a workspace project to export screenshots." : undefined}
      >
        {busy ? (
          <>
            <Loader2Icon className="animate-spin" />
            Exporting…
          </>
        ) : demo ? (
          <>Demo mode</>
        ) : !hasScreens ? (
          <>Upload screenshots</>
        ) : (
          <>
            <DownloadIcon />
            Export current device
          </>
        )}
      </Button>
    </div>
  );
}
