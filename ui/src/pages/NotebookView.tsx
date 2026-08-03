import { useCallback, useEffect, useState } from "react";
import { FileText, NotebookPen } from "lucide-react";
import { useDefaultLayout } from "react-resizable-panels";
import { useParams } from "react-router-dom";
import { toast } from "sonner";

import { api } from "@/api";
import ChatPane from "@/components/ChatPane";
import SourcesPane from "@/components/SourcesPane";
import StudioPane from "@/components/StudioPane";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useMediaQuery } from "@/lib/useMediaQuery";
import type { Citation, Note, Notebook, Source } from "@/types";

export default function NotebookView() {
  const { id = "" } = useParams();
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [highlightSource, setHighlightSource] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [studioOpen, setStudioOpen] = useState(false);
  const wide = useMediaQuery("(min-width: 1024px)");
  // Pane widths survive reloads — this is someone's working desk.
  const layout = useDefaultLayout({
    id: "nonstick-workspace",
    storage: localStorage,
  });

  const loadSources = useCallback(
    () =>
      api
        .get<Source[]>(`/api/notebooks/${id}/sources`)
        .then(setSources)
        .catch((e) => toast.error((e as Error).message)),
    [id],
  );
  const loadNotes = useCallback(
    () =>
      api
        .get<Note[]>(`/api/notebooks/${id}/notes`)
        .then(setNotes)
        .catch((e) => toast.error((e as Error).message)),
    [id],
  );

  useEffect(() => {
    api
      .get<Notebook>(`/api/notebooks/${id}`)
      .then(setNotebook)
      .catch((e) => toast.error((e as Error).message));
    void loadSources();
    void loadNotes();
  }, [id, loadSources, loadNotes]);

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
      if (!wide) setSourcesOpen(true);
      setHighlightSource(c.source_id);
      // Let the drawer mount before scrolling to the row inside it.
      requestAnimationFrame(() =>
        document
          .getElementById(`source-${c.source_id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" }),
      );
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

  const sourcesPane = (
    <SourcesPane
      notebookId={id}
      sources={sources}
      highlightId={highlightSource}
      onChanged={() => void loadSources()}
    />
  );
  const studioPane = (
    <StudioPane
      notebookId={id}
      notes={notes}
      hasReadySources={hasReadySources}
      onChanged={() => void loadNotes()}
    />
  );

  return (
    <div className="flex h-full flex-col">
      {/* running head */}
      <div className="flex shrink-0 items-center gap-3 border-b border-rule px-5 py-2.5">
        <span aria-hidden="true">{notebook?.emoji}</span>
        <h1 className="min-w-0 flex-1 truncate font-display text-[15px] font-medium">
          {notebook?.title ?? "…"}
        </h1>

        {!wide && (
          <div className="flex items-center gap-1">
            <Sheet open={sourcesOpen} onOpenChange={setSourcesOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm">
                  <FileText />
                  <span className="tnum">{sources.length}</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[85vw] max-w-[340px] p-0">
                <SheetTitle className="sr-only">Sources</SheetTitle>
                <SheetDescription className="sr-only">
                  Documents in this notebook
                </SheetDescription>
                {sourcesPane}
              </SheetContent>
            </Sheet>

            <Sheet open={studioOpen} onOpenChange={setStudioOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm">
                  <NotebookPen />
                  <span className="tnum">{notes.length}</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[85vw] max-w-[380px] p-0">
                <SheetTitle className="sr-only">Studio</SheetTitle>
                <SheetDescription className="sr-only">
                  Notes generated from this notebook
                </SheetDescription>
                {studioPane}
              </SheetContent>
            </Sheet>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1">
        {wide ? (
          <ResizablePanelGroup
            orientation="horizontal"
            defaultLayout={layout.defaultLayout}
            onLayoutChanged={layout.onLayoutChanged}
            className="h-full"
          >
            <ResizablePanel defaultSize="22%" minSize="15%" maxSize="34%">
              {sourcesPane}
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize="52%" minSize="30%">
              <ChatPane
                notebookId={id}
                hasReadySources={hasReadySources}
                onCite={onCite}
              />
            </ResizablePanel>
            <ResizableHandle />
            <ResizablePanel defaultSize="26%" minSize="18%" maxSize="40%">
              {studioPane}
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          <ChatPane
            notebookId={id}
            hasReadySources={hasReadySources}
            onCite={onCite}
          />
        )}
      </div>
    </div>
  );
}
