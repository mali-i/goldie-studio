export type Excerpt = {
  id: string;
  messageId: string;
  start: number;
  end: number;
  text: string;
  createdAt: string;
};
export type WorkspaceNotes = {
  revision: number;
  document: string;
  excerpts: Excerpt[];
  history: { document: string; savedAt: string }[];
};
export const emptyNotes = (): WorkspaceNotes => ({ revision: 0, document: "", excerpts: [], history: [] });

/** Offsets use the original message's UTF-16 text, independent of rendered marks. */
export function highlightSegments(text: string, excerpts: Excerpt[]) {
  const ranges = excerpts.filter((e) => text.slice(e.start, e.end) === e.text);
  const points = [...new Set([0, text.length, ...ranges.flatMap((e) => [e.start, e.end])])].sort((a, b) => a - b);
  return points.slice(0, -1).map((start, i) => ({
    start, text: text.slice(start, points[i + 1]),
    highlighted: ranges.some((e) => e.start <= start && e.end >= points[i + 1]),
  }));
}
