import { useRef, useState } from "react";
import {
  File,
  FileCode2,
  FileText,
  FileType2,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "@/api";
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
import { cn } from "@/lib/utils";
import type { Source } from "@/types";

const ICONS: Record<string, typeof File> = {
  ".pdf": FileType2,
  ".docx": FileText,
  ".md": FileCode2,
  ".markdown": FileCode2,
  ".txt": FileText,
};

function iconFor(filename: string) {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  return ICONS[ext] ?? File;
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
}: {
  notebookId: string;
  sources: Source[];
  highlightId: string | null;
  onChanged: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Source | null>(null);

  const uploadFiles = async (files: FileList | File[]) => {
    setBusy(true);
    for (const file of Array.from(files)) {
      try {
        await api.upload(`/api/notebooks/${notebookId}/sources`, file);
      } catch (e) {
        toast.error(`${file.name}: ${(e as Error).message}`);
      }
    }
    setBusy(false);
    onChanged();
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await api.delete(
        `/api/notebooks/${notebookId}/sources/${pendingDelete.id}`,
      );
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <Pane>
      <PaneHeader title="Sources">
        <Badge>{sources.length}</Badge>
      </PaneHeader>

      <PaneBody className="p-3">
        <button
          type="button"
          className={cn(
            "flex w-full flex-col items-center gap-1.5 border border-dashed px-4 py-6 text-center transition-colors",
            drag
              ? "border-copper bg-copper-wash text-copper-deep"
              : "border-rule-strong text-ink-muted hover:border-copper hover:text-copper-deep",
          )}
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
          <Plus className="size-4" />
          <span className="text-[13px]">
            {busy ? "Uploading…" : "Drop a document"}
          </span>
          <span className="label">PDF · DOCX · MD · TXT</span>
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
        </button>

        <ul className="mt-2">
          {sources.map((s) => {
            const Icon = iconFor(s.filename);
            return (
              <li
                key={s.id}
                id={`source-${s.id}`}
                className={cn(
                  "group flex items-start gap-2.5 border-b border-rule px-1 py-3 transition-colors",
                  highlightId === s.id && "bg-copper-wash",
                )}
              >
                <Icon
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    s.status === "failed" ? "text-vermilion" : "text-ink-faint",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px]" title={s.filename}>
                    {s.filename}
                  </p>
                  <p
                    className={cn(
                      "label tnum mt-1 normal-case",
                      s.status === "failed" && "text-vermilion",
                      s.status === "processing" && "text-copper",
                    )}
                  >
                    {s.status === "ready" &&
                      `${s.chunk_count} chunks · ${fmtSize(s.size_bytes)}`}
                    {s.status === "processing" && (
                      <span className="animate-pulse">indexing…</span>
                    )}
                    {s.status === "failed" && (s.error ?? "failed")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`Remove ${s.filename}`}
                  className="shrink-0 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-vermilion"
                  onClick={() => setPendingDelete(s)}
                >
                  <Trash2 />
                </Button>
              </li>
            );
          })}
        </ul>

        {sources.length === 0 && (
          <p className="px-1 py-6 text-[13px] leading-relaxed text-ink-muted">
            Nothing indexed yet. Add a document and it will be chunked,
            embedded, and made answerable.
          </p>
        )}
      </PaneBody>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove “{pendingDelete?.filename}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Its chunks leave the index, so answers will stop citing it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-vermilion text-destructive-foreground hover:bg-vermilion/85"
              onClick={() => void confirmDelete()}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Pane>
  );
}
