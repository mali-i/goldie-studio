import { expect, test } from "bun:test";
import { highlightSegments, type Excerpt } from "../notes";
function excerpt(start: number, end: number, text: string): Excerpt { return { id: `${start}`, messageId: "m", start, end, text, createdAt: "2026-10-27" }; }
test("overlapping selections preserve original Unicode text and highlight the union", () => {
  const text = "🎨理清用户价值，再制作宣传图。";
  const parts = highlightSegments(text, [excerpt(2, 6, text.slice(2, 6)), excerpt(4, 8, text.slice(4, 8))]);
  expect(parts.map((p) => p.text).join("")).toBe(text);
  expect(parts.filter((p) => p.highlighted).map((p) => p.text).join("")).toBe(text.slice(2, 8));
});
test("removing a highlight restores plain text; changed source text is never marked at stale positions", () => {
  expect(highlightSegments("new reply", [excerpt(0, 3, "old")])).toEqual([{ start: 0, text: "new reply", highlighted: false }]);
  expect(highlightSegments("hello", [])).toEqual([{ start: 0, text: "hello", highlighted: false }]);
});
