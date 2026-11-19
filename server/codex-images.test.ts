import { afterEach, expect, test } from 'bun:test';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PNG } from 'pngjs';
import { CodexRpc } from './codex-rpc';
import { CodexImages } from './codex-images';
const cleanups: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
async function fixture(timeout = 2000) {
  const directory = await mkdtemp(join(tmpdir(), 'goldie-codex-image-'));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const png = new PNG({ width: 2, height: 1 }); png.data.set([255,255,255,255,0,0,0,0]);
  const bytes = PNG.sync.write(png);
  const inputPath = join(directory, 'original.png'); await writeFile(inputPath, bytes);
  const executable = join(directory, 'codex-fixture'); const log = join(directory, 'requests.jsonl');
  await writeFile(executable, `#!${process.execPath}
const {createInterface} = require('node:readline');
const {appendFileSync} = require('node:fs');
const emit = (packet) => process.stdout.write(JSON.stringify(packet)+'\\n');
createInterface({input:process.stdin}).on('line', (line) => {
 const p = JSON.parse(line); if (p.id === undefined) return;
 appendFileSync(${JSON.stringify(log)}, JSON.stringify(p)+'\\n');
 const reply = (result) => emit({id:p.id,result});
 if (p.method==='initialize') return reply({});
 if (p.method==='account/read') return reply({account:{type:'chatgpt'}});
 if (p.method==='modelProvider/capabilities/read') return reply({imageGeneration:true});
 if (p.method==='config/read') return reply({config:{mcp_servers:{unrelated:{}},plugins:{unrelated:{}}}});
 if (p.method==='thread/start') return reply({thread:{id:'image-thread'}});
 if (p.method==='turn/start') {
  reply({turn:{id:'turn-1'}});
  const text=p.params.input[0].text;
  setTimeout(() => {
   if(text.includes('hang')) return;
   if(text.includes('disconnect')) return process.exit(1);
   // Results from other threads must not be imported.
   emit({method:'item/completed',params:{threadId:'other',item:{type:'imageGeneration',status:'completed',result:'INVALID'}}});
   if(!text.includes('no-tool')) emit({method:'item/completed',params:{threadId:'image-thread',item:{type:'imageGeneration',status:'completed',...(text.includes('unsafe-file') ? {savedPath:'/etc/passwd'} : text.includes('saved-file') ? {savedPath:${JSON.stringify(inputPath)}} : {result:${JSON.stringify(bytes.toString('base64'))}})}}});
   else emit({method:'item/completed',params:{threadId:'image-thread',item:{type:'agentMessage',text:'image_gen unavailable'}}});
   emit({method:'turn/completed',params:{threadId:'image-thread',turn:{id:'turn-1',status:'completed'}}});
  },10); return;
 }
 reply({});
});
`);
  await chmod(executable, 0o755);
  const editor = new CodexImages(() => new CodexRpc(executable, true), timeout);
  cleanups.push(async () => editor.close());
  return { directory, inputPath, editor, bytes, log };
}
test('local Codex checks capability and imports native image result using an isolated screenshot turn', async () => {
  const f = await fixture(); expect(await f.editor.status()).toEqual({ configured: true });
  expect(await f.editor.edit(f.bytes, 'remove white dots', f)).toEqual(f.bytes);
  const packets = (await readFile(f.log, 'utf8')).trim().split('\n').map((line) => JSON.parse(line));
  expect(packets.find((p) => p.method === 'initialize').params.capabilities.experimentalApi).toBe(true);
  const thread = packets.find((p) => p.method === 'thread/start').params;
  expect(thread.ephemeral).toBe(true); expect(thread.sandbox).toBe('read-only');
  expect(thread.config['mcp_servers.unrelated.enabled']).toBe(false);
  expect(thread.config['plugins.unrelated.enabled']).toBe(false);
  expect(thread.config['features.image_generation']).toBe(true);
  const turn = packets.find((p) => p.method === 'turn/start').params;
  expect(turn.input[1]).toEqual({ type: 'localImage', path: await import('node:fs/promises').then((fs) => fs.realpath(f.inputPath)) });
  expect(turn.sandboxPolicy.networkAccess).toBe(false);
  expect(turn.outputSchema).toBeUndefined();
});
test('no image tool, disconnect and timeout fail without switching to another provider', async () => {
  const f = await fixture(120);
  await expect(f.editor.edit(f.bytes, 'no-tool', f)).rejects.toThrow('image_gen unavailable');
  await expect(f.editor.edit(f.bytes, 'disconnect', f)).rejects.toThrow('Codex exited');
  await expect(f.editor.edit(f.bytes, 'hang', f)).rejects.toThrow('timed out');
});

test('saved image files are accepted only from task or Codex generated-image directories', async () => {
  const f = await fixture();
  expect(await f.editor.edit(f.bytes, 'saved-file', f)).toEqual(f.bytes);
  await expect(f.editor.edit(f.bytes, 'unsafe-file', f)).rejects.toThrow('outside supported output directories');
});
