import { useState } from "react";
import { api } from "../api";
import type { Note } from "../types";
import Markdown from "./Markdown";

const KIND_LABEL: Record<string, string> = {
  manual: "note",
  summary: "summary",
  study_guide: "study guide",
  faq: "FAQ",
};

export default function StudioPane({
  notebookId,
  notes,
  hasReadySources,
  onChanged,
  onError,
}: {
  notebookId: string;
  notes: Note[];
  hasReadySources: boolean;
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const [generating, setGenerating] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: "", content_md: "" });

  const generate = async (kind: "summary" | "study_guide" | "faq") => {
    setGenerating(kind);
    try {
      await api.post(`/api/notebooks/${notebookId}/notes/generate`, { kind });
      onChanged();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setGenerating(null);
    }
  };

  const addNote = async () => {
    if (!draft.title.trim()) return;
    try {
      await api.post(`/api/notebooks/${notebookId}/notes`, draft);
      setDraft({ title: "", content_md: "" });
      setAdding(false);
      onChanged();
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const remove = async (id: string) => {
    try {
      await api.delete(`/api/notebooks/${notebookId}/notes/${id}`);
      onChanged();
    } catch (e) {
      onError((e as Error).message);
    }
  };

  return (
    <div className="pane studio">
      <div className="pane-header">
        Studio <span className="spacer" />
        <button className="ghost" title="New note" onClick={() => setAdding((v) => !v)}>
          ＋
        </button>
      </div>
      <div className="studio-actions">
        {(["summary", "study_guide", "faq"] as const).map((kind) => (
          <button
            key={kind}
            disabled={!hasReadySources || generating !== null}
            onClick={() => void generate(kind)}
          >
            {generating === kind ? "Generating…" : `✨ ${KIND_LABEL[kind]}`}
          </button>
        ))}
      </div>
      <div className="pane-body">
        {adding && (
          <div className="note-card">
            <input
              style={{ width: "100%", marginBottom: 8 }}
              placeholder="Note title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <textarea
              style={{ width: "100%", marginBottom: 8 }}
              rows={4}
              placeholder="Markdown content…"
              value={draft.content_md}
              onChange={(e) => setDraft({ ...draft, content_md: e.target.value })}
            />
            <button className="primary" onClick={() => void addNote()}>
              Save note
            </button>
          </div>
        )}
        {notes.map((n) => (
          <div
            key={n.id}
            className={`note-card${expanded === n.id ? " expanded" : ""}`}
          >
            <div className="note-head">
              <h4>{n.title}</h4>
              <span className="badge">{KIND_LABEL[n.kind] ?? n.kind}</span>
              <button
                className="ghost"
                title={expanded === n.id ? "Collapse" : "Expand"}
                onClick={() => setExpanded(expanded === n.id ? null : n.id)}
              >
                {expanded === n.id ? "–" : "⤢"}
              </button>
              <button className="ghost" title="Delete" onClick={() => void remove(n.id)}>
                ✕
              </button>
            </div>
            <Markdown text={n.content_md} />
          </div>
        ))}
        {notes.length === 0 && !adding && (
          <p style={{ color: "var(--text-dim)", fontSize: 13, textAlign: "center" }}>
            Generate a summary, study guide or FAQ from your sources — or add your
            own notes.
          </p>
        )}
      </div>
    </div>
  );
}
