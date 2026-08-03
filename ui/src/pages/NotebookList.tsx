import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { Notebook } from "../types";

const EMOJIS = ["📓", "📚", "🧪", "🧠", "📈", "🗂️", "🔭", "⚗️", "🧬", "🌍"];

export default function NotebookList({ onError }: { onError: (m: string) => void }) {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const navigate = useNavigate();

  const load = () =>
    api
      .get<Notebook[]>("/api/notebooks")
      .then(setNotebooks)
      .catch((e) => onError((e as Error).message));

  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    if (!title.trim()) return;
    try {
      const emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
      const nb = await api.post<Notebook>("/api/notebooks", { title: title.trim(), emoji });
      navigate(`/notebook/${nb.id}`);
    } catch (e) {
      onError((e as Error).message);
    }
  };

  const remove = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Delete this notebook and all its documents?")) return;
    try {
      await api.delete(`/api/notebooks/${id}`);
      void load();
    } catch (err) {
      onError((err as Error).message);
    }
  };

  return (
    <div className="notebook-grid-page">
      <h1>Your notebooks</h1>
      <div className="notebook-grid">
        {creating ? (
          <div className="notebook-card">
            <input
              autoFocus
              style={{ width: "100%" }}
              placeholder="Notebook title…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void create();
                if (e.key === "Escape") setCreating(false);
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="primary" onClick={() => void create()}>
                Create
              </button>
              <button onClick={() => setCreating(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <div className="notebook-card new" onClick={() => setCreating(true)}>
            ＋ New notebook
          </div>
        )}
        {notebooks.map((nb) => (
          <div
            key={nb.id}
            className="notebook-card"
            onClick={() => navigate(`/notebook/${nb.id}`)}
          >
            <button className="ghost delete" onClick={(e) => void remove(e, nb.id)}>
              ✕
            </button>
            <div className="emoji">{nb.emoji}</div>
            <h3>{nb.title}</h3>
            <div className="meta">
              {nb.source_count} source{nb.source_count === 1 ? "" : "s"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
