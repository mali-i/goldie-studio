/** Public Studio/Codex contract. Credentials never cross this API. */
export type CopyProposal = { headline: string; subhead: string };
export type ChatFrameContext = { id: string; sceneId: string; label: string; headline: string; subhead: string };
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sceneId: string;
  locale: string;
  device: string;
  frames?: ChatFrameContext[];
  status?: "completed" | "interrupted" | "failed";
  proposal?: CopyProposal | null;
};
export type CodexProject = { appRoot: string | null; lastAppRoot?: string; threadId?: string; messages: ChatMessage[] };
export type CodexStatus = { available: boolean; authenticated: boolean; account: string; error?: string };
export type ChatInput = {
  message: string;
  sceneId: string;
  locale: string;
  device: string;
  headline: string;
  subhead: string;
  frames?: ChatFrameContext[];
};
export type ChatEvent =
  | { type: "activity"; text: string }
  | { type: "reply"; message: ChatMessage }
  | { type: "error"; text: string }
  | { type: "done" };

export class CodexRequestError extends Error {
  constructor(message: string, readonly kind: "network" | "backend" | "http") {
    super(message);
    this.name = "CodexRequestError";
  }
}

async function fetchStudio(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (init?.signal?.aborted && init.signal.reason?.name !== "TimeoutError") throw error;
    throw new CodexRequestError(
      `Cannot reach the local Studio service. Check that it is running and that this page uses the Local URL printed by bun run dev (including the port). Then retry.`,
      "network",
    );
  }
}

async function responseJson(response: Response): Promise<any> {
  const contentType = response.headers.get("Content-Type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new CodexRequestError(
      "The Studio backend is unavailable at this address. Start bun run dev in the Goldie Studio directory and open the Local URL printed in the terminal.",
      "backend",
    );
  }
  let result;
  try { result = await response.json(); }
  catch {
    throw new CodexRequestError("The local Studio service returned an incomplete response. Check the terminal and retry.", "backend");
  }
  if (!response.ok) throw new CodexRequestError(result.error ?? `Studio request failed (${response.status}).`, "http");
  return result;
}

export async function codexJson<T>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const response = await fetchStudio(url, {
    ...(body === undefined ? {} : { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(45_000),
  });
  return await responseJson(response) as T;
}

export async function streamChat(url: string, input: ChatInput, signal: AbortSignal, onEvent: (event: ChatEvent) => void) {
  const response = await fetchStudio(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input), signal,
  });
  if (!response.ok) {
    await responseJson(response);
  }
  if (!response.headers.get("Content-Type")?.includes("application/x-ndjson")) throw new CodexRequestError("The Studio chat backend is unavailable at this address. Open the Local URL printed by bun run dev.", "backend");
  if (!response.body) throw new Error("Streaming responses are unavailable.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as ChatEvent;
        if (event.type === "done") completed = true;
        onEvent(event);
      }
      if (chunk.done) break;
    }
    if (!completed) throw new CodexRequestError("Studio connection lost. Check that the local service is running, then retry to recover the saved conversation.", "network");
  } catch (error) {
    if (!signal.aborted && error instanceof TypeError) throw new CodexRequestError("Studio connection lost while receiving the reply. Check the local service and retry.", "network");
    throw error;
  } finally { reader.releaseLock(); }
}
