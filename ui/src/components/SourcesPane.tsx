import { useRef, useState } from "react";
import { api } from "../api";
import type { Source } from "../types";

const ICONS: Record<string, string> = {
  ".pdf": "📕",
  ".docx": "📘",
  ".md": "📝",
  ".markdown": "📝",
  ".txt": "📄",
};

function icon(filename: string) {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return ICONS[ext] ?? "📄";
}

function fmtSize(bytes: number) {
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function SourcesPane({
  notebookId,
  sources,
  highlightId,
  onChanged,
  onError,
}: {
  notebookId: string;
  sources: Source[];
  highlightId: string | null;
  onChanged: () => void;
  onError: (msg: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);

  const uploadFiles = async (files: FileList | File[]) => {
    setBusy(true);
    for (const file of Array.from(files)) {
      try {
        await api.upload(`/api/notebooks/${notebookId}/sources`, file);
      } catch (e) {
        onError(`${file.name}: ${(e as Error).message}`);
      }
    }
    setBusy(false);
    onChanged();
  };

  const remove = async (id: string) => {
    try {
      await api.delete(`/api/notebooks/${notebookId}/sources/${id}`);
      onChanged();
    } catch (e) {
      onError((e as Error).message);
    }
  };

  return (
    <div className="pane sources">
      <div className="pane-header">
        Sources <span className="spacer" />
        <span className="badge">{sources.length}</span>
      </div>
      <div className="pane-body">
        <div
          className={`upload-zone${drag ? " drag" : ""}`}
          onClick={() => fileInput.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void uploadFiles(e.dataTransfer.files);
          }}
        >
          {busy ? "Uploading…" : "＋ Add PDF, DOCX, MD or TXT"}
          <input
            ref={fileInput}
            type="file"
            hidden
            multiple
            accept=".pdf,.docx,.md,.markdown,.txt"
            onChange={(e) => {
              if (e.target.files?.length) void uploadFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {sources.map((s) => (
          <div
            key={s.id}
            id={`source-${s.id}`}
            className={`source-item${highlightId === s.id ? " highlight" : ""}`}
          >
            <span className="icon">{icon(s.filename)}</span>
            <div className="info">
              <div className="name" title={s.filename}>
                {s.filename}
              </div>
              <div className={`status ${s.status}`}>
                {s.status === "ready" && `${s.chunk_count} chunks · ${fmtSize(s.size_bytes)}`}
                {s.status === "processing" && "processing…"}
                {s.status === "failed" && (s.error ?? "failed")}
              </div>
            </div>
            <button className="ghost" title="Remove" onClick={() => void remove(s.id)}>
              ✕
            </button>
          </div>
        ))}
        {sources.length === 0 && (
          <p style={{ color: "var(--text-dim)", fontSize: 13, textAlign: "center" }}>
            Upload documents to start asking questions about them.
          </p>
        )}
      </div>
    </div>
  );
}
