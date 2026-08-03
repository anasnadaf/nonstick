import { useEffect, useRef, useState } from "react";
import { CornerDownLeft } from "lucide-react";
import { toast } from "sonner";

import { api, streamChat } from "@/api";
import CitedText from "@/components/CitedText";
import { Pane } from "@/components/Pane";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChatMessage, Citation, ToolActivity } from "@/types";

interface LiveMessage {
  content: string;
  citations: Citation[];
  tools: ToolActivity[];
  cached: boolean;
  blocked: string | null;
}

/** Speaker rule — the transcript device that replaces chat bubbles. */
function Speaker({ who }: { who: string }) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="label text-copper">{who}</span>
      <span className="h-px flex-1 bg-rule" />
    </div>
  );
}

export default function ChatPane({
  notebookId,
  hasReadySources,
  onCite,
}: {
  notebookId: string;
  hasReadySources: boolean;
  onCite: (c: Citation) => void;
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
      onError: (detail) => toast.error(detail),
    }).catch((e) => toast.error((e as Error).message));

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
    <>
      <CitedText text={content} citations={citations} onCite={onCite} />
      {citations.length > 0 && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {citations.map((c) => (
            <button
              key={c.ref}
              type="button"
              className="border-l-2 border-rule-strong py-1 pl-3 text-left transition-colors hover:border-copper"
              onClick={() => onCite(c)}
            >
              <span className="label mb-1 flex items-center gap-2">
                <span className="text-copper">[{c.ref}]</span>
                <span className="truncate normal-case tracking-normal">
                  {c.filename ?? c.url}
                </span>
                {c.page && <span className="tnum shrink-0">p.{c.page}</span>}
              </span>
              <span className="line-clamp-3 text-[12px] leading-relaxed text-ink-muted">
                {c.snippet}
              </span>
            </button>
          ))}
        </div>
      )}
    </>
  );

  return (
    <Pane>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[68ch] flex-col gap-10 px-6 py-10">
          {messages.length === 0 && !live && (
            <div className="pt-16 text-center">
              <p className="font-display text-2xl font-medium">
                {hasReadySources
                  ? "Ask your sources something."
                  : "Add a document to begin."}
              </p>
              <p className="mx-auto mt-3 max-w-[38ch] text-[14px] leading-relaxed text-ink-muted">
                {hasReadySources
                  ? "Answers arrive with numbered markers. Each one opens the passage it came from."
                  : "Drop a PDF, DOCX, Markdown or text file into the sources pane and it will be indexed in seconds."}
              </p>
            </div>
          )}

          {messages.map((m) => (
            <article key={m.id}>
              <Speaker who={m.role === "user" ? "you" : "nonstick"} />
              {m.role === "user" ? (
                <p className="text-[15px] leading-relaxed whitespace-pre-wrap">
                  {m.content}
                </p>
              ) : (
                renderAssistant(m.content, m.citations)
              )}
            </article>
          ))}

          {live && (
            <article>
              <Speaker who="nonstick" />

              {live.tools.some((t) => t.running) && (
                <p className="label mb-3 flex items-center gap-2">
                  <span className="size-1.5 animate-pulse rounded-[1px] bg-copper" />
                  {live.tools
                    .filter((t) => t.running)
                    .map((t) => t.tool)
                    .join(" · ")}
                </p>
              )}

              {live.cached && (
                <Badge variant="copper" className="mb-3">
                  cached
                </Badge>
              )}

              {live.blocked ? (
                <Badge variant="destructive">blocked — {live.blocked}</Badge>
              ) : (
                (live.content || !live.tools.length) &&
                renderAssistant(live.content || "…", live.citations)
              )}
            </article>
          )}

          <div ref={bottom} />
        </div>
      </div>

      <div className="shrink-0 border-t border-rule px-6 py-4">
        <div className="mx-auto flex max-w-[68ch] items-end gap-3">
          <Textarea
            rows={1}
            className="max-h-40 min-h-9 flex-1 resize-none border-0 border-b border-rule px-0 focus-visible:border-copper"
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
          <Button
            size="icon"
            aria-label="Send"
            disabled={streaming || !input.trim()}
            onClick={() => void send()}
          >
            <CornerDownLeft />
          </Button>
        </div>
      </div>
    </Pane>
  );
}
