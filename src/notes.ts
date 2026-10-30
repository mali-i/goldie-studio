export type Excerpt = {
  id: string;
  messageId: string;
  start: number;
  end: number;
  text: string;
  createdAt: string;
};
export type NoteCard = {
  id: string;
  title: string;
  document: string;
  history: { document: string; savedAt: string }[];
};
export type WorkspaceNotes = {
  revision: number;
  cards: NoteCard[];
  excerpts: Excerpt[];
};
export const emptyNotes = (): WorkspaceNotes => ({ revision: 0, cards: [], excerpts: [] });

/** Stable ID keeps saved legacy notes and browser recovery drafts aligned. */
export function migrateNotes(value: unknown): WorkspaceNotes {
  const notes = value as WorkspaceNotes & { document?: string; history?: NoteCard["history"] };
  if (notes && !Array.isArray(notes.cards) && typeof notes.document === "string") {
    return {
      revision: notes.revision,
      cards: notes.document || notes.history?.length ? [{ id: "legacy-document", title: "Current understanding", document: notes.document, history: notes.history ?? [] }] : [],
      excerpts: notes.excerpts,
    };
  }
  return notes;
}

/** Offsets use the original message's UTF-16 text, independent of rendered marks. */
export function highlightSegments(text: string, excerpts: Excerpt[]) {
  const ranges = excerpts.filter((e) => text.slice(e.start, e.end) === e.text);
  const points = [...new Set([0, text.length, ...ranges.flatMap((e) => [e.start, e.end])])].sort((a, b) => a - b);
  return points.slice(0, -1).map((start, i) => ({
    start, text: text.slice(start, points[i + 1]),
    highlighted: ranges.some((e) => e.start <= start && e.end >= points[i + 1]),
  }));
}
