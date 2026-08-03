import { useEffect, useRef, useState } from "react";
import { api, streamChat } from "../api";
import type { ChatMessage, Citation, ToolActivity } from "../types";
import CitedText from "./CitedText";

interface LiveMessage {
  content: string;
  citations: Citation[];
  tools: ToolActivity[];
  cached: boolean;
  blocked: string | null;
}

export default function ChatPane({
  notebookId,
  hasReadySources,
  onCite,
  onError,
}: {
  notebookId: string;
  hasReadySources: boolean;
  onCite: (c: Citation) => void;
  onError: (msg: string) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [live, setLive] = useState<LiveMessage | null>(null);
  const [streaming, setStreaming] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // resume the latest session for this notebook, if any
    void (async () => {
      try {
        const sessions = await api.get<{ id: string }[]>(
          `/api/notebooks/${notebookId}/sessions`,
        );
        if (sessions.length > 0) {
          setSessionId(sessions[0].id);
          setMessages(
            await api.get<ChatMessage[]>(
              `/api/notebooks/${notebookId}/sessions/${sessions[0].id}/messages`,
            ),
          );
        }
      } catch {
        /* fresh notebook */
      }
    })();
  }, [notebookId]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, live]);

  const send = async () => {
    const message = input.trim();
    if (!message || streaming) return;
    setInput("");
    setStreaming(true);
    setMessages((m) => [
      ...m,
      {
        id: `local-${Date.now()}`,
        role: "user",
        content: message,
        citations: [],
        created_at: new Date().toISOString(),
      },
    ]);
    const draft: LiveMessage = {
      content: "",
      citations: [],
      tools: [],
      cached: false,
      blocked: null,
    };
    setLive({ ...draft });

    await streamChat(notebookId, message, sessionId, {
      onSession: (sid) => setSessionId(sid),
      onToken: (text) => {
        draft.content += text;
        setLive({ ...draft });
      },
      onToolStart: (tool) => {
        draft.tools = [...draft.tools, { tool, running: true }];
        setLive({ ...draft });
      },
      onToolEnd: (tool) => {
        draft.tools = draft.tools.map((t) =>
          t.tool === tool ? { ...t, running: false } : t,
        );
        setLive({ ...draft });
      },
      onCached: () => {
        draft.cached = true;
        setLive({ ...draft });
      },
      onBlocked: (reason) => {
        draft.blocked = reason;
        setLive({ ...draft });
      },
      onCitations: (citations) => {
        draft.citations = citations;
        setLive({ ...draft });
      },
      onFinal: (answer, citations) => {
        draft.content = answer;
        draft.citations = citations;
        setLive({ ...draft });
      },
      onError: (detail) => onError(detail),
    }).catch((e) => onError((e as Error).message));

    setMessages((m) => [
      ...m,
      {
        id: `local-${Date.now()}-a`,
        role: "assistant",
        content: draft.blocked ? `⛔ ${draft.blocked}` : draft.content,
        citations: draft.citations,
        created_at: new Date().toISOString(),
      },
    ]);
    setLive(null);
    setStreaming(false);
  };

  const renderAssistant = (content: string, citations: Citation[]) => (
    <div className="bubble">
      <CitedText text={content} citations={citations} onCite={onCite} />
      {citations.length > 0 && (
        <div className="citation-cards">
          {citations.map((c) => (
            <div key={c.ref} className="citation-card" onClick={() => onCite(c)}>
              <div className="src">
                [{c.ref}] {c.filename ?? c.url}
                {c.page ? ` · p.${c.page}` : ""}
              </div>
              <div className="snip">{c.snippet}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="pane chat">
      <div className="chat-messages">
        {messages.length === 0 && !live && (
          <div className="empty-hint">
            <div className="big">💬</div>
            {hasReadySources
              ? "Ask anything about your sources — answers come with citations."
              : "Add a source on the left, then ask questions about it here."}
          </div>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="msg user">
              {m.content}
            </div>
          ) : (
            <div key={m.id} className="msg assistant">
              {renderAssistant(m.content, m.citations)}
            </div>
          ),
        )}
        {live && (
          <div className="msg assistant">
            {live.tools.some((t) => t.running) && (
              <div className="tool-activity">
                <span className="dot" />
                {live.tools
                  .filter((t) => t.running)
                  .map((t) => t.tool)
                  .join(", ")}
                …
              </div>
            )}
            {live.cached && <span className="badge">cached</span>}
            {live.blocked ? (
              <span className="badge blocked">blocked — {live.blocked}</span>
            ) : (
              (live.content || !live.tools.length) &&
              renderAssistant(live.content || "…", live.citations)
            )}
          </div>
        )}
        <div ref={bottom} />
      </div>
      <div className="chat-input">
        <textarea
          rows={1}
          placeholder="Ask about your sources…"
          value={input}
          disabled={streaming}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button className="primary" disabled={streaming || !input.trim()} onClick={() => void send()}>
          {streaming ? "…" : "Send"}
        </button>
      </div>
    </div>
  );
}
