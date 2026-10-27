import type { DesignScene, SceneCopy } from "../manifest";
import { isTemplateKey, resolveScenes, type LayoutKey } from "./layouts";

export type ChatFrame = { id: string; sceneId: string; label: string; headline: string };

/** One entry per exported still, in the same order and layout as the canvas. */
export function chatFrames(scenes: DesignScene[], order: string[], template: string | string[], layout: string, sceneLayouts: Record<string, string>, copy: Record<string, SceneCopy>, locale: string): ChatFrame[] {
  const rank = (id: string) => order.includes(id) ? order.indexOf(id) : Infinity;
  const sorted = [...scenes].sort((a, b) => rank(a.id) - rank(b.id));
  const resolved = resolveScenes(sorted, {
    template: Array.isArray(template) ? template as LayoutKey[] : isTemplateKey(template) ? template : undefined,
    layout, sceneLayouts,
  });
  return resolved.flatMap(({ scene, layout }) => Array.from({ length: layout.span }, (_, slice) => ({
    id: `${scene.id}#${slice + 1}`,
    sceneId: scene.id,
    headline: copy[scene.id]?.headline?.[locale] ?? scene.headline[locale] ?? "",
  }))).map((frame, index) => ({ ...frame, label: `Frame ${index + 1}` }));
}

/** Only inspect text before the caret, leaving trailing text untouched on selection. */
export function frameMention(text: string, caret: number) {
  const match = /(^|[^\w@])@([^\s@]*)$/u.exec(text.slice(0, caret));
  if (!match) return null;
  return { start: caret - match[2]!.length - 1, end: caret, query: match[2]! };
}
