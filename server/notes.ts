import { readFile, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { emptyNotes, type WorkspaceNotes } from "../src/notes";

export class NotesError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export async function readNotes(directory: string): Promise<WorkspaceNotes> {
  try { return JSON.parse(await readFile(join(directory, "goldie.notes.json"), "utf8")); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return emptyNotes();
    throw error;
  }
}
const writes = new Map<string, Promise<unknown>>();
export function saveNotes(directory: string, input: WorkspaceNotes): Promise<WorkspaceNotes> {
  const task = (writes.get(directory) ?? Promise.resolve()).catch(() => {}).then(async () => {
    validate(input);
    const previous = await readNotes(directory);
    if (input.revision !== previous.revision) throw new NotesError(409, "Notes changed in another window. Copy your draft before reloading.");
    const history = previous.document !== input.document && previous.document
      ? [{ document: previous.document, savedAt: new Date().toISOString() }, ...previous.history].slice(0, 20)
      : previous.history;
    const next: WorkspaceNotes = { revision: previous.revision + 1, document: input.document, excerpts: input.excerpts, history };
    const file = join(directory, "goldie.notes.json");
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(next, null, 2) + "\n");
    await rename(temporary, file);
    return next;
  });
  writes.set(directory, task);
  void task.finally(() => { if (writes.get(directory) === task) writes.delete(directory); }).catch(() => {});
  return task;
}
function validate(input: WorkspaceNotes) {
  if (!input || !Number.isSafeInteger(input.revision) || input.revision < 0 || typeof input.document !== "string" || input.document.length > 500_000 || !Array.isArray(input.excerpts) || input.excerpts.length > 2000) {
    throw new NotesError(422, "Invalid notes or notes size limit exceeded.");
  }
  const ids = new Set<string>();
  for (const e of input.excerpts) {
    if (!e || typeof e.id !== "string" || !e.id || ids.has(e.id) || typeof e.messageId !== "string" || !e.messageId || !Number.isSafeInteger(e.start) || !Number.isSafeInteger(e.end) || e.start < 0 || e.end <= e.start || typeof e.text !== "string" || !e.text.trim() || e.text.length !== e.end - e.start || e.text.length > 100_000 || typeof e.createdAt !== "string" || !Number.isFinite(Date.parse(e.createdAt))) {
      throw new NotesError(422, "Invalid excerpt.");
    }
    ids.add(e.id);
  }
}
