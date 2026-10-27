import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readNotes, saveNotes } from "./notes";
import { emptyNotes } from "../src/notes";
const roots: string[] = [];
async function directory() { const root = await mkdtemp(join(tmpdir(), "goldie-notes-")); roots.push(root); return root; }
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const excerpt = { id: "excerpt-1", messageId: "reply-1", start: 2, end: 6, text: "用户价值", createdAt: new Date().toISOString() };

test("notes persist independently per workspace, with snapshots and excerpt removal", async () => {
  const a = await directory(); const b = await directory();
  expect(await readNotes(a)).toEqual(emptyNotes());
  let notes = await saveNotes(a, { ...emptyNotes(), document: "最初的想法", excerpts: [excerpt] });
  notes = await saveNotes(a, { ...notes, document: "更新后的理解" });
  expect(notes.history[0].document).toBe("最初的想法");
  notes = await saveNotes(a, { ...notes, excerpts: [] });
  expect(await readNotes(a)).toEqual(notes);
  expect(await readNotes(b)).toEqual(emptyNotes());
  expect(JSON.parse(await readFile(join(a, "goldie.notes.json"), "utf8")).excerpts).toEqual([]);
  notes = await saveNotes(a, { ...notes, document: notes.history[0].document });
  expect(notes.document).toBe("最初的想法");
  expect(notes.history[0].document).toBe("更新后的理解");
});

test("concurrent saves reject stale revisions without losing the winning edit", async () => {
  const root = await directory();
  const results = await Promise.allSettled([
    saveNotes(root, { ...emptyNotes(), document: "A" }),
    saveNotes(root, { ...emptyNotes(), document: "B" }),
  ]);
  expect(results[0].status).toBe("fulfilled");
  expect(results[1].status).toBe("rejected");
  expect((await readNotes(root)).document).toBe("A");
  await expect(saveNotes(root, emptyNotes())).rejects.toThrow("another window");
});

test("invalid ranges and duplicate excerpt ids cannot corrupt notes", async () => {
  const root = await directory();
  await expect(saveNotes(root, { ...emptyNotes(), excerpts: [{ ...excerpt, start: -1 }] })).rejects.toThrow("Invalid excerpt");
  await expect(saveNotes(root, { ...emptyNotes(), excerpts: [excerpt, excerpt] })).rejects.toThrow("Invalid excerpt");
  expect(await readNotes(root)).toEqual(emptyNotes());
});
