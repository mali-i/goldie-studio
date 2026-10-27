import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, join } from "node:path";
import { homedir } from "node:os";

/** GUI apps may add Codex to PATH while an ordinary terminal does not. */
export async function resolveCodexExecutable(explicit?: string): Promise<string> {
  if (explicit) return explicit;
  if (process.platform === "win32") return "codex";
  const candidates = (process.env.PATH ?? "").split(delimiter).filter(Boolean).map((directory) => join(directory, "codex"));
  if (process.platform === "darwin") {
    for (const directory of ["/Applications", join(homedir(), "Applications")]) {
      candidates.push(join(directory, "ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex"));
    }
  }
  for (const candidate of candidates) {
    try { await access(candidate, constants.X_OK); return candidate; } catch { /* Try the next installed location. */ }
  }
  return "codex"; // Spawn reports an actionable missing-runtime error.
}

type Packet = { id?: number | string; method?: string; params?: Record<string, any>; result?: any; error?: { message: string } };
type Pending = { resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> };

/** One stdio connection, owned by Studio, never attached to another client's chat. */
export class CodexRpc {
  private child?: ChildProcessWithoutNullStreams;
  private ready?: Promise<void>;
  private sequence = 0;
  private pending = new Map<number | string, Pending>();
  private listeners = new Set<(packet: Packet) => void>();

  constructor(private executable = process.env.GOLDIE_CODEX_BIN) {}

  async connect() {
    if (!this.ready) {
      this.ready = this.start().catch((error) => { this.close(); throw error; });
    }
    return this.ready;
  }

  private async start() {
    const executable = await resolveCodexExecutable(this.executable);
    // Keep runtime/launcher process-group signals away from Vite and its shell.
    // Detached still uses owned stdio pipes; do not unref the child.
    const child = spawn(executable, ["app-server", "--listen", "stdio://"], {
      stdio: "pipe",
      detached: process.platform !== "win32",
      windowsHide: true,
    });
    this.child = child;
    // Drain diagnostics without exposing credentials or unbounded tool output.
    child.stderr.on("data", () => {});
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      let packet: Packet;
      try { packet = JSON.parse(line); } catch { return; }
      if (packet.id !== undefined && !packet.method) {
        const request = this.pending.get(packet.id);
        if (!request) return;
        clearTimeout(request.timer);
        this.pending.delete(packet.id);
        if (packet.error) request.reject(new Error(packet.error.message));
        else request.resolve(packet.result);
      } else if (packet.method && packet.id !== undefined) {
        // The first version is read-only: never auto-approve an escalation.
        const approval = packet.method.includes("Approval") || packet.method.endsWith("requestApproval");
        child.stdin.write(JSON.stringify(approval
          ? { id: packet.id, result: { decision: "decline" } }
          : { id: packet.id, error: { code: -32601, message: "Studio supports read-only code exploration. Ask questions in the chat reply." } }) + "\n");
      } else {
        for (const listener of this.listeners) listener(packet);
      }
    });
    const failed = (error: Error) => {
      if (this.child !== child) return;
      this.child = undefined;
      this.ready = undefined;
      for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); }
      this.pending.clear();
      for (const listener of this.listeners) listener({ method: "studio/disconnected", params: { message: error.message } });
    };
    child.on("error", () => failed(new Error("Codex could not start. Install Codex CLI or set GOLDIE_CODEX_BIN to its executable.")));
    child.stdin.on("error", () => failed(new Error("Codex disconnected. Reconnect and try again.")));
    child.on("exit", (code, signal) => failed(new Error(`Codex exited${signal ? ` (${signal})` : code === null ? "" : ` (${code})`}. Check the CLI setup and access to its state directory, then reconnect.`)));
    if (!child.pid) throw new Error("Codex could not start. Install Codex CLI or set GOLDIE_CODEX_BIN to its executable.");
    await this.request("initialize", { clientInfo: { name: "goldie_studio", title: "Goldie Studio", version: "0.1.0" } });
    child.stdin.write(JSON.stringify({ method: "initialized" }) + "\n");
  }

  request(method: string, params: unknown = {}): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.child || this.child.stdin.destroyed) return reject(new Error("Codex is disconnected."));
      const id = ++this.sequence;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Codex timed out (${method}).`)); }, 30_000);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, method, params }) + "\n", (error) => {
        if (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
      });
    });
  }

  subscribe(listener: (packet: Packet) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  close() {
    const child = this.child;
    if (!child) return;
    this.child = undefined;
    this.ready = undefined;
    // Node can report a ChildProcess before spawn fails with ENOENT. Its handle
    // still has PID 0: kill() would signal Studio's entire process group.
    if (child.pid !== undefined && child.pid > 0 && child.exitCode === null && child.signalCode === null) child.kill();
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error("Codex connection closed.")); }
    this.pending.clear();
    for (const listener of this.listeners) listener({ method: "studio/disconnected", params: { message: "Codex connection closed." } });
  }
}
