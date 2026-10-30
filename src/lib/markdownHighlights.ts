import type { Element, Root, Text, RootContent } from "hast";
import { decodeString } from "micromark-util-decode-string";
import type { Excerpt } from "../notes";

type Atom = { text: string; start: number; end: number };

/** Map decoded Markdown text back to original UTF-16 offsets used by saved excerpts. */
export function sourceAtoms(raw: string, start: number, literal = false): Atom[] {
  const atoms: Atom[] = [];
  for (let i = 0; i < raw.length;) {
    const from = i;
    let value = raw[i]!;
    if (!literal && value === "\\" && /^[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]$/.test(raw[i + 1] ?? "")) {
      value = raw[i + 1]!; i += 2;
    } else if (!literal && value === "&") {
      const entity = /^&(#(?:x[\da-f]+|\d+)|[a-z][\da-z]+);/i.exec(raw.slice(i));
      const decoded = entity && decodeString(entity[0]);
      if (entity && decoded) { value = decoded; i += entity[0].length; }
      else i++;
    } else if (value === "\r") {
      value = "\n"; i += raw[i + 1] === "\n" ? 2 : 1;
    } else i++;
    atoms.push({ text: value, start: start + from, end: start + i });
  }
  return atoms;
}

export function rehypeSourceHighlights({ excerpts }: { excerpts: Excerpt[] }) {
  return (tree: Root, file: { value: unknown }) => {
    const source = String(file.value);
    const ranges = excerpts.filter((e) => source.slice(e.start, e.end) === e.text);
    const renderText = (node: Text, parent: Element): RootContent[] => {
      const code = parent.tagName === "code";
      const position = node.position ?? (code ? parent.position : undefined);
      let start = position?.start.offset;
      const end = position?.end.offset;
      if (start === undefined || end === undefined) return [node];
      let raw = source.slice(start, end);
      let inlineCode = false;
      if (code) {
        const fence = /^(?:[ \t]*)(`{3,}|~{3,})[^\n]*\n/.exec(raw);
        const ticks = /^`+/.exec(raw);
        if (fence) { start += fence[0].length; raw = raw.slice(fence[0].length).replace(/\n[ \t]*(`{3,}|~{3,})[ \t]*$/, "\n"); }
        else if (ticks) { inlineCode = true; start += ticks[0].length; raw = raw.slice(ticks[0].length, -ticks[0].length); }
      }
      const atoms = sourceAtoms(raw, start, code).map((atom) => inlineCode && atom.text === "\n" ? { ...atom, text: " " } : atom);
      const parts: Array<{ text: string; start: number; end: number; highlighted: boolean }> = [];
      let rendered = 0;
      for (const atom of atoms) {
        if (rendered >= node.value.length) break;
        // Markdown can remove indentation in code blocks and escaped hard breaks.
        if (!node.value.startsWith(atom.text, rendered)) continue;
        const highlighted = ranges.some((range) => range.start < atom.end && range.end > atom.start);
        const previous = parts.at(-1);
        if (previous && previous.highlighted === highlighted && previous.end === atom.start
          && previous.end - previous.start === previous.text.length && atom.end - atom.start === atom.text.length) {
          previous.text += atom.text; previous.end = atom.end;
        } else parts.push({ ...atom, highlighted });
        rendered += atom.text.length;
      }
      // Never change rendered content if an unsupported source transformation cannot be mapped.
      if (rendered < node.value.trimEnd().length) return [node];
      const result: RootContent[] = parts.map((part) => ({ type: "element", tagName: part.highlighted ? "mark" : "span",
        properties: { dataSourceStart: part.start, dataSourceEnd: part.end }, children: [{ type: "text", value: part.text }] }));
      if (rendered < node.value.length) result.push({ type: "text", value: node.value.slice(rendered) });
      return result;
    };
    const walk = (parent: Root | Element) => {
      parent.children = parent.children.flatMap((child): RootContent[] => {
        if (child.type === "text" && parent.type === "element") return renderText(child, parent);
        if (child.type === "element") walk(child);
        return [child];
      }) as typeof parent.children;
    };
    walk(tree);
  };
}

/** Resolve DOM selection endpoints, including selections across formatted blocks. */
export function selectionSourceOffset(root: HTMLElement, node: Node, offset: number, end: boolean): number | null {
  const element = node.nodeType === Node.ELEMENT_NODE ? node as HTMLElement : node.parentElement;
  let leaf: HTMLElement | null = element?.closest<HTMLElement>("[data-source-start]") ?? null;
  if (!leaf && node.nodeType === Node.ELEMENT_NODE) {
    const child = end ? node.childNodes[offset - 1] : node.childNodes[offset];
    if (child instanceof HTMLElement) {
      const leaves = child.querySelectorAll<HTMLElement>("[data-source-start]");
      leaf = child.matches("[data-source-start]") ? child : (end ? leaves.item(leaves.length - 1) : leaves.item(0));
    } else if (child) leaf = child.parentElement?.closest<HTMLElement>("[data-source-start]") ?? null;
    if (leaf && root.contains(leaf)) return Number(end ? leaf.dataset.sourceEnd : leaf.dataset.sourceStart);
  }
  if (!leaf || !root.contains(leaf)) return null;
  const prefix = document.createRange();
  prefix.selectNodeContents(leaf);
  prefix.setEnd(node, offset);
  const length = prefix.toString().length;
  const from = Number(leaf.dataset.sourceStart), to = Number(leaf.dataset.sourceEnd);
  return to - from === leaf.textContent?.length ? from + length : length === 0 ? from : to;
}
