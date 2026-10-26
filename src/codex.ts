/** Public Studio/Codex contract. Credentials never cross this API. */
export type CopyProposal = { headline: string; subhead: string };
export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sceneId: string;
  locale: string;
  device: string;
  status?: "completed" | "interrupted" | "failed";
  proposal?: CopyProposal | null;
};
export type CodexProject = { appRoot: string | null; threadId?: string; messages: ChatMessage[] };
export type CodexStatus = { available: boolean; authenticated: boolean; account: string; error?: string };
export type ChatInput = {
  message: string;
  sceneId: string;
  locale: string;
  device: string;
  headline: string;
  subhead: string;
};
export type ChatEvent =
  | { type: "activity"; text: string }
  | { type: "reply"; message: ChatMessage }
  | { type: "error"; text: string }
  | { type: "done" };

export async function codexJson<T>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const response = await fetch(url, body === undefined ? undefined : {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Codex request failed.");
  return result as T;
}

export async function streamChat(url: string, input: ChatInput, signal: AbortSignal, onEvent: (event: ChatEvent) => void) {
  const response = await fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input), signal,
  });
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error ?? "Could not start conversation.");
  }
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
    if (!completed) throw new Error("Connection lost. Reconnect to recover the saved conversation.");
  } finally { reader.releaseLock(); }
}
