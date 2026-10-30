import { ArrowUpIcon, CodeXmlIcon, Loader2Icon, MessageSquareIcon, PanelRightCloseIcon, RefreshCwIcon, SquarePenIcon, SquareIcon, Undo2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { codexJson, CodexRequestError, streamChat, type ChatInput, type ChatMessage, type CodexProject, type CodexStatus, type CopyProposal } from "../codex";
import { HighlightText } from "./HighlightText";
import type { NotesController } from "../lib/useWorkspaceNotes";
import type { Excerpt } from "../notes";
import type { ChatFrame } from "../lib/chatFrames";
import { ChatSessions } from "./ChatSessions";
import { FrameComposer } from "./FrameComposer";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";

export function CodexPanel({ projectId, frames, context, onScene, onApply, onUndo, canUndo, onClose, notes, source }: {
  notes: NotesController;
  source: Excerpt | null;
  projectId: string;
  frames: ChatFrame[];
  context: Omit<ChatInput, "message">;
  onScene: (id: string) => void;
  onApply: (sceneId: string, locale: string, proposal: CopyProposal) => void;
  onUndo: () => void;
  canUndo: boolean;
  onClose: () => void;
}) {
  const base = `/api/projects/${encodeURIComponent(projectId)}/codex`;
  const [project, setProject] = useState<CodexProject>({ appRoot: null, messages: [] });
  const [status, setStatus] = useState<CodexStatus | null>(null);
  const [path, setPath] = useState("");
  const [settings, setSettings] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [selectedFrameIds, setSelectedFrameIds] = useState<string[] | null>(null);
  const selectedFrames = selectedFrameIds === null
    ? frames.filter((frame) => frame.sceneId === context.sceneId).slice(0, 1)
    : selectedFrameIds.flatMap((id) => frames.filter((frame) => frame.id === id));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const [activity, setActivity] = useState("");
  const [loginUrl, setLoginUrl] = useState("");
  const [applied, setApplied] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const viewedSource = useRef<Excerpt | null>(null);
  const [sourceError, setSourceError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const mounted = useRef(true);

  const reportError = (error: unknown) => {
    if (!mounted.current) return;
    setError(messageOf(error));
    if (error instanceof CodexRequestError && error.kind !== "http") {
      setServiceUnavailable(true);
      setStatus(null);
    }
  };

  const refresh = async () => {
    setConnecting(true);
    try {
      const [state, connection] = await Promise.all([
        codexJson<CodexProject & { busy: boolean }>(base), codexJson<CodexStatus>(`${base}/status`),
      ]);
      if (!mounted.current) return;
      setProject(state); setPath(state.appRoot ?? ""); setStatus(connection);
      setServiceUnavailable(false);
      setBusy(state.busy);
      if (connection.authenticated) setLoginUrl("");
      setError(connection.error ?? "");
    } catch (error) { reportError(error); }
    finally { if (mounted.current) setConnecting(false); }
  };

  useEffect(() => {
    mounted.current = true;
    void refresh();
    return () => { mounted.current = false; abort.current?.abort(); };
  }, [base]);

  useEffect(() => {
    const recover = () => { if (serviceUnavailable && !busy && !connecting) void refresh(); };
    window.addEventListener("online", recover);
    window.addEventListener("focus", recover);
    return () => {
      window.removeEventListener("online", recover);
      window.removeEventListener("focus", recover);
    };
  }, [base, busy, connecting, serviceUnavailable]);

  // Recover an active turn after a reload, and update login state after OAuth.
  useEffect(() => {
    if (!loginUrl && !(busy && !abort.current)) return;
    const timer = setInterval(() => { void refresh(); }, 3000);
    return () => clearInterval(timer);
  }, [loginUrl, busy]);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [project.messages, activity]);

  useEffect(() => {
    if (!source || connecting || viewedSource.current === source) return;
    const session = project.sessions?.find((item) => item.messages.some((message) => message.id === source.messageId));
    if (session && session.id !== project.activeSessionId) {
      if (!busy) void changeSession(session.id);
      return;
    }
    if (directoryOpen) { setDirectoryOpen(false); return; }
    viewedSource.current = source;
    const element = document.getElementById(`chat-message-${source.messageId}`);
    if (!element) { setSourceError("The source conversation is no longer available. Your excerpt is still saved."); return; }
    setSourceError("");
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.focus({ preventScroll: true });
  }, [source, connecting, busy, directoryOpen, project.messages]);

  const link = async (appRoot: string | null) => {
    setError("");
    setConnecting(true);
    try {
      const state = await codexJson<CodexProject>(base, { appRoot }, "PUT");
      setProject(state); setPath(state.appRoot ?? ""); setSettings(false); setApplied(null);
    } catch (error) { reportError(error); }
    finally { setConnecting(false); }
  };

  const changeSession = async (sessionId?: string) => {
    if (busy || connecting) return;
    setConnecting(true); setError("");
    try {
      const state = await codexJson<CodexProject>(`${base}/sessions`, sessionId ? { sessionId } : {});
      if (!mounted.current) return;
      setProject(state); setPath(state.appRoot ?? "");
      if (state.activeSessionId !== project.activeSessionId) setDraft("");
      setApplied(null); setSourceError(""); setDirectoryOpen(false);
    } catch (error) { viewedSource.current = source; reportError(error); }
    finally { if (mounted.current) setConnecting(false); }
  };

  const send = async () => {
    if (!draft.trim() || busy || connecting || !selectedFrames.length) return;
    const primary = selectedFrames[0]!;
    const input: ChatInput = { ...context, sessionId: project.activeSessionId, sceneId: primary.sceneId, headline: primary.headline, subhead: primary.subhead, frames: selectedFrames, message: draft.trim() };
    const optimistic: ChatMessage = { ...input, id: crypto.randomUUID(), role: "user", text: input.message };
    setProject((prev) => ({ ...prev, messages: [...prev.messages, optimistic] }));
    setDraft(""); setBusy(true); setError(""); setActivity("Connecting to Codex…");
    const controller = new AbortController();
    abort.current = controller;
    try {
      await streamChat(`${base}/turn`, input, controller.signal, (event) => {
        if (!mounted.current) return;
        if (event.type === "activity") setActivity(event.text);
        if (event.type === "error") setError(event.text);
        if (event.type === "reply") setProject((prev) => ({ ...prev, messages: [...prev.messages, event.message] }));
      });
    } catch (error) { if (!controller.signal.aborted) reportError(error); }
    finally {
      abort.current = null;
      if (mounted.current) {
        // Keep chat switching disabled until the authoritative history has been recovered.
        try { const state = await codexJson<CodexProject>(base); if (mounted.current) setProject(state); }
        catch (error) { reportError(error); }
        if (mounted.current) { setBusy(false); setActivity(""); }
      }
    }
  };

  return (
    <aside id="codex-panel" aria-label="Codex assistant" className="fixed inset-y-3 right-3 z-30 flex w-[380px] max-w-[calc(100vw-1.5rem)] shrink-0 flex-col overflow-hidden rounded-2xl border border-sidebar-border bg-sidebar text-sidebar-foreground md:static md:z-auto md:ml-3 md:h-full md:min-w-[320px] md:max-w-[42vw]">
      {!directoryOpen && <header className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <Button size="icon" variant={directoryOpen ? "secondary" : "outline"} className="shrink-0" aria-label={directoryOpen ? "Return to chat" : "Browse chat history"} aria-pressed={directoryOpen} aria-controls="chat-directory" title={directoryOpen ? "Return to chat" : "Conversations"} onClick={() => { setDirectoryOpen((open) => !open); setSettings(false); }}><MessageSquareIcon className="size-4" /></Button>
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="shrink-0 text-sm font-semibold">Codex</h2>
            <span className="min-w-0 truncate text-[11px] text-muted-foreground" role="status" title={status?.account}>
              <span className={`mr-2 inline-block size-1.5 rounded-full ${status?.authenticated ? "bg-emerald-500" : "bg-amber-500"}`} />
              {connecting ? "Connecting…" : serviceUnavailable ? "Studio service unavailable" : status?.authenticated ? "Connected" : status?.available ? "Sign in to Codex" : "Codex not connected"}
            </span>
            <Button size="icon-xs" variant="ghost" disabled={busy || connecting} aria-label={serviceUnavailable ? "Retry Studio connection" : "Reconnect Codex"} title={serviceUnavailable ? "Retry Studio connection" : "Reconnect Codex"} onClick={async () => {
              setConnecting(true); setError("");
              try {
                if (!serviceUnavailable) setStatus(await codexJson<CodexStatus>(`${base}/reconnect`, {}));
                await refresh();
              }
              catch (error) { reportError(error); }
              finally { setConnecting(false); }
            }}><RefreshCwIcon /></Button>
          </div>
        </div>
        <div className="ml-2 flex shrink-0 items-center gap-1">
          <Button size="icon-sm" variant="ghost" aria-label="New chat" title="New chat" disabled={busy || connecting || !project.activeSessionId} onClick={() => { setSettings(false); void changeSession(); }}><SquarePenIcon /></Button>
          <Popover open={settings} onOpenChange={(open) => { if (open) setPath(project.appRoot ?? ""); setSettings(open); }}>
            <PopoverTrigger asChild>
              <Button size="icon-sm" variant="ghost" className="relative" aria-label={project.appRoot ? "Manage linked app source" : "Link app source (optional)"} title={project.appRoot ? `App source: ${project.appRoot}` : "Link app source (optional)"}>
                <CodeXmlIcon />
                {project.appRoot && <span aria-hidden="true" className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-emerald-500 ring-2 ring-sidebar" />}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" sideOffset={12} aria-label="App source settings" className="w-80 max-w-[calc(100vw-2rem)] max-h-[var(--radix-popover-content-available-height)] space-y-4 overflow-y-auto p-4">
              <div className="space-y-1">
                <h3 className="flex items-center gap-2 text-sm font-semibold"><CodeXmlIcon className="size-4 text-muted-foreground" />App source<span className="ml-auto text-[10px] font-normal text-muted-foreground">{project.appRoot ? "Linked · Read-only" : "Optional"}</span></h3>
                {project.appRoot && <p className="truncate font-mono text-[11px] text-muted-foreground" title={project.appRoot}>{project.appRoot}</p>}
              </div>
          <form id="app-project-settings" className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (path.trim() && !busy && !connecting) void link(path.trim()); }}>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium" htmlFor="app-directory">App source directory</label>
              <Input id="app-directory" className="h-9 bg-background font-mono text-xs" value={path} onChange={(event) => setPath(event.target.value)} placeholder="/Users/you/Projects/my-app" disabled={busy || connecting} aria-describedby="app-directory-help" autoComplete="off" spellCheck={false} />
              <p id="app-directory-help" className="text-[11px] leading-relaxed text-muted-foreground">Optional: link your app’s source folder for more accurate screenshot copy. Source access is read-only. Relevant code and screenshots are sent to your model provider.</p>
            </div>
            {(project.appRoot || project.lastAppRoot) && <p className="text-[11px] text-muted-foreground">Unlinking keeps this conversation and stops further source reading. Previously read code remains in context. Linking a different app starts a new chat.</p>}
            <div className="flex items-center justify-between gap-2">
              {project.appRoot ? <Button type="button" size="xs" variant="ghost" className="text-muted-foreground" disabled={busy || connecting} onClick={() => void link(null)}>Unlink project</Button> : <span className="text-[11px] text-muted-foreground">Read-only access</span>}
              <div className="flex items-center gap-1">
                <Button type="button" size="sm" variant="ghost" disabled={connecting} onClick={() => { setPath(project.appRoot ?? ""); setSettings(false); }}>Cancel</Button>
                <Button size="sm" disabled={busy || connecting || !path.trim() || path.trim() === project.appRoot}>{connecting && <Loader2Icon className="animate-spin" />}{project.appRoot ? "Save project" : "Link project"}</Button>
              </div>
            </div>
          </form>
            </PopoverContent>
          </Popover>
          <Button size="icon-sm" variant="ghost" aria-label="Close Codex panel" title="Collapse chat" onClick={onClose}><PanelRightCloseIcon /></Button>
        </div>
      </header>}
      {directoryOpen && <>
        <ChatSessions error={error} sessions={project.sessions ?? []} activeId={project.activeSessionId}
          disabled={busy || connecting} onSelect={changeSession} onCreate={() => changeSession()} onBack={() => setDirectoryOpen(false)} />
        {busy && <p role="status" className="shrink-0 border-t border-border px-4 py-3 text-xs text-muted-foreground">A reply is running. Return to chat to stop it before switching conversations.</p>}
      </>}
      <div className={`${directoryOpen ? "hidden" : "flex"} min-h-0 flex-1 flex-col`}>
      {(status?.available && !status.authenticated || loginUrl) && <div className="shrink-0 space-y-3 border-b border-sidebar-border p-4">
        {status?.available && !status.authenticated && <Button size="sm" variant="outline" disabled={connecting} onClick={async () => {
          setConnecting(true); setError("");
          try { const result = await codexJson<{ authUrl: string }>(`${base}/login`, {}); setLoginUrl(result.authUrl); }
          catch (error) { reportError(error); }
          finally { setConnecting(false); }
        }}>Sign in with ChatGPT</Button>}
        {loginUrl && <a className="block text-xs underline" href={loginUrl} target="_blank" rel="noreferrer">Continue sign-in in your browser ↗</a>}
      </div>}
      <div className={`min-h-0 flex-1 overflow-y-auto p-4 ${project.messages.length ? "space-y-4" : "flex flex-col"}`} role="log" aria-label="Project conversation">
        {!project.messages.length && <div className="flex flex-1 flex-col items-center justify-center py-6 text-center text-sm leading-relaxed text-muted-foreground"><p>What should this Frame say?</p><p className="mt-2 max-w-64 text-xs">Discuss the benefit, check the implementation, or ask for a few directions. Codex can read your linked app to ground its suggestions.</p></div>}
        {sourceError && <p role="status" className="text-xs text-muted-foreground">{sourceError}</p>}
        {project.messages.map((message) => <article id={`chat-message-${message.id}`} tabIndex={-1} key={message.id} className={`rounded-xl p-3 text-sm focus:outline-2 focus:outline-amber-400 ${message.role === "user" ? "ml-6 bg-muted" : "border border-border bg-background"}`}>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{message.role === "user" ? "You" : "Codex"} · {message.frames?.map((frame) => frame.label).join(", ") || message.sceneId} · {message.locale}</p>
          {message.role === "assistant" ? <HighlightText text={message.text} disabled={!notes.ready} excerpts={notes.notes.excerpts.filter((e) => e.messageId === message.id)} onHighlight={(start, end) => {
            notes.update((n) => n.excerpts.some((e) => e.messageId === message.id && e.start === start && e.end === end) ? n : ({ ...n, excerpts: [...n.excerpts, { id: crypto.randomUUID(), messageId: message.id, start, end, text: message.text.slice(start, end), createdAt: new Date().toISOString() }] }));
          }} /> : <p className="whitespace-pre-wrap break-words leading-relaxed">{message.text}</p>}
          {message.proposal && <div className="mt-3 space-y-2 border-t border-border pt-3">
            <p className="font-semibold">{message.proposal.headline}</p><p className="text-xs text-muted-foreground">{message.proposal.subhead}</p>
            <Button size="sm" variant="outline" disabled={message.sceneId !== context.sceneId || message.locale !== context.locale} onClick={() => {
              onApply(message.sceneId, message.locale, message.proposal!); setApplied(message.id);
            }}>{applied === message.id ? "Apply again" : "Apply copy"}</Button>
            {(message.sceneId !== context.sceneId || message.locale !== context.locale) && <p className="text-[11px] text-muted-foreground">Select {message.sceneId} in {message.locale} to apply.</p>}
          </div>}
        </article>)}
        {busy && <div className="flex items-start gap-2 text-xs text-muted-foreground" role="status"><Loader2Icon className="size-3.5 shrink-0 animate-spin" /><span className="break-all">{activity || "Codex is working…"}</span></div>}
        <div ref={bottom} />
      </div>
      <form className="shrink-0 space-y-2 border-t border-sidebar-border p-3" onSubmit={(event) => { event.preventDefault(); void send(); }}>
        {error && <p role="alert" className="max-h-24 overflow-auto text-xs text-destructive">{error}</p>}
        <FrameComposer frames={frames} selected={selectedFrames} locale={context.locale} value={draft} disabled={!status?.authenticated || busy || connecting}
          onChange={setDraft} onSelect={(frame) => { setSelectedFrameIds([...new Set([...selectedFrames.map((item) => item.id), frame.id])]); onScene(frame.sceneId); }}
          onRemove={(id) => setSelectedFrameIds(selectedFrames.filter((frame) => frame.id !== id).map((frame) => frame.id))} onSend={() => void send()} />
        {!selectedFrames.length && <p className="text-xs text-muted-foreground">Type @ to choose a Frame before sending.</p>}
        <div className="flex items-center justify-between">
          <Button type="button" size="sm" variant="ghost" disabled={!canUndo} onClick={() => { onUndo(); setApplied(null); }}><Undo2Icon />Undo last edit</Button>
          {busy ? <Button type="button" size="sm" variant="outline" onClick={async () => {
            try { await codexJson(`${base}/stop`, {}); setActivity("Stopping…"); }
            catch (error) { reportError(error); }
          }}><SquareIcon />Stop</Button> : <Button size="sm" disabled={!draft.trim() || !status?.authenticated || !selectedFrames.length || connecting}><ArrowUpIcon />Send</Button>}
        </div>
      </form>
      </div>
    </aside>
  );
}

function messageOf(error: unknown) { return error instanceof Error ? error.message : String(error); }
