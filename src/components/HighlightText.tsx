import { useEffect, useRef, useState } from "react";
import { HighlighterIcon } from "lucide-react";
import { highlightSegments, type Excerpt } from "../notes";
import { Button } from "./ui/button";

export function HighlightText({ text, excerpts, onHighlight, disabled }: { text: string; excerpts: Excerpt[]; onHighlight: (start: number, end: number) => void; disabled: boolean }) {
  const root = useRef<HTMLParagraphElement>(null);
  const [selection, setSelection] = useState<{ start: number; end: number; top: number; left: number } | null>(null);
  const capture = () => {
    const selected = window.getSelection();
    const element = root.current;
    if (!element || !selected || selected.isCollapsed || !selected.rangeCount) { setSelection(null); return; }
    const range = selected.getRangeAt(0);
    if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) { setSelection(null); return; }
    const prefix = range.cloneRange();
    prefix.selectNodeContents(element); prefix.setEnd(range.startContainer, range.startOffset);
    const start = prefix.toString().length;
    const end = start + range.toString().length;
    const rect = range.getBoundingClientRect();
    setSelection(text.slice(start, end).trim() ? { start, end, top: Math.max(8, rect.top - 34), left: Math.max(8, Math.min(window.innerWidth - 130, rect.left)) } : null);
  };
  useEffect(() => {
    document.addEventListener("selectionchange", capture);
    return () => document.removeEventListener("selectionchange", capture);
  }, [text]);
  return <div onMouseUp={capture} onKeyUp={capture} onTouchEnd={capture}>
    <p ref={root} className="whitespace-pre-wrap break-words leading-relaxed">{highlightSegments(text, excerpts).map((part) => part.highlighted ? <mark key={part.start} className="rounded-sm bg-amber-200/80 text-inherit dark:bg-amber-700/60">{part.text}</mark> : <span key={part.start}>{part.text}</span>)}</p>
    {selection && <Button type="button" size="xs" variant="outline" className="fixed z-50 shadow-md" style={{ top: selection.top, left: selection.left }} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={() => { onHighlight(selection.start, selection.end); setSelection(null); window.getSelection()?.removeAllRanges(); }}><HighlighterIcon />Highlight</Button>}
  </div>;
}
