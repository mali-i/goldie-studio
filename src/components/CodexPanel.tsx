import { ArrowUpIcon, ChevronDownIcon, SparklesIcon, SlidersHorizontalIcon, CodeXmlIcon, FolderOpenIcon, Loader2Icon, MessageSquareIcon, PanelRightCloseIcon, RefreshCwIcon, SquarePenIcon, SquareIcon, Undo2Icon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "radix-ui";
import { codexJson, CodexRequestError, streamChat, type ChatInput, type ChatMessage, type CodexProject, type CodexStatus, type CopyProposal } from "../codex";
import { ChatImageEdit, type ImagePreview } from "./ChatImageEdit";
import type { ImageEditJob } from "../image-edit";
import { HighlightText } from "./HighlightText";
import type { NotesController } from "../lib/useWorkspaceNotes";
import type { Excerpt } from "../notes";
import type { ChatFrame } from "../lib/chatFrames";
import { ChatSessions } from "./ChatSessions";
import { FrameComposer } from "./FrameComposer";
import { Button } from "./ui/button";

export function CodexPanel({ projectId, frames, context, onScene, onApply, onUndo, canUndo, onClose, notes, source, background, previewId, onImagePreview, onImageApplied }: {
  background: string;
  previewId?: string;
  onImagePreview: (preview: ImagePreview | null) => void;
  onImageApplied: () => void;
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
  const [pickingDirectory, setPickingDirectory] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [imageHistory, setImageHistory] = useState<ImageEditJob[] | null>(null);
  const [loadingImages, setLoadingImages] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [mode, setMode] = useState<"discuss" | "image">("discuss");
  const [imageSlot, setImageSlot] = useState<"primary" | "secondary">("primary");
  const [draft, setDraft] = useState("");
  const [selectedFrameIds, setSelectedFrameIds] = useState<string[]>([]);
  const selectedFrames = selectedFrameIds.flatMap((id) => frames.filter((frame) => frame.id === id));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [imageAction, setImageAction] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [serviceUnavailable, setServiceUnavailable] = useState(false);
  const [activity, setActivity] = useState("");
  const [loginUrl, setLoginUrl] = useState("");
  const [applied, setApplied] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const viewedSource = useRef<Excerpt | null>(null);
  const [sourceError, setSourceError] = useState("");
  const bottom = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const mounted = useRef(true);

  useEffect(() => { onImagePreview(null); return () => onImagePreview(null); }, [base, project.activeSessionId, onImagePreview]);

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

  const chooseDirectory = async () => {
    if (pickingDirectory || busy || imageAction || connecting) return;
    setPickingDirectory(true); setError("");
    try {
      const result = await codexJson<{ appRoot: string | null }>(`${base}/pick-directory`, {}, "POST", 130_000);
      if (mounted.current && result.appRoot !== null) setPath(result.appRoot);
    } catch (error) { reportError(error); }
    finally { if (mounted.current) setPickingDirectory(false); }
  };

  const changeSession = async (sessionId?: string) => {
    if (busy || imageAction || connecting) return;
    setConnecting(true); setError("");
    try {
      const state = await codexJson<CodexProject>(`${base}/sessions`, sessionId ? { sessionId } : {});
      if (!mounted.current) return;
      setProject(state); setPath(state.appRoot ?? "");
      if (state.activeSessionId !== project.activeSessionId) setDraft("");
      setSelectedFrameIds([]); setMode("discuss"); setToolsOpen(false);
      setApplied(null); setSourceError(""); setDirectoryOpen(false); setImageHistory(null);
    } catch (error) { viewedSource.current = source; reportError(error); }
    finally { if (mounted.current) setConnecting(false); }
  };

  const send = async () => {
    if (!draft.trim() || !status?.authenticated || busy || imageAction || connecting) return;
    if (mode === "image" && new Set(selectedFrames.map((frame) => frame.sceneId)).size !== 1) { setError("请选择一个 Frame，再选择需要编辑的截图。"); return; }
    const primary = selectedFrames[0];
    const input: ChatInput = { ...context, sessionId: project.activeSessionId, sceneId: primary?.sceneId ?? "", headline: primary?.headline ?? "", subhead: primary?.subhead ?? "", frames: selectedFrames, message: draft.trim(), ...(mode === "image" ? { imageEditSlot: imageSlot } : {}) };
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
    <aside ref={panel} id="codex-panel" aria-label="Codex assistant" className="fixed inset-y-3 right-3 z-30 flex w-[420px] max-w-[calc(100vw-1.5rem)] shrink-0 flex-col overflow-hidden rounded-2xl border border-sidebar-border bg-sidebar text-sidebar-foreground md:relative md:inset-auto md:z-auto md:ml-3 md:h-full md:min-w-[320px] md:max-w-[42vw]">
      {!directoryOpen && <header className="flex h-14 shrink-0 items-center justify-between border-b border-sidebar-border px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <Button size="icon" variant={directoryOpen ? "secondary" : "outline"} className="shrink-0" aria-label={directoryOpen ? "Return to chat" : "Browse chat history"} aria-pressed={directoryOpen} aria-controls="chat-directory" title={directoryOpen ? "Return to chat" : "Conversations"} onClick={() => { setDirectoryOpen((open) => !open); setSettings(false); }}><MessageSquareIcon className="size-4" /></Button>
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="shrink-0 text-sm font-semibold">Codex</h2>
            <span className="min-w-0 truncate text-[11px] text-muted-foreground" role="status" title={status?.account}>
              <span className={`mr-2 inline-block size-1.5 rounded-full ${status?.authenticated ? "bg-emerald-500" : "bg-amber-500"}`} />
              {connecting ? "Connecting…" : serviceUnavailable ? "Studio service unavailable" : status?.authenticated ? "Connected" : status?.available ? "Sign in to Codex" : "Codex not connected"}
            </span>
            <Button size="icon-xs" variant="ghost" disabled={busy || imageAction || connecting} aria-label={serviceUnavailable ? "Retry Studio connection" : "Reconnect Codex"} title={serviceUnavailable ? "Retry Studio connection" : "Reconnect Codex"} onClick={async () => {
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
          <Button size="icon-sm" variant="ghost" aria-label="New chat" title="New chat" disabled={busy || imageAction || connecting || !project.activeSessionId} onClick={() => { setSettings(false); void changeSession(); }}><SquarePenIcon /></Button>
          <Dialog.Root open={settings} onOpenChange={(open) => { if (pickingDirectory) return; if (open) setPath(project.appRoot ?? ""); setSettings(open); }}>
            <Dialog.Trigger asChild>
              <Button size="icon-sm" variant="ghost" className="relative" aria-label={project.appRoot ? "Manage linked project source" : "Link project source (optional)"} title={project.appRoot ? `Project source: ${project.appRoot}` : "Link project source (optional)"}>
                <CodeXmlIcon />
                {project.appRoot && <span aria-hidden="true" className="absolute right-0.5 top-0.5 size-1.5 rounded-full bg-emerald-500 ring-2 ring-sidebar" />}
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal container={panel.current}>
              <Dialog.Overlay className="absolute inset-0 z-50 bg-black/15 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
              <Dialog.Content aria-describedby="app-directory-help" className="absolute left-1/2 top-1/2 z-50 max-h-[calc(100%-2rem)] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 space-y-4 overflow-y-auto rounded-2xl border border-border bg-popover p-6 text-popover-foreground shadow-xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
                <Dialog.Close asChild><Button size="icon-xs" variant="ghost" className="absolute right-4 top-4" disabled={pickingDirectory} aria-label="Close project source settings"><XIcon /></Button></Dialog.Close>
              <div className="space-y-1">
                <Dialog.Title className="flex items-center gap-2 pr-7 text-sm font-semibold"><CodeXmlIcon className="size-4 text-muted-foreground" />Project source<span className="ml-auto text-[10px] font-normal text-muted-foreground">{project.appRoot ? "Linked · Read-only" : "Optional"}</span></Dialog.Title>
                {project.appRoot && <p className="truncate font-mono text-[11px] text-muted-foreground" title={project.appRoot}>{project.appRoot}</p>}
              </div>
          <form id="app-project-settings" className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (path.trim() && !busy && !connecting && !pickingDirectory) void link(path.trim()); }}>
            <div className="space-y-1.5">
              <span className="block text-xs font-medium">Project source directory</span>
              <Button type="button" variant="outline" className="h-auto w-full justify-start gap-2 px-3 py-3 text-left" disabled={busy || imageAction || connecting || pickingDirectory} onClick={() => void chooseDirectory()} aria-describedby="app-directory-help">
                {pickingDirectory ? <Loader2Icon className="size-4 shrink-0 animate-spin" /> : <FolderOpenIcon className="size-4 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 flex-1">
                  <span className="block text-xs">{pickingDirectory ? "Choosing folder…" : path ? "Change folder" : "Choose folder"}</span>
                  {path && <span className="mt-1 block truncate font-mono text-[10px] font-normal text-muted-foreground" title={path}>{path}</span>}
                </span>
              </Button>
              <Dialog.Description id="app-directory-help" className="text-[11px] leading-relaxed text-muted-foreground">Optional: link a project folder to give Codex context for questions, analysis, and writing. Source access is read-only. Relevant code and screenshots are sent to your model provider.</Dialog.Description>
            </div>
            {(project.appRoot || project.lastAppRoot) && <p className="text-[11px] text-muted-foreground">Unlinking keeps this conversation and stops further source reading. Previously read code remains in context. Linking a different project starts a new chat.</p>}
            {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
            <div className="flex items-center justify-between gap-2">
              {project.appRoot ? <Button type="button" size="xs" variant="ghost" className="text-muted-foreground" disabled={busy || imageAction || connecting || pickingDirectory} onClick={() => void link(null)}>Unlink project</Button> : <span className="text-[11px] text-muted-foreground">Read-only access</span>}
              <div className="flex items-center gap-1">
                <Button type="button" size="sm" variant="ghost" disabled={connecting || pickingDirectory} onClick={() => { setPath(project.appRoot ?? ""); setSettings(false); }}>Cancel</Button>
                <Button size="sm" disabled={busy || imageAction || connecting || pickingDirectory || !path.trim() || path.trim() === project.appRoot}>{connecting && <Loader2Icon className="animate-spin" />}{project.appRoot ? "Save project" : "Link project"}</Button>
              </div>
            </div>
          </form>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          <Button size="icon-sm" variant="ghost" aria-label="Close Codex panel" title="Collapse chat" onClick={onClose}><PanelRightCloseIcon /></Button>
        </div>
      </header>}
      {directoryOpen && <>
        <ChatSessions error={error} sessions={project.sessions ?? []} activeId={project.activeSessionId}
          disabled={busy || imageAction || connecting} onSelect={changeSession} onCreate={() => changeSession()} onBack={() => setDirectoryOpen(false)} />
        {busy && <p role="status" className="shrink-0 border-t border-border px-4 py-3 text-xs text-muted-foreground">A reply is running. Return to chat to stop it before switching conversations.</p>}
      </>}
      <div className={`${directoryOpen ? "hidden" : "flex"} min-h-0 flex-1 flex-col`}>
      {(status?.available && !status.authenticated || loginUrl) && <div className="shrink-0 space-y-3 border-b border-sidebar-border p-4">
        {status?.available && !status.authenticated && <Button size="sm" variant="outline" disabled={connecting || imageAction} onClick={async () => {
          setConnecting(true); setError("");
          try { const result = await codexJson<{ authUrl: string }>(`${base}/login`, {}); setLoginUrl(result.authUrl); }
          catch (error) { reportError(error); }
          finally { setConnecting(false); }
        }}>Sign in with ChatGPT</Button>}
        {loginUrl && <a className="block text-xs underline" href={loginUrl} target="_blank" rel="noreferrer">Continue sign-in in your browser ↗</a>}
      </div>}
      <div className={`min-h-0 flex-1 overflow-y-auto p-4 ${project.messages.length ? "space-y-4" : "flex flex-col"}`} role="log" aria-label="Project conversation">
        {!project.messages.length && <div className="flex flex-1 flex-col justify-center px-2 py-8">
          <div className="mb-4 flex size-10 items-center justify-center rounded-2xl border border-border bg-background"><SparklesIcon className="size-5 text-muted-foreground" /></div>
          <h3 className="text-xl font-semibold tracking-tight">有什么想一起解决？</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">从一个问题、想法或任务开始。需要时，再添加画布内容或关联项目。</p>
          <div className="mt-6 space-y-2">
            {[{ label: "梳理思路", text: "帮我梳理这个想法，明确目标、关键问题和下一步。" }, { label: "分析与比较", text: "帮我比较几个方案，分析各自的优点、限制和适用场景。" }, { label: "写作与表达", text: "帮我打磨一段文字，让表达更清晰、简洁。" }].map((starter) => <button key={starter.label} type="button" disabled={busy || connecting || imageAction} onClick={() => setDraft(starter.text)} className="flex w-full items-center justify-between rounded-xl border border-border bg-background/60 px-3 py-3 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50">{starter.label}<span aria-hidden="true">↗</span></button>)}
          </div>
        </div>}
        {sourceError && <p role="status" className="text-xs text-muted-foreground">{sourceError}</p>}
        {project.messages.map((message) => <article id={`chat-message-${message.id}`} tabIndex={-1} key={message.id} className={`rounded-xl p-3 text-sm focus:outline-2 focus:outline-amber-400 ${message.role === "user" ? "ml-6 bg-muted" : "border border-border bg-background"}`}>
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{message.role === "user" ? "You" : "Codex"}{(message.frames?.length || message.sceneId) ? ` · ${message.frames?.map((frame) => frame.label).join(", ") || message.sceneId} · ${message.locale}` : ""}</p>
          {message.role === "assistant" ? <HighlightText text={message.text} disabled={!notes.ready} excerpts={notes.notes.excerpts.filter((e) => e.messageId === message.id)} onHighlight={(start, end) => {
            notes.update((n) => n.excerpts.some((e) => e.messageId === message.id && e.start === start && e.end === end) ? n : ({ ...n, excerpts: [...n.excerpts, { id: crypto.randomUUID(), messageId: message.id, start, end, text: message.text.slice(start, end), createdAt: new Date().toISOString() }] }));
          }} /> : <p className="whitespace-pre-wrap break-words leading-relaxed">{message.text}</p>}
          {message.imageEdit && <ChatImageEdit projectId={projectId} message={message} sessionId={project.activeSessionId} disabled={busy || imageAction || connecting} background={background} previewId={previewId} onPreview={onImagePreview} onConversation={setProject} onApplied={onImageApplied} onBusy={setImageAction} />}
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
        <div className="flex items-center justify-between gap-2">
          <Button type="button" size="xs" variant="ghost" aria-expanded={toolsOpen} aria-controls="chat-tools" onClick={() => setToolsOpen((open) => !open)}><SlidersHorizontalIcon />{mode === "image" ? "图片编辑" : "工具"}<ChevronDownIcon className={toolsOpen ? "rotate-180" : ""} /></Button>
          <span className="text-[10px] text-muted-foreground">{selectedFrames.length ? `${selectedFrames.length} 个上下文` : "通用对话"}</span>
        </div>
        <div id="chat-tools" hidden={!toolsOpen} className="space-y-2 rounded-xl border border-border bg-background/50 p-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant={mode === "discuss" ? "secondary" : "ghost"} disabled={busy || imageAction || connecting} onClick={() => setMode("discuss")}>对话</Button>
          <Button type="button" size="sm" variant={mode === "image" ? "secondary" : "ghost"} disabled={busy || imageAction || connecting} onClick={() => setMode("image")}>编辑图片</Button>
          {mode === "image" && <select aria-label="Image editing screenshot" className="rounded border bg-background p-1 text-xs" value={imageSlot} disabled={busy || imageAction || connecting} onChange={(e) => setImageSlot(e.target.value as "primary" | "secondary")}><option value="primary">Screen 1</option><option value="secondary">Screen 2</option></select>}
        </div>
        <Button type="button" size="sm" variant="ghost" disabled={busy || imageAction || connecting || loadingImages} onClick={async () => {
          if (imageHistory) { setImageHistory(null); return; }
          setLoadingImages(true); setError("");
          try { const history = await codexJson<{ jobs: ImageEditJob[] }>(`/api/projects/${encodeURIComponent(projectId)}/image-edits`); if (mounted.current) setImageHistory(history.jobs); }
          catch (e) { reportError(e); } finally { if (mounted.current) setLoadingImages(false); }
        }}>{loadingImages ? '正在读取…' : imageHistory ? '收起图片历史' : '图片历史'}</Button>
        {imageHistory && <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2" aria-label="Saved image tasks">
          {!imageHistory.length && <p className="text-xs text-muted-foreground">暂无图片任务。</p>}
          {imageHistory.map((job) => <button type="button" key={job.id} disabled={busy || imageAction || connecting || loadingImages} className="block w-full rounded p-2 text-left text-xs hover:bg-muted disabled:opacity-50" onClick={async () => {
            setLoadingImages(true); setConnecting(true); setError("");
            try { const state = await codexJson<CodexProject>(`${base}/image-edit`, { sessionId: project.activeSessionId, jobId: job.id }); if (mounted.current) { setProject(state); setImageHistory(null); } }
            catch (e) { reportError(e); } finally { if (mounted.current) { setLoadingImages(false); setConnecting(false); } }
          }}>{job.target.sceneId} · Screen {job.target.slot === 'primary' ? 1 : 2} · {job.status}<span className="block truncate text-muted-foreground">{job.prompt}</span></button>)}
        </div>}
        {mode === "image" && <p className="text-[11px] text-muted-foreground">选择一个 Frame。发送后通过本机 Codex 生成候选图片，应用后才会替换截图。</p>}

        </div>
        {mode === "image" && !toolsOpen && <p className="text-[11px] text-muted-foreground">图片编辑已启用 · 在工具中切回通用对话</p>}
        {error && <p role="alert" className="max-h-24 overflow-auto text-xs text-destructive">{error}</p>}
        <FrameComposer frames={frames} selected={selectedFrames} locale={context.locale} value={draft} disabled={!status?.authenticated || busy || imageAction || connecting}
          onChange={setDraft} onSelect={(frame) => { setSelectedFrameIds([...new Set([...selectedFrames.map((item) => item.id), frame.id])]); onScene(frame.sceneId); }}
          onRemove={(id) => setSelectedFrameIds(selectedFrames.filter((frame) => frame.id !== id).map((frame) => frame.id))} onSend={() => void send()} />
        {!selectedFrames.length && <p className="text-xs text-muted-foreground">输入 @ 添加 Frame 上下文，或直接开始对话。</p>}
        <div className="flex items-center justify-between">
          <Button type="button" size="sm" variant="ghost" className={canUndo ? "" : "invisible"} disabled={!canUndo} onClick={() => { onUndo(); setApplied(null); }}><Undo2Icon />Undo last edit</Button>
          {busy ? <Button type="button" size="sm" variant="outline" onClick={async () => {
            try { await codexJson(`${base}/stop`, {}); setActivity("Stopping…"); }
            catch (error) { reportError(error); }
          }}><SquareIcon />Stop</Button> : <Button size="sm" disabled={!draft.trim() || !status?.authenticated || connecting || imageAction}><ArrowUpIcon />Send</Button>}
        </div>
      </form>
      </div>
    </aside>
  );
}

function messageOf(error: unknown) { return error instanceof Error ? error.message : String(error); }
