import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, realpath, rename } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { CodexImages, type ImageContext } from './codex-images';
import { PNG } from 'pngjs';
import type { ImageEditJob, ImageTarget } from '../src/image-edit';

export class ImageEditError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
export const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export async function readImageAsset(dir: string, path: string) {
  if (typeof path !== 'string' || !/^screenshots\/[A-Za-z0-9/_.-]+$/.test(path) || path.split('/').includes('..')) throw new ImageEditError(422, 'Invalid image path.');
  const base = await realpath(dir);
  const file = await realpath(resolve(base, path));
  if (!file.startsWith(base + sep)) throw new ImageEditError(422, 'Image escapes project.');
  return readFile(file);
}
export function validateTransparentPng(bytes: Buffer) {
  if (bytes.length > 40 * 1024 * 1024 || bytes.length < 24 || bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw new Error('The image service did not return a valid PNG.');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width * height > 20_000_000) throw new Error('Image dimensions exceed the supported limit.');
  const png = PNG.sync.read(bytes);
  let transparent = false, visible = false;
  for (let i = 3; i < png.data.length; i += 4) { transparent ||= png.data[i]! < 255; visible ||= png.data[i]! > 0; }
  if (!transparent || !visible) throw new Error('The result must contain both transparent and visible pixels. Try a more specific background-removal instruction.');
}
type Provider = (bytes: Buffer, prompt: string, context: ImageContext) => Promise<Buffer>;
export class ImageEdits {
  private active = new Set<string>();
  constructor(private provider?: Provider, private codex = new CodexImages()) {}
  status() { return this.provider ? Promise.resolve({ configured: true }) : this.codex.status(); }
  close() { this.codex.close(); }
  async create(dir: string, target: ImageTarget, source: string, prompt: string, expectedHash?: string) {
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 4000) throw new ImageEditError(422, 'Enter an instruction of 1–4000 characters.');
    if (this.active.has(dir)) throw new ImageEditError(409, 'An image edit is already running in this project.');
    this.active.add(dir);
    try {
      const bytes = await readImageAsset(dir, source);
      if (expectedHash && digest(bytes) !== expectedHash) throw new ImageEditError(409, "Screenshot changed while Codex was replying. Send the edit again.");
      const id = randomUUID();
      const folder = `screenshots/ai/${id}`;
      await mkdir(join(dir, folder), { recursive: true });
      const original = `${folder}/original.${source.split('.').pop()}`;
      await writeFile(join(dir, original), bytes);
      const job: ImageEditJob = { id, createdAt: Date.now(), target, source, original, sourceHash: digest(bytes), prompt: prompt.trim(), status: 'running' };
      await this.save(dir, job);
      void this.run(dir, job, bytes);
      return { ...job };
    } catch (error) { this.active.delete(dir); throw error; }
  }
  async get(dir: string, id: string): Promise<ImageEditJob> {
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new ImageEditError(422, 'Invalid task id.');
    let job: ImageEditJob;
    try { job = JSON.parse(await readFile(join(dir, 'screenshots/ai', id, 'task.json'), 'utf8')); }
    catch { throw new ImageEditError(404, 'Image edit not found.'); }
    if (job.status === 'running' && !this.active.has(dir)) return { ...job, status: 'failed', error: 'Studio restarted during generation. Please retry.' };
    return job;
  }
  private async save(dir: string, job: ImageEditJob) {
    const file = join(dir, 'screenshots/ai', job.id, 'task.json');
    const temp = `${file}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(job)); await rename(temp, file);
  }
  private async run(dir: string, job: ImageEditJob, bytes: Buffer) {
    try {
      const context = { directory: join(dir, 'screenshots/ai', job.id), inputPath: join(dir, job.original) };
      const output = this.provider
        ? await this.provider(bytes, job.prompt, context)
        : await this.codex.edit(bytes, job.prompt, context);
      validateTransparentPng(output);
      job.result = `screenshots/ai/${job.id}/transparent.png`;
      await writeFile(join(dir, job.result), output); job.status = 'ready';
    } catch (error) { job.status = 'failed'; job.error = error instanceof Error ? error.message : 'Image editing failed.'; }
    try { await this.save(dir, job); } catch { /* Project may have been removed while generation was active. */ } finally { this.active.delete(dir); }
  }
}
