import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { codexJson, CodexRequestError, streamChat, type ChatInput } from "./codex";

let mock: ReturnType<typeof spyOn> | undefined;
afterEach(() => { mock?.mockRestore(); });

describe("Codex service diagnostics", () => {
  test("explains failed fetches as a local Studio connection problem", async () => {
    mock = spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    const error = await codexJson("/api/projects/app/codex/status").catch((error) => error);
    expect(error).toBeInstanceOf(CodexRequestError);
    expect(error.kind).toBe("network");
    expect(error.message).toContain("local Studio service");
    expect(error.message).toContain("including the port");
  });

  test("identifies a frontend served without its API backend", async () => {
    mock = spyOn(globalThis, "fetch").mockResolvedValue(new Response("<!doctype html><html>Studio</html>", { headers: { "Content-Type": "text/html" } }));
    const error = await codexJson("/api/projects/app/codex/status").catch((error) => error);
    expect(error.kind).toBe("backend");
    expect(error.message).toContain("bun run dev");
  });

  test("keeps backend errors separate from transport failures", async () => {
    mock = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: "Stop the active reply before reconnecting." }, { status: 409 }));
    const error = await codexJson("/api/projects/app/codex/reconnect", {}).catch((error) => error);
    expect(error.kind).toBe("http");
    expect(error.message).toContain("Stop the active reply");
  });

  test("does not mistake a Codex startup failure for an unreachable Studio service", async () => {
    mock = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ available: false, authenticated: false, account: "", error: "Codex could not start." }));
    expect(await codexJson("/api/projects/app/codex/status")).toEqual({ available: false, authenticated: false, account: "", error: "Codex could not start." });
  });

  test("reports a dropped chat stream and preserves user cancellation", async () => {
    const input: ChatInput = { message: "Hello", sceneId: "scene-1", device: "iphone-6.9", locale: "en-US", headline: "", subhead: "" };
    mock = spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"type":"activity","text":"Thinking"}\n', { headers: { "Content-Type": "application/x-ndjson" } }));
    const error = await streamChat("/turn", input, new AbortController().signal, () => {}).catch((error) => error);
    expect(error.kind).toBe("network");
    expect(error.message).toContain("connection lost");
    const controller = new AbortController();
    controller.abort();
    mock.mockRejectedValue(controller.signal.reason);
    const aborted = await streamChat("/turn", input, controller.signal, () => {}).catch((error) => error);
    expect(aborted.name).toBe("AbortError");
  });
});
