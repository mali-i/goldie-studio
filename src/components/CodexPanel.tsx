import { ArrowUpIcon, ChevronDownIcon, FolderCodeIcon, Loader2Icon, MessageSquareIcon, PanelRightCloseIcon, RefreshCwIcon, SquareIcon, Undo2Icon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { codexJson, CodexRequestError, streamChat, type ChatInput, type ChatMessage, type CodexProject, type CodexStatus, type CopyProposal } from "../codex";
import { HighlightText } from "./HighlightText";
import type { NotesController } from "../lib/useWorkspaceNotes";
import type { Excerpt } from "../notes";
import type { DesignScene } from "../manifest";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export function CodexPanel({ projectId, scenes, context, imageUrl, onScene, onApply, onUndo, canUndo, onClose, notes, source }: {
  notes: NotesController;
  source: Excerpt | null;
  projectId: string;
  scenes: DesignScene[];
  context: Omit<ChatInput, "message">;
  imageUrl?: string;
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
  const [draft, setDraft] = useState("");
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
      if (!state.appRoot) setSettings(true);
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
    viewedSource.current = source;
    const element = document.getElementById(`chat-message-${source.messageId}`);
    if (!element) { setSourceError("The source conversation is no longer available. Your excerpt is still saved."); return; }
    setSourceError("");
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.focus({ preventScroll: true });
  }, [source, connecting, project.messages]);

  const link = async (appRoot: string | null) => {
    setError("");
    setConnecting(true);
    try {
      const state = await codexJson<CodexProject>(base, { appRoot }, "PUT");
      setProject(state); setPath(state.appRoot ?? ""); setSettings(!state.appRoot); setApplied(null);
    } catch (error) { reportError(error); }
    finally { setConnecting(false); }
  };

  const send = async () => {
    if (!draft.trim() || busy || !context.sceneId) return;
    const input = { ...context, message: draft.trim() };
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
        setBusy(false); setActivity("");
        // The server's persisted history is authoritative, including failures and cancellations.
        codexJson<CodexProject>(base).then(setProject).catch(() => {});
      }
    }
  };

  return (
    <aside id="codex-panel" aria-label="Codex assistant" className="ml-3 flex h-full w-[380px] max-w-[42vw] shrink-0 flex-col overflow-hidden rounded-2xl border border-sidebar-border bg-sidebar text-sidebar-foreground">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background"><MessageSquareIcon className="size-4 text-muted-foreground" /></span>
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
          <Button size="icon-sm" variant="ghost" aria-label="Close Codex panel" title="Collapse chat" onClick={onClose}><PanelRightCloseIcon /></Button>
        </div>
      </header>
      <div className="shrink-0 space-y-3 border-b border-sidebar-border p-4">
        {status?.available && !status.authenticated && <Button size="sm" variant="outline" disabled={connecting} onClick={async () => {
          setConnecting(true); setError("");
          try { const result = await codexJson<{ authUrl: string }>(`${base}/login`, {}); setLoginUrl(result.authUrl); }
          catch (error) { reportError(error); }
          finally { setConnecting(false); }
        }}>Sign in with ChatGPT</Button>}
        {loginUrl && <a className="block text-xs underline" href={loginUrl} target="_blank" rel="noreferrer">Continue sign-in in your browser ↗</a>}
        <section className="overflow-hidden rounded-xl border border-border bg-background/60" aria-label="App project">
          <button type="button" className="flex w-full items-center gap-2.5 p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" onClick={() => setSettings(!settings)} aria-expanded={settings} aria-controls="app-project-settings">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted"><FolderCodeIcon className="size-4 text-muted-foreground" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">{project.appRoot ? project.appRoot.split(/[\\/]/).filter(Boolean).pop() || project.appRoot : "Link app project"}</span>
              <span className="mt-0.5 block truncate text-[11px] text-muted-foreground" title={project.appRoot ?? undefined}>{project.appRoot || "Add source code context for better copy"}</span>
            </span>
            <ChevronDownIcon className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${settings ? "rotate-180" : ""}`} />
          </button>
          {settings && <form id="app-project-settings" className="space-y-3 border-t border-border p-3" onSubmit={(event) => { event.preventDefault(); if (path.trim() && !busy && !connecting) void link(path.trim()); }}>
            <div className="space-y-1.5">
              <label className="block text-xs font-medium" htmlFor="app-directory">App source directory</label>
              <Input id="app-directory" className="h-9 bg-background font-mono text-xs" value={path} onChange={(event) => setPath(event.target.value)} placeholder="/Users/you/Projects/my-app" disabled={busy || connecting} aria-describedby="app-directory-help" autoComplete="off" spellCheck={false} />
              <p id="app-directory-help" className="text-[11px] leading-relaxed text-muted-foreground">Codex reads your code to understand your app. Relevant code and screenshots are sent to your model provider.</p>
            </div>
            {project.appRoot && <p className="text-[11px] text-muted-foreground">Changing the directory starts a new chat.</p>}
            <div className="flex items-center justify-between gap-2">
              {project.appRoot ? <Button type="button" size="xs" variant="ghost" className="text-muted-foreground" disabled={busy || connecting} onClick={() => void link(null)}>Unlink project</Button> : <span className="text-[11px] text-muted-foreground">Read-only access</span>}
              <div className="flex items-center gap-1">
                {project.appRoot && <Button type="button" size="sm" variant="ghost" disabled={connecting} onClick={() => { setPath(project.appRoot ?? ""); setSettings(false); }}>Cancel</Button>}
                <Button size="sm" disabled={busy || connecting || !path.trim() || path.trim() === project.appRoot}>{connecting && <Loader2Icon className="animate-spin" />}{project.appRoot ? "Save project" : "Link project"}</Button>
              </div>
            </div>
          </form>}
        </section>
        <label className="block text-xs text-muted-foreground" htmlFor="chat-scene">Screenshot · {context.locale}</label>
        <select id="chat-scene" className="h-8 w-full rounded-lg border border-border bg-background px-2 text-xs" value={context.sceneId} onChange={(event) => onScene(event.target.value)}>
          {scenes.map((scene, index) => <option key={scene.id} value={scene.id}>{index + 1}. {scene.headline[context.locale] || scene.id}</option>)}
        </select>
        <div className="flex gap-3 rounded-lg bg-muted/50 p-2">
          {imageUrl && <img src={imageUrl} alt="Current app screenshot" className="h-16 w-9 shrink-0 rounded object-cover object-top" />}
          <div className="min-w-0 text-xs"><p className="font-medium break-words">{context.headline || "No headline yet"}</p><p className="mt-1 break-words text-muted-foreground">{context.subhead}</p>{!imageUrl && <p className="mt-1 text-muted-foreground">No screenshot uploaded for this device and language.</p>}</div>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4" role="log" aria-label="Project conversation">
        {!project.messages.length && <div className="py-6 text-sm leading-relaxed text-muted-foreground"><p>What should this screenshot say?</p><p className="mt-2 text-xs">Discuss the benefit, check the implementation, or ask for a few directions. Codex can read your linked app to ground its suggestions.</p></div>}
        {sourceError && <p role="status" className="text-xs text-muted-foreground">{sourceError}</p>}
        {project.messages.map((message) => <article id={`chat-message-${message.id}`} tabIndex={-1} key={message.id} className={`rounded-xl p-3 text-sm focus:outline-2 focus:outline-amber-400 ${message.role === "user" ? "ml-6 bg-muted" : "border border-border bg-background"}`}>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{message.role === "user" ? "You" : "Codex"} · {message.sceneId} · {message.locale}</p>
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
        <textarea aria-label="Message Codex" className="min-h-20 w-full resize-none rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-ring disabled:opacity-50" placeholder="What should we emphasize in this screenshot?" value={draft} maxLength={16000} onChange={(event) => setDraft(event.target.value)} disabled={!project.appRoot || !status?.authenticated || busy} onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); }
        }} />
        <div className="flex items-center justify-between">
          <Button type="button" size="sm" variant="ghost" disabled={!canUndo} onClick={() => { onUndo(); setApplied(null); }}><Undo2Icon />Undo last edit</Button>
          {busy ? <Button type="button" size="sm" variant="outline" onClick={async () => {
            try { await codexJson(`${base}/stop`, {}); setActivity("Stopping…"); }
            catch (error) { reportError(error); }
          }}><SquareIcon />Stop</Button> : <Button size="sm" disabled={!draft.trim() || !project.appRoot || !status?.authenticated || !context.sceneId || connecting}><ArrowUpIcon />Send</Button>}
        </div>
      </form>
    </aside>
  );
}

function messageOf(error: unknown) { return error instanceof Error ? error.message : String(error); }
