import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { PNG } from 'pngjs';
import { ImageEdits, validateTransparentPng, readImageAsset } from './image-edit';
import { workspaceService, workspacePlugin } from './workspace';
const roots: string[] = [];
const servers: ViteDevServer[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((s) => s.close())); await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true }))); });
function png(alpha: number) {
  const image = new PNG({ width: 2, height: 1 }); image.data.set([255,255,255,255,0,0,0,alpha]); return PNG.sync.write(image);
}
async function dir() { const root = await mkdtemp(join(tmpdir(), 'goldie-ai-')); roots.push(root); return root; }
const target = { sceneId: 'scene-1', device: 'iphone-6.9', locale: 'en-US', slot: 'primary' as const };
async function ready(edits: ImageEdits, folder: string, id: string) {
  for (let i = 0; i < 100; i++) { const job = await edits.get(folder, id); if (job.status !== 'running') return job; await new Promise((r) => setTimeout(r, 5)); }
  throw new Error('Task did not complete');
}
test('validates actual alpha, rejects opaque, empty and malformed output', () => {
  validateTransparentPng(png(0));
  expect(() => validateTransparentPng(png(255))).toThrow('transparent');
  expect(() => validateTransparentPng(Buffer.from('not a png'))).toThrow('valid PNG');
  const image = new PNG({ width: 1, height: 1 });
  expect(() => validateTransparentPng(PNG.sync.write(image))).toThrow('visible');
});
test('task preserves source, persists result and handles failure and restart', async () => {
  const folder = await dir(); await mkdir(join(folder, 'screenshots'));
  await writeFile(join(folder, 'screenshots/input.png'), png(255));
  let release!: (value: Buffer) => void;
  const edits = new ImageEdits(() => new Promise((resolve) => { release = resolve; }));
  const job = await edits.create(folder, target, 'screenshots/input.png', 'remove background');
  expect((await edits.get(folder, job.id)).status).toBe('running');
  expect((await new ImageEdits().get(folder, job.id)).status).toBe('failed');
  await expect(edits.create(folder, target, 'screenshots/input.png', 'again')).rejects.toThrow('already running');
  release(png(0)); const result = await ready(edits, folder, job.id);
  expect(result.status).toBe('ready');
  expect(await readImageAsset(folder, result.original)).toEqual(png(255));
  validateTransparentPng(await readImageAsset(folder, result.result!));
  const failures = new ImageEdits(async () => png(255));
  await expect(failures.create(folder, target, 'screenshots/input.png', 'remove background', 'stale-hash')).rejects.toThrow('Screenshot changed');
  const failed = await failures.create(folder, target, 'screenshots/input.png', 'remove background');
  expect((await ready(failures, folder, failed.id)).status).toBe('failed');
  await expect(readImageAsset(folder, 'screenshots/../../escape')).rejects.toThrow('Invalid');
});
test('HTTP applies only to matching unchanged screenshot and restores original across restart', async () => {
  const root = await dir(); const p = await workspaceService.createProject(root, 'AI test');
  await workspaceService.saveScreenshot(root, p.project.id, { ...target, mimeType: 'image/png', base64: png(255).toString('base64') });
  const folder = join(root, p.project.id), source = 'screenshots/iphone-6.9/en-US/scene-1/primary.png';
  const edits = new ImageEdits(async () => png(0));
  const created = await edits.create(folder, target, source, 'Remove background');
  const job = await ready(edits, folder, created.id);
  const server = await createServer({ configFile: false, root, plugins: [workspacePlugin(root)], server: { host: '127.0.0.1', port: 0, strictPort: true } });
  servers.push(server); await server.listen();
  const address = server.httpServer!.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}/api/projects/${p.project.id}/image-edits`;
  const apply = (expectedSource: string, restore = false) => fetch(`${base}/${job.id}/apply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedSource, restore }) });
  expect((await fetch(base, { headers: { Origin: 'https://evil.example' } })).status).toBe(403);
  expect((await apply('screenshots/wrong.png')).status).toBe(409);
  await writeFile(join(folder, source), png(128));
  expect((await apply(source)).status).toBe(409);
  await writeFile(join(folder, source), png(255));
  expect((await apply(source)).status).toBe(200);
  let saved = await workspaceService.readProject(root, p.project.id);
  expect(saved.config.scenes[0]!.sources[target.device]![target.locale]!.primary).toBe(job.result);
  expect((await apply(job.result!, true)).status).toBe(200);
  saved = await workspaceService.readProject(root, p.project.id);
  expect(saved.config.scenes[0]!.sources[target.device]![target.locale]!.primary).toBe(job.original);
});

