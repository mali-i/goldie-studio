import { expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { rehypeSourceHighlights, sourceAtoms } from "./markdownHighlights";
import type { Excerpt } from "../notes";

function render(text: string, excerpts: Excerpt[] = []) {
  return renderToStaticMarkup(createElement(Markdown, { remarkPlugins: [remarkGfm], rehypePlugins: [[rehypeSourceHighlights, { excerpts }]], skipHtml: true, children: text }));
}
function excerpt(text: string, start: number, end: number): Excerpt {
  return { id: "e", messageId: "m", start, end, text: text.slice(start, end), createdAt: "" };
}

test("renders headings, emphasis, nested lists, quotes, tables and fenced code", () => {
  const html = render("## Benefit\n\n**Strong** and *quiet*.\n\n- One\n  - Two\n\n> Quote\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n```ts\nconst x = 1;\n```");
  for (const tag of ["h2", "strong", "em", "ul", "blockquote", "table", "pre"]) expect(html).toContain(`<${tag}`);
  expect(html).toContain('class="language-ts"');
  expect(html).not.toContain("**");
});

test("source offsets survive formatting, Unicode, escaped punctuation and entities", () => {
  const text = "🎨 **重点** and \\*literal\\* &amp; &#x1F600;";
  const start = text.indexOf("重点");
  const html = render(text, [excerpt(text, start, start + 2)]);
  expect(html).toContain(`<strong><mark data-source-start="${start}" data-source-end="${start + 2}">重点</mark></strong>`);
  expect(html.replace(/<[^>]+>/g, "")).toContain('*literal');
  const atoms = sourceAtoms("\\* &amp; &#x1F600;", 10);
  expect(atoms.map((atom) => atom.text).join("")).toBe("* & 😀");
  expect(atoms[0]).toEqual({ text: "*", start: 10, end: 12 });
  expect(atoms[2]).toEqual({ text: "&", start: 13, end: 18 });
});

test("cross-block excerpts highlight visible text and ignore stale selections", () => {
  const text = "First **bold**\n\n- Second\n- Third";
  const html = render(text, [excerpt(text, 0, text.indexOf("Third"))]);
  expect(html.match(/<mark /g)?.length).toBe(3);
  expect(html).toContain("Third</span>");
  expect(render(text, [{ ...excerpt(text, 0, 5), text: "stale" }])).not.toContain("<mark");
});

test("maps code text to source contents while keeping literal markup and entities", () => {
  for (const text of ["`a &amp; **b**`", "```js\na &amp; **b**\n```", "    a &amp; **b**"]) {
    const start = text.indexOf("a &amp;");
    expect(render(text, [excerpt(text, start, start + 7)])).toContain(`<mark data-source-start="${start}" data-source-end="${start + 7}">a &amp;amp;</mark>`);
  }
});

test("does not execute raw HTML or javascript links", () => {
  const html = render('<script>alert(1)</script>\n\n[Bad](javascript:alert%281%29)\n\nSafe');
  expect(html).not.toContain("<script");
  expect(html).not.toContain("javascript:");
  expect(html).toContain("Safe");
});
