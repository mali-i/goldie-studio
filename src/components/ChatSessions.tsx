import { ArrowLeftIcon, CheckIcon, CodeXmlIcon, MessageSquareIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
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

export function ChatSessions({ sessions, activeId, disabled, onSelect, onCreate, onBack }: {
  sessions: CodexSession[];
  activeId?: string;
  disabled: boolean;
  onSelect: (id: string) => Promise<void>;
  onCreate: () => Promise<void>;
  onBack: () => void;
}) {
  const [query, setQuery] = useState("");
  const search = query.trim().toLocaleLowerCase();
  const filtered = [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).filter((session) =>
    !search || [session.title, session.appRoot ?? "", ...session.messages.map((message) => message.text)]
      .some((text) => text.toLocaleLowerCase().includes(search)));

  return (
    <section id="chat-directory" aria-label="Chat history" className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0 px-4 pt-3">
        <Button size="xs" variant="ghost" className="-ml-2 text-muted-foreground" onClick={onBack}><ArrowLeftIcon />Back to chat</Button>
      </div>
          <div className="flex items-center justify-between px-4 pb-3 pt-4">
            <div className="flex items-center gap-2"><h3 className="text-sm font-semibold">Your conversations</h3><span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">{sessions.length}</span></div>
            <Button size="xs" variant="ghost" disabled={disabled || !activeId} onClick={() => void onCreate()}><PlusIcon />New chat</Button>
          </div>
          <div className="relative mx-3 mb-3">
            <SearchIcon aria-hidden="true" className="pointer-events-none absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
            <Input aria-label="Search conversations" placeholder="Search conversations…" value={query} onChange={(event) => setQuery(event.target.value)} className="h-9 bg-muted/40 pl-9 text-xs" />
          </div>
          <nav aria-label="Conversations" className="min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-border px-2 pb-2">
            {["Today", "Yesterday", "Earlier"].map((group) => {
              const items = filtered.filter((session) => dayGroup(session.updatedAt) === group);
              if (!items.length) return null;
              return <div key={group}>
                <p className="px-2 pb-1.5 pt-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{group}</p>
                {items.map((session) => {
                  const selected = session.id === activeId;
                  const preview = session.messages.at(-1)?.text;
                  const source = session.appRoot?.split(/[\\/]/).filter(Boolean).at(-1);
                  return <button key={session.id} type="button" aria-current={selected ? "true" : undefined} disabled={disabled} onClick={() => { if (selected) onBack(); else void onSelect(session.id); }}
                    className={`mb-1 flex w-full items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50 ${selected ? "border-border bg-muted/80" : "border-transparent hover:bg-muted/50"}`}>
                    <span className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md ${selected ? "bg-foreground text-background" : "bg-muted text-muted-foreground"}`}><MessageSquareIcon className="size-3" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2"><span className="truncate text-xs font-medium" title={session.title}>{session.title}</span>{selected && <CheckIcon aria-label="Current chat" className="ml-auto size-3 shrink-0" />}</span>
                      <span className="mt-1 block truncate text-[11px] leading-relaxed text-muted-foreground">{preview || "No messages yet. Make room for a new idea."}</span>
                      <span className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
                        {source ? <><CodeXmlIcon className="size-3 shrink-0" /><span className="max-w-32 truncate" title={session.appRoot ?? undefined}>{source}</span></> : <span>No source linked</span>}
                        <span className="ml-auto shrink-0">{dateLabel(session.updatedAt)}</span>
                      </span>
                    </span>
                  </button>;
                })}
              </div>;
            })}
            {!filtered.length && <div className="px-4 py-10 text-center"><SearchIcon className="mx-auto mb-3 size-5 text-muted-foreground" /><p className="text-xs font-medium">No conversations found</p><p className="mt-1 text-[11px] text-muted-foreground">Try another title, message, or app name.</p></div>}
          </nav>
          <div className="shrink-0 border-t border-border bg-muted/20 px-4 py-2.5 text-[10px] text-muted-foreground">Conversations are saved in this project.</div>
    </section>
  );
}
