import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readNotes, saveNotes } from "./notes";
import { emptyNotes, migrateNotes, type NoteCard } from "../src/notes";
const roots: string[] = [];
async function directory() { const root = await mkdtemp(join(tmpdir(), "goldie-notes-")); roots.push(root); return root; }
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const excerpt = { id: "excerpt-1", messageId: "reply-1", start: 2, end: 6, text: "用户价值", createdAt: new Date().toISOString() };
const card = (id: string, document: string): NoteCard => ({ id, title: id, document, history: [] });

test("multiple cards persist independently with per-card history, rename, restore and deletion", async () => {
  const a = await directory(); const b = await directory();
  let notes = await saveNotes(a, { ...emptyNotes(), cards: [card("a", "最初的想法"), card("b", "第二张笔记")], excerpts: [excerpt] });
  notes = await saveNotes(a, { ...notes, cards: notes.cards.map((c) => c.id === "a" ? { ...c, title: "用户价值", document: "更新后的理解" } : c) });
  expect(notes.cards[0].history[0].document).toBe("最初的想法");
  expect(notes.cards[1].history).toEqual([]);
  expect(notes.cards[0].title).toBe("用户价值");
  notes = await saveNotes(a, { ...notes, cards: notes.cards.map((c) => c.id === "a" ? { ...c, document: c.history[0].document } : c), excerpts: [] });
  expect(notes.cards[0].document).toBe("最初的想法");
  expect(notes.cards[0].history[0].document).toBe("更新后的理解");
  notes = await saveNotes(a, { ...notes, cards: notes.cards.filter((c) => c.id !== "a") });
  expect(await readNotes(a)).toEqual(notes);
  expect(notes.cards).toEqual([card("b", "第二张笔记")]);
  expect(await readNotes(b)).toEqual(emptyNotes());
  expect(JSON.parse(await readFile(join(a, "goldie.notes.json"), "utf8")).cards).toEqual(notes.cards);
  notes = await saveNotes(a, { ...notes, cards: [] });
  expect((await readNotes(a)).cards).toEqual([]);
});

test("legacy document and history migrate without losing excerpts or revision, including browser drafts", async () => {
  const root = await directory();
  const legacy = { revision: 7, document: "旧文档", history: [{ document: "历史", savedAt: new Date().toISOString() }], excerpts: [excerpt] };
  await writeFile(join(root, "goldie.notes.json"), JSON.stringify(legacy));
  const migrated = await readNotes(root);
  expect(migrated.cards[0]).toEqual({ id: "legacy-document", title: "Current understanding", document: legacy.document, history: legacy.history });
  expect(migrated.revision).toBe(7);
  expect(migrated.excerpts).toEqual([excerpt]);
  expect(migrateNotes({ ...legacy, document: "未保存的草稿" }).cards[0].id).toBe(migrated.cards[0].id);
  expect(migrateNotes({ revision: 0, document: "", history: [], excerpts: [] })).toEqual(emptyNotes());
  expect((await saveNotes(root, migrated)).cards).toEqual(migrated.cards);
});

test("concurrent saves reject stale revisions without losing the winning cards", async () => {
  const root = await directory();
  const results = await Promise.allSettled([
    saveNotes(root, { ...emptyNotes(), cards: [card("a", "A")] }),
    saveNotes(root, { ...emptyNotes(), cards: [card("b", "B")] }),
  ]);
  expect(results[0].status).toBe("fulfilled");
  expect(results[1].status).toBe("rejected");
  expect((await readNotes(root)).cards[0].document).toBe("A");
  await expect(saveNotes(root, emptyNotes())).rejects.toThrow("another window");
});

test("invalid cards, ranges and duplicate ids cannot corrupt notes", async () => {
  const root = await directory();
  for (const cards of [[card("a", "A"), card("a", "B")], [{ ...card("a", "A"), title: "x".repeat(201) }], [{ ...card("a", "A"), document: "x".repeat(500001) }]]) {
    await expect(saveNotes(root, { ...emptyNotes(), cards })).rejects.toThrow("Invalid note card");
  }
  await expect(saveNotes(root, { ...emptyNotes(), excerpts: [{ ...excerpt, start: -1 }] })).rejects.toThrow("Invalid excerpt");
  await expect(saveNotes(root, { ...emptyNotes(), excerpts: [excerpt, excerpt] })).rejects.toThrow("Invalid excerpt");
  expect(await readNotes(root)).toEqual(emptyNotes());
});

test("each card keeps at most 20 server-owned previous versions", async () => {
  const root = await directory();
  let notes = await saveNotes(root, { ...emptyNotes(), cards: [card("a", "0")] });
  for (let i = 1; i <= 22; i++) notes = await saveNotes(root, { ...notes, cards: [{ ...notes.cards[0], document: String(i), history: [] }] });
  expect(notes.cards[0].history).toHaveLength(20);
  expect(notes.cards[0].history[0].document).toBe("21");
  expect(notes.cards[0].history[19].document).toBe("2");
});
