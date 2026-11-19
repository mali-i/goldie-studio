import { useEffect, useState } from 'react';
import { assetUrl, REMOVE_BACKGROUND, type ImageEditJob, type ImageTarget } from '../image-edit';
import { projectApi } from '../project-api';
import type { GoldieProjectConfig } from '../project';
import { Button } from './ui/button';

async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data as T;
}
export function ImageEditPanel({ projectId, initial, background, onPreview, onClose, onApplied }: {
  projectId: string; initial: ImageTarget; background: string;
  onPreview: (preview: { target: ImageTarget; url: string } | null) => void;
  onClose: () => void; onApplied: () => void;
}) {
  const base = `/api/projects/${encodeURIComponent(projectId)}/image-edits`;
  const [config, setConfig] = useState<GoldieProjectConfig>();
  const [target, setTarget] = useState(initial);
  const [prompt, setPrompt] = useState(REMOVE_BACKGROUND);
  const [job, setJob] = useState<ImageEditJob | null>(null);
  const [jobs, setJobs] = useState<ImageEditJob[]>([]);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState<'frame' | 'checker' | 'original'>('frame');
  const scene = config?.scenes.find((s) => s.id === target.sceneId);
  const source = scene?.sources[target.device]?.[target.locale]?.[target.slot];
  const matching = jobs.filter((j) => j.target.sceneId === target.sceneId && j.target.device === target.device && j.target.locale === target.locale && j.target.slot === target.slot);
  useEffect(() => {
    let live = true;
    Promise.all([projectApi.get(projectId), api<{ configured: boolean; error?: string; jobs: ImageEditJob[] }>(base)]).then(([p, history]) => {
      if (!live) return;
      setConfig(p.config); setConfigured(history.configured); setJobs(history.jobs); if (history.error) setError(history.error);
      const active = history.jobs.find((j) => j.status === 'running');
      if (active) { setJob(active); setTarget(active.target); }
    }).catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [projectId, base]);
  useEffect(() => {
    if (!job || job.status !== 'running') return;
    let live = true;
    const timer = setInterval(() => {
      api<ImageEditJob>(`${base}/${job.id}`).then((next) => { if (live) { setJob(next); if (next.status !== 'running') setJobs((prev) => [next, ...prev.filter((j) => j.id !== next.id)]); } }).catch((e) => { if (live) setError(e.message); });
    }, 2000);
    return () => { live = false; clearInterval(timer); };
  }, [base, job?.id, job?.status]);
  const relevant = job?.target.sceneId === target.sceneId && job.target.device === target.device && job.target.locale === target.locale && job.target.slot === target.slot;
  const result = relevant && job?.status === 'ready' ? job.result : undefined;
  useEffect(() => {
    onPreview(result ? { target, url: assetUrl(projectId, view === 'original' ? job!.original : result).slice(1) } : null);
    return () => onPreview(null);
  }, [result, job?.original, view, target, projectId, onPreview]);
  const running = job?.status === 'running';
  async function generate() {
    setBusy(true); setError('');
    try { const next = await api<ImageEditJob>(base, { ...target, prompt }); setJob(next); setJobs((prev) => [next, ...prev]); setView('frame'); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  async function apply(restore = false) {
    if (!job || !source) return;
    setBusy(true); setError('');
    try { await api(`${base}/${job.id}/apply`, { restore, expectedSource: source }); onApplied(); onClose(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <aside aria-label="AI image editing" className="flex w-[380px] max-w-[45vw] shrink-0 flex-col border-l bg-background p-4 overflow-y-auto gap-4">
    <div className="flex items-center justify-between"><h2 className="font-semibold">AI image editing</h2><Button variant="ghost" size="sm" onClick={onClose}>Close</Button></div>
    <p className="text-xs text-muted-foreground">Remove the screenshot background and blend its foreground into your Frame. AI may alter text or icons; inspect the result before applying.</p>
    {!configured && <p role="status" className="text-xs rounded-lg bg-muted p-3">Uses your local Codex login and built-in image tool. Sign in through Discuss with Codex if needed. No separate API key is required.</p>}
    <label className="text-xs">Frame<select className="mt-1 w-full rounded border bg-background p-2" value={target.sceneId} disabled={running || busy} onChange={(e) => { setTarget({ ...target, sceneId: e.target.value }); setJob(null); }}>
      {config?.scenes.map((s) => <option key={s.id} value={s.id}>{s.headline[target.locale] || s.id}</option>)}
    </select></label>
    <label className="text-xs">Screenshot · {target.device} · {target.locale}<select className="mt-1 w-full rounded border bg-background p-2" value={target.slot} disabled={running || busy} onChange={(e) => { setTarget({ ...target, slot: e.target.value as ImageTarget['slot'] }); setJob(null); }}><option value="primary">Screen 1</option><option value="secondary">Screen 2</option></select></label>
    {!source && <p className="text-xs">Upload a screenshot into this slot before editing.</p>}
    {source && <div className="flex min-h-40 max-h-80 justify-center overflow-hidden rounded-lg border p-3" style={{ background: view === 'checker' ? 'repeating-conic-gradient(#ddd 0 25%, #fff 0 50%) 0/16px 16px' : background }}>
      <img alt={view === 'original' || !result ? 'Original screenshot' : 'AI edited screenshot'} className="max-h-72 max-w-full object-contain" src={assetUrl(projectId, view === 'original' ? (relevant ? job?.original : undefined) ?? source : result ?? source)} />
    </div>}
    {result && <div className="flex gap-1">{(['frame', 'checker', 'original'] as const).map((v) => <Button key={v} size="sm" variant={view === v ? 'secondary' : 'ghost'} onClick={() => setView(v)}>{v === 'frame' ? 'Frame' : v === 'checker' ? 'Transparency' : 'Original'}</Button>)}</div>}
    <label className="text-xs">Edit instruction<textarea className="mt-1 min-h-32 w-full rounded-lg border bg-background p-2 text-sm" value={prompt} maxLength={4000} disabled={running || busy} onChange={(e) => setPrompt(e.target.value)} /></label>
    <Button variant="ghost" size="sm" disabled={running || busy} onClick={() => setPrompt(REMOVE_BACKGROUND)}>Remove white dotted background</Button>
    <p className="text-[11px] text-muted-foreground">Generating sends this screenshot and instruction through your local Codex provider.</p>
    <Button variant="outline" size="sm" disabled={busy || running} onClick={async () => { setError(''); setBusy(true); try { const status = await api<{ configured: boolean; error?: string }>(base); setConfigured(status.configured); if (status.error) setError(status.error); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>Recheck local Codex</Button>
    <Button disabled={!configured || !source || !prompt.trim() || busy || running} onClick={generate}>{running ? 'Generating…' : result ? 'Generate again' : 'Generate'}</Button>
    {running && <p role="status" className="text-xs">You can close this panel. Reopen it to check the task.</p>}
    {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    {relevant && job?.status === 'failed' && <p role="alert" className="text-xs text-destructive">{job.error}</p>}
    {result && <div className="flex gap-2"><Button disabled={busy} onClick={() => apply()}>Apply to Frame</Button><Button variant="outline" disabled={busy} onClick={() => apply(true)}>Restore original</Button></div>}
    {matching.length > 0 && <label className="text-xs">Saved versions<select className="mt-1 w-full rounded border bg-background p-2" value={relevant ? job?.id ?? '' : ''} disabled={busy || running} onChange={(e) => { setJob(matching.find((j) => j.id === e.target.value) ?? null); setError(''); }}><option value="">Select a version</option>{matching.map((j) => <option key={j.id} value={j.id}>{new Date(j.createdAt).toLocaleTimeString()} · {j.status} · {j.prompt.slice(0, 20)}</option>)}</select></label>}
  </aside>;
}
