import { useState } from "react";
import { CopyIcon, HighlighterIcon, XIcon } from "lucide-react";
import type { Excerpt } from "../notes";
import type { NotesController } from "../lib/useWorkspaceNotes";
import { Button } from "./ui/button";

export function NotesPanel({ controller: c, onClose, onSource }: { controller: NotesController; onClose: () => void; onSource: (excerpt: Excerpt) => void }) {
  const [tab, setTab] = useState<"document" | "excerpts">("document");
  const [feedback, setFeedback] = useState("");
  return <aside aria-label="Workspace value notes" className="ml-3 flex h-full w-[360px] max-w-[42vw] shrink-0 flex-col overflow-hidden rounded-2xl border border-sidebar-border bg-sidebar">
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4"><div><h2 className="text-sm font-semibold">Value notes</h2><p className="text-[10px] text-muted-foreground">Shared across this workspace</p></div><Button size="icon-sm" variant="ghost" aria-label="Close value notes" onClick={onClose}><XIcon /></Button></header>
    <div className="flex gap-1 border-b border-border p-2" role="tablist" aria-label="Value notes">
      <Button role="tab" aria-selected={tab === "document"} variant={tab === "document" ? "secondary" : "ghost"} size="sm" onClick={() => setTab("document")}>Current understanding</Button>
      <Button role="tab" aria-selected={tab === "excerpts"} variant={tab === "excerpts" ? "secondary" : "ghost"} size="sm" onClick={() => setTab("excerpts")}><HighlighterIcon />Excerpts · {c.notes.excerpts.length}</Button>
    </div>
    {c.error && <div role="alert" className="border-b border-border p-3 text-xs text-destructive">{c.error}<Button variant="outline" size="xs" className="mt-2 block" onClick={c.retry}>Retry</Button>{c.ready && <><p className="mt-2">Copy any text you want to keep before discarding your draft.</p><Button variant="outline" size="xs" className="mt-2" onClick={() => void c.discardDraft()}>Discard draft & load saved</Button></>}</div>}
    {tab === "document" ? <div className="flex min-h-0 flex-1 flex-col p-4" role="tabpanel">
      <p className="mb-3 text-xs leading-relaxed text-muted-foreground">Your evolving view of the product. Write freely, or copy useful excerpts here and make them your own.</p>
      <textarea aria-label="Current understanding" disabled={!c.ready} maxLength={500000} className="min-h-40 flex-1 resize-none rounded-xl border border-border bg-background p-4 text-sm leading-relaxed outline-none focus:border-ring disabled:opacity-50" placeholder={"Who is this app for?\nWhat problem does it solve?\nWhat changes for the user?"} value={c.notes.document} onChange={(e) => c.update((n) => ({ ...n, document: e.target.value }))} />
      {c.notes.history.length > 0 && <details className="mt-3 max-h-36 overflow-auto text-xs"><summary className="cursor-pointer text-muted-foreground">Previous versions</summary>{c.notes.history.map((h, i) => <div key={i} className="mt-2 border-t border-border pt-2"><p className="whitespace-pre-wrap break-words">{h.document.slice(0, 100)}{h.document.length > 100 ? "…" : ""}</p><Button size="xs" variant="ghost" onClick={() => c.update((n) => ({ ...n, document: h.document }))}>Restore · {new Date(h.savedAt).toLocaleString()}</Button></div>)}</details>}
    </div> : <div role="tabpanel" className="min-h-0 flex-1 space-y-3 overflow-auto p-4">
      {!c.notes.excerpts.length && <p className="py-6 text-sm leading-relaxed text-muted-foreground">Select text in a Codex reply and choose Highlight. Your excerpts will collect here.</p>}
      {c.notes.excerpts.map((e) => <article key={e.id} className="rounded-xl border border-border bg-background p-3"><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{e.text}</p><div className="mt-3 flex flex-wrap gap-1"><Button size="xs" variant="ghost" onClick={async () => { try { await navigator.clipboard.writeText(e.text); setFeedback("Copied excerpt"); } catch { setFeedback("Could not copy. Select the excerpt text to copy manually."); } }}><CopyIcon />Copy</Button><Button size="xs" variant="ghost" onClick={() => onSource(e)}>View source</Button><Button size="xs" variant="ghost" onClick={() => c.update((n) => ({ ...n, excerpts: n.excerpts.filter((item) => item.id !== e.id) }))}>Remove highlight</Button></div></article>)}
    </div>}
    <footer className="flex shrink-0 justify-between border-t border-border px-4 py-2 text-[11px] text-muted-foreground" role="status"><span>{c.status}</span><span>{feedback}</span></footer>
  </aside>;
}
