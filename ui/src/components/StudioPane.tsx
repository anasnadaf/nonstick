import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/api";
import Markdown from "@/components/Markdown";
import { Pane, PaneBody, PaneHeader } from "@/components/Pane";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { Note } from "@/types";

const KIND_LABEL: Record<string, string> = {
  manual: "note",
  summary: "summary",
  study_guide: "study guide",
  faq: "FAQ",
};

const KINDS = ["summary", "study_guide", "faq"] as const;

export default function StudioPane({
  notebookId,
  notes,
  hasReadySources,
  onChanged,
}: {
  notebookId: string;
  notes: Note[];
  hasReadySources: boolean;
  onChanged: () => void;
}) {
  const [generating, setGenerating] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: "", content_md: "" });
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null);

  const generate = async (kind: (typeof KINDS)[number]) => {
    setGenerating(kind);
    try {
      await api.post(`/api/notebooks/${notebookId}/notes/generate`, { kind });
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
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
      toast.error((e as Error).message);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await api.delete(`/api/notebooks/${notebookId}/notes/${pendingDelete.id}`);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <Pane>
      <PaneHeader title="Studio">
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="New note"
          onClick={() => setAdding((v) => !v)}
        >
          <Plus />
        </Button>
      </PaneHeader>

      <div className="flex shrink-0 flex-wrap gap-2 border-b border-rule p-3">
        {KINDS.map((kind) => (
          <Button
            key={kind}
            variant="outline"
            size="xs"
            disabled={!hasReadySources || generating !== null}
            onClick={() => void generate(kind)}
          >
            {generating === kind ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Sparkles />
            )}
            {KIND_LABEL[kind]}
          </Button>
        ))}
      </div>

      <PaneBody className="p-3">
        {adding && (
          <div className="mb-4 border border-rule p-3">
            <Input
              placeholder="Note title"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
            <Textarea
              className="mt-3"
              rows={4}
              placeholder="Markdown…"
              value={draft.content_md}
              onChange={(e) =>
                setDraft({ ...draft, content_md: e.target.value })
              }
            />
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={() => void addNote()}>
                Save note
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setAdding(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        <ul>
          {notes.map((n) => {
            const open = expanded === n.id;
            return (
              <li key={n.id} className="group border-b border-rule py-3">
                <div className="flex items-start gap-2">
                  <h3 className="min-w-0 flex-1 font-display text-[14px] font-medium">
                    {n.title}
                  </h3>
                  <Badge variant="ghost">{KIND_LABEL[n.kind] ?? n.kind}</Badge>
                </div>

                <Markdown
                  text={n.content_md}
                  className={cn(
                    "mt-2 text-[12.5px] leading-relaxed",
                    open
                      ? "text-foreground"
                      : "max-h-32 overflow-hidden text-ink-muted",
                  )}
                />

                <div className="mt-1.5 flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => setExpanded(open ? null : n.id)}
                  >
                    {open ? <ChevronUp /> : <ChevronDown />}
                    {open ? "less" : "more"}
                  </Button>
                  <span className="flex-1" />
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Delete ${n.title}`}
                    className="opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-vermilion"
                    onClick={() => setPendingDelete(n)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>

        {notes.length === 0 && !adding && (
          <p className="px-1 py-6 text-[13px] leading-relaxed text-ink-muted">
            {hasReadySources
              ? "Generate a summary, study guide or FAQ from your sources — or write your own note."
              : "Once a document is indexed you can generate a summary, study guide or FAQ here."}
          </p>
        )}
      </PaneBody>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pendingDelete?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This note is removed permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-vermilion text-destructive-foreground hover:bg-vermilion/85"
              onClick={() => void confirmDelete()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Pane>
  );
}
