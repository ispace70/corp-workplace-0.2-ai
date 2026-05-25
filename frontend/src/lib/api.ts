import { RouteMode, Source, SqlResult } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8009";

export interface ChatStreamCallbacks {
  onRoute?: (route: string) => void;
  onText?: (chunk: string) => void;
  onSources?: (sources: Source[]) => void;
  onSqlReview?: (sql: string) => void;
  onSqlResult?: (result: SqlResult) => void;
  onDone?: () => void;
  onError?: (err: string) => void;
}

async function _readSSEStream(
  response: Response,
  callbacks: ChatStreamCallbacks,
) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (raw === "[DONE]") {
        callbacks.onDone?.();
        return;
      }
      try {
        const event = JSON.parse(raw);
        switch (event.type) {
          case "route":
            callbacks.onRoute?.(event.content);
            break;
          case "text":
            callbacks.onText?.(event.content);
            break;
          case "sources":
            callbacks.onSources?.(event.content);
            break;
          case "sql_review":
            callbacks.onSqlReview?.(event.content);
            break;
          case "sql_result":
            callbacks.onSqlResult?.(event.content);
            break;
        }
      } catch {
        // ignore parse errors
      }
    }
  }
  callbacks.onDone?.();
}

export async function sendChat(
  message: string,
  mode: RouteMode,
  callbacks: ChatStreamCallbacks,
) {
  try {
    const res = await fetch(`${API_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, mode }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await _readSSEStream(res, callbacks);
  } catch (e: unknown) {
    callbacks.onError?.((e as Error).message);
  }
}

export async function executeSQL(
  sql: string,
  query: string,
  callbacks: ChatStreamCallbacks,
) {
  try {
    const res = await fetch(`${API_URL}/sql/execute`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sql, query }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await _readSSEStream(res, callbacks);
  } catch (e: unknown) {
    callbacks.onError?.((e as Error).message);
  }
}

export async function fetchTables() {
  const res = await fetch(`${API_URL}/db/tables`);
  const data = await res.json();
  return data.tables as { name: string; columns: { name: string; type: string }[] }[];
}

export async function checkHealth() {
  try {
    const res = await fetch(`${API_URL}/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function fetchLLMStatus(): Promise<{ connected: boolean; provider: string }> {
  try {
    const res = await fetch(`${API_URL}/llm-status`, { cache: "no-store" });
    return await res.json();
  } catch {
    return { connected: false, provider: "GCP VM" };
  }
}
