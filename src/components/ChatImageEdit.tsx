import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, CodexProject } from '../codex';
import { codexJson } from '../codex';
import { assetUrl, type ImageEditJob, type ImageTarget } from '../image-edit';
import { projectApi } from '../project-api';
import { Button } from './ui/button';
export type ImagePreview = { target: ImageTarget; url: string; jobId?: string };
export function ChatImageEdit({ projectId, message, sessionId, disabled, background, previewId, onPreview, onConversation, onApplied, onBusy }: {
  projectId: string; message: ChatMessage; sessionId?: string; disabled: boolean; background: string; previewId?: string;
  onBusy: (busy: boolean) => void;
  onPreview: (preview: ImagePreview | null) => void; onConversation: (state: CodexProject) => void; onApplied: () => void;
}) {
  const edit = message.imageEdit!;
  const base = `/api/projects/${encodeURIComponent(projectId)}`;
  const [job, setJob] = useState<ImageEditJob | null>(null);
  const [slot, setSlot] = useState<ImageTarget['slot'] | ''>(edit.slot ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState(false);
  const [view, setView] = useState<'frame' | 'checker' | 'original'>('frame');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    setJob(null); setError('');
    if (!edit.jobId) return;
    let live = true; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await codexJson<ImageEditJob>(`${base}/image-edits/${edit.jobId}`);
        if (!live) return;
        setJob(next); setError('');
        if (next.status === 'running') timer = setTimeout(poll, 2000);
      } catch (e) { if (live) { setError((e as Error).message); timer = setTimeout(poll, 5000); } }
    };
    void poll();
    return () => { live = false; clearTimeout(timer); };
  }, [base, edit.jobId]);
  const previewing = Boolean(job && previewId === job.id);
  const target = { sceneId: edit.sceneId, device: message.device, locale: message.locale, slot: edit.slot ?? slot };
  const show = (original = false) => {
    if (!job?.result) return;
    onPreview({ jobId: job.id, target: job.target, url: assetUrl(projectId, original ? job.original : job.result).slice(1) });
  };
  async function generate() {
    setBusy(true); onBusy(true); setError('');
    try {
      const state = await codexJson<CodexProject>(`${base}/codex/image-edit`, { sessionId, messageId: message.id, slot });
      if (mounted.current) onConversation(state);
    } catch (e) { if (mounted.current) setError((e as Error).message); }
    finally { onBusy(false); if (mounted.current) setBusy(false); }
  }
  async function apply(restore = false) {
    if (!job) return;
    setBusy(true); onBusy(true); setError('');
    try {
      const project = await projectApi.get(projectId);
      const source = project.config.scenes.find((s) => s.id === job.target.sceneId)?.sources[job.target.device]?.[job.target.locale]?.[job.target.slot];
      if (!source) throw new Error('The screenshot is no longer available.');
      await codexJson(`${base}/image-edits/${job.id}/apply`, { expectedSource: source, restore });
      if (!mounted.current) return;
      if (previewing) onPreview(null);
      setApplied(!restore); onApplied();
    } catch (e) { if (mounted.current) setError((e as Error).message); }
    finally { onBusy(false); if (mounted.current) setBusy(false); }
  }
  return <section aria-label="Screenshot edit result" className="mt-3 space-y-3 border-t border-border pt-3">
    <p className="text-xs font-medium">图片编辑 · {target.device} · {target.locale}{target.slot ? ` · Screen ${target.slot === 'primary' ? 1 : 2}` : ''}</p>
    <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{edit.prompt}</p>
    {!edit.slot && !job && <label className="block text-xs">选择要编辑的截图<select aria-label="Screenshot to edit" className="mt-1 w-full rounded border bg-background p-2" value={slot} disabled={busy || disabled} onChange={(e) => setSlot(e.target.value as ImageTarget['slot'])}><option value="">请选择截图</option><option value="primary">Screen 1</option><option value="secondary">Screen 2</option></select></label>}
    {edit.jobId && !job && !error && <p role="status" className="text-xs">正在读取图片任务…</p>}
    {job?.status === 'running' && <p role="status" className="text-xs">正在通过本机 Codex 编辑图片。关闭面板后任务仍会继续。</p>}
    {job?.status === 'ready' && job.result && <>
      <div className="flex h-48 items-center justify-center rounded-lg border p-2" style={{ background: view === 'checker' ? 'repeating-conic-gradient(#ddd 0 25%, #fff 0 50%) 0/16px 16px' : background }}><img className="max-h-full max-w-full object-contain" alt={view === 'original' ? 'Original screenshot' : 'Edited screenshot'} src={assetUrl(projectId, view === 'original' ? job.original : job.result)} /></div>
      <div className="flex flex-wrap gap-1">{(['frame', 'checker', 'original'] as const).map((v) => <Button key={v} size="sm" variant={view === v ? 'secondary' : 'ghost'} onClick={() => { setView(v); if (previewing) show(v === 'original'); }}>{v === 'frame' ? '结果' : v === 'checker' ? '透明度' : '原图'}</Button>)}</div>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => previewing ? onPreview(null) : show(view === 'original')}>{previewing ? '结束画布预览' : '在 Frame 中预览'}</Button><Button size="sm" disabled={busy || disabled} onClick={() => apply()}>{applied ? '再次应用' : '应用到 Frame'}</Button><Button size="sm" variant="outline" disabled={busy || disabled} onClick={() => apply(true)}>恢复原图</Button></div>
      <p className="text-[11px] text-muted-foreground">应用前请检查文字与图标。Frame 的文案、背景和设备边框仍可独立编辑。</p>
    </>}
    {(edit.error && !job || error || job?.error) && <p role="alert" className="break-words text-xs text-destructive">{error || job?.error || edit.error}</p>}
    {job?.status !== 'running' && (!edit.jobId || job) && <Button size="sm" variant="outline" disabled={busy || disabled || !target.slot} onClick={generate}>{busy ? '正在提交…' : job ? '重新生成' : '生成图片'}</Button>}
  </section>;
}
