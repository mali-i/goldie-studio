import { ArrowLeftIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useRef, useState } from "react";
import type { CodexSession } from "../codex";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

function dayGroup(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return "Earlier";
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat(undefined, dayGroup(value) === "Today"
    ? { hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric" }).format(date);
}

export function ChatSessions({ sessions, activeId, disabled, onSelect, onCreate, onBack, error }: {
  sessions: CodexSession[];
  activeId?: string;
  disabled: boolean;
  onSelect: (id: string) => Promise<void>;
  onCreate: () => Promise<void>;
  onBack: () => void;
  error?: string;
}) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchToggle = useRef<HTMLButtonElement>(null);
  const closeSearch = () => {
    setSearchOpen(false);
    setQuery("");
    searchToggle.current?.focus();
  };
  const search = query.trim().toLocaleLowerCase();
  // The active draft is available in the composer, but is not saved chat history.
  const history = sessions.filter((session) => session.messages.some((message) => message.role === "user" && message.text.trim()));
  const filtered = [...history].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).filter((session) =>
    !search || [session.title, session.appRoot ?? "", ...session.messages.map((message) => message.text)]
      .some((text) => text.toLocaleLowerCase().includes(search)));

  return (
    <section id="chat-directory" aria-label="Chat history" className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border px-3">
        <Button size="icon-xs" variant="ghost" aria-label="Back to chat" title="Back to chat" className="text-muted-foreground" onClick={onBack}><ArrowLeftIcon /></Button>
        <h3 className="flex-1 text-sm font-medium">Conversations <span className="ml-1 text-xs font-normal tabular-nums text-muted-foreground">{history.length}</span></h3>
        <Button ref={searchToggle} size="icon-xs" variant={searchOpen ? "secondary" : "ghost"} aria-label={searchOpen ? "Close search" : "Search chats"} title={searchOpen ? "Close search" : "Search chats"} aria-expanded={searchOpen} aria-controls="chat-search" onClick={() => { if (searchOpen) closeSearch(); else setSearchOpen(true); }}><SearchIcon /></Button>
        <Button size="xs" variant="ghost" disabled={disabled || !activeId} onClick={() => void onCreate()}><PlusIcon />New chat</Button>
      </header>
      {error && <p role="alert" className="shrink-0 px-4 pt-3 text-xs text-destructive">{error}</p>}
          {searchOpen && <div id="chat-search" className="relative mx-3 my-3">
            <SearchIcon aria-hidden="true" className="pointer-events-none absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
            <Input autoFocus onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeSearch(); } }} aria-label="Search conversations" placeholder="Search chats…" value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 bg-muted/40 pl-9 text-xs" />
          </div>}
          <nav aria-label="Conversations" className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2">
            {["Today", "Yesterday", "Earlier"].map((group) => {
              const items = filtered.filter((session) => dayGroup(session.updatedAt) === group);
              if (!items.length) return null;
              return <div key={group}>
                <p className="px-2 pb-1.5 pt-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{group}</p>
                {items.map((session) => {
                  const selected = session.id === activeId;
                  const preview = session.messages.at(-1)?.text;
                  return <button key={session.id} type="button" aria-current={selected ? "true" : undefined} disabled={disabled} onClick={() => { if (selected) onBack(); else void onSelect(session.id); }}
                    className={`mb-1 block w-full rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 ${selected ? "bg-muted" : "hover:bg-muted/50"}`}>
                    <span className="flex items-baseline gap-3">
                      <span className="min-w-0 flex-1 truncate text-xs font-medium" title={session.title}>{session.title}</span>
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{dateLabel(session.updatedAt)}</span>
                    </span>
                    {preview && <span className="mt-1 block truncate text-[11px] leading-relaxed text-muted-foreground">{preview.replace(/\s+/g, " ")}</span>}
                  </button>;
                })}
              </div>;
            })}
            {!filtered.length && <div className="px-4 py-10 text-center"><SearchIcon className="mx-auto mb-3 size-5 text-muted-foreground" /><p className="text-xs font-medium">{search ? "No conversations found" : "No conversations yet"}</p><p className="mt-1 text-[11px] text-muted-foreground">{search ? "Try another title, message, or app name." : "Send your first message to save a conversation here."}</p></div>}
          </nav>
    </section>
  );
}
