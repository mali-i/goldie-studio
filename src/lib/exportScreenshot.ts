import { toBlob } from "html-to-image";

/** Render the same full-resolution composition used by the ZIP exporter. */
export async function renderExportTile(node: HTMLElement): Promise<Blob> {
  const blob = await toBlob(node, {
    cacheBust: true,
    pixelRatio: 1,
    width: node.offsetWidth,
    height: node.offsetHeight,
  });
  if (!blob) throw new Error("The browser could not render a screenshot.");
  return blob;
}

export function downloadScreenshot(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
