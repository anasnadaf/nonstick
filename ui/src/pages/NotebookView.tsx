import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import ChatPane from "../components/ChatPane";
import SourcesPane from "../components/SourcesPane";
import StudioPane from "../components/StudioPane";
import type { Citation, Note, Notebook, Source } from "../types";

export default function NotebookView({ onError }: { onError: (m: string) => void }) {
  const { id = "" } = useParams();
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [highlightSource, setHighlightSource] = useState<string | null>(null);

  const loadSources = useCallback(
    () =>
      api
        .get<Source[]>(`/api/notebooks/${id}/sources`)
        .then(setSources)
        .catch((e) => onError((e as Error).message)),
    [id, onError],
  );
  const loadNotes = useCallback(
    () =>
      api
        .get<Note[]>(`/api/notebooks/${id}/notes`)
        .then(setNotes)
        .catch((e) => onError((e as Error).message)),
    [id, onError],
  );

  useEffect(() => {
    api
      .get<Notebook>(`/api/notebooks/${id}`)
      .then(setNotebook)
      .catch((e) => onError((e as Error).message));
    void loadSources();
    void loadNotes();
  }, [id, loadSources, loadNotes, onError]);

  // poll while any source is still ingesting
  useEffect(() => {
    if (!sources.some((s) => s.status === "processing")) return;
    const timer = setInterval(loadSources, 1500);
    return () => clearInterval(timer);
  }, [sources, loadSources]);

  const onCite = (c: Citation) => {
    if (c.kind === "web" && c.url) {
      window.open(c.url, "_blank", "noopener");
      return;
    }
    if (c.source_id) {
      setHighlightSource(c.source_id);
      document
        .getElementById(`source-${c.source_id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => setHighlightSource(null), 2500);
    }
  };

  const hasReadySources = sources.some((s) => s.status === "ready");

  useEffect(() => {
    document.title = notebook ? `${notebook.title} — NonStick.ai` : "NonStick.ai";
    return () => {
      document.title = "NonStick.ai";
    };
  }, [notebook]);

  return (
    <>
      <div className="workspace">
        <SourcesPane
          notebookId={id}
          sources={sources}
          highlightId={highlightSource}
          onChanged={() => void loadSources()}
          onError={onError}
        />
        <ChatPane
          notebookId={id}
          hasReadySources={hasReadySources}
          onCite={onCite}
          onError={onError}
        />
        <StudioPane
          notebookId={id}
          notes={notes}
          hasReadySources={hasReadySources}
          onChanged={() => void loadNotes()}
          onError={onError}
        />
      </div>
    </>
  );
}
