import { useEffect, useMemo, useRef, useState } from "react";
import { HighlighterIcon } from "lucide-react";
import type { Excerpt } from "../notes";
import Markdown, { type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import { rehypeSourceHighlights, selectionSourceOffset } from "../lib/markdownHighlights";
import { Button } from "./ui/button";

export function HighlightText({ text, excerpts, onHighlight, disabled }: { text: string; excerpts: Excerpt[]; onHighlight: (start: number, end: number) => void; disabled: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<{ start: number; end: number; top: number; left: number } | null>(null);
  const plugins = useMemo<Options["rehypePlugins"]>(() => [[rehypeSourceHighlights, { excerpts }]], [excerpts]);
  const capture = () => {
    const selected = window.getSelection();
    const element = root.current;
    if (!element || !selected || selected.isCollapsed || !selected.rangeCount) { setSelection(null); return; }
    const range = selected.getRangeAt(0);
    if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) { setSelection(null); return; }
    const start = selectionSourceOffset(element, range.startContainer, range.startOffset, false);
    const end = selectionSourceOffset(element, range.endContainer, range.endOffset, true);
    if (start === null || end === null || end <= start) { setSelection(null); return; }
    const rect = range.getBoundingClientRect();
    setSelection(text.slice(start, end).trim() ? { start, end, top: Math.max(8, rect.top - 34), left: Math.max(8, Math.min(window.innerWidth - 130, rect.left)) } : null);
  };
  useEffect(() => {
    document.addEventListener("selectionchange", capture);
    return () => document.removeEventListener("selectionchange", capture);
  }, [text]);
  return <div onMouseUp={capture} onKeyUp={capture} onTouchEnd={capture}>
    <div ref={root} className="agent-markdown">
      <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={plugins} skipHtml components={{
        a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
        img: ({ alt }) => <span className="text-muted-foreground">{alt ? `[Image: ${alt}]` : "[Image]"}</span>,
        table: ({ node: _node, ...props }) => <div className="agent-table-scroll"><table {...props} /></div>,
      }}>{text}</Markdown>
    </div>
    {selection && <Button type="button" size="xs" variant="outline" className="fixed z-50 shadow-md" style={{ top: selection.top, left: selection.left }} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => { onHighlight(selection.start, selection.end); setSelection(null); window.getSelection()?.removeAllRanges(); }}><HighlighterIcon />Highlight</Button>}
  </div>;
}
