import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexRpc } from "./codex-rpc";
import { assertLocalRequest, checkedAppRoot, parseReply, readCodexProject, StudioCodex, validateChatInput } from "./codex";
import { workspaceService } from "./workspace";
import type { ChatInput } from "../src/codex";

const cleanups: Array<() => Promise<unknown> | void> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });

const input: ChatInput = { message: "Explain the benefit", sceneId: "scene-1", device: "iphone-6.9", locale: "en-US", headline: "Unsaved headline", subhead: "Unsaved subhead" };

async function setup(pickDirectory?: () => Promise<string | null>) {
  const root = await mkdtemp(join(tmpdir(), "goldie-codex-test-"));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const app = join(root, "app");
  await mkdir(app);
  const executable = join(root, "fake-codex.mjs");
  const log = join(root, "requests.jsonl");
  // Real stdio transport, deterministic server. No model access or credentials.
  await writeFile(executable, `#!/usr/bin/env node
import { createInterface } from "node:readline";
import { appendFileSync } from "node:fs";
const emit = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
let thread = 0, current;
createInterface({ input: process.stdin }).on("line", (line) => {
  const packet = JSON.parse(line);
  appendFileSync(${JSON.stringify(log)}, line + "\\n");
  if (packet.id === undefined) return;
  const { id, method, params } = packet;
  const reply = (result) => emit({ id, result });
  if (method === "initialize") return reply({});
  if (method === "account/read") return reply({ account: { type: "chatgpt", email: "test@example.com" } });
  if (method === "config/read") return reply({ config: { mcp_servers: { external: {} }, plugins: { external: {} } } });
  if (method === "thread/start") return reply({ thread: { id: "thread-" + (++thread) } });
  if (method === "thread/resume") return reply({ thread: { id: params.threadId } });
  if (method === "turn/interrupt") {
    reply({});
    emit({ method: "turn/completed", params: { threadId: params.threadId, turn: { id: params.turnId, status: "interrupted" } } });
    return;
  }
  if (method === "turn/start") {
    current = params.threadId;
    reply({ turn: { id: "turn-1" } });
    emit({ method: "turn/started", params: { threadId: current, turn: { id: "turn-1" } } });
    emit({ method: "item/started", params: { threadId: current, item: { id: "cmd", type: "commandExecution", command: "rg stats src" } } });
    if (params.input[0].text.includes("wait for stop")) return;
    setTimeout(() => {
      const failed = params.input[0].text.includes("fail turn");
      const text = JSON.stringify({ reply: "Verified the statistics feature.", proposal: { headline: "See your progress", subhead: "Find patterns over time" } });
      emit({ method: "item/agentMessage/delta", params: { threadId: current, itemId: "final", delta: text } });
      emit({ method: "item/completed", params: { threadId: current, item: { id: "final", type: "agentMessage", text } } });
      emit({ method: "turn/completed", params: { threadId: current, turn: { id: "turn-1", status: failed ? "failed" : "completed", error: failed ? { message: "Model unavailable" } : null } } });
    }, 20);
    return;
  }
  reply({});
});
`);
  await chmod(executable, 0o755);
  const agent = new StudioCodex(new CodexRpc(executable), pickDirectory);
  cleanups.push(() => agent.close());
  const alpha = await workspaceService.createProject(root, "Alpha");
  const beta = await workspaceService.createProject(root, "Beta");
  const server = createServer(async (req, res) => {
    try {
      const [, id, action] = (req.url ?? "").split("/");
      const detail = id === "Alpha" ? alpha : beta;
      let data = "";
      for await (const chunk of req) data += chunk;
      await agent.handle(req, res, join(root, detail.project.id), detail, action, async () => JSON.parse(data || "{}"));
    } catch (error) { res.statusCode = 400; res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: (error as Error).message })); }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  cleanups.push(() => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }));
  const port = (server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  const request = (url: string, body?: unknown, method = "POST") => fetch(base + url, body === undefined ? undefined : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { root, app, log, agent, alpha, beta, server, request };
}

describe("Studio Codex", () => {
  test("creates isolated chats, restores history and source links, and resumes their own threads", async () => {
    const { request, app, root, log } = await setup();
    await request("/Alpha", { appRoot: app }, "PUT");
    await (await request("/Alpha/turn", input)).text();
    const first = await (await request("/Alpha")).json();
    const second = await (await request("/Alpha/sessions", {})).json();
    expect(second.activeSessionId).not.toBe(first.activeSessionId);
    expect(second.appRoot).toBe(first.appRoot);
    expect(second.messages).toEqual([]);
    expect(second.threadId).toBeUndefined();
    expect(second.sessions).toHaveLength(2);
    expect(second.sessions[0].messages).toEqual(first.messages);
    const stale = await request("/Alpha/turn", { ...input, sessionId: first.activeSessionId });
    expect(stale.status).toBe(400);
    await (await request("/Alpha/turn", { ...input, message: "Second chat", sessionId: second.activeSessionId })).text();
    const savedSecond = await readCodexProject(join(root, "Alpha"));
    expect(savedSecond.threadId).not.toBe(first.threadId);
    await request("/Alpha", { appRoot: null }, "PUT");
    const restored = await (await request("/Alpha/sessions", { sessionId: first.activeSessionId })).json();
    expect(restored.messages).toEqual(first.messages);
    expect(restored.appRoot).toBe(first.appRoot);
    expect(restored.threadId).toBe(first.threadId);
    await (await request("/Alpha/turn", { ...input, sessionId: first.activeSessionId })).text();
    const packets = (await readFile(log, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(packets.filter((packet) => packet.method === "thread/start")).toHaveLength(2);
    expect(packets.filter((packet) => packet.method === "thread/resume").at(-1).params.threadId).toBe(first.threadId);
    const disk = await readCodexProject(join(root, "Alpha"));
    expect(disk.messages).toHaveLength(4);
    expect(disk.sessions?.[1]?.messages).toHaveLength(2);
    expect(disk.sessions?.[1]?.appRoot).toBeNull();
    expect((await request("/Alpha/sessions", { sessionId: "missing" })).status).toBe(400);
    expect((await (await request("/Beta")).json()).sessions).toHaveLength(1);
  });

  test("migrates a legacy chat without losing its thread or messages", async () => {
    const { request, root } = await setup();
    const legacy = { appRoot: null, threadId: "existing-thread", messages: [{ id: "old", role: "user", text: "Original chat", sceneId: input.sceneId, locale: input.locale, device: input.device }] };
    await writeFile(join(root, "Alpha", "goldie.codex.json"), JSON.stringify(legacy));
    const original = await (await request("/Alpha")).json();
    expect(original.messages).toEqual(legacy.messages);
    expect(original.threadId).toBe(legacy.threadId);
    await request("/Alpha/sessions", {});
    const restored = await (await request("/Alpha/sessions", { sessionId: original.activeSessionId })).json();
    expect(restored.messages).toEqual(legacy.messages);
    expect(restored.threadId).toBe(legacy.threadId);
    const disk = JSON.parse(await readFile(join(root, "Alpha", "goldie.codex.json"), "utf8"));
    expect(disk.sessions).toHaveLength(1);
    expect(disk.messages).toBeUndefined();
  });

  test("reuses empty chats until a message is accepted and drops abandoned drafts", async () => {
    const { request, root } = await setup();
    const initial = await (await request("/Alpha")).json();
    for (let count = 0; count < 3; count++) {
      const empty = await (await request("/Alpha/sessions", {})).json();
      expect(empty.activeSessionId).toBe(initial.activeSessionId);
      expect(empty.sessions).toHaveLength(1);
    }
    // Rejected sends must not turn an empty draft into saved history.
    expect((await request("/Alpha/turn", { ...input, message: "" })).status).toBe(400);
    const retry = await (await request("/Alpha/sessions", {})).json();
    expect(retry.activeSessionId).toBe(initial.activeSessionId);
    await (await request("/Alpha/turn", { ...input, sessionId: retry.activeSessionId })).text();
    const next = await (await request("/Alpha/sessions", {})).json();
    expect(next.activeSessionId).not.toBe(initial.activeSessionId);
    expect(next.sessions).toHaveLength(2);
    const repeated = await (await request("/Alpha/sessions", {})).json();
    expect(repeated.activeSessionId).toBe(next.activeSessionId);
    expect(repeated.sessions).toHaveLength(2);
    await request("/Alpha/sessions", { sessionId: initial.activeSessionId });
    const saved = JSON.parse(await readFile(join(root, "Alpha", "goldie.codex.json"), "utf8"));
    expect(saved.sessions).toHaveLength(1);
    expect(saved.sessions[0].messages).toHaveLength(2);
  });

  test("cleans up old duplicate empty chats while preserving populated chats", async () => {
    const { request, root } = await setup();
    await (await request("/Alpha/turn", input)).text();
    const file = join(root, "Alpha", "goldie.codex.json");
    const saved = JSON.parse(await readFile(file, "utf8"));
    const template = { ...saved.sessions[0], threadId: undefined, messages: [], title: "New chat" };
    saved.sessions.push({ ...template, id: "empty-1" }, { ...template, id: "empty-2" });
    saved.activeSessionId = "empty-2";
    await writeFile(file, JSON.stringify(saved));
    const result = await (await request("/Alpha/sessions", {})).json();
    expect(result.sessions).toHaveLength(2);
    expect(result.sessions.filter((session: { messages: unknown[] }) => !session.messages.length)).toHaveLength(1);
    expect(result.sessions[0].messages).toHaveLength(2);
    expect(JSON.parse(await readFile(file, "utf8")).sessions).toHaveLength(2);
  });

  test("validates picked directories without changing the source link until saved", async () => {
    let selection: string | null = null;
    const { request, app } = await setup(async () => selection);
    selection = app;
    const picked = await (await request("/Alpha/pick-directory", {})).json();
    expect(picked.appRoot).toBe(await realpath(app));
    expect((await (await request("/Alpha")).json()).appRoot).toBeNull();
    await request("/Alpha", picked, "PUT");
    selection = null;
    expect(await (await request("/Alpha/pick-directory", {})).json()).toEqual({ appRoot: null });
    expect((await (await request("/Alpha")).json()).appRoot).toBe(await realpath(app));
    selection = "/";
    expect((await request("/Alpha/pick-directory", {})).status).toBe(400);
    expect((await (await request("/Alpha")).json()).appRoot).toBe(await realpath(app));
  });

  test("reports missing runtimes without crashing or hanging", async () => {
    const agent = new StudioCodex(new CodexRpc("/nonexistent/goldie-codex"));
    cleanups.push(() => agent.close());
    const status = await agent.status();
    expect(status.available).toBe(false);
    expect(status.error).toContain("could not start");
  });
  test("streams tool activity, attaches actual screenshots and unsaved copy, and resumes isolated project chats", async () => {
    const { request, app, root, log, alpha } = await setup();
    expect((await (await request("/Alpha/status")).json()).authenticated).toBe(true);
    await request("/Alpha", { appRoot: app }, "PUT");
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    await workspaceService.saveScreenshot(root, "Alpha", { ...input, mimeType: "image/png", base64: png });
    // The HTTP fixture's project detail must see the newly uploaded source.
    Object.assign(alpha, await workspaceService.readProject(root, "Alpha"));
    const first = await (await request("/Alpha/turn", input)).text();
    expect(first).toContain("rg stats src");
    expect(first).toContain("See your progress");
    expect(first).toContain('"type":"done"');
    const state = await readCodexProject(join(root, "Alpha"));
    expect(state.messages).toHaveLength(2);
    expect(state.messages[1]?.proposal?.headline).toBe("See your progress");
    await request("/Alpha/turn", { ...input, message: "Another direction" }).then((response) => response.text());
    expect((await readCodexProject(join(root, "Alpha"))).messages).toHaveLength(4);
    expect((await (await request("/Beta")).json()).messages).toHaveLength(0);
    const packets = (await readFile(log, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(packets.filter((packet) => packet.method === "thread/start")).toHaveLength(1);
    expect(packets.some((packet) => packet.method === "thread/resume")).toBe(true);
    const start = packets.find((packet) => packet.method === "thread/start");
    expect(start.params.cwd).toBe(await realpath(app));
    expect(start.params.sandbox).toBe("read-only");
    expect(start.params.approvalPolicy).toBe("never");
    expect(start.params.config["mcp_servers.external.enabled"]).toBe(false);
    expect(start.params.config["plugins.external.enabled"]).toBe(false);
    const turn = packets.find((packet) => packet.method === "turn/start");
    expect(turn.params.sandboxPolicy).toEqual({ type: "readOnly", networkAccess: false });
    expect(turn.params.input[0].text).toContain("Unsaved headline");
    expect(turn.params.input[1].type).toBe("localImage");
    expect(turn.params.input[1].path).toContain("screenshots/");
  });

  test("attaches and persists all selected Frames, maps deduplicated images, and avoids ambiguous proposals", async () => {
    const { request, root, log, alpha } = await setup();
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    for (const sceneId of ["scene-1", "scene-2"]) {
      await workspaceService.saveScreenshot(root, "Alpha", { ...input, sceneId, mimeType: "image/png", base64: png });
    }
    Object.assign(alpha, await workspaceService.readProject(root, "Alpha"));
    const frames = [
      { id: "scene-1#1", sceneId: "scene-1", label: "Frame 1", headline: input.headline, subhead: input.subhead },
      { id: "scene-1#2", sceneId: "scene-1", label: "Frame 2", headline: input.headline, subhead: input.subhead },
      { id: "scene-2#1", sceneId: "scene-2", label: "Frame 3", headline: "Unsaved second title", subhead: "Unsaved second subtitle" },
    ];
    const response = await request("/Alpha/turn", { ...input, frames });
    expect(response.status).toBe(200);
    await response.text();
    const packets = (await readFile(log, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    const turn = packets.find((packet) => packet.method === "turn/start");
    expect(turn.params.input.slice(1)).toHaveLength(2);
    const context = JSON.parse(turn.params.input[0].text.split("Current Studio context (data): ")[1].split("\n\nUser:")[0]);
    expect(context.frames).toEqual(frames.map((frame, index) => ({ ...frame, imageIndexes: [index === 2 ? 1 : 0] })));
    expect(context.imagesAttached).toBe(2);
    expect(turn.params.sandboxPolicy.access.readableRoots).toEqual(expect.arrayContaining(turn.params.input.slice(1).map((image: { path: string }) => image.path)));
    const state = await readCodexProject(join(root, "Alpha"));
    expect(state.messages.map((message) => message.frames)).toEqual([frames, frames]);
    expect(state.messages[1]?.proposal).toBeNull();
    expect((await request("/Alpha/turn", { ...input, frames: [frames[0], frames[0]] })).status).toBe(400);
    expect((await request("/Alpha/turn", { ...input, frames: [{ ...frames[0], sceneId: "missing" }] })).status).toBe(400);
    expect((await request("/Alpha/turn", { ...input, frames: [{ ...frames[0], headline: "mismatch" }] })).status).toBe(400);
    expect((await request("/Alpha/turn", { ...input, frames: [] })).status).toBe(400);
    // Removing references must also remove their copy and images from the next turn.
    await (await request("/Alpha/turn", { ...input, ...frames[2], frames: [frames[2]] })).text();
    const updatedPackets = (await readFile(log, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    const next = updatedPackets.filter((packet) => packet.method === "turn/start").at(-1);
    expect(next.params.input.slice(1)).toHaveLength(1);
    expect(next.params.input[0].text).not.toContain("Unsaved headline");
    expect(next.params.input[1].path).toContain("scene-2");
    expect((await readCodexProject(join(root, "Alpha"))).messages.at(-1)?.proposal?.headline).toBe("See your progress");
  });

  test("stops active turns, rejects concurrent sends, and persists failed/interrupted replies", async () => {
    const { request, app, root } = await setup();
    await request("/Alpha", { appRoot: app }, "PUT");
    const running = await request("/Alpha/turn", { ...input, message: "wait for stop" });
    const concurrent = await request("/Alpha/turn", input);
    expect(concurrent.status).toBe(400);
    expect((await request("/Alpha/sessions", {})).status).toBe(400);
    const active = await (await request("/Alpha")).json();
    expect((await request("/Alpha/sessions", { sessionId: active.activeSessionId })).status).toBe(400);
    const change = await request("/Alpha", { appRoot: null }, "PUT");
    expect(change.status).toBe(400);
    await request("/Alpha/stop", {});
    expect(await running.text()).toContain("Reply stopped.");
    const state = await readCodexProject(join(root, "Alpha"));
    expect(state.messages[1]?.status).toBe("interrupted");
    const failed = await (await request("/Alpha/turn", { ...input, message: "fail turn" })).text();
    expect(failed).toContain("Model unavailable");
    expect((await readCodexProject(join(root, "Alpha"))).messages.at(-1)?.status).toBe("failed");
  });

  test("rejects invalid context and resets history when changing the codebase", async () => {
    const { request, app, root } = await setup();
    expect((await request("/Alpha", { appRoot: "relative/path" }, "PUT")).status).toBe(400);
    await request("/Alpha", { appRoot: app }, "PUT");
    expect((await request("/Alpha/turn", { ...input, sceneId: "missing" })).status).toBe(400);
    await (await request("/Alpha/turn", input)).text();
    await request("/Alpha", { appRoot: root }, "PUT");
    const state = await readCodexProject(join(root, "Alpha"));
    expect(state.messages).toHaveLength(0);
    expect(state.threadId).toBeUndefined();
  });

  test("preserves the conversation when linking, unlinking, and relinking the same app", async () => {
    const { request, app, root, log } = await setup();
    await (await request("/Alpha/turn", input)).text();
    const original = await readCodexProject(join(root, "Alpha"));
    expect(original.messages).toHaveLength(2);
    let expectedMessages = 2;
    for (const appRoot of [app, null, app]) {
      const response = await request("/Alpha", { appRoot }, "PUT");
      expect(response.status).toBe(200);
      const linked = await readCodexProject(join(root, "Alpha"));
      expect(linked.threadId).toBe(original.threadId);
      expect(linked.messages).toHaveLength(expectedMessages);
      await (await request("/Alpha/turn", input)).text();
      expectedMessages += 2;
      expect((await readCodexProject(join(root, "Alpha"))).messages).toHaveLength(expectedMessages);
    }
    const packets = (await readFile(log, "utf8")).trim().split("\n").map((line) => JSON.parse(line));
    expect(packets.filter((packet) => packet.method === "thread/start")).toHaveLength(1);
    const turns = packets.filter((packet) => packet.method === "turn/start");
    for (const index of [0, 2]) {
      const turn = turns[index].params;
      expect(turn.cwd).toBe(await realpath(join(root, "Alpha", ".codex-context")));
      expect(turn.sandboxPolicy.access).toEqual({ type: "restricted", includePlatformDefaults: false, readableRoots: [turn.cwd] });
      expect(JSON.parse(turn.input[0].text.split("\n")[0].replace("Current Studio context (data): ", "")).appSourceDirectory).toBeNull();
    }
    expect(turns[1].params.cwd).toBe(await realpath(app));
    expect(turns[3].params.cwd).toBe(await realpath(app));
  });

  test("remembers the prior app across unlinking and starts a fresh conversation for another app", async () => {
    const { request, app, root } = await setup();
    await request("/Alpha", { appRoot: app }, "PUT");
    await (await request("/Alpha/turn", input)).text();
    await request("/Alpha", { appRoot: null }, "PUT");
    await (await request("/Alpha/turn", input)).text();
    await request("/Alpha", { appRoot: root }, "PUT");
    const state = await readCodexProject(join(root, "Alpha"));
    expect(state.messages).toHaveLength(0);
    expect(state.threadId).toBeUndefined();
    expect(state.appRoot).toBe(await realpath(root));
    expect(state.sessions).toHaveLength(2);
    expect(state.sessions?.[0]?.messages).toHaveLength(4);
  });

  test("rejects remote hosts and cross-origin access before calling the runtime", () => {
    const local = { socket: { remoteAddress: "127.0.0.1" }, headers: { host: "localhost:4321", origin: "http://localhost:4321" } };
    expect(() => assertLocalRequest(local as any)).not.toThrow();
    expect(() => assertLocalRequest({ ...local, headers: { host: "localhost:4321", origin: "https://evil.example" } } as any)).toThrow("Cross-origin");
    expect(() => assertLocalRequest({ ...local, headers: { host: "evil.example" } } as any)).toThrow("localhost");
    expect(() => assertLocalRequest({ ...local, socket: { remoteAddress: "192.168.1.2" } } as any)).toThrow("only on this computer");
  });

  test("validates code directories and copy proposals", async () => {
    const { app, alpha } = await setup();
    expect(await checkedAppRoot(app)).toBe(await realpath(app));
    expect(checkedAppRoot("/")).rejects.toThrow("filesystem root");
    expect(() => validateChatInput({ ...input, locale: "missing" }, alpha)).toThrow("configured");
    expect(() => parseReply('{"reply":"hello","proposal":{"headline":42}}')).toThrow("invalid copy");
    expect(parseReply('{"reply":"hello","proposal":null}')).toEqual({ reply: "hello", proposal: null });
  });
});
