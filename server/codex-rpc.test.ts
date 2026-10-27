import { afterEach, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

test.skipIf(process.platform === "win32")("a Codex process-group SIGTERM cannot terminate its Studio host", async () => {
  const root = await mkdtemp(join(tmpdir(), "goldie-rpc-signals-"));
  roots.push(root);
  const executable = join(root, "fake-codex.mjs");
  await writeFile(executable, `#!/usr/bin/env node
import { createInterface } from 'node:readline';
createInterface({ input: process.stdin }).on('line', (line) => {
  const packet = JSON.parse(line);
  if (packet.method === 'terminate-group') { process.kill(0, 'SIGTERM'); return; }
  if (packet.id !== undefined) process.stdout.write(JSON.stringify({ id: packet.id, result: {} }) + '\\n');
});
`);
  await chmod(executable, 0o755);
  const harness = join(root, "host.ts");
  await writeFile(harness, `
import { CodexRpc } from ${JSON.stringify(new URL("./codex-rpc.ts", import.meta.url).href)};
const rpc = new CodexRpc(${JSON.stringify(executable)});
try {
  await rpc.connect();
  await rpc.request('terminate-group').catch(() => {});
  await rpc.connect();
  await rpc.request('host-still-running');
  console.log('Studio survived and reconnected');
} finally { rpc.close(); }
`);
  // Isolate the test harness too, so a regression cannot terminate the test runner.
  const host = spawn(process.execPath, [harness], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = ""; let stderr = "";
  host.stdout.on("data", (chunk) => { stdout += chunk; });
  host.stderr.on("data", (chunk) => { stderr += chunk; });
  const timeout = setTimeout(() => { if (host.pid) process.kill(-host.pid, "SIGKILL"); }, 10_000);
  try {
    const exit = await new Promise<{ code: number | null; signal: string | null }>((resolve, reject) => {
      host.on("error", reject);
      host.on("exit", (code, signal) => resolve({ code, signal }));
    });
    expect({ ...exit, stderr }).toEqual({ code: 0, signal: null, stderr: "" });
    expect(stdout).toContain("Studio survived and reconnected");
  } finally { clearTimeout(timeout); }
}, 15_000);

test.skipIf(process.platform === "win32")("missing Codex cannot signal the host under the production Node runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "goldie-rpc-missing-"));
  roots.push(root);
  const harness = join(root, "node-host.mjs");
  // Vite runs in Node even when launched by `bun run dev`. Bundle TS for Node
  // rather than accidentally exercising only Bun's different spawn semantics.
  const { build } = await import("esbuild");
  const result = await build({
    stdin: { contents: `
      import { StudioCodex } from ${JSON.stringify(new URL("./codex.ts", import.meta.url).pathname)};
      import { CodexRpc } from ${JSON.stringify(new URL("./codex-rpc.ts", import.meta.url).pathname)};
      let signals = 0;
      process.on('SIGTERM', () => { signals++; });
      const studio = new StudioCodex(new CodexRpc('/nonexistent/goldie-codex'));
      const status = await studio.status();
      studio.close();
      await new Promise((resolve) => setTimeout(resolve, 100));
      console.log(JSON.stringify({ available: status.available, error: status.error, signals }));
      if (status.available || signals !== 0) process.exitCode = 1;
    `, resolveDir: process.cwd() },
    bundle: true, platform: "node", format: "esm", write: false,
  });
  await writeFile(harness, result.outputFiles[0].text);
  const host = spawn("node", [harness], { detached: true, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = ""; let stderr = "";
  host.stdout.on("data", (chunk) => { stdout += chunk; });
  host.stderr.on("data", (chunk) => { stderr += chunk; });
  const exit = await new Promise<{ code: number | null; signal: string | null }>((resolve, reject) => {
    host.on("error", reject);
    host.on("exit", (code, signal) => resolve({ code, signal }));
  });
  expect({ ...exit, stderr }).toEqual({ code: 0, signal: null, stderr: "" });
  const status = JSON.parse(stdout);
  expect(status.available).toBe(false);
  expect(status.error).toContain("could not start");
  expect(status.signals).toBe(0);
}, 10_000);
