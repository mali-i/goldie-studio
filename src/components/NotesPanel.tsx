import { useLayoutEffect, useRef, useState } from "react";
import { ChevronDownIcon, CopyIcon, FileTextIcon, GripHorizontalIcon, HighlighterIcon, PlusIcon, Trash2Icon, XIcon } from "lucide-react";
import type { Excerpt, NoteCard } from "../notes";
import type { NotesController } from "../lib/useWorkspaceNotes";
import { Button } from "./ui/button";

type Position = { x: number; y: number };

const MOVE_KEYS: Partial<Record<string, Position>> = {
  ArrowLeft: { x: -16, y: 0 },
  ArrowRight: { x: 16, y: 0 },
  ArrowUp: { x: 0, y: -16 },
  ArrowDown: { x: 0, y: 16 },
};

function clampPosition(position: Position, bounds: Position): Position {
  return {
    x: Math.max(0, Math.min(position.x, bounds.x)),
    y: Math.max(0, Math.min(position.y, bounds.y)),
  };
}

export function NotesPanel({ controller: c, position, onMove, onClose, onSource }: {
  controller: NotesController;
  position: Position | null;
  onMove: (position: Position) => void;
  onClose: () => void;
  onSource: (excerpt: Excerpt) => void;
}) {
  const panel = useRef<HTMLElement>(null);
  const drag = useRef<{ pointerId: number; offset: Position } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [bounds, setBounds] = useState<Position>({ x: 0, y: 0 });
  const location = clampPosition(position ?? { x: bounds.x, y: 0 }, bounds);

  useLayoutEffect(() => {
    const element = panel.current;
    const container = element?.parentElement;
    if (!element || !container) return;
    const measure = () => setBounds({
      x: container.clientWidth - element.offsetWidth,
      y: container.clientHeight - element.offsetHeight,
    });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const [tab, setTab] = useState<"document" | "excerpts">("document");
  const [feedback, setFeedback] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const updateCard = (id: string, change: Partial<NoteCard>) => c.update((n) => ({ ...n, cards: n.cards.map((card) => card.id === id ? { ...card, ...change } : card) }));
  const createCard = () => {
    const id = crypto.randomUUID();
    c.update((n) => ({ ...n, cards: [...n.cards, { id, title: "", document: "", history: [] }] }));
    setSelectedId(id);
    setDeletingId(null);
  };
  return <aside ref={panel} id="value-notes" aria-label="Workspace value notes"
    className="pointer-events-auto absolute flex h-[520px] max-h-full w-[360px] max-w-full flex-col overflow-hidden rounded-2xl border border-sidebar-border bg-sidebar shadow-xl"
    style={{ left: location.x, top: location.y }}
  >
    <header className="shrink-0 border-b border-border p-2">
      <div className="mb-1 flex items-center gap-1">
        <button
          type="button"
          title="Drag to move Value notes, or focus and use the arrow keys"
          aria-label="Move Value notes with the arrow keys"
          className={`flex min-w-0 flex-1 touch-none select-none items-center gap-2 rounded-md px-2 py-1 text-left text-xs font-medium text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
          onPointerDown={(event) => {
            if (event.button !== 0 || drag.current || !panel.current) return;
            const rect = panel.current.getBoundingClientRect();
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = { pointerId: event.pointerId, offset: { x: event.clientX - rect.left, y: event.clientY - rect.top } };
            setDragging(true);
          }}
          onPointerMove={(event) => {
            const current = drag.current;
            const container = panel.current?.parentElement;
            if (!current || current.pointerId !== event.pointerId || !container) return;
            const rect = container.getBoundingClientRect();
            onMove(clampPosition({
              x: event.clientX - rect.left - current.offset.x,
              y: event.clientY - rect.top - current.offset.y,
            }, bounds));
          }}
          onLostPointerCapture={(event) => {
            if (drag.current?.pointerId !== event.pointerId) return;
            drag.current = null;
            setDragging(false);
          }}
          onKeyDown={(event) => {
            const delta = MOVE_KEYS[event.key];
            if (!delta) return;
            event.preventDefault();
            onMove(clampPosition({ x: location.x + delta.x, y: location.y + delta.y }, bounds));
          }}
        >
          <GripHorizontalIcon aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">Value notes</span>
        </button>
        <Button size="icon-sm" variant="ghost" aria-label="Close value notes" onClick={onClose}><XIcon /></Button>
      </div>
      <div className="flex min-w-0 gap-1 overflow-x-auto" role="tablist" aria-label="Value notes">
        <Button role="tab" aria-selected={tab === "document"} variant={tab === "document" ? "secondary" : "ghost"} size="sm" onClick={() => setTab("document")}>Notes · {c.notes.cards.length}</Button>
        <Button role="tab" aria-selected={tab === "excerpts"} variant={tab === "excerpts" ? "secondary" : "ghost"} size="sm" onClick={() => setTab("excerpts")}><HighlighterIcon />Excerpts · {c.notes.excerpts.length}</Button>
      </div>
    </header>
    {c.error && <div role="alert" className="border-b border-border p-3 text-xs text-destructive">{c.error}<Button variant="outline" size="xs" className="mt-2 block" onClick={c.retry}>Retry</Button>{c.ready && <><p className="mt-2">Copy any text you want to keep before discarding your draft.</p><Button variant="outline" size="xs" className="mt-2" onClick={() => void c.discardDraft()}>Discard draft & load saved</Button></>}</div>}
    {tab === "document" ? <div className="flex min-h-0 flex-1 flex-col" role="tabpanel">
        <div className="shrink-0 px-4 pb-3 pt-4">
          <Button variant="outline" className="h-9 w-full gap-2 rounded-xl border-border/70 bg-transparent text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground motion-reduce:transition-none" disabled={!c.ready || c.notes.cards.length >= 200} onClick={createCard}><PlusIcon aria-hidden="true" />New note</Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 pb-4">
        {!c.notes.cards.length && <div className="rounded-xl border border-dashed border-border px-5 py-10 text-center"><FileTextIcon className="mx-auto mb-3 size-6 text-muted-foreground" /><p className="text-sm font-medium">Space for your thinking</p><p className="mt-2 text-xs leading-relaxed text-muted-foreground">Keep product ideas, user insights and plans in separate notes. Each card saves automatically.</p></div>}
        <div className="grid gap-3">{c.notes.cards.map((card) => {
          const expanded = selectedId === card.id;
          return <article key={card.id} className={`overflow-hidden rounded-xl border bg-background transition-shadow ${expanded ? "border-foreground/15 shadow-sm" : "border-border"}`}>
            {expanded ? <div className="flex items-start gap-3 px-4 pb-2 pt-4">
              <input aria-label="Note title" disabled={!c.ready} maxLength={200} placeholder="Untitled note" className="min-w-0 flex-1 rounded-sm bg-transparent py-0.5 text-base font-semibold leading-6 tracking-tight text-foreground placeholder:text-muted-foreground/60 outline-none focus-visible:ring-1 focus-visible:ring-border" value={card.title} onChange={(e) => updateCard(card.id, { title: e.target.value })} />
              <Button variant="ghost" size="icon-sm" className="text-muted-foreground/60 hover:text-foreground" aria-label="Collapse note" aria-expanded={true} aria-controls={`note-editor-${card.id}`} onClick={() => { setSelectedId(null); setDeletingId(null); }}><ChevronDownIcon aria-hidden="true" className="rotate-180 text-muted-foreground" /></Button>
            </div> : <button type="button" aria-expanded={false} aria-controls={`note-editor-${card.id}`} onClick={() => { setSelectedId(card.id); setDeletingId(null); }} className="w-full p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
              <div className="flex items-center gap-3"><h3 className="min-w-0 flex-1 break-words text-sm font-semibold">{card.title.trim() || "Untitled note"}</h3><ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" /></div>
              <p className="mt-2 line-clamp-4 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground">{card.document.trim() || "Start writing…"}</p>
              <p className="mt-3 text-[10px] text-muted-foreground">{card.document.length.toLocaleString()} characters</p>
            </button>}
            <div id={`note-editor-${card.id}`} hidden={!expanded}>
              {expanded && <div className="px-4 pb-3">
                <textarea aria-label="Note content" disabled={!c.ready} maxLength={500000} className="block h-56 min-h-40 max-h-96 w-full resize-y rounded-md border border-transparent bg-transparent px-0 py-2 text-sm leading-7 text-foreground/85 placeholder:text-muted-foreground/50 outline-none focus-visible:border-border disabled:opacity-50" placeholder="Write your ideas here…" value={card.document} onChange={(e) => updateCard(card.id, { document: e.target.value })} />
                <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2"><span className="text-[10px] tabular-nums text-muted-foreground/70">{card.document.length.toLocaleString()} characters</span><Button variant="ghost" size="icon-sm" className="text-muted-foreground/60 hover:bg-destructive/5 hover:text-destructive" aria-label="Delete note" disabled={!c.ready} onClick={() => setDeletingId(card.id)}><Trash2Icon /></Button></div>
                {deletingId === card.id && <div className="mt-2 rounded-lg border border-destructive/30 p-3 text-xs" role="alert">
                  <p>Delete this note? Its text and previous versions will be removed.</p>
                  <div className="mt-2 flex gap-2"><Button size="xs" variant="destructive" onClick={() => { c.update((n) => ({ ...n, cards: n.cards.filter((item) => item.id !== card.id) })); setSelectedId(null); setDeletingId(null); }}>Delete note</Button><Button size="xs" variant="ghost" onClick={() => setDeletingId(null)}>Keep note</Button></div>
                </div>}
                {card.history.length > 0 && <details className="mt-2 max-h-36 overflow-auto border-t border-border/60 pt-3 text-xs"><summary className="cursor-pointer text-muted-foreground">Previous versions · {card.history.length}</summary>{card.history.map((h, i) => <div key={i} className="mt-2 border-t border-border pt-2"><p className="whitespace-pre-wrap break-words">{h.document.slice(0, 100)}{h.document.length > 100 ? "…" : ""}</p><Button size="xs" variant="ghost" onClick={() => updateCard(card.id, { document: h.document })}>Restore · {new Date(h.savedAt).toLocaleString()}</Button></div>)}</details>}
              </div>}
            </div>
          </article>;
        })}</div>
        </div>
    </div> : <div role="tabpanel" className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
      {!c.notes.excerpts.length && <p className="py-6 text-sm leading-relaxed text-muted-foreground">Select text in a Codex reply and choose Highlight. Your excerpts will collect here.</p>}
      {c.notes.excerpts.map((e) => <article key={e.id} className="rounded-xl border border-border bg-background p-3"><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{e.text}</p><div className="mt-3 flex flex-wrap gap-1"><Button size="xs" variant="ghost" onClick={async () => { try { await navigator.clipboard.writeText(e.text); setFeedback("Copied excerpt"); } catch { setFeedback("Could not copy. Select the excerpt text to copy manually."); } }}><CopyIcon />Copy</Button><Button size="xs" variant="ghost" onClick={() => onSource(e)}>View source</Button><Button size="xs" variant="ghost" onClick={() => c.update((n) => ({ ...n, excerpts: n.excerpts.filter((item) => item.id !== e.id) }))}>Remove highlight</Button></div></article>)}
    </div>}
    <footer className="flex shrink-0 justify-between border-t border-border px-4 py-2 text-[11px] text-muted-foreground" role="status"><span>{c.status}</span><span>{feedback}</span></footer>
  </aside>;
}
