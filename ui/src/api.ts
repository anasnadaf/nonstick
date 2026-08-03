import type { Citation } from "./types";

const TOKEN_KEY = "nonstick_token";

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const token = getToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
  }
}

async function handle<T>(resp: Response): Promise<T> {
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      detail = (await resp.json()).detail ?? detail;
    } catch {
      /* not json */
    }
    throw new ApiError(resp.status, detail);
  }
  if (resp.status === 204) return undefined as T;
  return resp.json();
}

export const api = {
  get: <T>(path: string) =>
    fetch(path, { headers: headers() }).then((r) => handle<T>(r)),
  post: <T>(path: string, body?: unknown) =>
    fetch(path, {
      method: "POST",
      headers: headers({ "Content-Type": "application/json" }),
      body: body === undefined ? undefined : JSON.stringify(body),
    }).then((r) => handle<T>(r)),
  patch: <T>(path: string, body: unknown) =>
    fetch(path, {
      method: "PATCH",
      headers: headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    }).then((r) => handle<T>(r)),
  delete: (path: string) =>
    fetch(path, { method: "DELETE", headers: headers() }).then((r) =>
      handle<void>(r),
    ),
  upload: <T>(path: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return fetch(path, { method: "POST", headers: headers(), body: form }).then(
      (r) => handle<T>(r),
    );
  },
};

export interface StreamHandlers {
  onSession?: (sessionId: string) => void;
  onToken?: (text: string) => void;
  onToolStart?: (tool: string) => void;
  onToolEnd?: (tool: string) => void;
  onCached?: () => void;
  onCitations?: (citations: Citation[]) => void;
  onBlocked?: (reason: string) => void;
  onFinal?: (answer: string, citations: Citation[]) => void;
  onError?: (detail: string) => void;
}

export async function streamChat(
  notebookId: string,
  message: string,
  sessionId: string | null,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const resp = await fetch(`/api/notebooks/${notebookId}/chat`, {
    method: "POST",
    headers: headers({ "Content-Type": "application/json" }),
    body: JSON.stringify({ message, session_id: sessionId }),
    signal,
  });
  if (!resp.ok || !resp.body) {
    let detail = resp.statusText;
    try {
      detail = (await resp.json()).detail ?? detail;
    } catch {
      /* not json */
    }
    handlers.onError?.(detail);
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const dispatch = (block: string) => {
    let event = "";
    let data: Record<string, unknown> = {};
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) event = line.slice(7).trim();
      else if (line.startsWith("data: ")) {
        try {
          data = JSON.parse(line.slice(6));
        } catch {
          /* skip malformed */
        }
      }
    }
    switch (event) {
      case "session":
        handlers.onSession?.(data.session_id as string);
        break;
      case "token":
        handlers.onToken?.(data.text as string);
        break;
      case "tool_start":
        handlers.onToolStart?.(data.tool as string);
        break;
      case "tool_end":
        handlers.onToolEnd?.(data.tool as string);
        break;
      case "cached":
        handlers.onCached?.();
        break;
      case "citations":
        handlers.onCitations?.((data.citations as Citation[]) ?? []);
        break;
      case "blocked":
        handlers.onBlocked?.((data.reason as string) ?? "Blocked");
        break;
      case "final":
        handlers.onFinal?.(
          (data.answer as string) ?? "",
          (data.citations as Citation[]) ?? [],
        );
        break;
      case "error":
        handlers.onError?.((data.detail as string) ?? "Stream error");
        break;
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (block.trim()) dispatch(block);
    }
  }
  if (buffer.trim()) dispatch(buffer);
}
