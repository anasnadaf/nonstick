import { useEffect, useRef, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { api } from "@/api";
import AmbientField from "@/components/three/AmbientField";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { Notebook } from "@/types";

const EMOJIS = ["📓", "📚", "🧪", "🧠", "📈", "🗂️", "🔭", "⚗️", "🧬", "🌍"];

function formatDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

export default function NotebookList() {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Notebook | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const titleRef = useRef<HTMLInputElement>(null);

  const load = () =>
    api
      .get<Notebook[]>("/api/notebooks")
      .then(setNotebooks)
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setLoading(false));

  useEffect(() => {
    void load();
  }, []);

  // The ⌘K palette can ask for the composer to be open on arrival.
  useEffect(() => {
    if ((location.state as { create?: boolean } | null)?.create) {
      setCreating(true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location, navigate]);

  useEffect(() => {
    if (creating) titleRef.current?.focus();
  }, [creating]);

  const create = async () => {
    if (!title.trim()) return;
    try {
      const emoji = EMOJIS[Math.floor(Math.random() * EMOJIS.length)];
      const nb = await api.post<Notebook>("/api/notebooks", {
        title: title.trim(),
        emoji,
      });
      navigate(`/notebook/${nb.id}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await api.delete(`/api/notebooks/${pendingDelete.id}`);
      toast.success(`Deleted “${pendingDelete.title}”`);
      void load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <div className="grain relative h-full overflow-y-auto">
      {!loading && notebooks.length === 0 && <AmbientField />}

      <div className="relative mx-auto max-w-[900px] px-5 py-16 sm:px-8">
        <div className="flex items-baseline justify-between border-b border-rule pb-4">
          <h1 className="font-display text-title font-semibold">Notebooks</h1>
          <span className="label tnum">
            {loading ? "—" : `${notebooks.length} in the index`}
          </span>
        </div>

        {/* ---- composer ---- */}
        {creating ? (
          <div className="flex flex-col gap-4 border-b border-rule py-6 sm:flex-row sm:items-end">
            <label className="flex flex-1 flex-col gap-1.5">
              <span className="label">New notebook</span>
              <Input
                ref={titleRef}
                placeholder="What are you researching?"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void create();
                  if (e.key === "Escape") setCreating(false);
                }}
              />
            </label>
            <div className="flex gap-2">
              <Button onClick={() => void create()} disabled={!title.trim()}>
                Create
              </Button>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="group flex w-full items-center gap-3 border-b border-rule py-5 text-left transition-colors hover:text-copper-deep"
          >
            <Plus className="size-4 text-copper" />
            <span className="font-display text-lg">Start a new notebook</span>
          </button>
        )}

        {/* ---- index ---- */}
        {loading ? (
          <div className="flex flex-col gap-px pt-px">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[72px] w-full" />
            ))}
          </div>
        ) : (
          <ol>
            {notebooks.map((nb, i) => (
              <li key={nb.id} className="group border-b border-rule">
                <div
                  role="link"
                  tabIndex={0}
                  onClick={() => navigate(`/notebook/${nb.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/notebook/${nb.id}`);
                    }
                  }}
                  className="flex cursor-pointer items-center gap-5 py-5 transition-colors hover:bg-copper-wash"
                >
                  <span className="label tnum w-6 shrink-0 text-copper">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span aria-hidden="true" className="text-xl">
                    {nb.emoji}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-lg font-medium">
                      {nb.title}
                    </span>
                    <span className="label mt-0.5 block">
                      {formatDate(nb.created_at)}
                    </span>
                  </span>

                  <span className="label tnum shrink-0">
                    {nb.source_count} source{nb.source_count === 1 ? "" : "s"}
                  </span>

                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Delete ${nb.title}`}
                    className="shrink-0 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:text-vermilion"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDelete(nb);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )}

        {!loading && notebooks.length === 0 && !creating && (
          <p className="max-w-[42ch] py-16 text-[15px] leading-relaxed text-ink-muted">
            Nothing here yet. A notebook holds a set of documents and the
            conversation you have with them.
          </p>
        )}
      </div>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete “{pendingDelete?.title}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Its documents, embeddings, chats and notes are removed with it.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-vermilion text-destructive-foreground hover:bg-vermilion/85"
              onClick={() => void confirmDelete()}
            >
              Delete notebook
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
